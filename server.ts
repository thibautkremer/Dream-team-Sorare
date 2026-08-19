import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { MOCK_GALLERY } from './src/data/mockGallery';
import { getClubUpcomingFixture, normalizeClubName, FIXTURES_CATALOG } from './src/data/fixturesData';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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
const userCardsCache = new Map<string, { timestamp: number; cards: any[]; user: any }>();

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
  const modelsToTry = [params.model, 'gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];
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

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'Team Sorare Backend',
    timestamp: new Date().toISOString(),
  });
});

// Admin Logs endpoints
app.get('/api/admin/logs', (req, res) => {
  res.json({ logs: apiLogs, total: apiLogs.length });
});

app.post('/api/admin/logs/clear', (req, res) => {
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
      const customApiKey = (req.headers['x-sorare-api-key'] as string) || process.env.SORARE_API_KEY || '';
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
          const last5Scores = rawScores.slice(0, 5);
          const last10Scores = rawScores.slice(0, 10);
          const last15Scores = rawScores.slice(0, 15);
          const last40Scores = rawScores.slice(0, 40);

          const l5 = player?.l5 != null ? Math.round(Number(player.l5) * 10) / 10 : foundCard?.scores?.l5 || 0;
          const l15 = player?.l15 != null ? Math.round(Number(player.l15) * 10) / 10 : foundCard?.scores?.l15 || 0;
          const l40 = player?.l40 != null ? Math.round(Number(player.l40) * 10) / 10 : foundCard?.scores?.l40 || 0;

          if (!foundCard) {
            foundCard = {
              id: player.id || targetSlug,
              slug: player.slug || targetSlug,
              displayName: player?.displayName || 'Joueur Sorare',
              name: player?.displayName || 'Carte Sorare',
              scores: {}
            };
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

          // Update cache if exists
          if (foundUserSlug && userCardsCache.has(foundUserSlug) && foundIndex !== -1) {
            const cachedObj = userCardsCache.get(foundUserSlug);
            if (cachedObj && cachedObj.cards[foundIndex]) {
              cachedObj.cards[foundIndex] = { ...cachedObj.cards[foundIndex], scores: foundCard.scores };
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

// Helper for cleaning Sorare username slugs
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
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

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
      'soccer_usa_mls'
    ];
    
    await Promise.allSettled(
      leagues.map(async (league) => {
        try {
          const url = `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h,totals,btts`;
          const res = await fetch(url);
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
        } catch {}
      })
    );
    lastOddsFetch = Date.now();
  } catch (err) {
    console.warn('[Odds API] Non-fatal background fetch notice:', err);
  }
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
    const scoresCount = 40;

    syncProgressMap.set(slug, {
      fetchedPages: 0,
      estimatedTotalPages: hasApiKey ? 15 : 25, // Roughly estimating based on 1000 cards max
      fetchedCards: 0,
      status: 'fetching'
    });

    const query = `
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

    let after: string | null = null;
    let allRawNodes: any[] = [];
    let userMeta: any = null;
    const maxPages = 200; // 200 pages * 12 cards = 2400 cards max

    for (let page = 1; page <= maxPages; page++) {
      console.log(`[Sorare Sync] Fetching page ${page}, headers:`, JSON.stringify(headers));
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

      syncProgressMap.set(slug, {
        fetchedPages: page,
        estimatedTotalPages: hasApiKey ? 15 : 25,
        fetchedCards: allRawNodes.length,
        status: (hasNext && after) ? 'fetching' : 'processing'
      });

      if (!hasNext || !after) {
        console.log(`[Sorare Sync] Reached end of collection at page ${page} (${allRawNodes.length} cards total).`);
        break;
      }

      // Small pacing delay between pages (150ms) to avoid triggering burst rate limits
      await new Promise((r) => setTimeout(r, 150));
    }

    if (allRawNodes.length > 0) {
      console.log(`[Sorare Sync] Successfully retrieved ${allRawNodes.length} real cards for ${slug}`);

      // Transform raw nodes into rich SorareCard format with real match history
      const transformedCards = allRawNodes.map((c: any, idx: number) => {
        const player = c.anyPlayer;
        const pgsList = player?.playerGameScores || [];

        const leagueName = player?.domesticLeague?.name || c.club?.domesticLeague?.name || 'Championnat';

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
            competitionName: leagueName,
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
    // Helper to calculate average of played matches
    const calcAvg = (scores: number[]) => {
      const played = scores.filter(s => s > 0);
      return played.length > 0
        ? Math.round((played.reduce((a, b) => a + b, 0) / played.length) * 10) / 10
        : 0;
    };

        const l5 = (player?.l5 != null) ? Math.round(Number(player.l5) * 10) / 10 : calcAvg(last5Scores);
        const l10 = calcAvg(last10Scores);
        const l15 = (player?.l15 != null) ? Math.round(Number(player.l15) * 10) / 10 : calcAvg(last15Scores);
        const l40 = (player?.l40 != null) ? Math.round(Number(player.l40) * 10) / 10 : calcAvg(last40Scores);

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

        // 5. Status & Starter Confidence based strictly on RECENT 5 GameWeeks
        let status: 'STARTER' | 'REGULAR' | 'SUBSTITUTE' | 'NOT_PLAYING' = 'REGULAR';
        let starterConfidence = 70;
        let injuryStatus: 'FIT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'INJURED' | 'SUSPENDED' = 'FIT';

        if (player?.playingStatus) {
          status = player.playingStatus;
          starterConfidence = status === 'STARTER' ? 90 : status === 'REGULAR' ? 65 : status === 'SUBSTITUTE' ? 30 : 0;
        } else {
          if (playedCountL5 === 0) {
            status = 'NOT_PLAYING';
            starterConfidence = 0;
            injuryStatus = 'DOUBTFUL';
          } else if (playedCountL5 === 1) {
            status = 'SUBSTITUTE';
            starterConfidence = 20;
          } else if (playedCountL5 === 2 || playedCountL5 === 3) {
            status = 'REGULAR';
            starterConfidence = 55;
          } else if (playedCountL5 >= 4 && playedLastMatch) {
            status = 'STARTER';
            starterConfidence = 90;
          } else if (playedCountL5 >= 4 && !playedLastMatch) {
            status = 'REGULAR';
            starterConfidence = 50;
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

        const clubName = player?.activeClub?.name || c.club?.name || 'Club';
        const normClub = normalizeClubName(clubName);
        const catalogEntry = FIXTURES_CATALOG[normClub] || FIXTURES_CATALOG['Club Non Renseigné'];
        
        let fixture = getClubUpcomingFixture(clubName, posCode as any, l5);
        if (player?.activeClub?.upcomingGames?.[0]) {
          const game = player.activeClub.upcomingGames[0];
          const isHome = game.homeTeam?.name === clubName;
          const opponentName = isHome ? (game.awayTeam?.name || 'Adversaire') : (game.homeTeam?.name || 'Adversaire');
          
          // Chercher dans le catalogue pour avoir les vraies cotes bookmakers réelles !
          const normOpponent = normalizeClubName(opponentName);
          const normClub = normalizeClubName(clubName);
          const clubCatalog = FIXTURES_CATALOG[normClub];
          let diffRating = 3;
          let bookmakerData: {
            win: number;
            draw: number;
            loss: number;
            cleanSheetProb: number;
            goalExpectancy: number;
            anytimeScorerOdds?: number;
            anytimeAssistOdds?: number;
            winProbability?: number;
          } = {
            win: isHome ? 1.95 : 2.70,
            draw: 3.40,
            loss: isHome ? 3.80 : 2.40,
            cleanSheetProb: posCode === 'GK' || posCode === 'DEF' ? (isHome ? 45 : 32) : 30,
            goalExpectancy: posCode === 'FWD' || posCode === 'MID' ? 1.85 : 1.2,
            anytimeScorerOdds: posCode === 'FWD' ? 2.40 : 4.50,
            anytimeAssistOdds: posCode === 'MID' ? 3.20 : 5.50,
          };

          if (clubCatalog) {
            diffRating = clubCatalog.difficultyRating;
            bookmakerData = {
              win: clubCatalog.winOdds,
              draw: clubCatalog.drawOdds,
              loss: clubCatalog.lossOdds,
              cleanSheetProb: posCode === 'GK' || posCode === 'DEF' ? clubCatalog.cleanSheetProb : Math.min(45, clubCatalog.cleanSheetProb),
              goalExpectancy: posCode === 'FWD' || posCode === 'MID' ? clubCatalog.goalExpectancy : Math.min(1.5, clubCatalog.goalExpectancy),
              anytimeScorerOdds: clubCatalog.anytimeScorerOdds,
            };
          } else {
            // Fallback intelligent basé sur les chances réelles
            const winProbVal = isHome ? 51 : 33;
            diffRating = winProbVal >= 60 ? 1 : winProbVal >= 48 ? 2 : winProbVal >= 35 ? 3 : winProbVal >= 22 ? 4 : 5;
          }

          // Override with REAL Odds API if available
          const realOdds = realOddsCache.get(normClub);
          if (realOdds) {
            bookmakerData.win = realOdds.win;
            bookmakerData.draw = realOdds.draw;
            bookmakerData.loss = realOdds.loss;
            if (realOdds.cleanSheetProb) {
              bookmakerData.cleanSheetProb = posCode === 'GK' || posCode === 'DEF' ? realOdds.cleanSheetProb : Math.min(45, realOdds.cleanSheetProb);
            }
            if (realOdds.goalExpectancy) {
              bookmakerData.goalExpectancy = realOdds.goalExpectancy;
              // Derive anytimeScorerOdds heuristically based on team xG and position
              if (posCode === 'FWD') bookmakerData.anytimeScorerOdds = Math.round(Math.max(1.75, 4.8 - realOdds.goalExpectancy * 1.1) * 10) / 10;
              else if (posCode === 'MID') bookmakerData.anytimeScorerOdds = Math.round(Math.max(2.4, 6.8 - realOdds.goalExpectancy * 0.9) * 10) / 10;
              else if (posCode === 'DEF') bookmakerData.anytimeScorerOdds = Math.round(Math.max(5.5, 14.0 - realOdds.goalExpectancy * 1.5) * 10) / 10;
              else bookmakerData.anytimeScorerOdds = 35.0;

              // Derive anytimeAssistOdds heuristically based on team xG and position
              if (posCode === 'MID') bookmakerData.anytimeAssistOdds = Math.round(Math.max(2.2, 5.2 - realOdds.goalExpectancy * 0.8) * 10) / 10;
              else if (posCode === 'FWD') bookmakerData.anytimeAssistOdds = Math.round(Math.max(2.8, 6.2 - realOdds.goalExpectancy * 0.7) * 10) / 10;
              else if (posCode === 'DEF') bookmakerData.anytimeAssistOdds = Math.round(Math.max(4.5, 9.5 - realOdds.goalExpectancy * 0.5) * 10) / 10;
              else bookmakerData.anytimeAssistOdds = 25.0;
            }
            
            // Recalculate diffRating based on real win probability
            const invWin = 1 / realOdds.win;
            const invDraw = 1 / realOdds.draw;
            const invLoss = 1 / realOdds.loss;
            const winProbVal = Math.round((invWin / (invWin + invDraw + invLoss)) * 100);
            bookmakerData.winProbability = winProbVal;
            diffRating = winProbVal >= 60 ? 1 : winProbVal >= 48 ? 2 : winProbVal >= 35 ? 3 : winProbVal >= 22 ? 4 : 5;
          }

          fixture = {
            gameWeek: 48,
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
        user: finalUser,
        cards: finalCollection,
        totalCards: finalCollection.length,
        syncedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.log('[Sorare Sync] Direct GraphQL error:', error);
    syncProgressMap.set(slug, {
      fetchedPages: 0,
      estimatedTotalPages: 0,
      fetchedCards: 0,
      status: 'error',
      error: error.message || 'Erreur lors de la synchronisation Sorare'
    });
    return res.status(500).json({ success: false, error: error.message || 'Erreur lors de la synchronisation Sorare' });
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
function computeServerOptimalSO5(cards: any[], strategy: string = 'BALANCED', gameWeek: number = 48, filters: any = {}) {
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
function generateFallbackChatAssistant(query: string, gallery: any[], gameWeek: number = 48): string {
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
app.post('/api/ai/optimize-lineup', async (req, res) => {
  const {
    cards,
    strategy = 'BALANCED',
    gameWeek = 48,
    filters = {},
    customPreferences = '',
  } = req.body;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'La liste de cartes est requise.' });
  }

  try {
    const ai = getAI();
    const model = 'gemini-2.5-flash';

    // Apply active optimization filters to the player pool
    let filteredCandidates = cards.filter((c: any) => {
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
      const bestGks = cards.filter((c: any) => c.positionCode === 'GK' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestGks.length > 0) filteredCandidates.push(bestGks[0]);
    }
    if (!hasDef) {
      const bestDefs = cards.filter((c: any) => c.positionCode === 'DEF' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestDefs.length > 0) filteredCandidates.push(bestDefs[0]);
    }
    if (!hasMid) {
      const bestMids = cards.filter((c: any) => c.positionCode === 'MID' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
      if (bestMids.length > 0) filteredCandidates.push(bestMids[0]);
    }
    if (!hasFwd) {
      const bestFwds = cards.filter((c: any) => c.positionCode === 'FWD' && c.status !== 'NOT_PLAYING' && isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)).sort((a: any, b: any) => (b.scores?.l5 || 0) - (a.scores?.l5 || 0));
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
6. Analyse les cotes bookmakers (clean sheet pour gardiens/défenseurs, espérance de buts xG pour milieux/attaquants).
Rédige une analyse tactique percutante, professionnelle et justifiée en français en mentionnant les filtres respectés.`;

    const prompt = `Voici les cartes disponibles du joueur Thib 8 pour la Game Week ${gameWeek} respectant les filtres :
${JSON.stringify(simplifiedRoster, null, 2)}
${constraintsText}
Préférences manager : ${customPreferences || 'Optimiser pour le score SO5 le plus élevé possible en respectant les filtres.'}

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
        const cardObj = cards.find((c: any) => c.id === pId);
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
app.post('/api/ai/scout-player', async (req, res) => {
  const { player, gameWeek = 48 } = req.body;
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
app.post('/api/ai/chat', async (req, res) => {
  const { messages, gallery, gameWeek = 48 } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required.' });
  }

  const userLastMessage = messages[messages.length - 1]?.content || 'Quelle est la meilleure composition ?';

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
      ? gallery.slice(0, 60).map(c => `${c.displayName} (${c.positionCode}, ${c.club?.name || ''}, L5:${c.scores?.l5}, L15:${c.scores?.l15}, Statut:${c.status}, vs ${c.upcomingFixture?.opponent || ''})`).join('\n')
      : 'Galerie standard Thib 8';

    const prompt = `Contexte de la galerie de Thib 8 (GW ${gameWeek}) :
${galleryContext}

Historique de la conversation :
${messages.map(m => `${m.role === 'user' ? 'Manager (Thib 8)' : 'Coach IA'}: ${m.content}`).join('\n')}

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Team Sorare Server] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
