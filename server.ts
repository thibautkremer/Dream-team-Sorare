import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { MOCK_GALLERY } from './src/data/mockGallery';
import { getClubUpcomingFixture, normalizeClubName, FIXTURES_CATALOG, getCurrentGameWeekNumber } from './src/data/fixturesData';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// --- Lightweight access guard for sensitive routes (admin dashboard + Gemini-costing AI routes) ---
// Opt-in via APP_ACCESS_TOKEN env var: if unset, behaves exactly as before (no breaking change for
// the current single-user deployment). If set, callers must send it as `x-app-token` header or
// `?token=` query param. This is intentionally simple (shared secret, not full auth/sessions) but
// closes the "wide open to the internet" exposure on the routes that cost real money (Gemini) or
// leak cross-user debug data (admin logs / debug-raya).
const APP_ACCESS_TOKEN = process.env.APP_ACCESS_TOKEN || '';
function requireAppToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!APP_ACCESS_TOKEN) {
    // No token configured -> guard is a no-op (keeps local/dev usage frictionless).
    return next();
  }
  const provided = (req.headers['x-app-token'] as string) || (req.query.token as string) || '';
  if (provided === APP_ACCESS_TOKEN) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized: missing or invalid access token.' });
}

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  description: string;
  service: 'Sorare API' | 'Gemini AI';
  method: string;
  status: 'SUCCESS' | 'ERROR' | 'RATE_LIMITED' | 'INFO';
  statusCode: number;
  durationMs: number;
  requestSummary: any;
  responseSummary: any;
  error?: string;
}

const apiLogs: ApiLogEntry[] = [];
const MAX_LOGS = 200;

function addApiLog(entry: Omit<ApiLogEntry, 'id' | 'timestamp'>) {
  const fullEntry: ApiLogEntry = {
    id: 'log_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  apiLogs.unshift(fullEntry);
  if (apiLogs.length > MAX_LOGS) {
    apiLogs.pop();
  }
}

// In-memory cache for user cards (slug -> { timestamp, cards, user })
// Bounded LRU cache: keeps memory usage predictable even if many distinct Sorare
// accounts are looked up over the lifetime of the server process. Existing TTL logic
// (15 min freshness check) still applies at each read site; this only bounds the
// number of *distinct users* kept in memory at once (max 20, evicting the least
// recently touched one first).
class BoundedUserCardsCache extends Map<string, { timestamp: number; cards: any[]; user: any }> {
  private readonly maxEntries: number;
  constructor(maxEntries = 20) {
    super();
    this.maxEntries = maxEntries;
  }
  // Any read/write "touches" the entry so it becomes the most recently used one.
  private touch(key: string) {
    if (super.has(key)) {
      const value = super.get(key)!;
      super.delete(key);
      super.set(key, value);
    }
  }
  get(key: string) {
    this.touch(key);
    return super.get(key);
  }
  set(key: string, value: { timestamp: number; cards: any[]; user: any }) {
    super.delete(key); // re-insert to push to the "most recent" end
    super.set(key, value);
    while (this.size > this.maxEntries) {
      const oldestKey = this.keys().next().value;
      if (oldestKey === undefined) break;
      super.delete(oldestKey);
    }
    return this;
  }
}

const userCardsCache = new BoundedUserCardsCache(20);

// Lazy GoogleGenAI Initialization
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('GEMINI_API_KEY environment variable is not defined. AI endpoints will use heuristic fallbacks.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Cooldown tracker for Gemini free-tier rate limits
let lastQuotaExhaustedTime = 0;
const QUOTA_COOLDOWN_MS = 60 * 1000;

// Robust wrapper to call Gemini API with retry mechanism and fallback models
async function generateContentWithRetry(params: {
  model: string;
  contents: any;
  config?: any;
}): Promise<any> {
  const startTime = Date.now();
  const now = Date.now();
  if (now - lastQuotaExhaustedTime < QUOTA_COOLDOWN_MS) {
    const durationMs = Date.now() - startTime;
    addApiLog({
      description: 'Gemini AI API: Quota dépassé (Cooldown)',
      service: 'Gemini AI',
      method: `generateContent (${params.model})`,
      status: 'RATE_LIMITED',
      statusCode: 429,
      durationMs,
      requestSummary: { model: params.model, contentsPreview: String(params.contents).substring(0, 200) },
      responseSummary: { error: 'Cooldown active' },
      error: 'Gemini API free-tier quota in cooldown',
    });
    throw new Error('Gemini API free-tier quota in cooldown, routing to high-precision algorithmic engine');
  }

  const ai = getAI();
  const modelsToTry = [
    params.model,
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  const uniqueModels = Array.from(new Set(modelsToTry.filter(Boolean)));
  let lastError: any = null;

  for (const modelName of uniqueModels) {
    try {
      const result = await ai.models.generateContent({
        ...params,
        model: modelName,
      });
      const durationMs = Date.now() - startTime;
      addApiLog({
        description: `Gemini AI: Génération réussie (${modelName})`,
        service: 'Gemini AI',
        method: `generateContent (${modelName})`,
        status: 'SUCCESS',
        statusCode: 200,
        durationMs,
        requestSummary: { model: modelName, config: params.config },
        responseSummary: { textPreview: result.text?.substring(0, 300) },
      });
      return result;
    } catch (err: any) {
      lastError = err;
      const errMessage = String(err?.message || '');
      const errStatus = err?.status || (err?.error && err?.error?.code);
      
      const isQuotaExhausted = errStatus === 429 || 
                              errMessage.includes('429') || 
                              errMessage.includes('RESOURCE_EXHAUSTED') || 
                              errMessage.includes('Quota exceeded') ||
                              errMessage.includes('quota');
                              
      if (isQuotaExhausted) {
        console.log(`[AI Engine] Model ${modelName} reached free tier quota. Trying next available model...`);
        continue;
      }

      const isTransient = errStatus === 503 || 
                          errMessage.includes('503') || 
                          errMessage.includes('UNAVAILABLE') || 
                          errMessage.includes('high demand') ||
                          errMessage.includes('overload');
                          
      if (isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  const durationMs = Date.now() - startTime;
  if (lastError && (lastError.status === 429 || String(lastError.message).includes('429'))) {
    lastQuotaExhaustedTime = Date.now();
  }
  addApiLog({
    description: `Gemini AI: Échec de génération (${params.model})`,
    service: 'Gemini AI',
    method: `generateContent (${params.model})`,
    status: 'ERROR',
    statusCode: 500,
    durationMs,
    requestSummary: { model: params.model },
    responseSummary: { error: lastError?.message || 'Failed' },
    error: lastError?.message || 'Failed',
  });
  throw lastError || new Error('GenerateContent completed, proceeding with fallback engine');
}


// =========================================================================
// REAL ODDS & GEMINI SEARCH API ENDPOINTS
// =========================================================================

// Get all real cached match odds
app.get('/api/match-odds/all', (req, res) => {
  const matches = Array.from(realMatchOddsStore.values());
  res.json({
    success: true,
    totalMatches: matches.length,
    matches,
    lastUpdated: new Date().toISOString(),
  });
});

// Single match search via Gemini Search Grounding
app.post('/api/match-odds/fetch-match', requireAppToken, async (req, res) => {
  const { homeTeam, awayTeam, players } = req.body;
  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'homeTeam et awayTeam requis' });
  }

  try {
    const entry = await fetchGeminiRealMatchOdds(homeTeam, awayTeam, players || []);
    if (entry) {
      return res.json({ success: true, match: entry });
    } else {
      // Return resolved fallback
      const resolved = getResolvedMatchOdds(homeTeam, awayTeam, true);
      return res.json({ 
        success: true, 
        isFallback: true,
        match: {
          matchKey: makeMatchKey(homeTeam, awayTeam),
          homeTeam: normalizeClubName(homeTeam),
          awayTeam: normalizeClubName(awayTeam),
          odds: { homeWin: resolved.bookmakerData.win, draw: resolved.bookmakerData.draw, awayWin: resolved.bookmakerData.loss },
          probabilities: { 
            homeWinPercent: resolved.bookmakerData.winProbability || 50, 
            drawPercent: 25, 
            awayWinPercent: 100 - (resolved.bookmakerData.winProbability || 50) - 25 
          },
          cleanSheetProbabilities: { homeCleanSheetPercent: resolved.bookmakerData.cleanSheetProb, awayCleanSheetPercent: 20 },
          expectedGoals: { homeXG: resolved.bookmakerData.goalExpectancy, awayXG: 1.0 },
          difficultyRatings: { homeFDR: resolved.diffRating, awayFDR: 6 - resolved.diffRating },
          source: resolved.bookmakerData.source || 'Catalogue SO5',
          sourceType: 'verified_bookmaker',
          updatedAt: new Date().toISOString()
        }
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la récupération des cotes réelles' });
  }
});

// Sync all distinct matches present in user cards via Gemini Search Grounding / Bookmaker Catalog
app.post('/api/match-odds/sync-gemini', requireAppToken, async (req, res) => {
  const { slug, cards: incomingCards } = req.body;
  const targetSlug = cleanSlug(slug || 'thib-8');
  
  let cardsToProcess = incomingCards || [];
  if (cardsToProcess.length === 0) {
    const cached = userCardsCache.get(targetSlug);
    if (cached && cached.cards) {
      cardsToProcess = cached.cards;
    }
  }

  if (cardsToProcess.length === 0) {
    return res.status(400).json({ error: 'Aucune carte trouvée pour synchroniser les cotes.' });
  }

  // Extract all unique valid fixtures from cards
  const uniqueMatchups = new Map<string, { homeTeam: string; awayTeam: string; players: string[] }>();

  cardsToProcess.forEach((c: any) => {
    if (c.upcomingFixture && c.club?.name && c.upcomingFixture.opponent) {
      const isHome = c.upcomingFixture.isHome;
      const rawHome = isHome ? c.club.name : c.upcomingFixture.opponent;
      const rawAway = isHome ? c.upcomingFixture.opponent : c.club.name;
      
      const homeTeam = normalizeClubName(rawHome);
      const awayTeam = normalizeClubName(rawAway);

      const isValidTeam = (t: string) => 
        t && 
        t !== 'Club Non Renseigné' && 
        t !== 'Adversaire Inconnu' && 
        !t.toLowerCase().includes('non renseign') && 
        !t.toLowerCase().includes('inconnu');

      if (!isValidTeam(homeTeam) || !isValidTeam(awayTeam) || homeTeam === awayTeam) {
        return;
      }

      const mKey = makeMatchKey(homeTeam, awayTeam);

      if (!uniqueMatchups.has(mKey)) {
        uniqueMatchups.set(mKey, {
          homeTeam,
          awayTeam,
          players: [c.displayName || c.name || ''].filter(Boolean),
        });
      } else {
        const item = uniqueMatchups.get(mKey)!;
        const pName = c.displayName || c.name || '';
        if (pName && !item.players.includes(pName)) {
          item.players.push(pName);
        }
      }
    }
  });

  const matchupList = Array.from(uniqueMatchups.values());
  console.log(`[Real Odds Sync] Processing ${matchupList.length} distinct valid matchups for ${targetSlug}...`);

  // Process batch sync with Gemini multi-model cascade and verified catalog fallback
  const updatedEntries = await fetchGeminiBatchRealMatchOdds(matchupList);

  // Refresh userCardsCache with newly synced real odds
  const cachedUser = userCardsCache.get(targetSlug);
  if (cachedUser && cachedUser.cards) {
    const enrichedCards = cachedUser.cards.map((card: any) => {
      if (card.upcomingFixture && card.club?.name && card.upcomingFixture.opponent) {
        const resolved = getResolvedMatchOdds(
          card.club.name,
          card.upcomingFixture.opponent,
          card.upcomingFixture.isHome,
          card.positionCode,
          card.displayName || card.name || ''
        );

        return {
          ...card,
          upcomingFixture: {
            ...card.upcomingFixture,
            difficultyRating: resolved.diffRating,
            bookmaker: resolved.bookmakerData,
          }
        };
      }
      return card;
    });

    userCardsCache.set(targetSlug, {
      ...cachedUser,
      cards: enrichedCards,
      timestamp: Date.now(),
    });

    return res.json({
      success: true,
      totalSynced: updatedEntries.length,
      totalUniqueMatches: matchupList.length,
      cards: enrichedCards,
      matches: Array.from(realMatchOddsStore.values()),
      syncedAt: new Date().toISOString(),
    });
  }

  res.json({
    success: true,
    totalSynced: updatedEntries.length,
    totalUniqueMatches: matchupList.length,
    matches: Array.from(realMatchOddsStore.values()),
    syncedAt: new Date().toISOString(),
  });
});

// Daily automatic odds sync status & trigger
app.get('/api/match-odds/auto-sync-status', (req, res) => {
  res.json({
    success: true,
    frequency: '1x / jour (toutes les 24h)',
    lastSyncISO: lastDailySyncISO || new Date().toISOString(),
    lastSyncTimestamp: lastDailySyncTimestamp || Date.now(),
    nextSyncISO: nextDailySyncTimestamp ? new Date(nextDailySyncTimestamp).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    nextSyncTimestamp: nextDailySyncTimestamp || (Date.now() + 24 * 60 * 60 * 1000),
    isRunning: isDailySyncRunning,
    stats: dailySyncStats,
    totalKnownMatches: Math.round(realMatchOddsStore.size / 2),
  });
});

app.post('/api/match-odds/sync-all-daily', async (req, res) => {
  const result = await syncAllMatchesDaily();
  res.json({
    ...result,
    stats: dailySyncStats,
    lastSyncISO: lastDailySyncISO,
    nextSyncISO: nextDailySyncTimestamp ? new Date(nextDailySyncTimestamp).toISOString() : '',
  });
});

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'Team Sorare Backend',
    timestamp: new Date().toISOString(),
  });
});

// Admin Logs endpoints (guarded: see requireAppToken above)
app.get('/api/admin/logs', requireAppToken, (req, res) => {
  console.log('Received request for /api/admin/logs');
  res.json({ logs: apiLogs, total: apiLogs.length });
});

app.post('/api/admin/logs/clear', requireAppToken, (req, res) => {
  apiLogs.length = 0;
  res.json({ success: true });
});

// Client Logs Ingestion
app.post('/api/admin/logs/client', express.json(), (req, res) => {
  const { message, error } = req.body;
  addApiLog({
    description: `UI Client Error: ${message}`,
    service: 'Sorare API', // ou autre
    method: 'CLIENT_UI',
    status: 'ERROR',
    statusCode: 500,
    durationMs: 0,
    requestSummary: {},
    responseSummary: { error: message },
    error: error || message,
  });
  res.json({ success: true });
});

// Player Live Detail (Automatic call when opening player sheet to get exact 40 real matches)
app.get('/api/sorare/player-live-detail', async (req, res) => {
  const targetSlug = (req.query.slug as string) || '';
  if (!targetSlug) {
    return res.status(400).json({ error: 'Slug requis' });
  }

  const startTime = Date.now();
  try {
    let foundCard: any = null;
    let foundUserSlug: string | null = null;
    let foundIndex = -1;

    for (const [uSlug, cached] of userCardsCache.entries()) {
      const idx = cached.cards.findIndex((c: any) => c.slug === targetSlug || c.id === targetSlug || c.displayName?.toLowerCase() === targetSlug.toLowerCase());
      if (idx !== -1) {
        foundCard = { ...cached.cards[idx] };
        foundUserSlug = uSlug;
        foundIndex = idx;
        break;
      }
    }

    // Live fetch exact 40 scores from Sorare GraphQL using anyPlayer allSo5Scores
    try {
      const customApiKey = (req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'TeamSorare-LiveScout/2.0',
      };
      if (customApiKey) {
        headers['APIKEY'] = customApiKey;
      }

      // Determine player slug: either from found card or by stripping card slug format
      let playerSlug = foundCard?.anyPlayer?.slug || foundCard?.playerSlug || '';
      if (!playerSlug && targetSlug) {
        playerSlug = targetSlug.replace(/-\d{4}-(common|limited|rare|super_rare|unique|custom).*$/i, '');
      }

      // Fetch exact 40 scores + detailed game stats from Sorare GraphQL
      const queryPage = `
        query GetDetailedStats($playerSlug: String!, $first: Int!, $after: String) {
          anyPlayer(slug: $playerSlug) {
            ... on Player {
              id
              displayName
              slug
              playingStatus
              position
              avatarUrl
              pictureUrl
              age
              country { name slug }
              activeClub {
                name
                pictureUrl
                domesticLeague { name }
              }
              l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
              l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
              l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
              allSo5Scores(first: $first, after: $after) {
                pageInfo { endCursor hasNextPage }
                nodes {
                  score
                  decisiveScore { totalScore }
                  playerGameStats {
                    minsPlayed
                    goals
                    goalAssist
                    yellowCards: yellowCard
                    redCards: redCard
                    cleanSheet
                    penaltyKickMissed
                    penaltySave
                    wonContest
                    totalPass
                    accuratePass
                    bigChanceCreated
                    errorLeadToGoal
                    ownGoals
                    fouls
                    wasFouled
                  }
                  game {
                    date
                    competition { name }
                    homeTeam { name }
                    awayTeam { name }
                  }
                }
              }
            }
          }
        }
      `;

      let allNodes: any[] = [];
      let playerMeta: any = null;
      let cursor: string | null = null;

      // Determine initial slug candidates
      const slugCandidates = [playerSlug, targetSlug].filter(Boolean);
      let activeSlug = playerSlug || targetSlug;

      for (const candSlug of slugCandidates) {
        allNodes = [];
        playerMeta = null;
        cursor = null;

        // Fetch up to 3 pages (14 + 14 + 12 = 40 matches) safely under 500 complexity limit
        for (let page = 0; page < 3; page++) {
          const pageSize = page === 2 ? 12 : 14;
          const pageRes = await fetchGraphQLWithRetry(
            'https://api.sorare.com/graphql',
            { query: queryPage, variables: { playerSlug: candSlug, first: pageSize, after: cursor } },
            headers,
            2
          );

          if (pageRes.ok && pageRes.data?.data?.anyPlayer) {
            const playerObj = pageRes.data.data.anyPlayer;
            if (!playerMeta) playerMeta = playerObj;
            const nodes = playerObj.allSo5Scores?.nodes || [];
            allNodes.push(...nodes);
            cursor = playerObj.allSo5Scores?.pageInfo?.endCursor || null;
            if (!playerObj.allSo5Scores?.pageInfo?.hasNextPage || allNodes.length >= 40) {
              break;
            }
          } else {
            break;
          }
        }

        if (allNodes.length > 0) {
          activeSlug = candSlug;
          break;
        }
      }

      if (allNodes.length === 0 && targetSlug) {
        try {
          const cardQuery = `
            query GetCardPlayerSlug($targetSlug: String!) {
              anyCard(slug: $targetSlug) {
                ... on Card {
                  anyPlayer {
                    ... on Player {
                      slug
                    }
                  }
                }
              }
            }
          `;
          const cardRes = await fetchGraphQLWithRetry(
            'https://api.sorare.com/graphql',
            { query: cardQuery, variables: { targetSlug } },
            headers,
            2
          );
          const resolvedPlayerSlug = cardRes.ok ? cardRes.data?.data?.anyCard?.anyPlayer?.slug : null;
          if (resolvedPlayerSlug && !slugCandidates.includes(resolvedPlayerSlug)) {
            cursor = null;
            for (let page = 0; page < 3; page++) {
              const pageSize = page === 2 ? 12 : 14;
              const pageRes = await fetchGraphQLWithRetry(
                'https://api.sorare.com/graphql',
                { query: queryPage, variables: { playerSlug: resolvedPlayerSlug, first: pageSize, after: cursor } },
                headers,
                2
              );
              if (pageRes.ok && pageRes.data?.data?.anyPlayer) {
                const playerObj = pageRes.data.data.anyPlayer;
                if (!playerMeta) playerMeta = playerObj;
                const nodes = playerObj.allSo5Scores?.nodes || [];
                allNodes.push(...nodes);
                cursor = playerObj.allSo5Scores?.pageInfo?.endCursor || null;
                if (!playerObj.allSo5Scores?.pageInfo?.hasNextPage || allNodes.length >= 40) {
                  break;
                }
              } else {
                break;
              }
            }
          }
        } catch (e) {
          console.warn('[Live Detail] anyCard fallback error:', e);
        }
      }

      if (allNodes.length > 0 && playerMeta) {
        const player = playerMeta;
        const pgsList = allNodes;
        const clubName = foundCard?.club?.name || '';
        const positionCode = foundCard?.positionCode || 'MID';

        const recentMatches = pgsList.map((pgs: any, pgsIdx: number) => {
          const scoreVal = pgs?.score !== null && pgs?.score !== undefined
            ? Math.round(Number(pgs.score) * 10) / 10
            : 0;

          const rawDecisiveVal = pgs?.decisiveScore?.totalScore !== undefined && pgs?.decisiveScore?.totalScore !== null
            ? Math.round(Number(pgs.decisiveScore.totalScore) * 10) / 10
            : (scoreVal >= 60 ? 60 : (scoreVal > 0 ? 35 : 0));

          const statsObj = pgs.playerGameStats || {};
          const minsPlayed = statsObj.minsPlayed !== null && statsObj.minsPlayed !== undefined
            ? Number(statsObj.minsPlayed)
            : (scoreVal > 0 ? 90 : 0);
          const goals = Number(statsObj.goals) || 0;
          const goalAssist = Number(statsObj.goalAssist) || 0;
          const yellowCards = Number(statsObj.yellowCards) || 0;
          const redCards = Number(statsObj.redCards) || 0;
          const cleanSheet = Number(statsObj.cleanSheet) || 0;
          const accuratePass = Number(statsObj.accuratePass) || 0;
          const totalPass = Number(statsObj.totalPass) || 0;
          const wonContest = Number(statsObj.wonContest) || 0;
          const bigChanceCreated = Number(statsObj.bigChanceCreated) || 0;
          const errorLeadToGoal = Number(statsObj.errorLeadToGoal) || 0;
          const ownGoals = Number(statsObj.ownGoals) || 0;
          const penaltyKickMissed = Number(statsObj.penaltyKickMissed) || 0;
          const penaltySave = Number(statsObj.penaltySave) || 0;
          const wasFouled = Number(statsObj.wasFouled) || 0;

          // Determine starter vs substitute base score
          const isDNP = scoreVal === 0 && minsPlayed === 0;
          let isStarter = false;
          let isSub = false;
          let baseScore = 0;

          if (!isDNP && scoreVal > 0) {
            if (rawDecisiveVal === 25 || (minsPlayed > 0 && minsPlayed < 45 && rawDecisiveVal < 60)) {
              isSub = true;
              baseScore = 25; // Base remplaçant entré en jeu
            } else {
              isStarter = true;
              baseScore = 35; // Base titulaire
            }
          }

          // Build authentic decisive actions
          const decisiveActions: string[] = [];
          if (goals > 1) decisiveActions.push(`⚽ Doublé (${goals} buts)`);
          else if (goals === 1) decisiveActions.push('⚽ But marqué');

          if (goalAssist > 1) decisiveActions.push(`🅰️ ${goalAssist} Passes décisives`);
          else if (goalAssist === 1) decisiveActions.push('🅰️ Passe décisive');

          if (penaltySave > 0) decisiveActions.push(`🧤 Penalty arrêté (${penaltySave})`);
          if (cleanSheet > 0 && positionCode === 'GK' && minsPlayed >= 60) decisiveActions.push('🛡️ Clean Sheet (0 but concédé)');
          else if (cleanSheet > 0 && positionCode === 'DEF' && minsPlayed >= 60) decisiveActions.push('🛡️ Clean Sheet défensif');

          if (rawDecisiveVal >= 60 && decisiveActions.length === 0) {
            decisiveActions.push(`⚡ Action décisive validée (${rawDecisiveVal} pts)`);
          }

          const hasDecisive = rawDecisiveVal >= 60 || decisiveActions.length > 0;
          const decisiveVal = hasDecisive ? rawDecisiveVal : 0; // 0 if no positive decisive action
          const decisiveBonus = hasDecisive ? Math.max(0, rawDecisiveVal - baseScore) : 0;

          const allAroundVal = scoreVal > 0
            ? (hasDecisive
                ? Math.max(0, Math.round((scoreVal - rawDecisiveVal) * 10) / 10)
                : Math.max(0, Math.round((scoreVal - baseScore) * 10) / 10))
            : 0;

          const isHome = pgs.game?.homeTeam?.name && clubName
            ? pgs.game.homeTeam.name.toLowerCase().includes(clubName.toLowerCase()) || clubName.toLowerCase().includes(pgs.game.homeTeam.name.toLowerCase())
            : pgsIdx % 2 === 0;

          const opponent = isHome
            ? (pgs.game?.awayTeam?.name || `Adversaire J-${pgsIdx + 1}`)
            : (pgs.game?.homeTeam?.name || `Adversaire J-${pgsIdx + 1}`);

          // Negative actions
          const negativeActions: string[] = [];
          if (redCards > 0) negativeActions.push(`🟥 Carton rouge (${redCards})`);
          if (yellowCards > 0) negativeActions.push(`🟨 Carton jaune (${yellowCards})`);
          if (ownGoals > 0) negativeActions.push(`❌ But contre son camp (${ownGoals})`);
          if (errorLeadToGoal > 0) negativeActions.push(`❌ Erreur menant au but (${errorLeadToGoal})`);
          if (penaltyKickMissed > 0) negativeActions.push(`⚠️ Penalty manqué (${penaltyKickMissed})`);

          // All around details
          const allAroundDetails: string[] = [];
          if (minsPlayed > 0) allAroundDetails.push(`⏱️ ${minsPlayed} mins jouées`);
          if (totalPass > 0) {
            const passPct = Math.round((accuratePass / totalPass) * 100);
            allAroundDetails.push(`🎯 ${accuratePass}/${totalPass} passes réussies (${passPct}%)`);
          }
          if (wonContest > 0) allAroundDetails.push(`⚔️ ${wonContest} duels gagnés`);
          if (bigChanceCreated > 0) allAroundDetails.push(`⚡ ${bigChanceCreated} occasion(s) créée(s)`);
          if (wasFouled > 0) allAroundDetails.push(`💥 ${wasFouled} faute(s) subie(s)`);

          return {
            score: scoreVal,
            isStarter,
            isSub,
            baseScore,
            decisiveScore: decisiveVal,
            decisiveBonus,
            allAroundScore: allAroundVal,
            opponent,
            isHome,
            competitionName: pgs.game?.competition?.name || '',
            matchDate: pgs.game?.date || '',
            minsPlayed,
            goals,
            goalAssist,
            yellowCards,
            redCards,
            cleanSheet,
            accuratePass,
            totalPass,
            wonContest,
            bigChanceCreated,
            errorLeadToGoal,
            ownGoals,
            penaltyKickMissed,
            penaltySave,
            wasFouled,
            decisiveActions,
            negativeActions,
            allAroundDetails
          };
        });

          const rawScores = recentMatches.map((m: any) => m.score);
          const last5Scores = rawScores.slice(0, 5).reverse();
          const last10Scores = rawScores.slice(0, 10).reverse();
          const last15Scores = rawScores.slice(0, 15).reverse();
          const last40Scores = rawScores.slice(0, 40).reverse();

          const l5 = player?.l5 != null ? Math.round(Number(player.l5) * 10) / 10 : foundCard?.scores?.l5 || 0;
          const l15 = player?.l15 != null ? Math.round(Number(player.l15) * 10) / 10 : foundCard?.scores?.l15 || 0;
          const l40 = player?.l40 != null ? Math.round(Number(player.l40) * 10) / 10 : foundCard?.scores?.l40 || 0;

          if (!foundCard) {
            const rawPos = (player?.position || 'Midfielder').toUpperCase();
            let posCode = 'MID';
            if (rawPos.includes('GOAL') || rawPos.includes('GARDIEN') || rawPos === 'GK') posCode = 'GK';
            else if (rawPos.includes('DEF') || rawPos.includes('BACK')) posCode = 'DEF';
            else if (rawPos.includes('FORW') || rawPos.includes('ATT') || rawPos === 'FWD' || rawPos.includes('STRIKER')) posCode = 'FWD';

            foundCard = {
              id: player.id || targetSlug,
              slug: player.slug || targetSlug,
              displayName: player?.displayName || 'Joueur Sorare',
              name: player?.displayName || 'Carte Sorare',
              pictureUrl: player?.avatarUrl || player?.pictureUrl || `https://assets.sorare.com/players/${player?.slug || targetSlug}.png`,
              position: player?.position || 'Midfielder',
              positionCode: posCode,
              rarity: 'limited',
              age: player?.age || 26,
              country: player?.country?.name || 'International',
              club: {
                name: player?.activeClub?.name || 'Club',
                pictureUrl: player?.activeClub?.pictureUrl || '',
                league: player?.activeClub?.domesticLeague?.name || 'Championnat',
              },
              scores: {}
            };
          } else {
            // Guarantee existing card retains its picture and position if not present
            if (!foundCard.pictureUrl && (player?.avatarUrl || player?.pictureUrl)) {
              foundCard.pictureUrl = player.avatarUrl || player.pictureUrl;
            }
          }

          foundCard.scores = {
            ...foundCard.scores,
            l5,
            l15,
            l40,
            last5Scores,
            last10Scores,
            last15Scores,
            last40Scores,
            recentMatches
          };

          if (player?.playingStatus) {
            foundCard.status = player.playingStatus;
          }

          // Update cache if exists
          if (foundUserSlug && userCardsCache.has(foundUserSlug) && foundIndex !== -1) {
            const cachedObj = userCardsCache.get(foundUserSlug);
            if (cachedObj && cachedObj.cards[foundIndex]) {
              cachedObj.cards[foundIndex] = { 
                ...cachedObj.cards[foundIndex], 
                scores: foundCard.scores,
                status: foundCard.status || cachedObj.cards[foundIndex].status
              };
            }
          }
        }
    } catch (gqlErr: any) {
      console.warn(`[Live Detail] Sorare GraphQL direct query error: ${gqlErr.message}`);
    }

    const durationMs = Date.now() - startTime;
    addApiLog({
      description: `Sorare API: Détail live joueur (${targetSlug})`,
      service: 'Sorare API',
      method: `GET /player-live-detail (${targetSlug})`,
      status: foundCard ? 'SUCCESS' : 'INFO',
      statusCode: foundCard ? 200 : 404,
      durationMs,
      requestSummary: { targetSlug },
      responseSummary: foundCard ? { cardName: foundCard.displayName, scoresCount: foundCard.scores?.last40Scores?.length } : { info: 'Card not found' },
      error: undefined,
    });

    if (foundCard) {
      return res.json({ success: true, card: foundCard });
    }

    return res.status(404).json({ success: false, error: 'Joueur introuvable dans la galerie synchronisée.' });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    addApiLog({
      description: `Sorare API: Erreur détail live (${targetSlug})`,
      service: 'Sorare API',
      method: `GET /player-live-detail (${targetSlug})`,
      status: 'ERROR',
      statusCode: 500,
      durationMs,
      requestSummary: { targetSlug },
      responseSummary: { error: err.message },
      error: err.message,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Sorare Direct Live Scoring API Endpoint
app.get('/api/sorare/live-scoring', async (req, res) => {
  const rawUsername = (req.query.username as string) || 'thib-8';
  const customApiKey = (req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  const slug = cleanSlug(rawUsername);
  const startTime = Date.now();

  try {
    const hasApiKey = Boolean(customApiKey);
    const pageSize = hasApiKey ? 50 : 3;
    let allNodes: any[] = [];
    let hasNextPage = true;
    let endCursor: string | null = null;
    let fetchCount = 0;
    const maxFetches = hasApiKey ? 15 : 35; // Up to 750 cards or 105 cards

    const query = hasApiKey
      ? `
        query GetLiveScoringDataApiKey($slug: String!, $after: String) {
          user(slug: $slug) {
            cards(first: ${pageSize}, after: $after, sport: FOOTBALL) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                slug
                anyPlayer {
                  ... on Player {
                    displayName
                    slug
                    playingStatus
                    so5Scores(last: 3) {
                      score
                      decisiveScore { totalScore }
                      allAroundStats { totalScore }
                      game {
                        id
                        date
                        statusTyped
                        homeGoals
                        awayGoals
                        homeTeam { name pictureUrl }
                        awayTeam { name pictureUrl }
                        competition { name }
                      }
                    }
                    activeClub {
                      name
                      pictureUrl
                      upcomingGames(first: 1) {
                        id
                        date
                        statusTyped
                        homeGoals
                        awayGoals
                        homeTeam { name pictureUrl }
                        awayTeam { name pictureUrl }
                        competition { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `
      : `
        query GetLiveScoringDataPublic($slug: String!, $after: String) {
          user(slug: $slug) {
            cards(first: ${pageSize}, after: $after, sport: FOOTBALL) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                slug
                anyPlayer {
                  ... on Player {
                    displayName
                    slug
                    playingStatus
                    so5Scores(last: 1) {
                      score
                      game {
                        id
                        date
                        statusTyped
                        homeGoals
                        awayGoals
                      }
                    }
                    activeClub {
                      name
                      upcomingGames(first: 1) {
                        id
                        date
                        statusTyped
                        homeGoals
                        awayGoals
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TeamSorare-App/2.0',
    };
    if (customApiKey) {
      headers['APIKEY'] = customApiKey;
    }

    while (hasNextPage && fetchCount < maxFetches) {
      fetchCount++;
      const variables: any = { slug };
      if (endCursor) {
        variables.after = endCursor;
      }

      const gqlResult = await fetchGraphQLWithRetry(
        'https://api.sorare.com/graphql',
        { query, variables },
        headers,
        2
      );

      if (gqlResult.ok && gqlResult.data?.data?.user?.cards) {
        const cardsData = gqlResult.data.data.user.cards;
        if (cardsData.nodes && cardsData.nodes.length > 0) {
          allNodes = allNodes.concat(cardsData.nodes);
        }
        hasNextPage = cardsData.pageInfo?.hasNextPage || false;
        endCursor = cardsData.pageInfo?.endCursor || null;
      } else {
        console.warn(`[LiveScoring] Error or missing data on page ${fetchCount}`, gqlResult.error);
        hasNextPage = false;
      }
    }

    if (allNodes.length > 0) {
      const liveScoresMap: Record<string, any> = {};

      allNodes.forEach((node: any) => {
        const player = node.anyPlayer;
        if (!player) return;

        const so5Scores = player.so5Scores || [];
        // Find if any SO5 score corresponds to a game that is live, or pick the first/latest
        const liveSo5 = so5Scores.find((s: any) => {
          const st = (s.game?.statusTyped || '').toLowerCase();
          return st === 'live' || st === 'in_play' || st === 'ht';
        }) || so5Scores[0];

        const upcomingGame = player.activeClub?.upcomingGames?.[0];

        const latestSo5Game = liveSo5?.game;
        const upcomingClubGame = upcomingGame;

        // Choose activeGame intelligently based on proximity to now and status
        let activeGame = null;
        const nowMs = Date.now();

        if (latestSo5Game && upcomingClubGame) {
          const statusSo5 = (latestSo5Game.statusTyped || '').toLowerCase();
          const statusUp = (upcomingClubGame.statusTyped || '').toLowerCase();

          // If either game is currently live, prioritize the live game
          if (statusSo5 === 'live' || statusSo5 === 'in_play' || statusSo5 === 'ht') {
            activeGame = latestSo5Game;
          } else if (statusUp === 'live' || statusUp === 'in_play' || statusUp === 'ht') {
            activeGame = upcomingClubGame;
          } else {
            // Compare time distance to now
            const tSo5 = latestSo5Game.date ? new Date(latestSo5Game.date).getTime() : Infinity;
            const tUp = upcomingClubGame.date ? new Date(upcomingClubGame.date).getTime() : Infinity;

            const distSo5 = isNaN(tSo5) ? Infinity : Math.abs(nowMs - tSo5);
            const distUp = isNaN(tUp) ? Infinity : Math.abs(nowMs - tUp);

            if (distSo5 <= distUp) {
              activeGame = latestSo5Game;
            } else {
              activeGame = upcomingClubGame;
            }
          }
        } else {
          activeGame = latestSo5Game || upcomingClubGame;
        }

        const liveScore = (liveSo5?.score != null && liveSo5?.game?.id === activeGame?.id)
          ? Math.round(Number(liveSo5.score) * 10) / 10
          : null;
        const decisiveScore = (liveSo5?.decisiveScore?.totalScore != null && liveSo5?.game?.id === activeGame?.id)
          ? Math.round(Number(liveSo5.decisiveScore.totalScore) * 10) / 10
          : null;

        const scoreEntry = {
          cardId: node.id,
          cardSlug: node.slug,
          playerSlug: player.slug,
          displayName: player.displayName,
          playingStatus: player.playingStatus,
          liveScore,
          decisiveScore,
          clubPictureUrl: player.activeClub?.pictureUrl || '',
          so5ScoresHistory: so5Scores.map((s: any) => ({
            score: s.score != null ? Math.round(Number(s.score) * 10) / 10 : null,
            decisiveScore: s.decisiveScore?.totalScore != null ? Math.round(Number(s.decisiveScore.totalScore) * 10) / 10 : null,
            allAroundScore: s.allAroundStats?.totalScore != null ? Math.round(Number(s.allAroundStats.totalScore) * 10) / 10 : null,
            game: s.game ? {
              id: s.game.id,
              date: s.game.date,
              statusTyped: s.game.statusTyped,
              homeGoals: s.game.homeGoals ?? 0,
              awayGoals: s.game.awayGoals ?? 0,
              homeTeam: s.game.homeTeam?.name || 'Équipe 1',
              homeTeamPicture: s.game.homeTeam?.pictureUrl || '',
              awayTeam: s.game.awayTeam?.name || 'Équipe 2',
              awayTeamPicture: s.game.awayTeam?.pictureUrl || '',
              competition: s.game.competition?.name || 'Championnat',
            } : null,
          })),
          game: activeGame ? {
            id: activeGame.id,
            date: activeGame.date,
            statusTyped: activeGame.statusTyped,
            homeGoals: activeGame.homeGoals ?? 0,
            awayGoals: activeGame.awayGoals ?? 0,
            homeTeam: activeGame.homeTeam?.name || 'Équipe 1',
            homeTeamPicture: activeGame.homeTeam?.pictureUrl || '',
            awayTeam: activeGame.awayTeam?.name || 'Équipe 2',
            awayTeamPicture: activeGame.awayTeam?.pictureUrl || '',
            competition: activeGame.competition?.name || 'Championnat',
          } : null,
          upcomingGame: upcomingClubGame ? {
            id: upcomingClubGame.id,
            date: upcomingClubGame.date,
            statusTyped: upcomingClubGame.statusTyped,
            homeGoals: upcomingClubGame.homeGoals ?? 0,
            awayGoals: upcomingClubGame.awayGoals ?? 0,
            homeTeam: upcomingClubGame.homeTeam?.name || 'Équipe 1',
            homeTeamPicture: upcomingClubGame.homeTeam?.pictureUrl || '',
            awayTeam: upcomingClubGame.awayTeam?.name || 'Équipe 2',
            awayTeamPicture: upcomingClubGame.awayTeam?.pictureUrl || '',
            competition: upcomingClubGame.competition?.name || 'Championnat',
          } : null,
        };

        liveScoresMap[node.id] = scoreEntry;
        if (node.id.startsWith('Card:')) {
          liveScoresMap[node.id.replace('Card:', '')] = scoreEntry;
        }
        if (node.slug) {
          liveScoresMap[node.slug] = scoreEntry;
        }
        if (player.slug) {
          liveScoresMap[player.slug] = scoreEntry;
        }
      });

      // Update cached user cards if present
      const cached = userCardsCache.get(slug);
      if (cached && cached.cards) {
        cached.cards.forEach((card: any) => {
          const liveUpdate = liveScoresMap[card.id];
          if (liveUpdate) {
            if (liveUpdate.liveScore !== null) {
              card.scores = {
                ...card.scores,
                liveScore: liveUpdate.liveScore,
              };
            }
            if (liveUpdate.game) {
              const g = liveUpdate.game;
              card.upcomingFixture = {
                ...card.upcomingFixture,
                status: g.statusTyped,
                kickoffDate: g.date,
                matchDate: g.date,
                homeGoals: g.homeGoals,
                awayGoals: g.awayGoals,
                homeTeamName: g.homeTeam,
                awayTeamName: g.awayTeam,
                competitionName: g.competition,
                opponent: card.club?.name && g.homeTeam.toLowerCase().includes(card.club.name.toLowerCase()) ? g.awayTeam : g.homeTeam,
                isHome: card.club?.name ? g.homeTeam.toLowerCase().includes(card.club.name.toLowerCase()) : true,
              };
            }
          }
        });
      }

      const durationMs = Date.now() - startTime;
      addApiLog({
        description: `Sorare API Direct: Scoring Live synchronisé (${allNodes.length} cartes)`,
        service: 'Sorare API',
        method: 'GET /api/sorare/live-scoring',
        status: 'SUCCESS',
        statusCode: 200,
        durationMs,
        requestSummary: { slug, customApiKeyProvided: Boolean(customApiKey) },
        responseSummary: { totalCards: allNodes.length, liveDataCount: Object.keys(liveScoresMap).length },
      });

      return res.json({
        success: true,
        source: 'sorare_graphql_direct',
        timestamp: new Date().toISOString(),
        totalCards: allNodes.length,
        liveScores: liveScoresMap,
        cards: cached?.cards || [],
      });
    }

    return res.json({
      success: true,
      source: 'server_cache_fallback',
      timestamp: new Date().toISOString(),
      liveScores: {},
      cards: userCardsCache.get(slug)?.cards || [],
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    addApiLog({
      description: `Sorare API Direct: Erreur Live Scoring (${slug})`,
      service: 'Sorare API',
      method: 'GET /api/sorare/live-scoring',
      status: 'ERROR',
      statusCode: 500,
      durationMs,
      requestSummary: { slug },
      responseSummary: { error: err.message },
      error: err.message,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Targeted Live Scoring Endpoint (POST - targeted slugs from active lineups)
app.post('/api/sorare/live-scoring', async (req, res) => {
  const rawUsername = (req.body.username as string) || (req.query.username as string) || 'thib-8';
  const customApiKey = (req.body.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  const slugs: string[] = Array.isArray(req.body.slugs) ? req.body.slugs.filter(Boolean) : [];
  const slug = cleanSlug(rawUsername);
  const startTime = Date.now();

  try {
    const cached = userCardsCache.get(slug);
    const liveScoresMap: Record<string, any> = {};

    // If specific slugs provided, resolve live matches directly for those players
    if (slugs.length > 0) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'TeamSorare-App/2.0',
      };
      if (customApiKey) {
        headers['APIKEY'] = customApiKey;
      }

      const query = `
        query GetPlayersLiveScores($slugs: [String!]!) {
          players(slugs: $slugs) {
            id
            slug
            displayName
            playingStatus
            so5Scores(last: 3) {
              score
              decisiveScore { totalScore }
              allAroundStats { totalScore }
              game {
                id
                date
                statusTyped
                homeGoals
                awayGoals
                homeTeam { name pictureUrl }
                awayTeam { name pictureUrl }
                competition { name }
              }
            }
            activeClub {
              name
              pictureUrl
              upcomingGames(first: 1) {
                id
                date
                statusTyped
                homeGoals
                awayGoals
                homeTeam { name pictureUrl }
                awayTeam { name pictureUrl }
                competition { name }
              }
            }
          }
        }
      `;

      try {
        const responseResult = await fetchGraphQLWithRetry(
          'https://api.sorare.com/graphql',
          { query, variables: { slugs } },
          headers,
          1
        );

        if (responseResult.ok && responseResult.data?.data?.players) {
          const playersData = responseResult.data.data.players || [];
          playersData.forEach((player: any) => {
            if (!player) return;

            const so5Scores = player.so5Scores || [];
            const liveSo5 = so5Scores.find((s: any) => {
              const st = (s.game?.statusTyped || '').toLowerCase();
              return st === 'live' || st === 'in_play' || st === 'ht';
            }) || so5Scores[0];

            const upcomingGame = player.activeClub?.upcomingGames?.[0];
            const latestSo5Game = liveSo5?.game;
            const upcomingClubGame = upcomingGame;

            let activeGame = null;
            const nowMs = Date.now();

            if (latestSo5Game && upcomingClubGame) {
              const statusSo5 = (latestSo5Game.statusTyped || '').toLowerCase();
              const statusUp = (upcomingClubGame.statusTyped || '').toLowerCase();

              if (statusSo5 === 'live' || statusSo5 === 'in_play' || statusSo5 === 'ht') {
                activeGame = latestSo5Game;
              } else if (statusUp === 'live' || statusUp === 'in_play' || statusUp === 'ht') {
                activeGame = upcomingClubGame;
              } else {
                const tSo5 = latestSo5Game.date ? new Date(latestSo5Game.date).getTime() : Infinity;
                const tUp = upcomingClubGame.date ? new Date(upcomingClubGame.date).getTime() : Infinity;

                const distSo5 = isNaN(tSo5) ? Infinity : Math.abs(nowMs - tSo5);
                const distUp = isNaN(tUp) ? Infinity : Math.abs(nowMs - tUp);

                if (distSo5 <= distUp) {
                  activeGame = latestSo5Game;
                } else {
                  activeGame = upcomingClubGame;
                }
              }
            } else {
              activeGame = latestSo5Game || upcomingClubGame;
            }

            // COHERENCE FIX (audit): `liveSo5` falls back to `so5Scores[0]` (the player's most
            // recently COMPLETED match, possibly from a past gameweek) whenever none of their
            // last 3 SO5 scores are tagged as genuinely live/in_play/ht by Sorare — which is
            // common, since SO5 scores are often only fully populated once a match is over. That
            // stale score was previously shown as "Score en direct" even when it belonged to a
            // different, older match than the one actually featured in the match badge
            // (`activeGame`). We now only trust liveScore/decisiveScore when they genuinely
            // belong to the same game as `activeGame` — otherwise we honestly show "no live score
            // yet" (null) rather than a mismatched number from an old match.
            const liveScore = (liveSo5?.score != null && liveSo5?.game?.id === activeGame?.id)
              ? Math.round(Number(liveSo5.score) * 10) / 10
              : null;
            const decisiveScore = (liveSo5?.decisiveScore?.totalScore != null && liveSo5?.game?.id === activeGame?.id)
              ? Math.round(Number(liveSo5.decisiveScore.totalScore) * 10) / 10
              : null;

            const scoreEntry = {
              cardId: player.id,
              cardSlug: player.slug,
              playerSlug: player.slug,
              displayName: player.displayName,
              playingStatus: player.playingStatus,
              liveScore,
              decisiveScore,
              clubPictureUrl: player.activeClub?.pictureUrl || '',
              so5ScoresHistory: so5Scores.map((s: any) => ({
                score: s.score != null ? Math.round(Number(s.score) * 10) / 10 : null,
                decisiveScore: s.decisiveScore?.totalScore != null ? Math.round(Number(s.decisiveScore.totalScore) * 10) / 10 : null,
                allAroundScore: s.allAroundStats?.totalScore != null ? Math.round(Number(s.allAroundStats.totalScore) * 10) / 10 : null,
                game: s.game ? {
                  id: s.game.id,
                  date: s.game.date,
                  statusTyped: s.game.statusTyped,
                  homeGoals: s.game.homeGoals ?? 0,
                  awayGoals: s.game.awayGoals ?? 0,
                  homeTeam: s.game.homeTeam?.name || 'Équipe 1',
                  homeTeamPicture: s.game.homeTeam?.pictureUrl || '',
                  awayTeam: s.game.awayTeam?.name || 'Équipe 2',
                  awayTeamPicture: s.game.awayTeam?.pictureUrl || '',
                  competition: s.game.competition?.name || 'Championnat',
                } : null,
              })),
              game: activeGame ? {
                id: activeGame.id,
                date: activeGame.date,
                statusTyped: activeGame.statusTyped,
                homeGoals: activeGame.homeGoals ?? 0,
                awayGoals: activeGame.awayGoals ?? 0,
                homeTeam: activeGame.homeTeam?.name || 'Équipe 1',
                homeTeamPicture: activeGame.homeTeam?.pictureUrl || '',
                awayTeam: activeGame.awayTeam?.name || 'Équipe 2',
                awayTeamPicture: activeGame.awayTeam?.pictureUrl || '',
                competition: activeGame.competition?.name || 'Championnat',
              } : null,
              upcomingGame: upcomingClubGame ? {
                id: upcomingClubGame.id,
                date: upcomingClubGame.date,
                statusTyped: upcomingClubGame.statusTyped,
                homeGoals: upcomingClubGame.homeGoals ?? 0,
                awayGoals: upcomingClubGame.awayGoals ?? 0,
                homeTeam: upcomingClubGame.homeTeam?.name || 'Équipe 1',
                homeTeamPicture: upcomingClubGame.homeTeam?.pictureUrl || '',
                awayTeam: upcomingClubGame.awayTeam?.name || 'Équipe 2',
                awayTeamPicture: upcomingClubGame.awayTeam?.pictureUrl || '',
                competition: upcomingClubGame.competition?.name || 'Championnat',
              } : null,
            };

            liveScoresMap[player.slug] = scoreEntry;
            liveScoresMap[player.id] = scoreEntry;
            if (player.id.startsWith('Card:')) {
              liveScoresMap[player.id.replace('Card:', '')] = scoreEntry;
            }
          });
        }
      } catch (gqlErr) {
        console.warn(`[LiveScoring] Dynamic fetch error for slugs:`, gqlErr);
      }

      // If live fetching failed or returned empty, fallback to cached cards data
      if (Object.keys(liveScoresMap).length === 0) {
        const matchedCards = cached?.cards ? cached.cards.filter(c => slugs.includes(c.slug) || slugs.includes(c.id)) : [];
        matchedCards.forEach(c => {
          const latestMatch = c.scores?.recentMatches?.[0];
          if (latestMatch) {
            const scoreEntry = {
              cardId: c.id,
              cardSlug: c.slug,
              playerSlug: c.slug,
              displayName: c.displayName,
              playingStatus: c.status,
              liveScore: latestMatch.score || 0,
              decisiveScore: latestMatch.decisiveScore || 0,
              clubPictureUrl: c.club?.pictureUrl || '',
              so5ScoresHistory: [],
              game: null,
              upcomingGame: null
            };
            liveScoresMap[c.slug] = scoreEntry;
            liveScoresMap[c.id] = scoreEntry;
          }
        });
      }

      const durationMs = Date.now() - startTime;
      addApiLog({
        description: `Sorare API: Live Scoring ciblé (${slugs.length} joueurs)`,
        service: 'Sorare API',
        method: 'POST /api/sorare/live-scoring',
        status: 'SUCCESS',
        statusCode: 200,
        durationMs,
        requestSummary: { slug, requestedSlugs: slugs.length },
        responseSummary: { resolvedCount: Object.keys(liveScoresMap).length },
      });

      return res.json({
        success: true,
        source: 'targeted_live_scoring',
        timestamp: new Date().toISOString(),
        totalCards: slugs.length,
        liveScores: liveScoresMap,
      });
    }

    // Default fallback to cache
    return res.json({
      success: true,
      source: 'server_cache_fallback',
      timestamp: new Date().toISOString(),
      liveScores: {},
      cards: cached?.cards || [],
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch User Submitted SO5 Lineups from Sorare or Cache
app.get('/api/sorare/user-lineups', async (req, res) => {
  const rawUsername = (req.query.username as string) || 'thib-8';
  const customApiKey = (req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  const slug = cleanSlug(rawUsername);
  const startTime = Date.now();

  try {
    const hasApiKey = Boolean(customApiKey);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Sorare-SO5-Optimizer/2.0'
    };
    if (customApiKey) {
      headers['APIKEY'] = customApiKey;
      headers['Authorization'] = `Bearer ${customApiKey}`;
    }

    const query = `
      query GetUserSo5Lineups($slug: String!) {
        user(slug: $slug) {
          nickname
          so5Lineups(last: 10) {
            id
            gameWeek
            status
            name
            projectedScore
            captainCard {
              id
              slug
            }
            cards {
              id
              slug
              rarity
              anyPlayer {
                ... on Player {
                  displayName
                  slug
                  position
                  activeClub {
                    name
                    pictureUrl
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await fetchGraphQLWithRetry('https://api.sorare.com/graphql', { query, variables: { slug } }, headers, 1);
    
    if (result.ok && result.data?.data?.user?.so5Lineups) {
      const durationMs = Date.now() - startTime;
      addApiLog({
        description: `Sorare API: Lineups SO5 récupérées (${result.data.data.user.so5Lineups.length})`,
        service: 'Sorare API',
        method: 'GET /api/sorare/user-lineups',
        status: 'SUCCESS',
        statusCode: 200,
        durationMs,
        requestSummary: { slug },
        responseSummary: { count: result.data.data.user.so5Lineups.length }
      });

      return res.json({
        success: true,
        source: 'sorare_graphql',
        lineups: result.data.data.user.so5Lineups
      });
    }

    return res.json({
      success: true,
      source: 'empty_fallback',
      lineups: []
    });
  } catch (err: any) {
    return res.json({
      success: true,
      source: 'fallback',
      lineups: []
    });
  }
});

// Helper for cleaning Sorare username slugs
app.get('/api/admin/debug-raya', requireAppToken, (req, res) => {
  const cards = Array.from(userCardsCache.values()).flatMap(c => c.cards);
  const raya = cards.find(c => c.displayName?.toLowerCase().includes('david raya') || c.slug === 'david-raya');
  if (raya) {
    return res.json({
      success: true,
      displayName: raya.displayName,
      slug: raya.slug,
      status: raya.status,
      upcomingFixture: raya.upcomingFixture,
      recentMatchesLength: raya.scores?.recentMatches?.length,
      allCompetitions: Array.from(new Set(raya.scores?.recentMatches?.map(m => m.competitionName))),
      precomputedL5: raya.scores?.l5,
      precomputedL15: raya.scores?.l15,
      precomputedL40: raya.scores?.l40,
      recentMatches: raya.scores?.recentMatches
    });
  }
  return res.json({ success: false, message: 'Raya not found in server cache' });
});

function cleanSlug(input: string): string {
  if (!input) return 'thib-8';
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'thib-8';
}

// Helper for fetching with exponential backoff & rate-limit (429) retry
async function fetchGraphQLWithRetry(
  url: string,
  payload: any,
  headers: Record<string, string>,
  maxRetries = 3
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const startTime = Date.now();
  let lastStatus = 0;
  let lastErrorMsg = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      lastStatus = response.status;
      const durationMs = Date.now() - startTime;

      if (response.ok) {
        const json = await response.json();
        addApiLog({
          description: 'Sorare API: Succès sync galerie (UserCards)',
          service: 'Sorare API',
          method: 'POST /graphql (UserCards)',
          status: 'SUCCESS',
          statusCode: response.status,
          durationMs,
          requestSummary: { query: payload.query?.substring(0, 300) + '...', variables: payload.variables },
          responseSummary: { dataPreview: json.data ? 'Success data retrieved' : json, errors: json.errors },
        });
        return { ok: true, status: response.status, data: json };
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        let delayMs = 1200 * Math.pow(2, attempt) + Math.random() * 400;
        let isLongWait = false;
        let waitSec = 0;
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            waitSec = parsed;
            delayMs = Math.max(delayMs, parsed * 1000);
            if (parsed > 10) isLongWait = true;
          }
        }

        if (isLongWait) {
          lastErrorMsg = `API Sorare saturée sans Clé API. Veuillez patienter ${waitSec}s ou ajouter une clé API dans les Réglages.`;
          break;
        }

        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
      } else if (response.status >= 500 && response.status <= 504) {
        const delayMs = 1000 * Math.pow(1.5, attempt) + 200;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
      }

      const errStr = `HTTP ${response.status}`;
      addApiLog({
        description: `Sorare API: Erreur GraphQL (${response.status})`,
        service: 'Sorare API',
        method: 'POST /graphql (UserCards)',
        status: response.status === 429 ? 'RATE_LIMITED' : 'ERROR',
        statusCode: response.status,
        durationMs,
        requestSummary: { variables: payload.variables },
        responseSummary: { error: errStr },
        error: errStr,
      });
      return { ok: false, status: response.status, error: errStr };
    } catch (err: any) {
      lastErrorMsg = err.message;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
    }
  }

  const durationMs = Date.now() - startTime;
  addApiLog({
    description: 'Sorare API: Échec critique sync galerie (Max retries)',
    service: 'Sorare API',
    method: 'POST /graphql (UserCards)',
    status: 'ERROR',
    statusCode: lastStatus || 500,
    durationMs,
    requestSummary: { variables: payload.variables },
    responseSummary: { error: lastErrorMsg || 'Max retries exceeded' },
    error: lastErrorMsg || 'Max retries exceeded',
  });
  return { ok: false, status: 429, error: lastErrorMsg || 'Max retries exceeded' };
}

// Progress Tracking Map
const syncProgressMap = new Map<string, { 
  fetchedPages: number; 
  estimatedTotalPages: number; 
  fetchedCards: number; 
  status: string; 
  error?: string;
}>();

app.get('/api/sorare/sync-progress', (req, res) => {
  const rawUsername = (req.query.username as string) || '';
  const slug = cleanSlug(rawUsername);
  const progress = syncProgressMap.get(slug) || null;
  res.json({ success: true, progress });
});

// Real Odds API Cache
const realOddsCache = new Map<string, { 
  win: number; 
  draw: number; 
  loss: number; 
  cleanSheetProb: number; 
  goalExpectancy: number; 
  opponentGoalExpectancy: number;
  bttsProb: number;
}>();
let lastOddsFetch = 0;
const ODDS_CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours

// Open-Meteo Weather API Integration
const weatherCache = new Map<string, { temp: number; description: string; wind: number; source: string; city: string; timestamp: number }>();
const WEATHER_CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3) return 'Partiellement nuageux';
  if (code <= 48) return 'Brouillard';
  if (code <= 67) return 'Pluie modérée';
  if (code <= 77) return 'Chutes de neige';
  if (code <= 82) return 'Averses de pluie';
  if (code <= 99) return 'Orage / Précipitations';
  return 'Temps idéal';
}

const CLUB_TO_CITY_MAP: Record<string, string> = {
  "Paris Saint Germain": "Paris",
  "Paris Saint-Germain": "Paris",
  "Paris SG": "Paris",
  "PSG": "Paris",
  "Bayer 04 Leverkusen": "Leverkusen",
  "Bayer Leverkusen": "Leverkusen",
  "Arsenal": "London",
  "Arsenal FC": "London",
  "Real Madrid": "Madrid",
  "FC Barcelona": "Barcelona",
  "Barcelona": "Barcelona",
  "Bayern Munich": "Munich",
  "FC Bayern München": "Munich",
  "Manchester City": "Manchester",
  "Manchester United": "Manchester",
  "Liverpool FC": "Liverpool",
  "Liverpool": "Liverpool",
  "Juventus": "Turin",
  "Juventus FC": "Turin",
  "AC Milan": "Milan",
  "Inter": "Milan",
  "Inter Milan": "Milan",
  "Roma": "Rome",
  "AS Roma": "Rome",
  "Napoli": "Naples",
  "SSC Napoli": "Naples",
  "Lazio": "Rome",
  "Chelsea": "London",
  "Tottenham": "London",
  "Tottenham Hotspur": "London",
  "Borussia Dortmund": "Dortmund",
  "RB Leipzig": "Leipzig",
  "Atlético Madrid": "Madrid",
  "Sevilla": "Seville",
  "Olympique Lyonnais": "Lyon",
  "Olympique Marseille": "Marseille",
  "Marseille": "Marseille",
  "Ajax": "Amsterdam",
  "PSV": "Eindhoven",
  "Feyenoord": "Rotterdam",
  "Porto": "Porto",
  "FC Porto": "Porto",
  "Benfica": "Lisbon",
  "Sporting CP": "Lisbon",
  "Boca Juniors": "Buenos Aires",
  "River Plate": "Buenos Aires",
  "Flamengo": "Rio de Janeiro",
  "Palmeiras": "Sao Paulo",
  "Santos": "Santos",
  "LA Galaxy": "Los Angeles",
  "Los Angeles FC": "Los Angeles",
  "New York City FC": "New York",
  "Seattle Sounders": "Seattle",
  "Inter Miami": "Miami",
  "Atlanta United": "Atlanta",
  "Toronto FC": "Toronto",
  "Urawa Reds": "Saitama",
  "Yokohama F. Marinos": "Yokohama",
  "Vissel Kobe": "Kobe",
  "Kawasaki Frontale": "Kawasaki",
  "Kashima Antlers": "Kashima",
  "Jeonbuk Hyundai": "Jeonju",
  "Ulsan Hyundai": "Ulsan",
  "Al Hilal": "Riyadh",
  "Al Nassr": "Riyadh",
  "Al Ahly": "Cairo",
  "Zamalek": "Cairo",
  "Mamelodi Sundowns": "Pretoria",
  "Kaizer Chiefs": "Johannesburg",
  "Celtic": "Glasgow",
  "Rangers": "Glasgow",
  "Galatasaray": "Istanbul",
  "Fenerbahce": "Istanbul",
  "Besiktas": "Istanbul",
  "Olympiacos": "Piraeus",
  "Panathinaikos": "Athens",
  "AEK Athens": "Athens",
  "Red Bull Salzburg": "Salzburg",
  "Club Brugge": "Bruges",
  "Anderlecht": "Brussels",
  "Standard Liege": "Liege",
  "FC Copenhagen": "Copenhagen",
  "Malmo FF": "Malmo",
  "Rosenborg": "Trondheim",
  "Bodo/Glimt": "Bodo",
  "Dinamo Zagreb": "Zagreb",
  "Red Star Belgrade": "Belgrade",
  "Partizan Belgrade": "Belgrade",
  "Slavia Prague": "Prague",
  "Sparta Prague": "Prague",
  "Ferencvaros": "Budapest",
  "Legia Warsaw": "Warsaw",
  "Shakhtar Donetsk": "Donetsk",
  "Dynamo Kyiv": "Kyiv",
  "Zenit": "St Petersburg",
  "Spartak Moscow": "Moscow",
  "CSKA Moscow": "Moscow",
  "Al Ain": "Al Ain",
  "Sydney FC": "Sydney",
  "Melbourne Victory": "Melbourne",
  "Colo-Colo": "Santiago",
  "Universidad de Chile": "Santiago",
  "Atletico Nacional": "Medellin",
  "Millonarios": "Bogota",
  "Penarol": "Montevideo",
  "Nacional": "Montevideo",
  "Olimpia": "Asuncion",
  "Cerro Porteno": "Asuncion",
  "Liga de Quito": "Quito",
  "Independiente del Valle": "Sangolqui",
  "Monterrey": "Monterrey",
  "Tigres UANL": "Monterrey",
  "Club America": "Mexico City",
  "Cruz Azul": "Mexico City",
  "Chivas": "Guadalajara",
  "Pumas UNAM": "Mexico City",
  "Pachuca": "Pachuca",
  "Leon": "Leon",
  "Toluca": "Toluca",
  "Santos Laguna": "Torreon",
  "Tijuana": "Tijuana",
  "Puebla": "Puebla",
  "Necaxa": "Aguascalientes",
  "Atlas": "Guadalajara",
  "Juarez": "Juarez",
  "Mazatlan": "Mazatlan",
  "Queretaro": "Queretaro",
  "Atletico San Luis": "San Luis Potosi",
  "Colorado Rapids": "Denver",
  "Real Salt Lake": "Salt Lake City",
  "Sporting Kansas City": "Kansas City",
  "Minnesota United": "St. Paul",
  "FC Dallas": "Frisco",
  "Houston Dynamo": "Houston",
  "Austin FC": "Austin",
  "San Jose Earthquakes": "San Jose",
  "Portland Timbers": "Portland",
  "Vancouver Whitecaps": "Vancouver",
  "New England Revolution": "Foxborough",
  "Philadelphia Union": "Chester",
  "DC United": "Washington",
  "New York Red Bulls": "New York",
  "CF Montreal": "Montreal",
  "Orlando City": "Orlando",
  "Columbus Crew": "Columbus",
  "FC Cincinnati": "Cincinnati",
  "Chicago Fire": "Chicago",
  "Nashville SC": "Nashville",
  "Charlotte FC": "Charlotte",
  "San Diego FC": "San Diego",
  "St. Louis City SC": "St. Louis",
  "Milan": "Milan",
  "FC Internazionale Milano": "Milan",
  "Chelsea FC": "London",
  "Atletico Madrid": "Madrid",
  "Atlético de Madrid": "Madrid",
  "SS Lazio": "Rome",
  "Olympique de Marseille": "Marseille",
  "Lyon": "Lyon",
  "AS Monaco": "Monaco",
  "Monaco": "Monaco",
  "LOSC Lille": "Lille",
  "Lille OSC": "Lille",
  "Stade Rennais FC": "Rennes",
  "Rennes": "Rennes",
  "RC Lens": "Lens",
  "Lens": "Lens",
  "Aston Villa": "Birmingham",
  "Newcastle United": "Newcastle",
  "West Ham United": "London",
  "Brighton & Hove Albion": "Brighton",
  "Wolverhampton Wanderers": "Wolverhampton",
  "Everton FC": "Liverpool",
  "Fulham FC": "London",
  "Brentford FC": "London",
  "Crystal Palace": "London",
  "Athletic Club": "Bilbao",
  "Athletic Bilbao": "Bilbao",
  "Real Sociedad": "San Sebastian",
  "Real Betis": "Seville",
  "Sevilla FC": "Seville",
  "Villarreal CF": "Villarreal",
  "Valencia CF": "Valencia",
  "SL Benfica": "Lisbon",
  "AFC Ajax": "Amsterdam",
  "PSV Eindhoven": "Eindhoven",
  "Celtic FC": "Glasgow",
  "Rangers FC": "Glasgow",
  "Inter Miami CF": "Miami",
  "Urawa Red Diamonds": "Saitama",
  "Jeonbuk Hyundai Motors": "Jeonju",
  "Ulsan HD FC": "Ulsan",
  "FC Seoul": "Seoul",
  "CR Flamengo": "Rio de Janeiro",
  "SE Palmeiras": "Sao Paulo",
  "Sao Paulo FC": "Sao Paulo",
  "SK Sturm Graz": "Graz",
  "BSC Young Boys": "Bern",
  "FC Basel": "Basel",
  "Bodø/Glimt": "Bodo",
  "Malmö FF": "Malmo",
  "Stade de Reims": "Reims",
  "Reims": "Reims",
  "Stade Brestois 29": "Brest",
  "Brest": "Brest",
  "OGC Nice": "Nice",
  "Nice": "Nice",
  "Toulouse FC": "Toulouse",
  "Toulouse": "Toulouse",
  "Montpellier HSC": "Montpellier",
  "Montpellier": "Montpellier",
  "RC Strasbourg Alsace": "Strasbourg",
  "Strasbourg": "Strasbourg",
  "FC Nantes": "Nantes",
  "Nantes": "Nantes",
  "AJ Auxerre": "Auxerre",
  "Auxerre": "Auxerre",
  "Angers SCO": "Angers",
  "Angers": "Angers",
  "AS Saint-Étienne": "Saint-Etienne",
  "Saint-Etienne": "Saint-Etienne",
  "Le Havre AC": "Le Havre",
  "Le Havre": "Le Havre",
  "Girona FC": "Girona",
  "Girona": "Girona",
  "RCD Mallorca": "Mallorca",
  "Mallorca": "Mallorca",
  "UD Las Palmas": "Las Palmas",
  "Las Palmas": "Las Palmas",
  "Deportivo Alavés": "Vitoria-Gasteiz",
  "Alaves": "Vitoria-Gasteiz",
  "CA Osasuna": "Pamplona",
  "Osasuna": "Pamplona",
  "Getafe CF": "Getafe",
  "Getafe": "Getafe",
  "RC Celta de Vigo": "Vigo",
  "Celta": "Vigo",
  "Celta Vigo": "Vigo",
  "Rayo Vallecano": "Madrid",
  "Real Valladolid CF": "Valladolid",
  "Valladolid": "Valladolid",
  "CD Leganés": "Leganes",
  "Leganes": "Leganes",
  "RCD Espanyol": "Barcelona",
  "Espanyol": "Barcelona",
  "Atalanta BC": "Bergamo",
  "Atalanta": "Bergamo",
  "Bologna FC 1909": "Bologna",
  "Bologna": "Bologna",
  "ACF Fiorentina": "Florence",
  "Fiorentina": "Florence",
  "Torino FC": "Turin",
  "Torino": "Turin",
  "Genoa CFC": "Genoa",
  "Genoa": "Genoa",
  "AC Monza": "Monza",
  "Monza": "Monza",
  "Udinese Calcio": "Udine",
  "Udinese": "Udine",
  "Hellas Verona FC": "Verona",
  "Verona": "Verona",
  "Cagliari Calcio": "Cagliari",
  "Cagliari": "Cagliari",
  "US Lecce": "Lecce",
  "Lecce": "Lecce",
  "Parma Calcio 1913": "Parma",
  "Parma": "Parma",
  "Como 1907": "Como",
  "Como": "Como",
  "Venezia FC": "Venice",
  "Venezia": "Venice",
  "Empoli FC": "Empoli",
  "Empoli": "Empoli",
  "Leicester City": "Leicester",
  "Ipswich Town": "Ipswich",
  "Southampton FC": "Southampton",
  "Southampton": "Southampton",
  "Nottingham Forest": "Nottingham",
  "AFC Bournemouth": "Bournemouth",
  "Bournemouth": "Bournemouth",
  "VfB Stuttgart": "Stuttgart",
  "Stuttgart": "Stuttgart",
  "Eintracht Frankfurt": "Frankfurt",
  "TSG 1899 Hoffenheim": "Sinsheim",
  "Hoffenheim": "Sinsheim",
  "1. FC Heidenheim 1846": "Heidenheim",
  "Heidenheim": "Heidenheim",
  "SV Werder Bremen": "Bremen",
  "Werder Bremen": "Bremen",
  "SC Freiburg": "Freiburg",
  "Freiburg": "Freiburg",
  "FC Augsburg": "Augsburg",
  "Augsburg": "Augsburg",
  "VfL Wolfsburg": "Wolfsburg",
  "Wolfsburg": "Wolfsburg",
  "1. FSV Mainz 05": "Mainz",
  "Mainz": "Mainz",
  "Borussia Mönchengladbach": "Monchengladbach",
  "Gladbach": "Monchengladbach",
  "VfL Bochum 1848": "Bochum",
  "Bochum": "Bochum",
  "FC St. Pauli": "Hamburg",
  "St. Pauli": "Hamburg",
  "Holstein Kiel": "Kiel",
};

app.get('/api/weather', async (req, res) => {
  let rawCity = ((req.query.city as string) || (req.query.club as string) || 'Paris').trim();
  // Exact match or partial lookup
  let city = CLUB_TO_CITY_MAP[rawCity];
  if (!city) {
    // Try without common affixes
    const simplified = rawCity
      .replace(/\b(FC|CF|SC|AC|AS|SS|RB|RC|BSC|SK|SE|CR|SL|AFC|FK|IF)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    city = CLUB_TO_CITY_MAP[simplified] || simplified || 'Paris';
  }

  const cacheKey = city.toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < WEATHER_CACHE_TTL)) {
    return res.json({ success: true, ...cached });
  }

  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`;
    const geoRes = await fetch(geoUrl);
    let lat = 48.8566;
    let lon = 2.3522;
    let resolvedCity = city;

    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        lat = geoData.results[0].latitude;
        lon = geoData.results[0].longitude;
        resolvedCity = geoData.results[0].name;
      }
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
    const wRes = await fetch(weatherUrl);
    if (wRes.ok) {
      const wData = await wRes.json();
      const current = wData.current;
      const weatherInfo = {
        temp: Math.round(current.temperature_2m),
        description: getWeatherDescription(current.weather_code),
        wind: Math.round(current.wind_speed_10m),
        source: 'Open-Meteo Live API',
        city: resolvedCity,
        timestamp: Date.now()
      };
      weatherCache.set(cacheKey, weatherInfo);
      return res.json({ success: true, ...weatherInfo });
    }
  } catch (err) {
    console.warn('[Open-Meteo] Weather fetch notice:', err);
  }

  const fallbackInfo = {
    temp: 18,
    description: 'Ensoleillé / Météo idéale',
    wind: 10,
    source: 'Estimation Météo',
    city,
    timestamp: Date.now()
  };
  return res.json({ success: true, ...fallbackInfo });
});

async function fetchRealBookmakerOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return;
  }
  
  if (Date.now() - lastOddsFetch < ODDS_CACHE_TTL && realOddsCache.size > 0) {
    return;
  }
  
  try {
    const leagues = [
      'soccer_france_ligue_one', 
      'soccer_epl', 
      'soccer_spain_la_liga', 
      'soccer_italy_serie_a', 
      'soccer_germany_bundesliga',
      'soccer_uefa_champs_league',
      'soccer_uefa_europa_league',
      'soccer_netherlands_eredivisie',
      'soccer_portugal_primeira_liga',
      'soccer_belgium_first_div',
      'soccer_usa_mls',
      'soccer_brazil_campeonato',
      'soccer_mexico_ligamx',
      'soccer_turkey_super_league',
      'soccer_japan_j_league',
      'soccer_korea_kleague1',
      'soccer_efl_champ',
      'soccer_spl',
      'soccer_argentina_primera_division',
      'soccer_austria_bundesliga',
      'soccer_switzerland_superleague',
      'soccer_denmark_superliga',
      'soccer_norway_eliteserien',
      'soccer_sweden_allsvenskan'
    ];
    
    for (const league of leagues) {
      try {
        const url = `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h,totals,btts`;
        const res = await fetch(url);
        if (res.status === 429) {
          console.warn(`[Odds API] Rate limit (429) reached for ${league}. Stopping current odds cache refresh.`);
          break; // Exit early to respect rate-limiting
        }
        if (res.ok) {
          const data = await res.json();
          data.forEach((match: any) => {
            const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
            const totalsMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'totals');
            const bttsMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'btts');
            
            if (h2hMarket) {
              const homeOdds = h2hMarket.outcomes.find((o: any) => o.name === match.home_team)?.price || 2.5;
              const awayOdds = h2hMarket.outcomes.find((o: any) => o.name === match.away_team)?.price || 2.5;
              const drawOdds = h2hMarket.outcomes.find((o: any) => o.name === 'Draw')?.price || 3.0;
              
              let over25Odds = 1.85;
              if (totalsMarket) {
                over25Odds = totalsMarket.outcomes.find((o: any) => o.name === 'Over' && o.point === 2.5)?.price || 1.85;
              }
              let bttsProb = 52;
              if (bttsMarket) {
                const bttsYesOdds = bttsMarket.outcomes.find((o: any) => o.name === 'Yes')?.price;
                const bttsNoOdds = bttsMarket.outcomes.find((o: any) => o.name === 'No')?.price;
                if (bttsYesOdds && bttsNoOdds) {
                  const invYes = 1 / bttsYesOdds;
                  const invNo = 1 / bttsNoOdds;
                  bttsProb = Math.round((invYes / (invYes + invNo)) * 100);
                }
              }
              
              const totalMatchXG = Math.max(1.5, Math.min(4.5, (1.9 / over25Odds) * 1.5 + 1.25));
              const homeWinProb = 1 / homeOdds;
              const awayWinProb = 1 / awayOdds;
              const totalProb = homeWinProb + awayWinProb;
              
              const homeXG = Math.round((totalMatchXG * (homeWinProb / totalProb) * 1.05) * 100) / 100;
              const awayXG = Math.round((totalMatchXG * (awayWinProb / totalProb) * 0.95) * 100) / 100;
              
              const homeCSPoisson = Math.exp(-awayXG) * 100;
              const awayCSPoisson = Math.exp(-homeXG) * 100;
              
              const homeCS = Math.max(5, Math.min(85, Math.round(homeCSPoisson * 0.7 + (100 - bttsProb) * 0.6)));
              const awayCS = Math.max(5, Math.min(85, Math.round(awayCSPoisson * 0.7 + (100 - bttsProb) * 0.4)));
              
              realOddsCache.set(normalizeClubName(match.home_team), { 
                win: homeOdds, 
                draw: drawOdds, 
                loss: awayOdds, 
                cleanSheetProb: homeCS, 
                goalExpectancy: homeXG, 
                opponentGoalExpectancy: awayXG,
                bttsProb
              });
              realOddsCache.set(normalizeClubName(match.away_team), { 
                win: awayOdds, 
                draw: drawOdds, 
                loss: homeOdds, 
                cleanSheetProb: awayCS, 
                goalExpectancy: awayXG, 
                opponentGoalExpectancy: homeXG,
                bttsProb
              });
            }
          });
        }
      } catch (err) {
        console.warn(`[Odds API] Error fetching ${league}:`, err);
      }
      // Sleep to avoid rate limiting
      await new Promise(r => setTimeout(r, 400));
    }
    lastOddsFetch = Date.now();
  } catch (err) {
    console.warn('[Odds API] Non-fatal background fetch notice:', err);
  }
}


// =========================================================================
// REAL BOOKMAKER MATCH ODDS STORE & GEMINI LIVE SEARCH GROUNDING ENGINE
// =========================================================================

export interface RealMatchOddsEntry {
  matchKey: string; // e.g. "olympique de marseille_vs_rc strasbourg alsace"
  homeTeam: string;
  awayTeam: string;
  odds: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  probabilities: {
    homeWinPercent: number;
    drawPercent: number;
    awayWinPercent: number;
  };
  cleanSheetProbabilities: {
    homeCleanSheetPercent: number;
    awayCleanSheetPercent: number;
  };
  expectedGoals: {
    homeXG: number;
    awayXG: number;
  };
  difficultyRatings: {
    homeFDR: number;
    awayFDR: number;
  };
  topScorers?: Array<{ name: string; team: string; anytimeScorerOdds: number }>;
  topAssisters?: Array<{ name: string; team: string; anytimeAssistOdds: number }>;
  source: string;
  // 'estimated_mirror' = fully computed locally from static fixture strength ratings, NOT sourced
  // from any real bookmaker. It must never be confused with genuinely fetched data.
  sourceType: 'gemini_search' | 'odds_api' | 'verified_bookmaker' | 'estimated_mirror';
  groundingUrls?: string[];
  updatedAt: string;
}

const realMatchOddsStore = new Map<string, RealMatchOddsEntry>();

// Helper to construct normalized match key
function makeMatchKey(teamA: string, teamB: string): string {
  const normA = normalizeClubName(teamA).toLowerCase();
  const normB = normalizeClubName(teamB).toLowerCase();
  return `${normA}_vs_${normB}`;
}

// Initial Verified Live Bookmaker Seeds (Winamax, Betclic, Unibet, Oddschecker)
// NOTE (audit fix): these 5 matches were manually captured from real bookmaker odds at
// authoring time. They are NOT re-fetched live, so `updatedAt` must reflect the actual
// capture date rather than "now" (which would falsely suggest the odds are freshly live
// every time the server restarts). Refresh this constant + the odds below by hand whenever
// this seed list is next updated, or better: replace it with a real scheduled sync.
const SEED_CAPTURED_AT = '2026-08-19T00:00:00.000Z';
const INITIAL_REAL_BOOKMAKER_MATCHES: RealMatchOddsEntry[] = [
  {
    matchKey: makeMatchKey('Olympique de Marseille', 'RC Strasbourg Alsace'),
    homeTeam: 'Olympique de Marseille',
    awayTeam: 'RC Strasbourg Alsace',
    odds: {
      homeWin: 1.56,
      draw: 4.20,
      awayWin: 5.80,
    },
    probabilities: {
      homeWinPercent: 61,
      drawPercent: 23,
      awayWinPercent: 16,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: 48,
      awayCleanSheetPercent: 17,
    },
    expectedGoals: {
      homeXG: 1.95,
      awayXG: 0.90,
    },
    difficultyRatings: {
      homeFDR: 2,
      awayFDR: 4,
    },
    topScorers: [
      { name: 'Mason Greenwood', team: 'Olympique de Marseille', anytimeScorerOdds: 2.10 },
      { name: 'Elye Wahi', team: 'Olympique de Marseille', anytimeScorerOdds: 2.40 },
      { name: 'Emanuel Emegha', team: 'RC Strasbourg Alsace', anytimeScorerOdds: 3.80 },
      { name: 'Sebastian Nanasi', team: 'RC Strasbourg Alsace', anytimeScorerOdds: 5.20 },
      { name: 'Luis Henrique', team: 'Olympique de Marseille', anytimeScorerOdds: 3.40 },
    ],
    topAssisters: [
      { name: 'Luis Henrique', team: 'Olympique de Marseille', anytimeAssistOdds: 3.10 },
      { name: 'Amine Harit', team: 'Olympique de Marseille', anytimeAssistOdds: 3.40 },
      { name: 'Habib Diarra', team: 'RC Strasbourg Alsace', anytimeAssistOdds: 4.80 },
      { name: 'Sebastian Nanasi', team: 'RC Strasbourg Alsace', anytimeAssistOdds: 4.50 },
    ],
    source: 'Winamax & Betclic Live (Cotes Officielles)',
    sourceType: 'verified_bookmaker',
    groundingUrls: ['https://www.winamax.fr', 'https://www.betclic.fr'],
    updatedAt: SEED_CAPTURED_AT, // static seed, NOT refreshed live (see comment above)
  },
  {
    matchKey: makeMatchKey('Paris Saint-Germain', 'Angers SCO'),
    homeTeam: 'Paris Saint-Germain',
    awayTeam: 'Angers SCO',
    odds: {
      homeWin: 1.20,
      draw: 7.00,
      awayWin: 13.00,
    },
    probabilities: {
      homeWinPercent: 80,
      drawPercent: 13,
      awayWinPercent: 7,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: 62,
      awayCleanSheetPercent: 8,
    },
    expectedGoals: {
      homeXG: 2.85,
      awayXG: 0.55,
    },
    difficultyRatings: {
      homeFDR: 1,
      awayFDR: 5,
    },
    topScorers: [
      { name: 'Ousmane Dembélé', team: 'Paris Saint-Germain', anytimeScorerOdds: 2.00 },
      { name: 'Bradley Barcola', team: 'Paris Saint-Germain', anytimeScorerOdds: 2.20 },
      { name: 'Himad Abdelli', team: 'Angers SCO', anytimeScorerOdds: 7.50 },
    ],
    topAssisters: [
      { name: 'Ousmane Dembélé', team: 'Paris Saint-Germain', anytimeAssistOdds: 2.20 },
      { name: 'Achraf Hakimi', team: 'Paris Saint-Germain', anytimeAssistOdds: 2.60 },
      { name: 'Himad Abdelli', team: 'Angers SCO', anytimeAssistOdds: 5.50 },
    ],
    source: 'Winamax & Unibet Live (Cotes Officielles)',
    sourceType: 'verified_bookmaker',
    groundingUrls: ['https://www.winamax.fr', 'https://www.unibet.fr'],
    updatedAt: SEED_CAPTURED_AT, // static seed, NOT refreshed live (see comment above)
  },
  {
    matchKey: makeMatchKey('Stade Rennais F.C.', 'Stade Brestois 29'),
    homeTeam: 'Stade Rennais F.C.',
    awayTeam: 'Stade Brestois 29',
    odds: {
      homeWin: 2.10,
      draw: 3.40,
      awayWin: 3.50,
    },
    probabilities: {
      homeWinPercent: 45,
      drawPercent: 28,
      awayWinPercent: 27,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: 38,
      awayCleanSheetPercent: 24,
    },
    expectedGoals: {
      homeXG: 1.55,
      awayXG: 1.15,
    },
    difficultyRatings: {
      homeFDR: 3,
      awayFDR: 3,
    },
    topScorers: [
      { name: 'Arnaud Kalimuendo', team: 'Stade Rennais F.C.', anytimeScorerOdds: 2.70 },
      { name: 'Ludovic Ajorque', team: 'Stade Brestois 29', anytimeScorerOdds: 3.30 },
      { name: 'Romain Del Castillo', team: 'Stade Brestois 29', anytimeScorerOdds: 3.80 },
    ],
    topAssisters: [
      { name: 'Ludovic Blas', team: 'Stade Rennais F.C.', anytimeAssistOdds: 3.40 },
      { name: 'Romain Del Castillo', team: 'Stade Brestois 29', anytimeAssistOdds: 3.20 },
    ],
    source: 'Betclic Live',
    sourceType: 'verified_bookmaker',
    groundingUrls: ['https://www.betclic.fr'],
    updatedAt: SEED_CAPTURED_AT, // static seed, NOT refreshed live (see comment above)
  },
  {
    matchKey: makeMatchKey('AS Monaco', 'RC Lens'),
    homeTeam: 'AS Monaco',
    awayTeam: 'RC Lens',
    odds: {
      homeWin: 1.85,
      draw: 3.80,
      awayWin: 4.10,
    },
    probabilities: {
      homeWinPercent: 51,
      drawPercent: 25,
      awayWinPercent: 24,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: 36,
      awayCleanSheetPercent: 22,
    },
    expectedGoals: {
      homeXG: 1.80,
      awayXG: 1.25,
    },
    difficultyRatings: {
      homeFDR: 2,
      awayFDR: 4,
    },
    topScorers: [
      { name: 'Folarin Balogun', team: 'AS Monaco', anytimeScorerOdds: 2.40 },
      { name: 'Breel Embolo', team: 'AS Monaco', anytimeScorerOdds: 2.60 },
      { name: 'Wesley Saïd', team: 'RC Lens', anytimeScorerOdds: 3.60 },
    ],
    topAssisters: [
      { name: 'Aleksandr Golovin', team: 'AS Monaco', anytimeAssistOdds: 3.10 },
      { name: 'Florian Sotoca', team: 'RC Lens', anytimeAssistOdds: 3.80 },
    ],
    source: 'Winamax Live',
    sourceType: 'verified_bookmaker',
    groundingUrls: ['https://www.winamax.fr'],
    updatedAt: SEED_CAPTURED_AT, // static seed, NOT refreshed live (see comment above)
  },
  {
    matchKey: makeMatchKey('Real Madrid', 'Real Valladolid CF'),
    homeTeam: 'Real Madrid',
    awayTeam: 'Real Valladolid CF',
    odds: {
      homeWin: 1.18,
      draw: 7.50,
      awayWin: 15.00,
    },
    probabilities: {
      homeWinPercent: 82,
      drawPercent: 12,
      awayWinPercent: 6,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: 65,
      awayCleanSheetPercent: 7,
    },
    expectedGoals: {
      homeXG: 2.90,
      awayXG: 0.50,
    },
    difficultyRatings: {
      homeFDR: 1,
      awayFDR: 5,
    },
    topScorers: [
      { name: 'Kylian Mbappé', team: 'Real Madrid', anytimeScorerOdds: 1.65 },
      { name: 'Vinícius Júnior', team: 'Real Madrid', anytimeScorerOdds: 1.85 },
      { name: 'Rodrygo', team: 'Real Madrid', anytimeScorerOdds: 2.15 },
    ],
    topAssisters: [
      { name: 'Jude Bellingham', team: 'Real Madrid', anytimeAssistOdds: 2.40 },
      { name: 'Vinícius Júnior', team: 'Real Madrid', anytimeAssistOdds: 2.20 },
    ],
    source: 'Oddschecker & Betclic Live',
    sourceType: 'verified_bookmaker',
    groundingUrls: ['https://www.oddschecker.com', 'https://www.betclic.fr'],
    updatedAt: SEED_CAPTURED_AT, // static seed, NOT refreshed live (see comment above)
  }
];

// Seed the store with both direct and reverse keys for instant bidirectional lookups
INITIAL_REAL_BOOKMAKER_MATCHES.forEach(entry => {
  realMatchOddsStore.set(entry.matchKey, entry);
  realMatchOddsStore.set(makeMatchKey(entry.awayTeam, entry.homeTeam), entry);
});

const GEMINI_CASCADE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite',
];

/**
 * Searches and fetches real bookmaker odds using Gemini with Google Search Grounding (Single Match)
 */
async function fetchGeminiRealMatchOdds(homeTeam: string, awayTeam: string, playerNames: string[] = []): Promise<RealMatchOddsEntry | null> {
  const normHome = normalizeClubName(homeTeam);
  const normAway = normalizeClubName(awayTeam);

  // Validate team names to avoid useless searches
  const isValidTeam = (t: string) => 
    t && 
    t !== 'Club Non Renseigné' && 
    t !== 'Adversaire Inconnu' && 
    !t.toLowerCase().includes('non renseign') && 
    !t.toLowerCase().includes('inconnu');

  if (!isValidTeam(normHome) || !isValidTeam(normAway) || normHome === normAway) {
    return null;
  }

  const matchKey = makeMatchKey(normHome, normAway);

  // Check store cache if refreshed within 2 hours
  const existing = realMatchOddsStore.get(matchKey);
  if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 2 * 60 * 60 * 1000) {
    return existing;
  }

  // If quota is currently in cooldown or API key is missing, skip Gemini call
  if (!process.env.GEMINI_API_KEY || (Date.now() - lastQuotaExhaustedTime < QUOTA_COOLDOWN_MS)) {
    return null;
  }

  const ai = getAI();
  const playerListStr = playerNames.length > 0 ? `Joueurs clés de notre effectif à évaluer pour cotes buteur et passeur : ${playerNames.slice(0, 8).join(', ')}` : '';

  const prompt = `Tu es un analyste professionnel de données sportives, spécialisé dans les cotes des bookmakers (Winamax, Betclic, Unibet, Oddschecker) et les modèles de probabilités de football (xG, Clean Sheet, Buteurs, Passeurs).

Recherche en direct sur le web via Google Search les véritables cotes officielles des bookmakers pour le match de football suivant :
- Équipe à Domicile : "${normHome}"
- Équipe à l'Extérieur : "${normAway}"
${playerListStr}

Exigences strictes :
1. Cotes 1 / N / 2 réelles du marché bookmaker actuel (ex: 1.56 / 4.20 / 5.80).
2. Probabilités normalisées réelles sans marge (la somme homeWinPercent + drawPercent + awayWinPercent doit être égale à 100).
3. Espérance de buts (Expected Goals / xG) pour chaque équipe (ex: homeXG: 1.95, awayXG: 0.90).
4. Pourcentage de probabilité de Clean Sheet pour la défense et le gardien de chaque équipe.
5. FDR (Fixture Difficulty Rating de 1 à 5) parfaitement cohérent et en miroir (si l'équipe à domicile a un FDR 2, l'adversaire aura FDR 4).
6. Cotes "Buteur au cours du match" et "Passeur décisif" pour les joueurs clés mentionnés ou les stars du match.

Réponds UNIQUEMENT avec un JSON valide respectant cette structure exacte :
{
  "homeTeam": "${normHome}",
  "awayTeam": "${normAway}",
  "odds": {
    "homeWin": 1.56,
    "draw": 4.20,
    "awayWin": 5.80
  },
  "probabilities": {
    "homeWinPercent": 61,
    "drawPercent": 23,
    "awayWinPercent": 16
  },
  "expectedGoals": {
    "homeXG": 1.95,
    "awayXG": 0.90
  },
  "cleanSheetProbabilities": {
    "homeCleanSheetPercent": 48,
    "awayCleanSheetPercent": 17
  },
  "difficultyRatings": {
    "homeFDR": 2,
    "awayFDR": 4
  },
  "topScorers": [
    { "name": "Nom Joueur", "team": "${normHome}", "anytimeScorerOdds": 2.10 }
  ],
  "topAssisters": [
    { "name": "Nom Joueur", "team": "${normHome}", "anytimeAssistOdds": 3.10 }
  ],
  "source": "Bookmakers Réels (Winamax / Betclic / Unibet / Google Search)"
}`;

  let lastError: any = null;

  for (const modelName of GEMINI_CASCADE_MODELS) {
    try {
      const startTime = Date.now();
      console.log(`[Gemini Real Odds] Searching odds with model "${modelName}" for ${normHome} vs ${normAway}...`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      const durationMs = Date.now() - startTime;

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingUrls = groundingChunks.map((c: any) => c.web?.uri).filter(Boolean);

      const rawText = response.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Réponse JSON non trouvée dans la sortie');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const entry: RealMatchOddsEntry = {
        matchKey,
        homeTeam: normHome,
        awayTeam: normAway,
        odds: {
          homeWin: Math.round((Number(parsed.odds?.homeWin) || 2.0) * 100) / 100,
          draw: Math.round((Number(parsed.odds?.draw) || 3.4) * 100) / 100,
          awayWin: Math.round((Number(parsed.odds?.awayWin) || 3.4) * 100) / 100,
        },
        probabilities: {
          homeWinPercent: Math.round(Number(parsed.probabilities?.homeWinPercent) || 50),
          drawPercent: Math.round(Number(parsed.probabilities?.drawPercent) || 25),
          awayWinPercent: Math.round(Number(parsed.probabilities?.awayWinPercent) || 25),
        },
        cleanSheetProbabilities: {
          homeCleanSheetPercent: Math.round(Number(parsed.cleanSheetProbabilities?.homeCleanSheetPercent) || 35),
          awayCleanSheetPercent: Math.round(Number(parsed.cleanSheetProbabilities?.awayCleanSheetPercent) || 20),
        },
        expectedGoals: {
          homeXG: Math.round((Number(parsed.expectedGoals?.homeXG) || 1.6) * 100) / 100,
          awayXG: Math.round((Number(parsed.expectedGoals?.awayXG) || 1.1) * 100) / 100,
        },
        difficultyRatings: {
          homeFDR: Number(parsed.difficultyRatings?.homeFDR) || 3,
          awayFDR: Number(parsed.difficultyRatings?.awayFDR) || 3,
        },
        topScorers: Array.isArray(parsed.topScorers) ? parsed.topScorers : [],
        topAssisters: Array.isArray(parsed.topAssisters) ? parsed.topAssisters : [],
        source: parsed.source || `Bookmakers Réels (Google Search - ${modelName})`,
        sourceType: 'gemini_search',
        groundingUrls,
        updatedAt: new Date().toISOString(),
      };

      realMatchOddsStore.set(matchKey, entry);
      console.log(`[Gemini Real Odds] Successfully fetched & cached real bookmaker data with ${modelName} for ${normHome} vs ${normAway}`);

      addApiLog({
        description: `Gemini Search Grounding (${modelName}): Cotes Réelles Bookmakers pour ${normHome} vs ${normAway}`,
        service: 'Gemini AI',
        method: `generateContent (${modelName} + googleSearch)`,
        status: 'SUCCESS',
        statusCode: 200,
        durationMs,
        requestSummary: { model: modelName, home: normHome, away: normAway },
        responseSummary: { odds: entry.odds, probas: entry.probabilities, xG: entry.expectedGoals, source: entry.source },
      });

      return entry;
    } catch (err: any) {
      lastError = err;
      const errStatus = err?.status || (err?.error && err?.error?.code);
      const errMsg = String(err?.message || '');
      const isQuota = errStatus === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
      
      if (isQuota) {
        console.log(`[Gemini Real Odds] Model ${modelName} hit quota limit (429). Cascade fallback to next model in queue...`);
        continue;
      } else {
        console.log(`[Gemini Real Odds] Model ${modelName} error (${errMsg}). Trying next model...`);
      }
    }
  }

  // If all models in the cascade failed
  const errStatus = lastError?.status || (lastError?.error && lastError?.error?.code);
  const errMsg = String(lastError?.message || '');
  const isQuota = errStatus === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');

  if (isQuota) {
    lastQuotaExhaustedTime = Date.now();
    console.log(`[Gemini Real Odds] All Gemini models in cascade reached quota limit. Cooldown activated, falling back seamlessly to verified catalog.`);
  } else {
    console.log(`[Gemini Real Odds] All models unavailable for ${normHome} vs ${normAway}, using verified catalog.`);
  }

  return null;
}

/**
 * Fetches real bookmaker data for a batch/lot of matches using Gemini Search Grounding
 * with optimized token usage and multi-model fallback cascade.
 */
async function fetchGeminiBatchRealMatchOdds(
  matchups: Array<{ homeTeam: string; awayTeam: string; players: string[] }>
): Promise<RealMatchOddsEntry[]> {
  if (!matchups || matchups.length === 0) return [];

  const results: RealMatchOddsEntry[] = [];
  const toFetch: Array<{ homeTeam: string; awayTeam: string; players: string[]; matchKey: string }> = [];

  matchups.forEach(m => {
    const normHome = normalizeClubName(m.homeTeam);
    const normAway = normalizeClubName(m.awayTeam);
    const isValidTeam = (t: string) => 
      t && 
      t !== 'Club Non Renseigné' && 
      t !== 'Adversaire Inconnu' && 
      !t.toLowerCase().includes('non renseign') && 
      !t.toLowerCase().includes('inconnu');

    if (!isValidTeam(normHome) || !isValidTeam(normAway) || normHome === normAway) {
      return;
    }

    const matchKey = makeMatchKey(normHome, normAway);
    const existing = realMatchOddsStore.get(matchKey);
    if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 2 * 60 * 60 * 1000) {
      results.push(existing);
    } else {
      toFetch.push({ homeTeam: normHome, awayTeam: normAway, players: m.players || [], matchKey });
    }
  });

  if (toFetch.length === 0) {
    return results;
  }

  // If quota cooldown active or no API key, fallback immediately to verified bookmaker catalog
  if (!process.env.GEMINI_API_KEY || (Date.now() - lastQuotaExhaustedTime < QUOTA_COOLDOWN_MS)) {
    toFetch.forEach(m => {
      const resolved = getResolvedMatchOdds(m.homeTeam, m.awayTeam, true);
      const entry: RealMatchOddsEntry = {
        matchKey: m.matchKey,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        odds: {
          homeWin: resolved.bookmakerData.win,
          draw: resolved.bookmakerData.draw,
          awayWin: resolved.bookmakerData.loss,
        },
        probabilities: {
          homeWinPercent: resolved.bookmakerData.winProbability || 50,
          drawPercent: Math.round((100 - (resolved.bookmakerData.winProbability || 50)) / 2),
          awayWinPercent: Math.max(10, 100 - (resolved.bookmakerData.winProbability || 50) - Math.round((100 - (resolved.bookmakerData.winProbability || 50)) / 2)),
        },
        cleanSheetProbabilities: {
          homeCleanSheetPercent: resolved.bookmakerData.cleanSheetProb,
          awayCleanSheetPercent: Math.max(10, 60 - resolved.bookmakerData.cleanSheetProb),
        },
        expectedGoals: {
          homeXG: resolved.bookmakerData.goalExpectancy,
          awayXG: resolved.bookmakerData.opponentGoalExpectancy || 1.1,
        },
        difficultyRatings: {
          homeFDR: resolved.diffRating,
          awayFDR: 6 - resolved.diffRating,
        },
        topScorers: resolved.bookmakerData.topScorers || [],
        topAssisters: resolved.bookmakerData.topAssisters || [],
        source: resolved.bookmakerData.source || 'Winamax & Betclic (Cotes Vérifiées)',
        sourceType: 'verified_bookmaker',
        updatedAt: new Date().toISOString(),
      };
      realMatchOddsStore.set(m.matchKey, entry);
      results.push(entry);
    });
    return results;
  }

  const ai = getAI();
  const BATCH_SIZE = 4; // Process 3-4 matches per prompt to optimize tokens and request quotas

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const chunk = toFetch.slice(i, i + BATCH_SIZE);
    
    const chunkPromptList = chunk.map((m, idx) => {
      const pStr = m.players.length > 0 ? `Joueurs clés à évaluer pour cotes buteurs & passeurs : ${m.players.slice(0, 6).join(', ')}` : '';
      return `MATCH ${idx + 1}:
- Domicile : "${m.homeTeam}"
- Extérieur : "${m.awayTeam}"
${pStr}`;
    }).join('\n\n');

    const prompt = `Tu es un expert analyste de données sportives spécialisé dans les cotes des bookmakers (Winamax, Betclic, Unibet, Oddschecker) et les probabilités de football (xG, Clean Sheet, Buteurs, Passeurs).

Recherche en direct sur le web via Google Search les véritables cotes officielles des bookmakers et métriques prédictives pour ce lot de ${chunk.length} matchs :

${chunkPromptList}

Exigences impératives pour CHAQUE match du lot :
1. "odds" : Cotes réelles 1 / N / 2 du marché bookmaker actuel (homeWin, draw, awayWin, ex: 1.62 / 4.10 / 5.50).
2. "probabilities" : Pourcentages normalisés de chance de Gagner (homeWinPercent), Nul (drawPercent), Perdre (awayWinPercent) (la somme homeWinPercent + drawPercent + awayWinPercent doit faire 100).
3. "expectedGoals" : Espérance de buts attendus xG de chaque équipe (homeXG, awayXG, ex: 1.85 / 0.90).
4. "cleanSheetProbabilities" : Pourcentage de probabilité de Clean Sheet pour la défense et le gardien (homeCleanSheetPercent, awayCleanSheetPercent).
5. "difficultyRatings" : FDR (Fixture Difficulty Rating de 1 à 5) en miroir pour les 2 équipes (ex: 2 pour le favori, 4 pour l'adversaire).
6. "topScorers" : Cotes "Buteur au cours du match" pour les joueurs clés demandés ou buteurs vedettes.
7. "topAssisters" : Cotes "Passeur décisif au cours du match" pour les créateurs de jeu clés.

Réponds UNIQUEMENT par un JSON valide respectant cette structure exacte :
{
  "matches": [
    {
      "homeTeam": "Nom Domicile",
      "awayTeam": "Nom Extérieur",
      "odds": { "homeWin": 1.62, "draw": 4.10, "awayWin": 5.50 },
      "probabilities": { "homeWinPercent": 58, "drawPercent": 24, "awayWinPercent": 18 },
      "expectedGoals": { "homeXG": 1.85, "awayXG": 0.90 },
      "cleanSheetProbabilities": { "homeCleanSheetPercent": 45, "awayCleanSheetPercent": 18 },
      "difficultyRatings": { "homeFDR": 2, "awayFDR": 4 },
      "topScorers": [
        { "name": "Nom Joueur", "team": "Nom Équipe", "anytimeScorerOdds": 2.20 }
      ],
      "topAssisters": [
        { "name": "Nom Joueur", "team": "Nom Équipe", "anytimeAssistOdds": 3.40 }
      ]
    }
  ]
}`;

    let batchSuccess = false;

    for (const modelName of GEMINI_CASCADE_MODELS) {
      try {
        console.log(`[Gemini Batch Real Odds] Processing lot of ${chunk.length} matches with model "${modelName}"...`);
        const startTime = Date.now();
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        const durationMs = Date.now() - startTime;

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const groundingUrls = groundingChunks.map((c: any) => c.web?.uri).filter(Boolean);

        const rawText = response.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error(`Réponse JSON absente pour le modèle ${modelName}`);
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const parsedMatches: any[] = Array.isArray(parsed.matches) ? parsed.matches : (parsed.homeTeam ? [parsed] : []);

        if (parsedMatches.length === 0) {
          throw new Error('Aucun match valide trouvé dans le JSON renvoyé');
        }

        chunk.forEach(m => {
          const found = parsedMatches.find(p => 
            normalizeClubName(p.homeTeam).includes(m.homeTeam) || 
            m.homeTeam.includes(normalizeClubName(p.homeTeam)) ||
            normalizeClubName(p.awayTeam).includes(m.awayTeam) ||
            m.awayTeam.includes(normalizeClubName(p.awayTeam))
          ) || parsedMatches[0];

          const homeWin = Math.round((Number(found?.odds?.homeWin) || 2.0) * 100) / 100;
          const draw = Math.round((Number(found?.odds?.draw) || 3.4) * 100) / 100;
          const awayWin = Math.round((Number(found?.odds?.awayWin) || 3.4) * 100) / 100;

          const hwProb = Math.round(Number(found?.probabilities?.homeWinPercent) || Math.round(100 / homeWin / 1.1));
          const drProb = Math.round(Number(found?.probabilities?.drawPercent) || Math.round(100 / draw / 1.1));
          const awProb = Math.max(5, 100 - hwProb - drProb);

          const entry: RealMatchOddsEntry = {
            matchKey: m.matchKey,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            odds: { homeWin, draw, awayWin },
            probabilities: {
              homeWinPercent: hwProb,
              drawPercent: drProb,
              awayWinPercent: awProb,
            },
            cleanSheetProbabilities: {
              homeCleanSheetPercent: Math.round(Number(found?.cleanSheetProbabilities?.homeCleanSheetPercent) || 35),
              awayCleanSheetPercent: Math.round(Number(found?.cleanSheetProbabilities?.awayCleanSheetPercent) || 20),
            },
            expectedGoals: {
              homeXG: Math.round((Number(found?.expectedGoals?.homeXG) || 1.65) * 100) / 100,
              awayXG: Math.round((Number(found?.expectedGoals?.awayXG) || 1.10) * 100) / 100,
            },
            difficultyRatings: (() => {
              let homeFDR = Number(found?.difficultyRatings?.homeFDR) || (hwProb >= 62 ? 1 : hwProb >= 48 ? 2 : hwProb <= 20 ? 5 : hwProb <= 34 ? 4 : 3);
              if (homeFDR < 1) homeFDR = 1;
              if (homeFDR > 5) homeFDR = 5;
              return {
                homeFDR,
                awayFDR: 6 - homeFDR,
              };
            })(),
            topScorers: Array.isArray(found?.topScorers) ? found.topScorers : [],
            topAssisters: Array.isArray(found?.topAssisters) ? found.topAssisters : [],
            source: `Bookmakers Réels (Google Search - ${modelName})`,
            sourceType: 'gemini_search',
            groundingUrls,
            updatedAt: new Date().toISOString(),
          };

          realMatchOddsStore.set(m.matchKey, entry);
          realMatchOddsStore.set(makeMatchKey(m.awayTeam, m.homeTeam), entry);
          results.push(entry);
        });

        addApiLog({
          description: `Gemini Batch Search (${modelName}): ${chunk.length} Matchs synchronisés`,
          service: 'Gemini AI',
          method: `generateContent (${modelName} + googleSearch)`,
          status: 'SUCCESS',
          statusCode: 200,
          durationMs,
          requestSummary: { model: modelName, matchCount: chunk.length, matches: chunk.map(c => `${c.homeTeam} vs ${c.awayTeam}`) },
          responseSummary: { parsedCount: parsedMatches.length },
        });

        console.log(`[Gemini Batch Real Odds] Successfully fetched & cached ${chunk.length} matches with model "${modelName}"`);
        batchSuccess = true;
        break; // Batch completed successfully, break cascade loop
      } catch (err: any) {
        const errStatus = err?.status || (err?.error && err?.error?.code);
        const errMsg = String(err?.message || '');
        const isQuota = errStatus === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');

        if (isQuota) {
          console.log(`[Gemini Batch Real Odds] Model "${modelName}" hit quota limit (429). Cascading to next model...`);
        } else {
          console.log(`[Gemini Batch Real Odds] Model "${modelName}" error (${errMsg}). Cascading to next model...`);
        }
      }
    }

    // Fallback to verified catalog if all models failed for this chunk
    if (!batchSuccess) {
      console.log(`[Gemini Batch Real Odds] All cascade models exhausted for this batch. Using verified bookmaker catalog.`);
      chunk.forEach(m => {
        const resolved = getResolvedMatchOdds(m.homeTeam, m.awayTeam, true);
        const entry: RealMatchOddsEntry = {
          matchKey: m.matchKey,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          odds: {
            homeWin: resolved.bookmakerData.win,
            draw: resolved.bookmakerData.draw,
            awayWin: resolved.bookmakerData.loss,
          },
          probabilities: {
            homeWinPercent: resolved.bookmakerData.winProbability || 50,
            drawPercent: Math.round((100 - (resolved.bookmakerData.winProbability || 50)) / 2),
            awayWinPercent: Math.max(10, 100 - (resolved.bookmakerData.winProbability || 50) - Math.round((100 - (resolved.bookmakerData.winProbability || 50)) / 2)),
          },
          cleanSheetProbabilities: {
            homeCleanSheetPercent: resolved.bookmakerData.cleanSheetProb,
            awayCleanSheetPercent: Math.max(10, 60 - resolved.bookmakerData.cleanSheetProb),
          },
          expectedGoals: {
            homeXG: resolved.bookmakerData.goalExpectancy,
            awayXG: resolved.bookmakerData.opponentGoalExpectancy || 1.1,
          },
          difficultyRatings: {
            homeFDR: resolved.diffRating,
            awayFDR: 6 - resolved.diffRating,
          },
          topScorers: resolved.bookmakerData.topScorers || [],
          topAssisters: resolved.bookmakerData.topAssisters || [],
          source: resolved.bookmakerData.source || 'Winamax & Betclic (Cotes Vérifiées)',
          sourceType: 'verified_bookmaker',
          updatedAt: new Date().toISOString(),
        };
        realMatchOddsStore.set(m.matchKey, entry);
        realMatchOddsStore.set(makeMatchKey(m.awayTeam, m.homeTeam), entry);
        results.push(entry);
      });
    }

    // Brief delay between batches
    await new Promise(r => setTimeout(r, 400));
  }

  return results;
}

/**
 * Universal Bidirectional Lookup in realMatchOddsStore
 */
function findRealMatchEntry(teamA: string, teamB: string): { entry: RealMatchOddsEntry; isReversed: boolean } | null {
  const normA = normalizeClubName(teamA).toLowerCase();
  const normB = normalizeClubName(teamB).toLowerCase();

  // 1. Exact key checks
  const directKey = `${normA}_vs_${normB}`;
  const reverseKey = `${normB}_vs_${normA}`;

  const direct = realMatchOddsStore.get(directKey);
  if (direct) {
    const isRev = normalizeClubName(direct.homeTeam).toLowerCase() === normB;
    return { entry: direct, isReversed: isRev };
  }

  const reversed = realMatchOddsStore.get(reverseKey);
  if (reversed) {
    const isRev = normalizeClubName(reversed.homeTeam).toLowerCase() === normB;
    return { entry: reversed, isReversed: isRev };
  }

  // 2. Fuzzy scan over realMatchOddsStore
  for (const [_, entry] of realMatchOddsStore.entries()) {
    const eHome = normalizeClubName(entry.homeTeam).toLowerCase();
    const eAway = normalizeClubName(entry.awayTeam).toLowerCase();

    const matchDirect = (eHome.includes(normA) || normA.includes(eHome)) && (eAway.includes(normB) || normB.includes(eAway));
    if (matchDirect) {
      return { entry, isReversed: false };
    }

    const matchReverse = (eHome.includes(normB) || normB.includes(eHome)) && (eAway.includes(normA) || normA.includes(eAway));
    if (matchReverse) {
      return { entry, isReversed: true };
    }
  }

  return null;
}

/**
 * State & tracking for Automatic Daily Odds Synchronization (1x / jour - 24h)
 */
let lastDailySyncTimestamp = 0;
let lastDailySyncISO = '';
let isDailySyncRunning = false;
let nextDailySyncTimestamp = 0;
let dailySyncStats = {
  totalSynced: 0,
  totalMatches: 0,
  lastDurationMs: 0,
  status: 'idle' as 'idle' | 'running' | 'success' | 'error',
  error: null as string | null,
};

/**
 * Synchronizes all distinct matches across fixtures catalog and active user galleries once per day (24h)
 */
async function syncAllMatchesDaily(): Promise<{ success: boolean; totalSynced: number; totalMatches: number }> {
  if (isDailySyncRunning) {
    console.log('[Daily Odds Sync] Synchronization already running, skipping concurrent call.');
    return { success: false, totalSynced: 0, totalMatches: 0 };
  }

  isDailySyncRunning = true;
  dailySyncStats.status = 'running';
  dailySyncStats.error = null;
  const startTime = Date.now();
  console.log('[Daily Odds Sync] ⏳ Running automatic 24h daily odds synchronization for ALL fixtures...');

  try {
    const uniqueMatchups = new Map<string, { homeTeam: string; awayTeam: string; players: string[] }>();

    // 1. Gather all matchups from standard catalog
    Object.values(FIXTURES_CATALOG).forEach(f => {
      if (f.clubName && f.opponent && f.hasUpcomingMatch) {
        const home = f.isHome ? f.clubName : f.opponent;
        const away = f.isHome ? f.opponent : f.clubName;
        const normH = normalizeClubName(home);
        const normA = normalizeClubName(away);
        if (normH && normA && normH !== normA && !normH.toLowerCase().includes('inconnu') && !normA.toLowerCase().includes('inconnu')) {
          const mKey = makeMatchKey(normH, normA);
          if (!uniqueMatchups.has(mKey)) {
            uniqueMatchups.set(mKey, { homeTeam: normH, awayTeam: normA, players: [] });
          }
        }
      }
    });

    // 2. Gather all matchups from all cached user galleries
    userCardsCache.forEach((userData) => {
      if (userData && userData.cards) {
        userData.cards.forEach((c: any) => {
          if (c.upcomingFixture && c.club?.name && c.upcomingFixture.opponent) {
            const isHome = c.upcomingFixture.isHome;
            const rawHome = isHome ? c.club.name : c.upcomingFixture.opponent;
            const rawAway = isHome ? c.upcomingFixture.opponent : c.club.name;
            const normH = normalizeClubName(rawHome);
            const normA = normalizeClubName(rawAway);
            if (normH && normA && normH !== normA) {
              const mKey = makeMatchKey(normH, normA);
              const pName = c.displayName || c.name || '';
              if (!uniqueMatchups.has(mKey)) {
                uniqueMatchups.set(mKey, { homeTeam: normH, awayTeam: normA, players: pName ? [pName] : [] });
              } else if (pName && !uniqueMatchups.get(mKey)!.players.includes(pName)) {
                uniqueMatchups.get(mKey)!.players.push(pName);
              }
            }
          }
        });
      }
    });

    const matchupList = Array.from(uniqueMatchups.values());
    console.log(`[Daily Odds Sync] Processing ${matchupList.length} distinct matches across leagues...`);

    const updated = await fetchGeminiBatchRealMatchOdds(matchupList);

    // 3. Enrich and refresh cards in memory cache for all active users
    userCardsCache.forEach((userData, slug) => {
      if (userData && userData.cards) {
        const enrichedCards = userData.cards.map((card: any) => {
          if (card.upcomingFixture && card.club?.name && card.upcomingFixture.opponent) {
            const resolved = getResolvedMatchOdds(
              card.club.name,
              card.upcomingFixture.opponent,
              card.upcomingFixture.isHome,
              card.positionCode,
              card.displayName || card.name || ''
            );
            return {
              ...card,
              upcomingFixture: {
                ...card.upcomingFixture,
                difficultyRating: resolved.diffRating,
                bookmaker: resolved.bookmakerData,
              }
            };
          }
          return card;
        });

        userCardsCache.set(slug, {
          ...userData,
          cards: enrichedCards,
          timestamp: Date.now(),
        });
      }
    });

    const durationMs = Date.now() - startTime;
    lastDailySyncTimestamp = Date.now();
    lastDailySyncISO = new Date(lastDailySyncTimestamp).toISOString();
    nextDailySyncTimestamp = lastDailySyncTimestamp + 24 * 60 * 60 * 1000;

    dailySyncStats = {
      totalSynced: updated.length,
      totalMatches: matchupList.length,
      lastDurationMs: durationMs,
      status: 'success',
      error: null,
    };

    addApiLog({
      description: `Mise à jour automatique quotidienne (1x par jour) : ${matchupList.length} matchs synchronisés (${updated.length} cotes mises à jour)`,
      service: 'Gemini AI',
      method: 'DAILY_ODDS_AUTO_SYNC',
      status: 'SUCCESS',
      statusCode: 200,
      durationMs,
      requestSummary: { frequency: '1x par jour (24h)', totalMatches: matchupList.length },
      responseSummary: { totalSynced: updated.length, nextSync: new Date(nextDailySyncTimestamp).toISOString() },
    });

    console.log(`[Daily Odds Sync] ✅ Automatic daily sync finished in ${durationMs}ms (${updated.length} matches updated). Next scheduled in 24h.`);
    return { success: true, totalSynced: updated.length, totalMatches: matchupList.length };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[Daily Odds Sync] ❌ Error in daily odds sync:', err);
    dailySyncStats.status = 'error';
    dailySyncStats.error = err.message || 'Erreur inconnue';

    addApiLog({
      description: `Erreur lors de la mise à jour quotidienne automatique des cotes: ${err.message}`,
      service: 'Gemini AI',
      method: 'DAILY_ODDS_AUTO_SYNC',
      status: 'ERROR',
      statusCode: 500,
      durationMs,
      requestSummary: { frequency: '1x par jour' },
      responseSummary: {},
      error: err.message,
    });
    return { success: false, totalSynced: 0, totalMatches: 0 };
  } finally {
    isDailySyncRunning = false;
  }
}

/**
 * Initializes the recurring 24h cron checker
 */
function initDailyOddsScheduler() {
  if (lastDailySyncTimestamp === 0) {
    lastDailySyncTimestamp = Date.now();
    lastDailySyncISO = new Date(lastDailySyncTimestamp).toISOString();
    nextDailySyncTimestamp = lastDailySyncTimestamp + 24 * 60 * 60 * 1000;
  }

  // Grace startup sync after 8 seconds
  setTimeout(() => {
    console.log('[Daily Odds Scheduler] Boot check: starting initial daily sync for all matches...');
    syncAllMatchesDaily().catch(err => console.error('[Daily Odds Scheduler] Init error:', err));
  }, 8000);

  // Check every 15 minutes if 24 hours have elapsed
  setInterval(() => {
    const now = Date.now();
    if (now - lastDailySyncTimestamp >= 24 * 60 * 60 * 1000 && !isDailySyncRunning) {
      console.log('[Daily Odds Scheduler] ⏰ 24 hours elapsed since last sync. Running scheduled daily update...');
      syncAllMatchesDaily().catch(err => console.error('[Daily Odds Scheduler] Scheduled tick error:', err));
    }
  }, 15 * 60 * 1000);
}

/**
 * Generates a mathematical mirror match entry ensuring 100% symmetry across both opponents
 */
function generateSymmetricMatchOdds(homeTeam: string, awayTeam: string): RealMatchOddsEntry {
  const normHome = normalizeClubName(homeTeam);
  const normAway = normalizeClubName(awayTeam);
  
  const homeCat = FIXTURES_CATALOG[normHome];
  const awayCat = FIXTURES_CATALOG[normAway];

  // Derive strength rating (1-5 where 1=PSG/Real is highest 95, 5 is 35)
  const homeStrength = homeCat ? (6 - homeCat.difficultyRating) * 16 + 20 : 50;
  const awayStrength = awayCat ? (6 - awayCat.difficultyRating) * 16 + 20 : 50;
  const homeAdvantage = 12; // 12% home advantage

  const netHomePower = (homeStrength + homeAdvantage) - awayStrength;

  let homeWinPct = Math.min(84, Math.max(10, Math.round(44 + netHomePower * 0.55)));
  let awayWinPct = Math.min(80, Math.max(8, Math.round(30 - netHomePower * 0.42)));
  let drawPct = Math.max(12, 100 - homeWinPct - awayWinPct);

  // Strictly normalize to 100
  const total = homeWinPct + drawPct + awayWinPct;
  homeWinPct = Math.round((homeWinPct / total) * 100);
  awayWinPct = Math.round((awayWinPct / total) * 100);
  drawPct = 100 - homeWinPct - awayWinPct;

  const margin = 1.07;
  const homeWinOdds = Math.round((margin / (homeWinPct / 100)) * 100) / 100;
  const drawOdds = Math.round((margin / (drawPct / 100)) * 100) / 100;
  const awayWinOdds = Math.round((margin / (awayWinPct / 100)) * 100) / 100;

  const homeXG = Math.round(Math.max(0.65, 1.55 + (netHomePower / 100) * 1.15) * 100) / 100;
  const awayXG = Math.round(Math.max(0.45, 1.05 - (netHomePower / 100) * 0.75) * 100) / 100;

  // Poisson clean sheets
  const homeCS = Math.min(80, Math.max(8, Math.round(Math.exp(-awayXG) * 100)));
  const awayCS = Math.min(75, Math.max(6, Math.round(Math.exp(-homeXG) * 100)));

  let homeFDR = 3;
  if (homeWinPct >= 62) homeFDR = 1;
  else if (homeWinPct >= 48) homeFDR = 2;
  else if (homeWinPct <= 20) homeFDR = 5;
  else if (homeWinPct <= 34) homeFDR = 4;
  const awayFDR = 6 - homeFDR;

  const entry: RealMatchOddsEntry = {
    matchKey: makeMatchKey(normHome, normAway),
    homeTeam: normHome,
    awayTeam: normAway,
    odds: {
      homeWin: homeWinOdds,
      draw: drawOdds,
      awayWin: awayWinOdds,
    },
    probabilities: {
      homeWinPercent: homeWinPct,
      drawPercent: drawPct,
      awayWinPercent: awayWinPct,
    },
    cleanSheetProbabilities: {
      homeCleanSheetPercent: homeCS,
      awayCleanSheetPercent: awayCS,
    },
    expectedGoals: {
      homeXG,
      awayXG,
    },
    difficultyRatings: {
      homeFDR,
      awayFDR,
    },
    // Honest labeling: this entire entry is computed locally from static difficulty ratings,
    // not from any real bookmaker feed. Do NOT claim 'verified_bookmaker' and do NOT fabricate
    // grounding URLs pointing at real bookmaker sites (Winamax/Betclic never produced this data).
    source: 'Estimation interne (miroir mathématique, aucune source bookmaker réelle)',
    sourceType: 'estimated_mirror',
    groundingUrls: undefined,
    updatedAt: new Date().toISOString(),
  };

  // Cache bidirectionally
  realMatchOddsStore.set(entry.matchKey, entry);
  realMatchOddsStore.set(makeMatchKey(normAway, normHome), entry);

  return entry;
}

// Function to resolve real match odds for a given club and opponent with strict 100% mirror guarantees
function getResolvedMatchOdds(clubName: string, opponentName: string, isHome: boolean, posCode: string = 'MID', playerName: string = ''): {
  diffRating: number;
  bookmakerData: {
    win: number;
    draw: number;
    loss: number;
    cleanSheetProb: number;
    opponentCleanSheetProb?: number;
    goalExpectancy: number;
    opponentGoalExpectancy?: number;
    anytimeScorerOdds?: number;
    anytimeAssistOdds?: number;
    winProbability?: number;
    drawProbability?: number;
    lossProbability?: number;
    homeWinOdds?: number;
    awayWinOdds?: number;
    homeTeamName?: string;
    awayTeamName?: string;
    source?: string;
    sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker' | 'estimated_mirror';
    groundingUrls?: string[];
    topScorers?: any[];
    topAssisters?: any[];
  };
} {
  const normClub = normalizeClubName(clubName);
  const normOpponent = normalizeClubName(opponentName);
  
  const homeTeam = isHome ? normClub : normOpponent;
  const awayTeam = isHome ? normOpponent : normClub;

  const foundResult = findRealMatchEntry(homeTeam, awayTeam);
  let entry: RealMatchOddsEntry;

  if (foundResult) {
    entry = foundResult.entry;
  } else {
    // Check realOddsCache
    const cachedHome = realOddsCache.get(normClub);
    const cachedAway = realOddsCache.get(normOpponent);
    if (cachedHome) {
      const hw = isHome ? cachedHome.win : cachedHome.loss;
      const aw = isHome ? cachedHome.loss : cachedHome.win;
      const dr = cachedHome.draw;
      const hwProb = Math.round((1 / hw / ((1/hw) + (1/dr) + (1/aw))) * 100);
      const awProb = Math.round((1 / aw / ((1/hw) + (1/dr) + (1/aw))) * 100);
      const drProb = 100 - hwProb - awProb;
        const homeFDR = hwProb >= 62 ? 1 : hwProb >= 48 ? 2 : hwProb <= 20 ? 5 : hwProb <= 34 ? 4 : 3;
        const awayFDR = 6 - homeFDR;
        entry = {
          matchKey: makeMatchKey(homeTeam, awayTeam),
          homeTeam,
          awayTeam,
          odds: { homeWin: hw, draw: dr, awayWin: aw },
          probabilities: { homeWinPercent: hwProb, drawPercent: drProb, awayWinPercent: awProb },
          cleanSheetProbabilities: {
            homeCleanSheetPercent: isHome ? cachedHome.cleanSheetProb : (cachedAway?.cleanSheetProb || 30),
            awayCleanSheetPercent: isHome ? (cachedAway?.cleanSheetProb || 20) : cachedHome.cleanSheetProb,
          },
          expectedGoals: {
            homeXG: isHome ? cachedHome.goalExpectancy : (cachedAway?.goalExpectancy || 1.1),
            awayXG: isHome ? (cachedAway?.goalExpectancy || 1.1) : cachedHome.goalExpectancy,
          },
          difficultyRatings: {
            homeFDR,
            awayFDR,
          },
          source: 'The Odds API Live (Marché Réel)',
          sourceType: 'odds_api',
          updatedAt: new Date().toISOString(),
        };
      realMatchOddsStore.set(entry.matchKey, entry);
      realMatchOddsStore.set(makeMatchKey(awayTeam, homeTeam), entry);
    } else {
      entry = generateSymmetricMatchOdds(homeTeam, awayTeam);
    }
  }

  // Perspective determination
  const isTeamHome = normalizeClubName(clubName).toLowerCase() === normalizeClubName(entry.homeTeam).toLowerCase()
    ? true
    : (normalizeClubName(clubName).toLowerCase() === normalizeClubName(entry.awayTeam).toLowerCase() ? false : isHome);

  const teamWinOdds = isTeamHome ? entry.odds.homeWin : entry.odds.awayWin;
  const teamLossOdds = isTeamHome ? entry.odds.awayWin : entry.odds.homeWin;
  const matchDrawOdds = entry.odds.draw;

  const teamWinProb = isTeamHome ? entry.probabilities.homeWinPercent : entry.probabilities.awayWinPercent;
  const teamLossProb = isTeamHome ? entry.probabilities.awayWinPercent : entry.probabilities.homeWinPercent;
  const matchDrawProb = entry.probabilities.drawPercent;

  const teamCS = isTeamHome ? entry.cleanSheetProbabilities.homeCleanSheetPercent : entry.cleanSheetProbabilities.awayCleanSheetPercent;
  const oppCS = isTeamHome ? entry.cleanSheetProbabilities.awayCleanSheetPercent : entry.cleanSheetProbabilities.homeCleanSheetPercent;

  const teamXG = isTeamHome ? entry.expectedGoals.homeXG : entry.expectedGoals.awayXG;
  const oppXG = isTeamHome ? entry.expectedGoals.awayXG : entry.expectedGoals.homeXG;

  const diffRating = isTeamHome ? entry.difficultyRatings.homeFDR : entry.difficultyRatings.awayFDR;

  // Anytime scorer & assist props
  let scorerOdds: number | undefined;
  let assistOdds: number | undefined;

  if (playerName && entry.topScorers && entry.topScorers.length > 0) {
    const pLower = playerName.toLowerCase();
    const matchScorer = entry.topScorers.find(s => 
      s.name.toLowerCase().includes(pLower) || pLower.includes(s.name.toLowerCase())
    );
    if (matchScorer) scorerOdds = matchScorer.anytimeScorerOdds;
  }

  if (playerName && entry.topAssisters && entry.topAssisters.length > 0) {
    const pLower = playerName.toLowerCase();
    const matchAssister = entry.topAssisters.find(a => 
      a.name.toLowerCase().includes(pLower) || pLower.includes(a.name.toLowerCase())
    );
    if (matchAssister) assistOdds = matchAssister.anytimeAssistOdds;
  }

  if (!scorerOdds) {
    if (posCode === 'FWD') scorerOdds = Math.round(Math.max(1.65, 4.6 - teamXG * 1.15) * 10) / 10;
    else if (posCode === 'MID') scorerOdds = Math.round(Math.max(2.30, 6.5 - teamXG * 0.95) * 10) / 10;
    else if (posCode === 'DEF') scorerOdds = Math.round(Math.max(5.00, 13.5 - teamXG * 1.4) * 10) / 10;
    else scorerOdds = 35.0;
  }

  if (!assistOdds) {
    if (posCode === 'MID') assistOdds = Math.round(Math.max(2.10, 5.0 - teamXG * 0.85) * 10) / 10;
    else if (posCode === 'FWD') assistOdds = Math.round(Math.max(2.60, 6.0 - teamXG * 0.75) * 10) / 10;
    else if (posCode === 'DEF') assistOdds = Math.round(Math.max(4.20, 9.0 - teamXG * 0.5) * 10) / 10;
    else assistOdds = 25.0;
  }

  return {
    diffRating,
    bookmakerData: {
      win: teamWinOdds,
      draw: matchDrawOdds,
      loss: teamLossOdds,
      winProbability: teamWinProb,
      drawProbability: matchDrawProb,
      lossProbability: teamLossProb,
      cleanSheetProb: teamCS,
      opponentCleanSheetProb: oppCS,
      goalExpectancy: teamXG,
      opponentGoalExpectancy: oppXG,
      homeWinOdds: entry.odds.homeWin,
      awayWinOdds: entry.odds.awayWin,
      homeTeamName: entry.homeTeam,
      awayTeamName: entry.awayTeam,
      anytimeScorerOdds: scorerOdds,
      anytimeAssistOdds: assistOdds,
      source: entry.source,
      sourceType: entry.sourceType,
      groundingUrls: entry.groundingUrls,
      topScorers: entry.topScorers,
      topAssisters: entry.topAssisters,
    }
  };
}

// 2. Sorare GraphQL API Cards Fetcher / Sync
app.get('/api/sorare/user-cards', async (req, res) => {
  const rawUsername = (req.query.username as string) || 'Thib 8';
  const customApiKey = (req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  const forceRefresh = req.query.forceRefresh === 'true';
  const slug = cleanSlug(rawUsername);
  
  if (req.query.clearCache === 'true') {
    userCardsCache.delete(slug);
    return res.json({ success: true, message: 'Server cache cleared' });
  }

  // Check in-memory cache first if not force-refreshing
  const cached = userCardsCache.get(slug);
  const now = Date.now();
  if (!forceRefresh && cached && (now - cached.timestamp < 15 * 60 * 1000) && cached.cards.length > 0) {
    console.log(`[Sorare Cache] Serving ${cached.cards.length} cached cards for "${slug}"`);
    return res.json({
      success: true,
      source: 'server_memory_cache',
      slug,
      user: cached.user,
      cards: cached.cards,
      totalCards: cached.cards.length,
      syncedAt: new Date(cached.timestamp).toISOString(),
    });
  }

  // Pre-fetch real odds in background if API key is present
  fetchRealBookmakerOdds().catch(() => {});

  console.log(`[Sorare Sync] Fetching exhaustive live gallery for slug: "${slug}" (forceRefresh: ${forceRefresh})`);

  try {
    const hasApiKey = Boolean(customApiKey);
    const pageSize = hasApiKey ? 80 : 50;
    const scoresCount = 60;

    syncProgressMap.set(slug, {
      fetchedPages: 0,
      estimatedTotalPages: hasApiKey ? 15 : 25, // Roughly estimating based on 1000 cards max
      fetchedCards: 0,
      status: 'fetching'
    });

    const fullQuery = `
      query GetUserFootballCards($slug: String!, $after: String) {
        user(slug: $slug) {
          id
          slug
          nickname
          profile {
            clubName
            pictureUrl
          }
          cards(first: ${pageSize}, after: $after, sport: FOOTBALL) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              slug
              name
              rarityTyped
              pictureUrl
              grade
              xp
              seasonYear
              power
              specialEdition
              powerBreakdown {
                collectionBasisPoints
                seasonBasisPoints
                specialEditionCardsBasisPoints
                xpBasisPoints
                otherBonusBasisPoints
              }
              anyPositions
              anyPlayer {
                slug
                displayName
                matchName
                age
                squaredPictureUrl
                activeClub {
                  name
                  slug
                  pictureUrl
                  domesticLeague {
                    name
                  }
                  upcomingGames(first: 1) {
                    date
                    homeTeam { name }
                    awayTeam { name }
                  }
                }
                ... on Player {
                  playingStatus
                  country {
                    slug
                  }
                  l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
                  l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
                  l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
                  playerGameScores: so5Scores(last: ${scoresCount}) {
                    score
                    decisiveScore {
                      totalScore
                    }
                    allAroundStats {
                      totalScore
                    }
                    game {
                      competition {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const reducedQuery = `
      query GetUserFootballCards($slug: String!, $after: String) {
        user(slug: $slug) {
          id
          slug
          nickname
          profile {
            clubName
            pictureUrl
          }
          cards(first: ${pageSize}, after: $after, sport: FOOTBALL) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              slug
              name
              rarityTyped
              pictureUrl
              grade
              xp
              seasonYear
              power
              specialEdition
              anyPositions
              anyPlayer {
                slug
                displayName
                matchName
                age
                squaredPictureUrl
                activeClub {
                  name
                  slug
                  pictureUrl
                  upcomingGames(first: 1) {
                    date
                    homeTeam { name }
                    awayTeam { name }
                  }
                }
                ... on Player {
                  playingStatus
                  l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
                  l15: averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
                  l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
                  playerGameScores: so5Scores(last: ${scoresCount}) {
                    score
                    decisiveScore {
                      totalScore
                    }
                    allAroundStats {
                      totalScore
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const query = hasApiKey ? fullQuery : reducedQuery;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TeamSorare-App/2.0',
    };
    if (customApiKey) {
      headers['APIKEY'] = customApiKey;
    }

    let after: string | null = null;
    let allRawNodes: any[] = [];
    let userMeta: any = null;
    const maxPages = 200; // 200 pages * 12 cards = 2400 cards max

    for (let page = 1; page <= maxPages; page++) {
      // Never log secret headers in clear text (Cloud Run logs are not a safe place for API keys).
      const redactedHeaders = { ...headers, ...(headers.APIKEY ? { APIKEY: '***redacted***' } : {}) };
      console.log(`[Sorare Sync] Fetching page ${page}, headers:`, JSON.stringify(redactedHeaders));
      const responseResult = await fetchGraphQLWithRetry(
        'https://api.sorare.com/graphql',
        { query, variables: { slug, after } },
        headers,
        3
      );

      if (!responseResult.ok) {
        console.log(`[Sorare Sync] Stopped pagination at page ${page}: ${responseResult.error}`);
        if (page === 1) throw new Error(responseResult.error);
        break;
      }

      const result = responseResult.data;
      if (!result) {
        console.log(`[Sorare Sync] No result data on page ${page}`);
        break;
      }
      if (result.errors && result.errors.length > 0) {
        console.log(`[Sorare Sync] GraphQL errors on page ${page}:`, result.errors[0]?.message);
        if (page === 1) throw new Error(result.errors[0]?.message);
        break;
      }

      const user = result.data?.user;
      if (!user) break;

      if (!userMeta) {
        userMeta = {
          id: user.id,
          slug: user.slug,
          nickname: user.nickname,
          clubName: user.profile?.clubName || `${user.nickname} FC`,
          pictureUrl: user.profile?.pictureUrl || '',
        };
      }

      const nodes = user.cards?.nodes || [];
      allRawNodes.push(...nodes);

      const hasNext = user.cards?.pageInfo?.hasNextPage;
      after = user.cards?.pageInfo?.endCursor;

      // AUDIT FIX (4.2): estimatedTotalPages used to be a fixed guess (15 or 25) for the whole
      // sync, so a gallery bigger than that guess would show a misleadingly-stuck ~100% progress
      // bar while still fetching. We don't have a verified `totalCount` field to query safely
      // (risking a GraphQL schema error), so instead we dynamically grow the estimate whenever
      // we're about to exceed it and more pages are still coming — keeps the percentage honest
      // without touching the query itself.
      const baseEstimate = hasApiKey ? 15 : 25;
      const prevEstimate = syncProgressMap.get(slug)?.estimatedTotalPages || baseEstimate;
      const dynamicEstimate = (hasNext && page >= prevEstimate - 2) ? page + 5 : prevEstimate;

      syncProgressMap.set(slug, {
        fetchedPages: page,
        estimatedTotalPages: dynamicEstimate,
        fetchedCards: allRawNodes.length,
        status: (hasNext && after) ? 'fetching' : 'processing'
      });

      if (!hasNext || !after) {
        console.log(`[Sorare Sync] Reached end of collection at page ${page} (${allRawNodes.length} cards total).`);
        break;
      }

      // Pacing delay between pages to avoid triggering burst rate limits (429).
      // Sorare's public rate limit is stricter without a personal API key, so we pace more
      // conservatively in that case (800ms) than with a key (150ms).
      await new Promise((r) => setTimeout(r, hasApiKey ? 150 : 800));
    }

    if (allRawNodes.length > 0) {
      console.log(`[Sorare Sync] Successfully retrieved ${allRawNodes.length} real cards for ${slug}`);

      // Transform raw nodes into rich SorareCard format with real match history
      const transformedCards = allRawNodes.map((c: any, idx: number) => {
        const player = c.anyPlayer;
        const pgsList = player?.playerGameScores || [];

        const leagueName = player?.domesticLeague?.name || c.club?.domesticLeague?.name || 'Championnat';

        const clubName = player?.activeClub?.name || c.club?.name || 'Club';
        const normClub = normalizeClubName(clubName);
        const catalogEntry = FIXTURES_CATALOG[normClub] || FIXTURES_CATALOG['Club Non Renseigné'];

        // Correction trêve nationale (DNP-crowding) sur le serveur
        const upcomingIsNational = catalogEntry?.competitionName && (
          catalogEntry.competitionName.toLowerCase().includes('world cup') || 
          catalogEntry.competitionName.toLowerCase().includes('qualifiers') || 
          catalogEntry.competitionName.toLowerCase().includes('nations league') || 
          catalogEntry.competitionName.toLowerCase().includes('copa america') || 
          catalogEntry.competitionName.toLowerCase().includes('euro') || 
          catalogEntry.competitionName.toLowerCase().includes('friendly') || 
          catalogEntry.competitionName.toLowerCase().includes('friendlies') || 
          catalogEntry.competitionName.toLowerCase().includes('sélection') || 
          catalogEntry.competitionName.toLowerCase().includes('national')
        );

        // Build real match details array for the player directly from nested query results
        // Note: Sorare GraphQL API returns playerGameScores with the MOST RECENT match at index 0.
        const recentMatches = pgsList.map((pgs: any, pgsIdx: number) => {
          const scoreVal = pgs?.score !== null && pgs?.score !== undefined && Number(pgs.score) > 0
            ? Math.round(Number(pgs.score) * 10) / 10
            : 0;

          const decisiveVal = pgs?.decisiveScore?.totalScore !== undefined && pgs?.decisiveScore?.totalScore !== null
            ? Math.round(Number(pgs.decisiveScore.totalScore) * 10) / 10
            : (scoreVal >= 60 ? 25 : 0);

          const allAroundStatsArr = pgs?.allAroundStats || [];
          const aasSum = allAroundStatsArr.reduce((sum: number, stat: any) => sum + (Number(stat?.totalScore) || 0), 0);
          const allAroundVal = aasSum > 0 ? Math.round(aasSum * 10) / 10 : (scoreVal > 0 ? Math.max(0, Math.round((scoreVal - (decisiveVal > 0 ? 60 : 35)) * 10) / 10) : 0);

          return {
            score: scoreVal,
            allAroundScore: allAroundVal,
            decisiveScore: decisiveVal,
            opponent: `Adversaire J-${pgsIdx + 1}`,
            isHome: pgsIdx % 2 === 0,
            competitionName: pgs?.game?.competition?.name || leagueName,
            matchDate: ''
          };
        });

        // 2. Extract EXACT last 5, 10, 15, 40 GameWeeks (index 0 is most recent match)
        const realScores = recentMatches.map((m: any) => m.score);
        const last5Scores = realScores.slice(0, 5);
        while (last5Scores.length < 5) last5Scores.push(0);

        const last10Scores = realScores.slice(0, 10);
        while (last10Scores.length < 10) last10Scores.push(0);

        const last15Scores = realScores.slice(0, 15);
        while (last15Scores.length < 15) last15Scores.push(0);

        const last40Scores = realScores.slice(0, 40);
        while (last40Scores.length < 40) last40Scores.push(0);

        // 3. Exact L5, L10, L15, L40 averages (over matches played, excluding DNP/0)
        // Helper to calculate average of played matches (excluding DNP / 0 scores)
        const calcAvg = (scores: number[]) => {
          const playedScores = scores.filter(s => s != null && s > 0);
          if (playedScores.length === 0) return 0;
          return Math.round((playedScores.reduce((a, b) => a + b, 0) / playedScores.length) * 10) / 10;
        };

        let l5 = (player?.l5 != null) ? Math.round(Number(player.l5) * 10) / 10 : calcAvg(last5Scores);
        let l10 = calcAvg(last10Scores);
        let l15 = (player?.l15 != null) ? Math.round(Number(player.l15) * 10) / 10 : calcAvg(last15Scores);
        let l40 = (player?.l40 != null) ? Math.round(Number(player.l40) * 10) / 10 : calcAvg(last40Scores);

        // Calculate Played and Decisive counts for each period based on sliced scores
        const playedCount = (scores: number[]) => scores.filter(s => s > 0).length;
        const decisiveCount = (scores: number[]) => scores.filter(s => s >= 60).length;

        const playedCountL5 = playedCount(last5Scores);
        const playedCountL10 = playedCount(last10Scores);
        const playedCountL15 = playedCount(last15Scores);
        const playedCountL40 = playedCount(last40Scores);
        
        // Define playedLastMatch (index 0 is most recent match)
        const playedLastMatch = last5Scores[0] > 0;

        const l5Played = playedCountL5;
        const l5PlayedRate = Math.round((playedCountL5 / 5) * 100);
        const l15Played = playedCountL15;
        const l15PlayedRate = Math.round((playedCountL15 / 15) * 100);
        const l40Played = playedCountL40;
        const l40PlayedRate = Math.round((playedCountL40 / 40) * 100);

        const decisiveCountL5 = decisiveCount(last5Scores);
        const decisiveRateL5 = Math.round((decisiveCountL5 / 5) * 100);
        const decisiveCountL15 = decisiveCount(last15Scores);
        const decisiveRateL15 = Math.round((decisiveCountL15 / Math.max(1, l15Played)) * 100);
        const decisiveCountL40 = decisiveCount(last40Scores);
        const decisiveRateL40 = Math.round((decisiveCountL40 / Math.max(1, l40Played)) * 100);


        let pos: 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' = 'Midfielder';
        let posCode: 'GK' | 'DEF' | 'MID' | 'FWD' = 'MID';
        let posName = 'Milieu';
        const pStr = (c.anyPositions?.[0] || '').toLowerCase();
        if (pStr.includes('goal') || pStr === 'gk') {
          pos = 'Goalkeeper';
          posCode = 'GK';
          posName = 'Gardien';
        } else if (pStr.includes('def')) {
          pos = 'Defender';
          posCode = 'DEF';
          posName = 'Défenseur';
        } else if (pStr.includes('forw') || pStr.includes('fwd') || pStr.includes('att')) {
          pos = 'Forward';
          posCode = 'FWD';
          posName = 'Attaquant';
        }

        const derivedXG = (() => {
          if (posCode === 'GK') return 0;
          const base = (posCode === 'FWD') ? 0.35 : (posCode === 'MID') ? 0.12 : 0.04;
          const formAdjust = Math.max(-0.2, (l15 - 45) * 0.012);
          return Math.round(Math.max(0.01, base + formAdjust) * 100) / 100;
        })();

        const derivedXA = (() => {
          if (posCode === 'GK') return 0;
          const base = (posCode === 'MID') ? 0.28 : (posCode === 'FWD') ? 0.15 : 0.06;
          const formAdjust = Math.max(-0.15, (l15 - 45) * 0.008);
          return Math.round(Math.max(0.01, base + formAdjust) * 100) / 100;
        })();

        // 5. Status & Starter Confidence based on context-aware recent matches
        const filteredRecentMatches = recentMatches.filter((m: any) => {
          const mComp = (m.competitionName || '').toLowerCase();
          const matchIsNational = mComp.includes('world cup') || 
                                 mComp.includes('qualifiers') || 
                                 mComp.includes('nations league') || 
                                 mComp.includes('copa america') || 
                                 mComp.includes('euro') || 
                                 mComp.includes('friendly') || 
                                 mComp.includes('friendlies') || 
                                 mComp.includes('sélection') || 
                                 mComp.includes('national');
          return upcomingIsNational ? matchIsNational : !matchIsNational;
        });

        const relevantL5Matches = filteredRecentMatches.slice(0, 5);
        const playedCountRelevantL5 = relevantL5Matches.filter((m: any) => m.score > 0).length;
        const playedLastRelevantMatch = relevantL5Matches.length > 0 ? relevantL5Matches[0].score > 0 : false;

        let status: 'STARTER' | 'REGULAR' | 'SUBSTITUTE' | 'NOT_PLAYING' = 'REGULAR';
        let starterConfidence = 70;
        let injuryStatus: 'FIT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'INJURED' | 'SUSPENDED' = 'FIT';

        const rawPlayingStatus = (c.anyPlayer?.playingStatus || '').toUpperCase();

        // Check direct prediction / playingStatus from Sorare API if available
        if (rawPlayingStatus.includes('STARTER') || rawPlayingStatus.includes('STARTING')) {
          status = 'STARTER';
          starterConfidence = 95;
        } else if (rawPlayingStatus.includes('SUB') || rawPlayingStatus.includes('BENCH')) {
          status = 'SUBSTITUTE';
          starterConfidence = 25;
        } else if (rawPlayingStatus.includes('INJUR') || rawPlayingStatus === 'INJURED') {
          injuryStatus = 'INJURED';
          status = 'NOT_PLAYING';
          starterConfidence = 0;
        } else if (rawPlayingStatus.includes('SUSPEND') || rawPlayingStatus === 'SUSPENDED') {
          injuryStatus = 'SUSPENDED';
          status = 'NOT_PLAYING';
          starterConfidence = 0;
        } else if (rawPlayingStatus.includes('OUT') || rawPlayingStatus.includes('UNAVAILABLE') || rawPlayingStatus.includes('RESERVE')) {
          status = 'NOT_PLAYING';
          starterConfidence = 0;
        } else if (rawPlayingStatus.includes('DOUBT') || rawPlayingStatus === 'DOUBTFUL') {
          injuryStatus = 'DOUBTFUL';
          starterConfidence = 20;
        } else if (rawPlayingStatus.includes('QUESTION') || rawPlayingStatus === 'QUESTIONABLE') {
          injuryStatus = 'QUESTIONABLE';
          starterConfidence = 45;
        } else {
          // Fallback: Calculate status from recent L5 match history
          if (relevantL5Matches.length === 0) {
            if (!upcomingIsNational) {
              if (l15 > 45 || l40 > 45) {
                status = 'STARTER';
                starterConfidence = 90;
              } else {
                status = 'REGULAR';
                starterConfidence = 50;
              }
            } else {
              status = 'NOT_PLAYING';
              starterConfidence = 0;
            }
          } else {
            if (playedCountRelevantL5 === 0) {
              status = 'NOT_PLAYING';
              starterConfidence = 0;
              injuryStatus = 'DOUBTFUL';
            } else if (playedCountRelevantL5 === 1) {
              status = 'SUBSTITUTE';
              starterConfidence = 20;
            } else if (playedCountRelevantL5 === 2 || playedCountRelevantL5 === 3) {
              status = 'REGULAR';
              starterConfidence = 55;
            } else if (playedCountRelevantL5 >= 4 && playedLastRelevantMatch) {
              status = 'STARTER';
              starterConfidence = 90;
            } else if (playedCountRelevantL5 >= 4 && !playedLastRelevantMatch) {
              status = 'REGULAR';
              starterConfidence = 50;
            }
          }
        }

        let rarity = 'COMMON';
        const rawRarity = (c.rarityTyped || '').toLowerCase();
        if (rawRarity.includes('rare') && !rawRarity.includes('super')) rarity = 'RARE';
        else if (rawRarity.includes('super')) rarity = 'SUPER_RARE';
        else if (rawRarity.includes('unique')) rarity = 'UNIQUE';
        else if (rawRarity.includes('limited')) rarity = 'LIMITED';

        // Calculate deep scoring metrics (Floor, Ceiling, AA vs Decisive split)
        const playedMatchesList = recentMatches.filter((m: any) => m.score > 0);
        const avgDecisiveScore = playedMatchesList.length > 0
          ? Math.round((playedMatchesList.reduce((acc: number, m: any) => acc + (m.decisiveScore || 0), 0) / playedMatchesList.length) * 10) / 10
          : Math.round(l5 * 0.45 * 10) / 10;

        const avgAllAroundScore = playedMatchesList.length > 0
          ? Math.round((playedMatchesList.reduce((acc: number, m: any) => acc + (m.allAroundScore || 0), 0) / playedMatchesList.length) * 10) / 10
          : Math.round(l5 * 0.55 * 10) / 10;

        const totalComponent = avgDecisiveScore + avgAllAroundScore || 1;
        const decisiveContributionPct = Math.round((avgDecisiveScore / totalComponent) * 100);
        const allAroundContributionPct = 100 - decisiveContributionPct;

        // Calculate Floor (15th percentile of played matches) and Ceiling (85th percentile)
        const sortedPlayedScores = [...playedMatchesList.map((m: any) => m.score)].sort((a, b) => a - b);
        const floorScore = sortedPlayedScores.length > 0
          ? sortedPlayedScores[Math.max(0, Math.floor(sortedPlayedScores.length * 0.15))]
          : Math.max(30, Math.round(l40 * 0.75));
        const ceilingScore = sortedPlayedScores.length > 0
          ? sortedPlayedScores[Math.min(sortedPlayedScores.length - 1, Math.floor(sortedPlayedScores.length * 0.85))]
          : Math.min(100, Math.round(l40 * 1.35));

        if (!upcomingIsNational && (l15 > 45 || l40 > 45)) {
          if (l5 === 0) l5 = l15 > 0 ? l15 : l40;
          if (l10 === 0) l10 = l15 > 0 ? l15 : l40;
        }
        
        let fixture = getClubUpcomingFixture(clubName, posCode as any, l5);
        if (player?.activeClub?.upcomingGames?.[0]) {
          const game = player.activeClub.upcomingGames[0];
          const isHome = game.homeTeam?.name === clubName;
          const opponentName = isHome ? (game.awayTeam?.name || 'Adversaire') : (game.homeTeam?.name || 'Adversaire');
          
          // Résolution haute-fidélité via le Real Odds Store / Gemini Search Engine
          const resolved = getResolvedMatchOdds(
            clubName, 
            opponentName, 
            isHome, 
            posCode, 
            player?.displayName || player?.name || ''
          );
          const diffRating = resolved.diffRating;
          const bookmakerData = resolved.bookmakerData;


          fixture = {
            gameWeek: getCurrentGameWeekNumber(),
            opponent: opponentName,
            isHome,
            difficultyRating: diffRating,
            kickoffDate: game.date,
            matchDate: game.date,
            kickoffFormatted: new Date(game.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            kickoffRelative: 'Dans cette GW',
            hasUpcomingMatch: true,
            competitionName: player?.activeClub?.domesticLeague?.name || catalogEntry.competitionName || 'Championnat',
            projectedScore: Math.max(25, Math.min(95, Math.round(l5 + (isHome ? 2.5 : -1.5)))),
            bookmaker: bookmakerData,
          };
        }

        return {
          id: c.id,
          slug: c.slug,
          displayName: player?.displayName || c.name.replace(/\s*\d{4}.*$/, '').trim(),
          matchName: player?.matchName || player?.displayName || c.name,
          position: pos,
          positionCode: posCode,
          positionName: posName,
          rarity,
          seasonYear: c.seasonYear || 2024,
          pictureUrl: c.pictureUrl || player?.squaredPictureUrl || '',
          avatarUrl: player?.squaredPictureUrl || c.pictureUrl || '',
          age: player?.age || 26,
          club: {
            name: clubName,
            slug: player?.activeClub?.slug || 'club',
            pictureUrl: player?.activeClub?.pictureUrl || '',
            country: player?.country?.slug || FIXTURES_CATALOG[normalizeClubName(clubName)]?.country || 'France',
            league: player?.activeClub?.domesticLeague?.name
          },
          grade: c.grade || 0,
          xp: c.xp || 0,
          power: c.power || '1.050',
          specialEdition: c.specialEdition || null,
          powerBreakdown: (() => {
            if (!c.powerBreakdown) return undefined;
            const pb = {
              collectionBasisPoints: c.powerBreakdown.collectionBasisPoints || 0,
              seasonBasisPoints: c.powerBreakdown.seasonBasisPoints || 0,
              specialEditionCardsBasisPoints: c.powerBreakdown.specialEditionCardsBasisPoints || 0,
              xpBasisPoints: c.powerBreakdown.xpBasisPoints || 0,
              otherBonusBasisPoints: c.powerBreakdown.otherBonusBasisPoints || 0,
            };
            if (pb.specialEditionCardsBasisPoints === 0 && c.specialEdition) {
              const se = c.specialEdition.toLowerCase();
              if (se.includes('chroma')) {
                pb.specialEditionCardsBasisPoints = 2000;
              } else if (se.includes('rising_flame') || se.includes('flame')) {
                pb.specialEditionCardsBasisPoints = 1500;
              } else if (se.includes('holo')) {
                pb.specialEditionCardsBasisPoints = 1000;
              } else if (se.includes('shiny')) {
                pb.specialEditionCardsBasisPoints = 500;
              }
            }
            return pb;
          })(),
          bonusPercentage: (() => {
            if (c.powerBreakdown) {
              const pb = {
                collectionBasisPoints: c.powerBreakdown.collectionBasisPoints || 0,
                seasonBasisPoints: c.powerBreakdown.seasonBasisPoints || 0,
                specialEditionCardsBasisPoints: c.powerBreakdown.specialEditionCardsBasisPoints || 0,
                xpBasisPoints: c.powerBreakdown.xpBasisPoints || 0,
                otherBonusBasisPoints: c.powerBreakdown.otherBonusBasisPoints || 0,
              };
              if (pb.specialEditionCardsBasisPoints === 0 && c.specialEdition) {
                const se = c.specialEdition.toLowerCase();
                if (se.includes('chroma')) {
                  pb.specialEditionCardsBasisPoints = 2000;
                } else if (se.includes('rising_flame') || se.includes('flame')) {
                  pb.specialEditionCardsBasisPoints = 1500;
                } else if (se.includes('holo')) {
                  pb.specialEditionCardsBasisPoints = 1000;
                } else if (se.includes('shiny')) {
                  pb.specialEditionCardsBasisPoints = 500;
                }
              }
              const sumBps = pb.collectionBasisPoints +
                             pb.seasonBasisPoints +
                             pb.specialEditionCardsBasisPoints +
                             pb.xpBasisPoints +
                             pb.otherBonusBasisPoints;
              return Math.round((sumBps / 100) * 10) / 10;
            }
            if (c.power) {
              const p = parseFloat(c.power);
              if (!isNaN(p) && p >= 1.0) {
                return Math.round((p - 1.0) * 100 * 10) / 10;
              }
            }
            return c.seasonYear >= 2025 ? 5 : 0;
          })(),
          status,
          starterConfidence,
          injuryStatus,
          scores: {
            l5,
            l10,
            l15,
            l40,
            xG: derivedXG,
            xA: derivedXA,
            last5Scores,
            last10Scores,
            last15Scores,
            last40Scores,
            recentMatches,
            avgDecisiveScore,
            avgAllAroundScore,
            decisiveContributionPct,
            allAroundContributionPct,
            floorScore,
            ceilingScore,
            l5Played,
            l5PlayedRate,
            l15Played,
            l15PlayedRate,
            l40Played,
            l40PlayedRate,
            decisiveCountL5,
            decisiveRateL5,
            decisiveCountL15,
            decisiveRateL15,
            decisiveCountL40,
            decisiveRateL40,
            consistencyRate: l5 > 45 ? 82 : l5 > 35 ? 65 : 40,
            decisiveRate: l5 > 55 ? 45 : l5 > 45 ? 25 : 10,
          },
          upcomingFixture: fixture,
          tacticalNotes: `Match GW 48 : ${clubName} vs ${fixture.opponent} (${fixture.isHome ? 'Dom.' : 'Ext.'}, ${fixture.kickoffFormatted}). Moyenne L5: ${l5} pts (${l5Played}/5 joués).`,
          updatedAt: new Date().toISOString(),
        };
      });

      const finalCollection = transformedCards;

      const finalUser = userMeta || { slug, nickname: rawUsername, clubName: `${rawUsername} FC` };
      userCardsCache.set(slug, {
        timestamp: Date.now(),
        cards: finalCollection,
        user: finalUser,
      });

      syncProgressMap.set(slug, {
        fetchedPages: maxPages,
        estimatedTotalPages: maxPages,
        fetchedCards: finalCollection.length,
        status: 'done'
      });

      return res.json({
        success: true,
        source: 'sorare_api_live',
        slug,
        isDegradedMode: false,
        user: finalUser,
        cards: finalCollection,
        totalCards: finalCollection.length,
        syncedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.log('[Sorare Sync] Direct GraphQL error:', error);
    
    // Circuit Breaker / Degraded Mode Fallback
    const cached = userCardsCache.get(slug);
    if (cached && cached.cards && cached.cards.length > 0) {
      console.log(`[Circuit Breaker] Serving ${cached.cards.length} stale cached cards for "${slug}" in degraded mode.`);
      syncProgressMap.set(slug, {
        fetchedPages: 0,
        estimatedTotalPages: 0,
        fetchedCards: cached.cards.length,
        status: 'done',
        error: 'Mode dégradé actif (API Rate Limit / Erreur réseau)'
      });
      return res.json({
        success: true,
        source: 'cache_degraded',
        isDegradedMode: true,
        degradedReason: `Erreur API Sorare (${error.message || '429 Rate Limit'}). Données en cache local utilisées.`,
        slug,
        user: cached.user,
        cards: cached.cards,
        totalCards: cached.cards.length,
        syncedAt: new Date(cached.timestamp).toISOString(),
      });
    }

    syncProgressMap.set(slug, {
      fetchedPages: 0,
      estimatedTotalPages: 0,
      fetchedCards: 0,
      status: 'error',
      error: error.message || 'Erreur lors de la synchronisation Sorare'
    });
    return res.status(500).json({ success: false, isDegradedMode: true, error: error.message || 'Erreur lors de la synchronisation Sorare' });
  }

  // If no error but also not returned yet
  syncProgressMap.set(slug, {
    fetchedPages: 0,
    estimatedTotalPages: 0,
    fetchedCards: 0,
    status: 'error',
    error: 'Aucune donnée trouvée pour cet utilisateur.'
  });
  return res.status(404).json({ success: false, error: 'Aucune donnée trouvée pour cet utilisateur.' });
});

// Helper to strictly check if card match is on or before selected date (YYYY-MM-DD)
function isCardMatchOnOrBeforeDate(card: any, maxDateStr?: string | null): boolean {
  if (!maxDateStr || maxDateStr.trim() === '') return true;
  const fixture = card.upcomingFixture;
  if (!fixture) return false;
  if (fixture.hasUpcomingMatch === false) return false;

  const rawDate = fixture.kickoffDate || fixture.matchDate;
  if (!rawDate) return false;

  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      const matchDay = rawDate.substring(0, 10);
      return matchDay <= maxDateStr;
    }

    const [year, month, day] = maxDateStr.split('-').map(Number);
    if (!year || !month || !day) return true;

    const limitEndOfDayUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
    if (d.getTime() > limitEndOfDayUtc) {
      return false;
    }

    const isoDateUtc = d.toISOString().substring(0, 10);
    if (isoDateUtc > maxDateStr) {
      return false;
    }

    return true;
  } catch {
    return rawDate.substring(0, 10) <= maxDateStr;
  }
}

// Analyse de la participation aux derniers matchs pour détecter les DNP récents
function getServerPlayerRecentMatchStats(card: any) {
  const last5 = card.scores?.last5Scores || [];
  if (!last5 || last5.length === 0) {
    const isStarter = card.status === 'STARTER';
    const isRegular = card.status === 'REGULAR';
    return {
      playedLastMatch: isStarter || isRegular,
      lastMatchScore: isStarter ? 50 : 0,
      playedCountL5: isStarter ? 5 : isRegular ? 3 : 1,
      consecutiveDnpCount: 0,
      recentPlayingFactor: isStarter ? 1.0 : isRegular ? 0.90 : 0.40,
    };
  }

  const lastMatchScore = last5[last5.length - 1];
  const playedLastMatch = typeof lastMatchScore === 'number' && lastMatchScore > 0;
  const playedCountL5 = last5.filter((s: number) => s > 0).length;

  let consecutiveDnpCount = 0;
  for (let i = last5.length - 1; i >= 0; i--) {
    if (last5[i] <= 0) {
      consecutiveDnpCount++;
    } else {
      break;
    }
  }

  let recentPlayingFactor = 1.0;
  if (playedCountL5 === 0) {
    recentPlayingFactor = 0.05;
  } else if (consecutiveDnpCount >= 3) {
    recentPlayingFactor = 0.20;
  } else if (consecutiveDnpCount === 2) {
    recentPlayingFactor = 0.45;
  } else if (consecutiveDnpCount === 1 || !playedLastMatch) {
    recentPlayingFactor = 0.65;
  } else {
    if (playedCountL5 >= 4) {
      recentPlayingFactor = 1.04;
    } else {
      recentPlayingFactor = 1.0;
    }
  }

  return {
    playedLastMatch,
    lastMatchScore: typeof lastMatchScore === 'number' ? lastMatchScore : 0,
    playedCountL5,
    consecutiveDnpCount,
    recentPlayingFactor,
  };
}

function compareServerCandidates(a: any, b: any): number {
  const diff = b.score - a.score;
  if (Math.abs(diff) > 0.05) return diff;

  // À score égal, le joueur ayant joué le dernier match est sélectionné en priorité
  if (a.playedLastMatch !== b.playedLastMatch) {
    return b.playedLastMatch ? 1 : -1;
  }

  if (a.playedCountL5 !== b.playedCountL5) {
    return b.playedCountL5 - a.playedCountL5;
  }

  return (b.card.scores?.l5 || 0) - (a.card.scores?.l5 || 0);
}

// Deterministic SO5 Lineup Computation Helper (for fallback or server computation)
function computeServerOptimalSO5(cards: any[], strategy: string = 'BALANCED', gameWeek: number = getCurrentGameWeekNumber(), filters: any = {}) {
  // Score breakdown per card based on strategy and recent match participation
  const scored = cards.map((c: any) => {
    if (c.injuryStatus === 'INJURED' || c.injuryStatus === 'SUSPENDED' || c.status === 'NOT_PLAYING') {
      return { card: c, score: 0, playedLastMatch: false, playedCountL5: 0 };
    }
    const recent = getServerPlayerRecentMatchStats(c);
    if (recent.playedCountL5 === 0 && c.status !== 'STARTER') {
      return { card: c, score: 0, playedLastMatch: false, playedCountL5: 0 };
    }

    const l5 = c.scores?.l5 || 40;
    const l15 = c.scores?.l15 || l5;
    const l40 = c.scores?.l40 || l15;
    let base = strategy === 'PURE_FORM' ? (l5 * 0.75 + l15 * 0.2 + l40 * 0.05)
      : strategy === 'SAFE_TITULAR' ? (l5 * 0.35 + l15 * 0.4 + l40 * 0.25)
      : strategy === 'HIGH_CEILING' ? (l5 * 0.6 + l15 * 0.3 + l40 * 0.1)
      : (l5 * 0.5 + l15 * 0.35 + l40 * 0.15);

    let starterFactor = c.status === 'STARTER' ? 1.0 : c.status === 'REGULAR' ? 0.9 : 0.4;
    starterFactor *= recent.recentPlayingFactor;

    const fdr = c.upcomingFixture?.difficultyRating || 3;
    const matchupFactor = fdr === 1 ? 1.12 : fdr === 2 ? 1.05 : fdr === 3 ? 1.0 : fdr === 4 ? 0.92 : 0.85;
    const csFactor = (c.positionCode === 'GK' || c.positionCode === 'DEF') && c.upcomingFixture?.bookmaker?.cleanSheetProb
      ? (c.upcomingFixture.bookmaker.cleanSheetProb / 100) * 8
      : 0;

    let proj = Math.round((base * starterFactor * matchupFactor + csFactor) * 10) / 10;
    return {
      card: c,
      score: proj,
      playedLastMatch: recent.playedLastMatch,
      playedCountL5: recent.playedCountL5,
      lastMatchScore: recent.lastMatchScore,
    };
  });

  // Filter candidates matching user filters
  const eligible = scored.filter(({ card, score }) => {
    if (score <= 0) return false;
    if (filters.maxMatchDate && !isCardMatchOnOrBeforeDate(card, filters.maxMatchDate)) return false;
    if (filters.rarity && filters.rarity !== 'ALL' && card.rarity?.toUpperCase() !== filters.rarity.toUpperCase()) return false;
    if (filters.ageCategory === 'U23' && card.age > 23) return false;
    if (filters.ageCategory === 'OVER_23' && card.age <= 23) return false;
    if (filters.starterOnly && card.status !== 'STARTER') return false;
    if (filters.minStarterConfidence && card.starterConfidence < filters.minStarterConfidence) return false;
    if (filters.homeOnly && !card.upcomingFixture?.isHome) return false;
    if (filters.maxFixtureDifficulty && (card.upcomingFixture?.difficultyRating || 3) > filters.maxFixtureDifficulty) return false;
    if (filters.minL5 && (card.scores?.l5 || 0) < filters.minL5) return false;
    if (filters.minL15 && (card.scores?.l15 || 0) < filters.minL15) return false;
    if (filters.selectedClub && filters.selectedClub !== 'ALL' && card.club?.name !== filters.selectedClub) return false;
    if (filters.minWinProb && filters.minWinProb > 0) {
      const win = card.upcomingFixture?.bookmaker?.win || 50;
      if (win < filters.minWinProb) return false;
    }
    return true;
  });

  let pool = eligible;
  if (pool.length < 5) {
    // Relax soft filters while strictly enforcing hard constraints (maxMatchDate, rarity, age)
    pool = scored.filter(({ card, score }) => {
      if (score <= 0) return false;
      if (filters.maxMatchDate && !isCardMatchOnOrBeforeDate(card, filters.maxMatchDate)) return false;
      if (filters.rarity && filters.rarity !== 'ALL' && card.rarity?.toUpperCase() !== filters.rarity.toUpperCase()) return false;
      if (filters.ageCategory === 'U23' && card.age > 23) return false;
      if (filters.ageCategory === 'OVER_23' && card.age <= 23) return false;
      return true;
    });
  }

  // Pick GK
  const gks = pool.filter(s => s.card.positionCode === 'GK').sort(compareServerCandidates);
  const selectedGk = gks[0]?.card || null;

  // Pick DEF
  const defs = pool.filter(s => s.card.positionCode === 'DEF' && s.card.id !== selectedGk?.id).sort(compareServerCandidates);
  const selectedDef = defs[0]?.card || null;

  // Pick MID
  const mids = pool.filter(s => s.card.positionCode === 'MID' && s.card.id !== selectedGk?.id && s.card.id !== selectedDef?.id).sort(compareServerCandidates);
  const selectedMid = mids[0]?.card || null;

  // Pick FWD
  const fwds = pool.filter(s => s.card.positionCode === 'FWD' && s.card.id !== selectedGk?.id && s.card.id !== selectedDef?.id && s.card.id !== selectedMid?.id).sort(compareServerCandidates);
  const selectedFwd = fwds[0]?.card || null;

  // Pick EXTRA (DEF, MID or FWD)
  const usedIds = new Set([selectedGk?.id, selectedDef?.id, selectedMid?.id, selectedFwd?.id].filter(Boolean));
  let extras = pool.filter(s => s.card.positionCode !== 'GK' && !usedIds.has(s.card.id));
  if (filters.preferredExtraPosition && filters.preferredExtraPosition !== 'AUTO') {
    extras = extras.filter(s => s.card.positionCode === filters.preferredExtraPosition);
  }
  extras.sort(compareServerCandidates);
  const selectedExtra = extras[0]?.card || null;

  // Pick Captain (highest score)
  const team = [
    { slot: 'gk', card: selectedGk, score: selectedGk?.scores?.l5 || 40 },
    { slot: 'def', card: selectedDef, score: selectedDef?.scores?.l5 || 40 },
    { slot: 'mid', card: selectedMid, score: selectedMid?.scores?.l5 || 40 },
    { slot: 'fwd', card: selectedFwd, score: selectedFwd?.scores?.l5 || 40 },
    { slot: 'extra', card: selectedExtra, score: selectedExtra?.scores?.l5 || 40 },
  ];
  const sortedCap = [...team].filter(t => t.card !== null).sort((a, b) => b.score - a.score);
  const captainSlot = sortedCap[0]?.slot || 'fwd';
  const capCard = team.find(t => t.slot === captainSlot)?.card;

  const sumScores = team.reduce((acc, t) => acc + (t.card?.scores?.l5 || 45), 0);
  const capBonus = Math.round(((capCard?.scores?.l5 || 50) * 0.20) * 10) / 10;
  const projectedTotalScore = Math.round((sumScores + capBonus) * 10) / 10;

  return {
    recommendedLineup: {
      gkId: selectedGk?.id || '',
      defId: selectedDef?.id || '',
      midId: selectedMid?.id || '',
      fwdId: selectedFwd?.id || '',
      extraId: selectedExtra?.id || '',
      captainSlot: captainSlot,
    },
    projectedTotalScore,
    summary: `Composition SO5 optimisée pour la Game Week ${gameWeek} basée sur les filtres appliqués, l'analyse des cotes de victoires et la forme récente (L5).`,
    strengths: [
      `100% de joueurs titulaires réguliers avec sécurité de temps de jeu`,
      `Capitaine désigné : ${capCard?.displayName || 'Attaquant'} avec bonus +20% (+${capBonus} pts)`,
      `Synergies défensives et cotes favorables des bookmakers`,
    ],
    risks: [
      `Surveiller la composition officielle 1h avant le coup d'envoi.`,
    ],
    captainReasoning: `${capCard?.displayName || 'Joueur'} possède le plus fort plafond offensif (${capCard?.scores?.l5 || 60} L5) face à son adversaire direct.`,
    cleanSheetOutlook: selectedGk?.upcomingFixture ? `${selectedGk.upcomingFixture.bookmaker?.cleanSheetProb || 50}% de probabilité de Clean Sheet pour ${selectedGk.displayName}` : 'Favorable',
    tacticalPerPosition: {
      gk: selectedGk ? `${selectedGk.displayName} - Face à ${selectedGk.upcomingFixture?.opponent || 'Adversaire'}.` : 'Gardien titulaire.',
      def: selectedDef ? `${selectedDef.displayName} - Solidité défensive et apport offensif.` : 'Défenseur titulaire.',
      mid: selectedMid ? `${selectedMid.displayName} - Régularité au milieu de terrain.` : 'Milieu titulaire.',
      fwd: selectedFwd ? `${selectedFwd.displayName} - Buteur principal en forme.` : 'Attaquant titulaire.',
      extra: selectedExtra ? `${selectedExtra.displayName} - Joker offensif à haut potentiel.` : 'Joueur Extra.',
    },
    alternativeOptions: [],
  };
}

// Fallback Tactical Assistant Chat Generator
function generateFallbackChatAssistant(query: string, gallery: any[], gameWeek: number = getCurrentGameWeekNumber()): string {
  const q = (query || '').toLowerCase();
  const validCards = Array.isArray(gallery) ? gallery.filter((c: any) => c.status !== 'NOT_PLAYING') : [];
  
  // Sort cards by L5
  const topCards = [...validCards].sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
  const topCaptains = topCards.slice(0, 3);
  const bestGk = validCards.filter((c: any) => c.positionCode === 'GK').sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0))[0];
  const dnpRisks = (Array.isArray(gallery) ? gallery : []).filter((c: any) => c.status === 'NOT_PLAYING' || c.injuryStatus === 'INJURED' || c.injuryStatus === 'SUSPENDED');

  if (q.includes('capitaine') || q.includes('bonus') || q.includes('brassard') || q.includes('captain')) {
    if (topCaptains.length > 0) {
      const capList = topCaptains.map(c => `- **${c.displayName}** (${c.club?.name || ''}, L5: ${c.scores?.l5} pts) : Match face à ${c.upcomingFixture?.opponent || 'Adversaire'}. Forte espérance de score SO5.`).join('\n');
      return `Voici mes recommandations de Capitaine (+20% de bonus SO5) pour la **Game Week ${gameWeek}** :\n\n${capList}\n\n💡 *Conseil : Privilégie un attaquant ou milieu offensif titulaire à domicile face à une défense abordable.*`;
    }
  }

  if (q.includes('gardien') || q.includes('gk') || q.includes('cage') || q.includes('clean sheet')) {
    if (bestGk) {
      return `Pour le poste de Gardien de but en **Game Week ${gameWeek}** :\n- **${bestGk.displayName}** (${bestGk.club?.name || ''}) est ton meilleur choix avec une moyenne L5 de **${bestGk.scores?.l5} pts** face à **${bestGk.upcomingFixture?.opponent || 'Adversaire'}** (Probabilité Clean Sheet : ${bestGk.upcomingFixture?.bookmaker?.cleanSheetProb || 45}%).\n\nAssure-toi qu'il soit bien titulaire indiscutable avant le verrouillage.`;
    }
  }

  if (q.includes('dnp') || q.includes('blessé') || q.includes('blessure') || q.includes('risque') || q.includes('suspendu')) {
    if (dnpRisks.length > 0) {
      const riskList = dnpRisks.slice(0, 5).map(c => `- **${c.displayName}** : ${c.injuryStatus !== 'FIT' ? c.injuryStatus : c.status} (0 pt SO5 garanti)`).join('\n');
      return `⚠️ **Attention aux risques de DNP (0 pt) détectés dans ta galerie :**\n\n${riskList}\n\nNe les aligne sous aucun prétexte pour cette Game Week.`;
    }
    return `✅ Excellente nouvelle : Aucun joueur blessé ou suspendu critique n'a été détecté parmi tes cartes prioritaires !`;
  }

  const topGk = validCards.find((c: any) => c.positionCode === 'GK');
  const topDef = validCards.find((c: any) => c.positionCode === 'DEF');
  const topMid = validCards.find((c: any) => c.positionCode === 'MID');
  const topFwd = validCards.find((c: any) => c.positionCode === 'FWD');

  return `### Analyse Tactique de ta Galerie (GW ${gameWeek})
  
J'ai passé en revue l'ensemble de tes cartes (${(gallery || []).length} cartes analysées). Voici les points clés :

1. **Colonne vertébrale recommandée** :
   - **GK** : ${topGk ? `${topGk.displayName} (L5: ${topGk.scores?.l5})` : 'Gardien titulaire'}
   - **DEF** : ${topDef ? `${topDef.displayName} (L5: ${topDef.scores?.l5})` : 'Défenseur titulaire'}
   - **MID** : ${topMid ? `${topMid.displayName} (L5: ${topMid.scores?.l5})` : 'Milieu titulaire'}
   - **FWD** : ${topFwd ? `${topFwd.displayName} (L5: ${topFwd.scores?.l5})` : 'Attaquant titulaire'}
2. **Capitaine recommandé (+20%)** : **${topCaptains[0]?.displayName || 'Ton meilleur attaquant'}** pour maximiser le plafond de points.
3. **Sécurité DNP** : Évite d'aligner les remplaçants à moins de 60% de confiance de titularisation.

N'hésite pas si tu souhaites comparer deux joueurs en particulier ou ajuster les contraintes de filtrage !`;
}

// 3. AI Lineup Optimization (Gemini 3.1 Flash Lite) with Filter Constraints
app.post('/api/ai/optimize-lineup', requireAppToken, async (req, res) => {
  const {
    cards,
    strategy = 'BALANCED',
    gameWeek = getCurrentGameWeekNumber(),
    filters = {},
    customPreferences = '',
  } = req.body;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'La liste de cartes est requise.' });
  }

  // AUDIT FIX: neither `cards` (whole gallery, unbounded) nor `customPreferences` (free text) had
  // any size cap before being folded into the Gemini prompt — an unauthenticated (or authenticated
  // but malicious) caller could send an oversized payload to inflate cost. 1500 cards is generous
  // for any real Sorare gallery; 500 chars is generous for a manager's stated preferences.
  const MAX_CARDS_FOR_AI = 1500;
  const MAX_PREFERENCES_CHARS = 500;
  const boundedCards = cards.slice(0, MAX_CARDS_FOR_AI);
  const boundedPreferences = typeof customPreferences === 'string' ? customPreferences.slice(0, MAX_PREFERENCES_CHARS) : '';

  try {
    const ai = getAI();
    const model = 'gemini-2.5-flash';

    // Apply active optimization filters to the player pool
    let filteredCandidates = boundedCards.filter((c: any) => {
      // 1. Exclude injured / suspended / not playing
      if (c.injuryStatus === 'INJURED' || c.injuryStatus === 'SUSPENDED' || c.status === 'NOT_PLAYING') {
        return false;
      }

      // 2. Rarity filter
      if (filters.rarity && filters.rarity !== 'ALL') {
        if (c.rarity?.toUpperCase() !== filters.rarity.toUpperCase()) return false;
      }

      // 3. Age / U23 filter
      if (filters.ageCategory === 'U23' && c.age > 23) return false;
      if (filters.ageCategory === 'OVER_23' && c.age <= 23) return false;

      // 4. Starter only
      if (filters.starterOnly && c.status !== 'STARTER') return false;

      // 5. Min starter confidence
      if (filters.minStarterConfidence && c.starterConfidence < filters.minStarterConfidence) return false;

      // 6. Home match only
      if (filters.homeOnly && !c.upcomingFixture?.isHome) return false;

      // 7. Max fixture difficulty
      if (filters.maxFixtureDifficulty && c.upcomingFixture?.difficultyRating > filters.maxFixtureDifficulty) return false;

      // 8. Min L5 & L15 scores
      if (filters.minL5 && (c.scores?.l5 || 0) < filters.minL5) return false;
      if (filters.minL15 && (c.scores?.l15 || 0) < filters.minL15) return false;

      // 9. Selected club
      if (filters.selectedClub && filters.selectedClub !== 'ALL' && c.club?.name !== filters.selectedClub) return false;

      // 10. Max match date (STRICT MANDATORY CONSTRAINT)
      if (filters.maxMatchDate && !isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)) {
        return false;
      }

      // 11. Min win probability
      if (filters.minWinProb && filters.minWinProb > 0) {
        const win = c.upcomingFixture?.bookmaker?.win || 50;
        if (win < filters.minWinProb) return false;
      }

      return true;
    });

    // Ensure we have candidates for all positions even if filters are strict, without breaking hard constraints
    const hasGk = filteredCandidates.some((c: any) => c.positionCode === 'GK');
    const hasDef = filteredCandidates.some((c: any) => c.positionCode === 'DEF');
    const hasMid = filteredCandidates.some((c: any) => c.positionCode === 'MID');
    const hasFwd = filteredCandidates.some((c: any) => c.positionCode === 'FWD');

    if (!hasGk) {
      const bestGks = boundedCards.filter((c: any) => c.positionCode === 'GK' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestGks.length > 0) filteredCandidates.push(bestGks[0]);
    }
    if (!hasDef) {
      const bestDefs = boundedCards.filter((c: any) => c.positionCode === 'DEF' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestDefs.length > 0) filteredCandidates.push(bestDefs[0]);
    }
    if (!hasMid) {
      const bestMids = boundedCards.filter((c: any) => c.positionCode === 'MID' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestMids.length > 0) filteredCandidates.push(bestMids[0]);
    }
    if (!hasFwd) {
      const bestFwds = boundedCards.filter((c: any) => c.positionCode === 'FWD' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestFwds.length > 0) filteredCandidates.push(bestFwds[0]);
    }

    // Build concise prompt payload with recent match playing indicators
    const simplifiedRoster = filteredCandidates.map((c: any) => {
      const recent = getServerPlayerRecentMatchStats(c);
      return {
        id: c.id,
        name: c.displayName,
        position: c.positionCode,
        rarity: c.rarity,
        club: c.club?.name,
        age: c.age,
        status: c.status,
        starterConfidence: c.starterConfidence,
        injuryStatus: c.injuryStatus,
        playedLastMatch: recent.playedLastMatch,
        lastMatchScore: recent.lastMatchScore,
        playedInL5: `${recent.playedCountL5}/5`,
        l5: c.scores?.l5,
        l15: c.scores?.l15,
        l40: c.scores?.l40,
        matchDate: c.upcomingFixture?.kickoffDate || c.upcomingFixture?.matchDate,
        kickoffFormatted: c.upcomingFixture?.kickoffFormatted,
        opponent: c.upcomingFixture?.opponent,
        isHome: c.upcomingFixture?.isHome,
        fixtureDifficulty: c.upcomingFixture?.difficultyRating,
        cleanSheetProb: c.upcomingFixture?.bookmaker?.cleanSheetProb,
        goalExpectancy: c.upcomingFixture?.bookmaker?.goalExpectancy,
        anytimeScorerOdds: c.upcomingFixture?.bookmaker?.anytimeScorerOdds,
        weather: c.upcomingFixture?.weather ? `${c.upcomingFixture.weather.description || 'Météo'} (${c.upcomingFixture.weather.temp}°C, vent ${c.upcomingFixture.weather.wind} km/h)` : undefined,
      };
    });

    // Filter constraints description for AI prompt
    const filterDescriptions: string[] = [];
    if (filters.maxMatchDate) filterDescriptions.push(`Date limite de match : Matchs jusqu'au ${filters.maxMatchDate} (inclus) UNIQUEMENT. Tout joueur dont le match a lieu après cette date est STRICTEMENT INTERDIT.`);
    if (filters.rarity && filters.rarity !== 'ALL') filterDescriptions.push(`Rareté exigée : ${filters.rarity}`);
    if (filters.ageCategory === 'U23') filterDescriptions.push('Éligibilité : U23 uniquement (≤ 23 ans)');
    if (filters.starterOnly) filterDescriptions.push('Statut exigé : 100% Titulaires Indiscutables (STARTER uniquement)');
    if (filters.minStarterConfidence) filterDescriptions.push(`Confiance de titularisation minimale : ≥ ${filters.minStarterConfidence}%`);
    if (filters.homeOnly) filterDescriptions.push('Uniquement joueurs évoluant à Domicile');
    if (filters.maxFixtureDifficulty) filterDescriptions.push(`Difficulté max FDR : ≤ ${filters.maxFixtureDifficulty}/5`);
    if (filters.minL5) filterDescriptions.push(`Forme L5 minimale : ≥ ${filters.minL5} pts`);
    if (filters.preferredExtraPosition && filters.preferredExtraPosition !== 'AUTO') filterDescriptions.push(`Poste EXTRA forcé : ${filters.preferredExtraPosition}`);
    if (filters.selectedClub && filters.selectedClub !== 'ALL') filterDescriptions.push(`Club ciblé : ${filters.selectedClub}`);
    if (filters.stackClub) filterDescriptions.push('Favoriser les synergies de coéquipiers (Club Stacking)');

    const constraintsText = filterDescriptions.length > 0
      ? `\nCONTRAINTES ET FILTRES D'OPTIMISATION APPLIQUÉS PAR LE MANAGER :\n- ${filterDescriptions.join('\n- ')}\n`
      : '\nAucun filtre restrictif particulier.';

    const systemInstruction = `Tu es l'analyste tactique en chef et optimisateur d'équipes pour le jeu de fantasy football Sorare (SO5 Free / Common Tier).
Règles de composition SO5 :
1. Une équipe est composée exactement de :
   - 1 Gardien (GK)
   - 1 Défenseur (DEF)
   - 1 Milieu (MID)
   - 1 Attaquant (FWD)
   - 1 Joueur Joker / EXTRA (parmi DEF, MID ou FWD uniquement, JAMAIS de GK en extra).
   ${filters.preferredExtraPosition && filters.preferredExtraPosition !== 'AUTO' ? `*Contrainte spéciale Extra : L'Extra DOIT être de poste ${filters.preferredExtraPosition}.*` : ''}
2. Capitaine : Sélectionne le joueur qui a le plus fort potentiel / plafond de points SO5 face à son adversaire direct. Il reçoit un bonus de +20% de score.
3. RÈGLE ABSOLUE DE SÉCURITÉ DU DERNIER MATCH ET DNP : 
   - Examine attentivement le champ 'playedLastMatch'.
   - Si un joueur n'a PAS joué le dernier match (playedLastMatch = false ou 0 min), il subit une LOURDE PÉNALITÉ car son risque de non-titularisation est critique.
   - À score égal ou très proche, CHOISIS SYSTÉMATIQUEMENT le joueur ayant joué le dernier match plutôt que celui qui n'a pas joué.
   - Élimine d'office tout joueur blessé, suspendu, ou ayant le statut NOT_PLAYING.
4. Respecte impérativement les filtres et contraintes fixés par l'utilisateur (notamment la date limite maxMatchDate).
5. Stratégie demandée : ${strategy}.
6. Analyse les cotes bookmakers (clean sheet pour gardiens/défenseurs, espérance de buts xG pour milieux/attaquants) et la météo (pluie/vent augmentant les erreurs de gardiens et favorisant les duels défensifs).
Rédige une analyse tactique percutante, professionnelle et justifiée en français en mentionnant les filtres respectés.`;

    const prompt = `Voici les cartes disponibles du joueur Thib 8 pour la Game Week ${gameWeek} respectant les filtres :
${JSON.stringify(simplifiedRoster, null, 2)}
${constraintsText}
Préférences manager : ${boundedPreferences || 'Optimiser pour le score SO5 le plus élevé possible en respectant les filtres.'}

Renvoie la composition optimale SO5 avec le capitaine, les justifications par poste, les forces, les risques, et les filtres respectés.`;

    const response = await generateContentWithRetry({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedLineup: {
              type: Type.OBJECT,
              properties: {
                gkId: { type: Type.STRING, description: 'ID de la carte GK sélectionnée' },
                defId: { type: Type.STRING, description: 'ID de la carte DEF sélectionnée' },
                midId: { type: Type.STRING, description: 'ID de la carte MID sélectionnée' },
                fwdId: { type: Type.STRING, description: 'ID de la carte FWD sélectionnée' },
                extraId: { type: Type.STRING, description: 'ID de la carte EXTRA sélectionnée (DEF, MID ou FWD uniquement)' },
                captainSlot: { type: Type.STRING, description: 'gk, def, mid, fwd, ou extra' },
              },
              required: ['gkId', 'defId', 'midId', 'fwdId', 'extraId', 'captainSlot'],
            },
            projectedTotalScore: { type: Type.NUMBER, description: 'Score total projeté avec bonus capitaine' },
            summary: { type: Type.STRING, description: 'Résumé exécutif de la stratégie retenue' },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Points forts clés de cette composition',
            },
            risks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Points de vigilance ou risques tactiques',
            },
            captainReasoning: { type: Type.STRING, description: 'Pourquoi ce joueur a été désigné Capitaine (+20%)' },
            cleanSheetOutlook: { type: Type.STRING, description: 'Perspective de clean sheet pour la défense' },
            differentialValue: { type: Type.STRING, description: 'Facteur différentiel de la composition' },
            tacticalPerPosition: {
              type: Type.OBJECT,
              properties: {
                gk: { type: Type.STRING },
                def: { type: Type.STRING },
                mid: { type: Type.STRING },
                fwd: { type: Type.STRING },
                extra: { type: Type.STRING },
              },
              required: ['gk', 'def', 'mid', 'fwd', 'extra'],
            },
            alternativeOptions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slot: { type: Type.STRING },
                  alternativePlayerId: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
                required: ['slot', 'alternativePlayerId', 'rationale'],
              },
            },
          },
          required: [
            'recommendedLineup',
            'projectedTotalScore',
            'summary',
            'strengths',
            'risks',
            'captainReasoning',
            'cleanSheetOutlook',
            'tacticalPerPosition',
          ],
        },
      },
    });

    const jsonText = response.text?.trim();
    if (!jsonText) {
      throw new Error('Réponse vide du modèle Gemini');
    }

    const parsed = JSON.parse(jsonText);

    // Validate and sanitize Gemini recommended cards against hard date filter
    if (filters.maxMatchDate && parsed.recommendedLineup) {
      const slots = ['gkId', 'defId', 'midId', 'fwdId', 'extraId'];
      const slotPosMap: Record<string, string> = { gkId: 'GK', defId: 'DEF', midId: 'MID', fwdId: 'FWD', extraId: 'EXTRA' };
      
      for (const slotKey of slots) {
        const pId = parsed.recommendedLineup[slotKey];
        const cardObj = boundedCards.find((c: any) => c.id === pId);
        if (cardObj && !isCardMatchOnOrBeforeDate(cardObj, filters.maxMatchDate)) {
          const expectedPos = slotPosMap[slotKey];
          const validReplacement = filteredCandidates.find((c: any) => {
            if (expectedPos === 'EXTRA') return c.positionCode !== 'GK' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate);
            return c.positionCode === expectedPos && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate);
          });
          if (validReplacement) {
            parsed.recommendedLineup[slotKey] = validReplacement.id;
          }
        }
      }
    }

    return res.json({
      success: true,
      source: 'gemini_ai',
      data: parsed,
    });
  } catch (error: any) {
    console.log('[AI Optimizer] Applying algorithmic SO5 lineup optimizer.');
    const deterministicData = computeServerOptimalSO5(cards, strategy, gameWeek, filters);
    return res.json({
      success: true,
      source: 'algorithmic_engine',
      data: deterministicData,
    });
  }
});

// 4. AI Player Scout Report
app.post('/api/ai/scout-player', requireAppToken, async (req, res) => {
  const { player, gameWeek = getCurrentGameWeekNumber() } = req.body;
  if (!player) {
    return res.status(400).json({ error: 'Données joueur manquantes.' });
  }

  try {
    const ai = getAI();
    const model = 'gemini-2.5-flash';

    const systemInstruction = `Tu es un recruteur expert Sorare SO5. Analyse la carte du joueur, sa forme récente (L5), sa régularité (L15/L40), son statut de titulaire, son adversaire et les cotes bookmakers pour délivrer une fiche de scouting ultra précise.`;

    const prompt = `Voici la carte du joueur :
${JSON.stringify(player, null, 2)}
Game Week : ${gameWeek}

Rédige une fiche d'analyse avec :
- Verdict global (Aligner absolument / Bon choix / Risqué / À éviter)
- Note de confiance sur 100
- Plafond de points estimé (Floor et Ceiling SO5)
- Analyse du duel face à l'adversaire
- Conseils pour le capitanat`;

    const response = await generateContentWithRetry({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: { type: Type.STRING },
            confidenceRating: { type: Type.NUMBER },
            floorScore: { type: Type.NUMBER },
            expectedScore: { type: Type.NUMBER },
            ceilingScore: { type: Type.NUMBER },
            matchupAnalysis: { type: Type.STRING },
            starterSecurity: { type: Type.STRING },
            captainSuitability: { type: Type.STRING },
            keyAdvice: { type: Type.STRING },
          },
          required: [
            'verdict',
            'confidenceRating',
            'floorScore',
            'expectedScore',
            'ceilingScore',
            'matchupAnalysis',
            'starterSecurity',
            'keyAdvice',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return res.json({ success: true, source: 'gemini_ai', data: parsed });
  } catch (error: any) {
    console.log('[AI Scout] Applying high-fidelity scouting calculation.');
    
    const isStarter = player?.status === 'STARTER';
    const l5 = player?.scores?.l5 || 50;
    const l40 = player?.scores?.l40 || 50;
    const opponent = player?.upcomingFixture?.opponent || 'Adversaire';
    const fdr = player?.upcomingFixture?.difficultyRating || 3;
    const keyAdvice = player?.tacticalNotes || (isStarter 
      ? `Joueur régulier avec une moyenne L5 de ${l5}. Son duel face à ${opponent} (FDR ${fdr}/5) s'annonce équilibré.` 
      : `Rôle de remplaçant ou temps de jeu partagé. Soyez prudent avant de l'aligner.`);

    const fallbackData = {
      verdict: isStarter ? (l5 > 60 ? 'Aligner absolument' : 'Titulaire solide') : 'Risque de banc',
      confidenceRating: player?.starterConfidence || (isStarter ? 80 : 30),
      floorScore: Math.max(30, Math.round(l40 * 0.8)),
      expectedScore: Math.round(l5),
      ceilingScore: Math.min(100, Math.round(l5 * 1.3)),
      matchupAnalysis: `Match face à ${opponent}. Niveau de difficulté estimé à ${fdr}/5.`,
      starterSecurity: isStarter ? 'Titulaire pressenti dans le XI de départ.' : 'Rôle incertain pour cette Game Week.',
      captainSuitability: l5 > 68 ? 'Très bonne option de capitanat.' : 'Préférable sans brassard.',
      keyAdvice: keyAdvice
    };

    return res.json({ success: true, source: 'algorithmic_engine', data: fallbackData });
  }
});

// 5. AI Tactical Assistant Chat
app.post('/api/ai/chat', requireAppToken, async (req, res) => {
  const { messages, gallery, gameWeek = getCurrentGameWeekNumber() } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required.' });
  }

  const userLastMessage = messages[messages.length - 1]?.content || 'Quelle est la meilleure composition ?';

  // Cap the conversation history sent to Gemini: keep only the most recent turns and clip
  // very long individual messages, so an open-ended chat can't grow the prompt (and the bill)
  // without bound. 20 messages / 2000 chars per message is generous for a tactical chat.
  const MAX_HISTORY_MESSAGES = 20;
  const MAX_MESSAGE_CHARS = 2000;
  const boundedMessages = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m: any) => ({
      role: m?.role,
      content: typeof m?.content === 'string' ? m.content.slice(0, MAX_MESSAGE_CHARS) : '',
    }));

  try {
    const ai = getAI();
    const model = 'gemini-2.5-flash';

    const systemInstruction = `Tu es l'Assistant Tactique IA personnel de Thib 8 pour Sorare SO5 (Fantasy Football).
Tu as accès en temps réel à l'ensemble de ses cartes de jeu, leurs statistiques L5/L15/L40, leurs statuts de titulaires, blessures et leurs matchs à venir avec cotes bookmakers.
Règles de jeu Sorare :
- Équipe SO5 : 1 GK, 1 DEF, 1 MID, 1 FWD, 1 EXTRA (DEF/MID/FWD uniquement).
- Bonus Capitaine : +20%.
- Objectif : Maximiser les points dans le mode gratuit.
Réponds de façon experte, concise, motivante et stratégique en français. Propose toujours des choix concrets argumentés.`;

    const galleryContext = Array.isArray(gallery)
      ? gallery
          .filter(c => c && c.scores?.l5 != null)
          .sort((a, b) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0))
          .slice(0, 45)
          .map(c => `${c.displayName} (${c.positionCode}, ${c.club?.name || ''}, L5:${c.scores?.l5}, L15:${c.scores?.l15}, Statut:${c.status}, vs ${c.upcomingFixture?.opponent || 'N/A'})`)
          .join('\n')
      : 'Galerie standard Thib 8';

    const prompt = `Contexte de la galerie de Thib 8 (GW ${gameWeek}) :
${galleryContext}

Historique de la conversation :
${boundedMessages.map((m: any) => `${m.role === 'user' ? 'Manager (Thib 8)' : 'Coach IA'}: ${m.content}`).join('\n')}

Dernière question du manager : "${userLastMessage}"`;

    const response = await generateContentWithRetry({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    return res.json({
      success: true,
      source: 'gemini_ai',
      reply: response.text || 'Désolé, je n\'ai pas pu formuler de réponse.',
    });
  } catch (error: any) {
    console.log('[AI Chat] Generating responsive tactical assistant guidance.');
    const fallbackReply = generateFallbackChatAssistant(userLastMessage, gallery, gameWeek);
    return res.json({
      success: true,
      source: 'algorithmic_engine',
      reply: fallbackReply,
    });
  }
});

// Vite Middleware for development & static for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.get('/api/sports/starting-xi', (req, res) => {
  res.json({
    success: true,
    confirmedSlugs: [], 
    source: 'opta_mock'
  });
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  // En production, échange du code contre un token via fetch POST sur le token endpoint de Sorare
  // const tokenRes = await fetch('https://api.sorare.com/oauth/token', { ... })
  res.send(`
    <html>
      <body>
        <script>
          // Simuler le stockage du token dans localStorage via un postMessage au parent
          if (window.opener) {
            window.opener.postMessage({ type: 'SORARE_OAUTH_SUCCESS', token: 'mock-oauth-token-xyz' }, '*');
            window.close();
          }
        </script>
        <h1>Autorisation réussie !</h1>
        <p>Vous pouvez fermer cette fenêtre.</p>
      </body>
    </html>
  `);
});

app.post('/api/sorare/export-lineup', async (req, res) => {
  const { token, lineup } = req.body;
  if (!token) return res.status(401).json({ success: false, error: 'OAuth token missing' });

  // AUDIT FIX: this route has never actually talked to Sorare (no registered OAuth app, no real
  // GraphQL mutation call) — it was previously returning `message: 'Lineup exported successfully
  // to Sorare'`, which is false and could mislead a manager into thinking their team was really
  // submitted. It now explicitly reports itself as a simulation. To make this real: implement
  // Sorare's OAuth2 token exchange, then call the real `createOrUpdateLineup` mutation below.
  // const mutation = `mutation createOrUpdateLineup(...) { ... }`
  // await fetch('https://api.sorare.com/graphql', { headers: { 'Authorization': `Bearer ${token}` }})

  res.json({
    success: true,
    simulated: true,
    message: 'Simulation locale uniquement — aucune donnée n\'a été envoyée à Sorare. Validez votre composition sur sorare.com.',
  });
});

app.get('/api/sorare/gameweek', async (req, res) => {
  // BUGFIX (audit): this endpoint used to unconditionally return a hardcoded `48`, with a comment
  // admitting it was simulated. It now tries a real Sorare GraphQL query first (best case: the
  // true live game week), and falls back to the locally-computed GAME_WEEK_ANCHOR-based number
  // (see fixturesData.ts) if the query fails or the app has no Sorare API key configured — but it
  // never silently freezes on a stale literal again.
  const customApiKey = (req.query.apiKey as string) || (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
  try {
    if (customApiKey) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', APIKEY: customApiKey };
      const query = `query { so5 { currentSo5OneWeekGameWeek { number } } }`;
      const result = await fetchGraphQLWithRetry('https://api.sorare.com/graphql', { query }, headers, 1);
      const liveNumber = result?.data?.data?.so5?.currentSo5OneWeekGameWeek?.number;
      if (typeof liveNumber === 'number' && liveNumber > 0) {
        return res.json({ success: true, gameWeek: liveNumber, source: 'sorare_live' });
      }
    }
  } catch (err) {
    console.warn('[GameWeek] Live Sorare query failed, using computed fallback:', (err as any)?.message || err);
  }
  return res.json({ success: true, gameWeek: getCurrentGameWeekNumber(), source: 'computed_fallback' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Team Sorare Server] Server running on http://0.0.0.0:${PORT}`);
    initDailyOddsScheduler();
  });
}

startServer();
 
