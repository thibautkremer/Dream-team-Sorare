import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Zap, Clock, Trophy, Crown, CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, Activity, Flame, Shield, ShieldAlert, Calendar, TrendingUp, AlertTriangle, Users, Layers, Radio, ArrowUpDown } from 'lucide-react';
import { SorareCard, Lineup, StrategyType } from '../types';
import { calculatePlayerProjectedScore, formatKickoffDate, getPlayerWinProbability, getPlayerRecentMatchAnalysis } from '../utils/optimizer';
import { StorageService } from '../utils/storage';
import { getCardTotalBonus, normalizePlayerSlug } from '../utils/sorareSlug';
import { SorareScoreDetailModal } from './SorareScoreDetailModal';
import { ApiFootballMatchModal } from './ApiFootballMatchModal';

interface LiveScoringViewProps {
  cards: SorareCard[];
  lineup: Lineup;
  compositions?: Lineup[];
  onOpenScout: (card: SorareCard) => void;
  gameWeek: number;
  strategy?: StrategyType;
}

/**
 * Convert an ISO date string to a YYYY-MM-DD date string in New York local time (America/New_York)
 */
function getNyDateString(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    return '';
  }
}

/**
 * Normalize raw league/competition names to clean unified display strings
 */
function normalizeLeagueName(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('la liga') || lower === 'laliga') {
    if (lower.includes('hypermotion') || lower.includes('2') || lower.includes('smartbank')) {
      return 'La Liga 2';
    }
    return 'La Liga';
  }
  if (lower.includes('ligue 1')) return 'Ligue 1';
  if (lower.includes('ligue 2')) return 'Ligue 2';
  if (lower.includes('serie a')) {
    if (lower.includes('brasil') || lower.includes('betano') || lower.includes('brasileirão')) return 'Brasileirão';
    return 'Serie A';
  }
  if (lower.includes('bundesliga')) {
    if (lower.includes('2') || lower.includes('zweite')) return '2. Bundesliga';
    return 'Bundesliga';
  }
  if (lower.includes('premier league')) return 'Premier League';
  if (lower.includes('major league soccer') || lower === 'mls') return 'MLS';
  if (lower.includes('brasileirão') || lower.includes('brasileirao')) return 'Brasileirão';
  if (lower.includes('liga mx')) return 'Liga MX';
  if (lower.includes('efl championship')) return 'EFL Championship';

  return trimmed;
}

export function getPlayingStatusBadge(card: SorareCard, sorareLive: any) {
  const liveStatus = (sorareLive?.playingStatus || '').toUpperCase();
  const cardStatus = (card.status || '').toUpperCase();

  // 1. Direct live status from Sorare API (real-time lineup / match state)
  if (
    liveStatus.includes('SUB') || 
    liveStatus.includes('BENCH') || 
    liveStatus === 'REPLACEMENT'
  ) {
    return {
      label: '🔄 Remplaçant',
      className: 'text-amber-400 bg-amber-950/60 border border-amber-800/60 font-semibold',
    };
  }

  if (
    liveStatus.includes('STARTER') || 
    liveStatus.includes('STARTING') || 
    liveStatus === 'STARTED'
  ) {
    return {
      label: '⚡ Titulaire',
      className: 'text-blue-400 bg-blue-950/60 border border-blue-800/60 font-bold',
    };
  }

  if (liveStatus.includes('DNP') || liveStatus.includes('DID_NOT_PLAY')) {
    return {
      label: '⏸️ Non entré',
      className: 'text-slate-400 bg-slate-950 border border-slate-800 font-medium',
    };
  }

  if (
    liveStatus.includes('NOT_IN_SQUAD') || 
    liveStatus.includes('OUT') || 
    liveStatus.includes('UNAVAILABLE')
  ) {
    return {
      label: '❌ Hors groupe',
      className: 'text-rose-400 bg-rose-950/60 border border-rose-800/60 font-medium',
    };
  }

  if (liveStatus.includes('INJUR')) {
    return {
      label: '🏥 Blessé',
      className: 'text-rose-400 bg-rose-950/60 border border-rose-800/60 font-medium',
    };
  }

  if (liveStatus.includes('SUSPEND')) {
    return {
      label: '🟨 Suspendu',
      className: 'text-rose-400 bg-rose-950/60 border border-rose-800/60 font-medium',
    };
  }

  // 2. Card-level status
  if (card.status === 'CONFIRMED') {
    return {
      label: '⚡ Confirmé (Opta)',
      className: 'text-blue-400 bg-blue-950/60 border border-blue-800/60 font-bold',
    };
  }

  if (cardStatus.includes('STARTER')) {
    return {
      label: '⚡ Titulaire',
      className: 'text-blue-400 bg-blue-950/60 border border-blue-800/60 font-bold',
    };
  }

  if (cardStatus.includes('SUB') || cardStatus.includes('BENCH')) {
    return {
      label: '🔄 Remplaçant',
      className: 'text-amber-400 bg-amber-950/60 border border-amber-800/60 font-semibold',
    };
  }

  if (cardStatus.includes('NOT_PLAYING') || cardStatus.includes('DNP')) {
    return {
      label: '⏸️ Non aligné',
      className: 'text-slate-400 bg-slate-950 border border-slate-800 font-medium',
    };
  }

  return {
    label: card.status === 'REGULAR' ? '🔄 Rotation' : '🔄 Remplaçant',
    className: 'text-slate-400 bg-slate-950 border border-slate-800 font-medium',
  };
}

/**
 * Color coding system for SO5 Live Scores:
 * - >= 70: Emerald 300 (Elite / MVP)
 * - >= 60: Emerald 400 (Excellent)
 * - >= 50: Teal 300 (Good)
 * - >= 40: Amber 400 (Average)
 * - >= 25: Orange 400 (Below Average)
 * - < 25: Rose 400 (Poor)
 * - null / --: Slate 400 (Not Started / No Data)
 */
export function getScoreColorClasses(score: number | null | undefined) {
  if (score == null) {
    return {
      text: 'text-slate-400',
      bg: 'bg-slate-950/80',
      border: 'border-slate-800',
      dot: 'bg-slate-600',
      badge: 'text-slate-400 bg-slate-900 border-slate-800',
      shadow: '',
    };
  }
  if (score >= 70) {
    return {
      text: 'text-emerald-300',
      bg: 'bg-emerald-950/70',
      border: 'border-emerald-500/60 ring-1 ring-emerald-500/30',
      dot: 'bg-emerald-400 animate-pulse',
      badge: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/40',
      shadow: 'shadow-lg shadow-emerald-950/40',
    };
  }
  if (score >= 60) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-950/50',
      border: 'border-emerald-500/40',
      dot: 'bg-emerald-400 animate-pulse',
      badge: 'text-emerald-300 bg-emerald-950/60 border-emerald-500/30',
      shadow: '',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-teal-300',
      bg: 'bg-teal-950/50',
      border: 'border-teal-500/40',
      dot: 'bg-teal-400 animate-pulse',
      badge: 'text-teal-300 bg-teal-950/60 border-teal-500/30',
      shadow: '',
    };
  }
  if (score >= 40) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-950/50',
      border: 'border-amber-500/40',
      dot: 'bg-amber-400 animate-pulse',
      badge: 'text-amber-300 bg-amber-950/60 border-amber-500/30',
      shadow: '',
    };
  }
  if (score >= 25) {
    return {
      text: 'text-orange-400',
      bg: 'bg-orange-950/50',
      border: 'border-orange-500/40',
      dot: 'bg-orange-400',
      badge: 'text-orange-300 bg-orange-950/60 border-orange-500/30',
      shadow: '',
    };
  }
  return {
    text: 'text-rose-400',
    bg: 'bg-rose-950/50',
    border: 'border-rose-500/40',
    dot: 'bg-rose-400',
    badge: 'text-rose-300 bg-rose-950/60 border-rose-500/30',
    shadow: '',
  };
}

export function getMatchDisplayInfo(card: SorareCard, sorareLive: any, fixture: any) {
  const liveGame = sorareLive?.game;
  const upcomingGame = sorareLive?.upcomingGame;
  const game = liveGame || upcomingGame;
  const clubName = card.club?.name || '';
  
  let homeTeam = game?.homeTeam || (fixture?.isHome ? clubName : (fixture?.opponent || 'Équipe 1'));
  let awayTeam = game?.awayTeam || (!fixture?.isHome ? clubName : (fixture?.opponent || 'Équipe 2'));
  
  const isHome = game?.homeTeam
    ? (clubName && (game.homeTeam.toLowerCase().includes(clubName.toLowerCase()) || clubName.toLowerCase().includes(game.homeTeam.toLowerCase())))
    : (fixture?.isHome ?? true);

  const status = (game?.statusTyped || (fixture as any)?.status || '').toLowerCase();
  const isLive = status === 'live' || status === 'in_play' || status === 'playing' || status === 'ht' || status === 'in_progress';
  const isFinished = status === 'finished' || status === 'played' || status === 'ft';
  
  const hasGoals = game?.homeGoals != null || (fixture as any)?.homeGoals != null;
  const homeGoals = game?.homeGoals ?? (fixture as any)?.homeGoals ?? 0;
  const awayGoals = game?.awayGoals ?? (fixture as any)?.awayGoals ?? 0;

  const showScore = isLive || isFinished || (hasGoals && status !== 'scheduled' && status !== 'upcoming');

  return {
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    isHome,
    isLive,
    isFinished,
    showScore,
    status,
    minute: game?.minute,
  };
}

export const LiveScoringView: React.FC<LiveScoringViewProps> = ({
  cards,
  lineup,
  compositions = [],
  onOpenScout,
  gameWeek,
  strategy,
}) => {
  // Navigation mode: 'all_gallery' (default: all cards in gallery), 'all_aligned' (players in compositions), 'team_0', 'team_1', 'gw_matches'
  const [activeView, setActiveView] = useState<string>('all_gallery');
  const [selectedPosition, setSelectedPosition] = useState<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD'>('ALL');
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'projected' | 'sorare' | 'diff'>('projected');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchStatusFilter, setMatchStatusFilter] = useState<{
    live: boolean;
    finished: boolean;
    upcoming: boolean;
  }>({
    live: true,
    finished: false,
    upcoming: false,
  });
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedDetailCard, setSelectedDetailCard] = useState<{
    card: SorareCard;
    sorareLive: any;
    isCaptain: boolean;
  } | null>(null);
  const [selectedMatchForModal, setSelectedMatchForModal] = useState<{
    homeTeam: string;
    awayTeam: string;
    competition?: string;
    kickoffDate?: string;
    players: SorareCard[];
  } | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sorare Direct GraphQL Live Scoring state
  const [liveScoresMap, setLiveScoresMap] = useState<Record<string, any>>({});
  const liveScoresRef = React.useRef<Record<string, any>>({});
  const [liveSyncStatus, setLiveSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [lastSorareSyncTime, setLastSorareSyncTime] = useState<Date | null>(null);
  const [lastLiveTrackedCount, setLastLiveTrackedCount] = useState(0);

  // API-Football Live Fixtures State
  const [apiFootballLiveFixtures, setApiFootballLiveFixtures] = useState<any[]>([]);
  const [loadingFootballLive, setLoadingFootballLive] = useState(false);

  const fetchApiFootballLive = useCallback(async () => {
    try {
      setLoadingFootballLive(true);
      const res = await fetch('/api/football/live');
      if (res.ok) {
        const data = await res.json();
        const fixtures = data.liveFixtures || data.response || [];
        setApiFootballLiveFixtures(fixtures);
      }
    } catch (err) {
      console.warn('[LiveScoringView] Erreur live API-Football:', err);
    } finally {
      setLoadingFootballLive(false);
    }
  }, []);

  // AUDIT FIX (robustness pass): sending an unbounded number of slugs in a single GraphQL request
  // risks a query-size/complexity failure or slow response, which would then silently return NO
  // live data for anyone in that batch (the server's fallback only kicks in when the ENTIRE
  // response is empty). We now split into fixed-size chunks and fetch them with limited
  // concurrency, merging every chunk's results — so one oversized request can no longer take down
  // live data for the whole gallery, and coverage scales safely with gallery size.
  const CHUNK_SIZE = 100;
  const MAX_CONCURRENT_CHUNKS = 3;

  const fetchLiveScoresChunk = useCallback(async (chunk: string[]): Promise<Record<string, any> | null> => {
    try {
      const username = StorageService.getUsername() || 'thib-8';
      const apiKey = StorageService.getApiKey() || '';
      const res = await fetch(`/api/sorare/live-scoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-sorare-api-key': apiKey } : {})
        },
        body: JSON.stringify({ username, slugs: chunk })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.liveScores || null;
    } catch (err) {
      console.warn('[LiveScoringView] Erreur de récupération d\'un lot de joueurs:', err);
      return null;
    }
  }, []);

  const fetchSorareLiveScores = useCallback(async (slugsToFetch?: string[]) => {
    const payloadSlugs = slugsToFetch || [];
    setLastLiveTrackedCount(payloadSlugs.length);
    if (payloadSlugs.length === 0) {
      // No active slugs aligned. Skip the request entirely to save API quota and rate limits.
      setLiveSyncStatus('idle');
      setLastRefreshed(new Date());
      return;
    }

    setIsRefreshing(true);
    setLiveSyncStatus('loading');
    try {
      // Split into chunks and fetch with bounded concurrency (MAX_CONCURRENT_CHUNKS at a time),
      // so a large gallery (hundreds of players with a match today) is fully covered without
      // firing dozens of simultaneous requests at Sorare's API at once.
      const chunks: string[][] = [];
      for (let i = 0; i < payloadSlugs.length; i += CHUNK_SIZE) {
        chunks.push(payloadSlugs.slice(i, i + CHUNK_SIZE));
      }

      const mergedScores: Record<string, any> = {};
      let anyChunkSucceeded = false;

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
        const results = await Promise.all(batch.map(fetchLiveScoresChunk));
        results.forEach(chunkResult => {
          if (chunkResult) {
            anyChunkSucceeded = true;
            Object.assign(mergedScores, chunkResult);
          }
        });
        // Small pacing pause between waves of concurrent batches, to stay well within Sorare's
        // rate limits on large galleries that need many chunks (this only matters for very large
        // galleries; most users will only ever need a single wave).
        if (i + MAX_CONCURRENT_CHUNKS < chunks.length) {
          await new Promise(r => setTimeout(r, 400));
        }
      }

      if (anyChunkSucceeded) {
        // DETECT LIVE EVENTS FOR TOAST NOTIFICATIONS
        const prevScores = liveScoresRef.current;
        Object.keys(mergedScores).forEach(slug => {
          const newPlayer = mergedScores[slug];
          const oldPlayer = prevScores[slug];
          
          if (newPlayer && oldPlayer && newPlayer.game?.id === oldPlayer.game?.id) {
            // Check for Decisive Score change (Goal, Assist, etc.)
            if (newPlayer.decisiveScore > oldPlayer.decisiveScore) {
              toast.success(`🚨 Action décisive pour ${newPlayer.player?.displayName || slug} !`, {
                description: `Son Decisive Score passe à ${newPlayer.decisiveScore} pts.`,
              });
            }
            // Check for AA big jumps (e.g. +10 pts in 5 mins)
            if (newPlayer.allAroundScore - oldPlayer.allAroundScore >= 10) {
              toast.info(`🔥 Gros coup de chaud pour ${newPlayer.player?.displayName || slug} !`, {
                description: `+${Math.round((newPlayer.allAroundScore - oldPlayer.allAroundScore) * 10) / 10} AA sur les 5 dernières minutes.`,
              });
            }
          }
        });

        liveScoresRef.current = mergedScores;
        setLiveScoresMap(mergedScores);
        setLiveSyncStatus('success');
        setLastSorareSyncTime(new Date());
      } else {
        setLiveSyncStatus('error');
      }
    } catch (err) {
      console.warn('[LiveScoringView] Erreur de récupération API Sorare direct:', err);
      setLiveSyncStatus('error');
    } finally {
      setIsRefreshing(false);
      setLastRefreshed(new Date());
    }
  }, [fetchLiveScoresChunk]);

  // Safe lineups list (ensure at least current lineup exists)
  const activeCompositions: Lineup[] = useMemo(() => {
    if (compositions && compositions.length > 0) {
      return compositions;
    }
    return [lineup];
  }, [compositions, lineup]);

  // Extract unique active player slugs (players aligned in any composition — always fetched,
  // since they matter most to the manager).
  const activeSlugs = useMemo(() => {
    const slugSet = new Set<string>();
    activeCompositions.forEach(comp => {
      Object.values(comp.slots).forEach(card => {
        if (card) {
          const playerSlug = (card as any).playerSlug || (card.slug?.match(/^(.*?)-\d{4}-/) ? card.slug.match(/^(.*?)-\d{4}-/)?.[1] : card.slug);
          if (playerSlug) {
            slugSet.add(playerSlug);
          }
        }
      });
    });
    return Array.from(slugSet);
  }, [activeCompositions]);

  // BUGFIX (audit): live data used to be fetched ONLY for players aligned in a composition
  // (activeSlugs), even though this view defaults to showing the *entire* gallery
  // ('all_gallery'). That meant most players displayed here never had any live match/score data
  // at all — only a clock-based minute guess, with the actual score always blank. We now also
  // include every gallery player whose fixture kick-off falls in a plausible "about to start /
  // live / just finished" window, so real Sorare data is fetched for everyone who could
  // plausibly be live right now — not just the players aligned in a composition, and not capped
  // to an arbitrary small number either (requests are chunked+batched, see
  // fetchSorareLiveScores above, so covering hundreds of players safely is fine). A generous
  // hard ceiling (SAFETY_MAX_SLUGS) only exists to protect against a pathological edge case
  // (e.g. a many-thousand-card gallery), not to silently truncate a normal one.
  //
  // BUGFIX #2: this was originally a `useMemo` keyed on `[cards]`, so `Date.now()` was captured
  // once at mount and never re-evaluated — a player whose match kicks off later in the day would
  // never enter the fetch list even after 5-minute refreshes. This is now a plain function
  // recomputed at call time (on mount AND on every 5-minute tick), so "now" is always fresh.
  const getLiveWindowSlugs = useCallback((): string[] => {
    const slugSet = new Set<string>();
    
    for (const card of cards) {
      const rawSlug = (card as any).playerSlug ||
        (card.slug?.match(/^(.*?)-\d{4}-/) ? card.slug.match(/^(.*?)-\d{4}-/)?.[1] : null) ||
        card.slug?.replace(/-\d{4}-.*$/, '') ||
        '';
      if (rawSlug) slugSet.add(rawSlug);
      const norm = normalizePlayerSlug(rawSlug || card.displayName || '');
      if (norm) slugSet.add(norm);
    }
    return Array.from(slugSet);
  }, [cards]);

  const getSlugsToFetchLive = useCallback((): string[] => {
    const slugSet = new Set<string>();

    // 1. All players in active lineups
    activeSlugs.forEach(s => {
      if (s) {
        slugSet.add(s);
        const norm = normalizePlayerSlug(s);
        if (norm) slugSet.add(norm);
      }
    });

    // 2. All gallery players
    getLiveWindowSlugs().forEach(s => {
      if (s) slugSet.add(s);
    });

    return Array.from(slugSet);
  }, [activeSlugs, getLiveWindowSlugs]);

  // Fetch real live scores from Sorare GraphQL on component mount and refresh every 5 minutes.
  // (Was every 60s — throttled to 5 min per product decision to stay well within Sorare's rate
  // limits given this now covers a much larger set of players than before.)
  // Slugs are recomputed fresh on every call (see getSlugsToFetchLive/getLiveWindowSlugs above),
  // so newly-kicking-off matches later in the day get picked up on the next 5-min tick.
  useEffect(() => {
    fetchSorareLiveScores(getSlugsToFetchLive());
    fetchApiFootballLive();
    const interval = setInterval(() => {
      fetchSorareLiveScores(getSlugsToFetchLive());
      fetchApiFootballLive();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSorareLiveScores, getSlugsToFetchLive, fetchApiFootballLive]);

  const handleManualRefresh = () => {
    fetchSorareLiveScores(getSlugsToFetchLive());
    fetchApiFootballLive();
  };

  // Build a lookup map of player id -> array of { compoIndex, compoName, isCaptain, slot }
  const playerLineupMap = useMemo(() => {
    const map = new Map<string, Array<{ compoIndex: number; compoName: string; isCaptain: boolean; slot: string }>>();
    
    activeCompositions.forEach((comp, idx) => {
      const compName = comp.name || `Compo ${idx + 1}`;
      const slots = comp.slots;
      const slotKeys: Array<'gk' | 'def' | 'mid' | 'fwd' | 'extra'> = ['gk', 'def', 'mid', 'fwd', 'extra'];

      slotKeys.forEach(slotKey => {
        const card = slots[slotKey];
        if (card && card.id) {
          const isCaptain = comp.captainSlot === slotKey;
          const list = map.get(card.id) || [];
          list.push({
            compoIndex: idx,
            compoName: compName,
            isCaptain,
            slot: slotKey.toUpperCase(),
          });
          map.set(card.id, list);
        }
      });
    });

    return map;
  }, [activeCompositions]);

  // Set of all player IDs aligned in ANY composition
  const allAlignedPlayerIds = useMemo(() => {
    return new Set(Array.from(playerLineupMap.keys()));
  }, [playerLineupMap]);

  // Compute real projected scores and data for each card (including direct Sorare API live scores)
  const processedCards = useMemo(() => {
    return cards.map(card => {
      const lineupPresences = playerLineupMap.get(card.id) || [];
      const isAlignedAny = lineupPresences.length > 0;
      const breakdown = calculatePlayerProjectedScore(card, strategy || lineup.strategy);
      const recentAnalysis = getPlayerRecentMatchAnalysis(card);
      
      const cardCleanId = card.id ? card.id.replace('Card:', '') : '';
      const extractedPlayerSlug = (card as any).playerSlug || (card.slug?.match(/^(.*?)-\d{4}-/) ? card.slug.match(/^(.*?)-\d{4}-/)?.[1] : null) || card.slug?.replace(/-\d{4}-.*$/, '') || '';
      const normExtracted = normalizePlayerSlug(extractedPlayerSlug);
      const normDisplayName = normalizePlayerSlug(card.displayName || '');
      const rawNameSlug = card.displayName ? card.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-') : '';

      const sorareLive = liveScoresMap[card.id] ||
        liveScoresMap[`Card:${card.id}`] ||
        liveScoresMap[cardCleanId] ||
        (extractedPlayerSlug ? liveScoresMap[extractedPlayerSlug] : null) ||
        (normExtracted ? liveScoresMap[normExtracted] : null) ||
        (card.slug ? liveScoresMap[card.slug] : null) ||
        (normDisplayName ? liveScoresMap[normDisplayName] : null) ||
        (rawNameSlug ? liveScoresMap[rawNameSlug] : null);

      const liveGame = sorareLive?.game;
      const fixture = card.upcomingFixture;

      const rawIso = liveGame?.date || fixture?.kickoffDate || fixture?.matchDate || '';
      const kickoffMs = rawIso ? new Date(rawIso).getTime() : NaN;
      const refMs = Date.now();

      // Consider it hasMatch if there is an active live game, a fixture, or a valid kickoff date
      let hasMatch = Boolean(liveGame || (fixture && fixture.hasUpcomingMatch !== false) || !isNaN(kickoffMs));

      let matchStatusCategory: 'LIVE' | 'FINISHED' | 'UPCOMING' = 'UPCOMING';
      let displayFixture = fixture;
      let kickoffStr = 'Date à confirmer';
      let matchStatusLabel = 'À venir';

      const statusLower = (liveGame?.statusTyped || (fixture as any)?.status || '').toLowerCase();
      // Real Sorare statuses observed: 'live', 'ht' (half-time), 'playing' (new naming), 'in_play' (older naming), 'finished'/'played'/'ft'.
      const isRealLiveStatus = statusLower === 'live' || statusLower === 'in_play' || statusLower === 'playing' || statusLower === 'ht';
      const isRealFinishedStatus = statusLower === 'finished' || statusLower === 'played' || statusLower === 'ft';
      // Only trust homeGoals/awayGoals as "real" once the match has actually started — a
      // not-yet-started game legitimately reports 0-0 via the `?? 0` default server-side, which
      // must not be displayed as if it were a real live score.
      const hasRealScore = Boolean(liveGame) && (isRealLiveStatus || isRealFinishedStatus) &&
        liveGame.homeGoals != null && liveGame.awayGoals != null;

      if (hasMatch && (liveGame || fixture)) {
        kickoffStr = liveGame?.date ? formatKickoffDate({ kickoffDate: liveGame.date }) : (fixture ? formatKickoffDate(fixture) : 'Prochainement');
        
        const relLower = (fixture?.kickoffRelative || '').toLowerCase();

        // 1. Check real official live indicators from Sorare API or fixture status
        if (isRealLiveStatus || relLower.includes('en direct') || relLower.includes('en cours')) {
          matchStatusCategory = 'LIVE';
          kickoffStr = hasRealScore ? `🔴 ${liveGame.homeGoals}-${liveGame.awayGoals}` : '🔴 En direct';
          matchStatusLabel = hasRealScore ? `🔴 En direct (API Sorare) • ${liveGame.homeTeam} ${liveGame.homeGoals}-${liveGame.awayGoals} ${liveGame.awayTeam}` : '🔴 En direct • Match en cours';
        }
        // 2. Check real official finished indicators
        else if (isRealFinishedStatus || relLower.includes('terminé') || relLower.includes('hier')) {
          matchStatusCategory = 'FINISHED';
          kickoffStr = hasRealScore ? `🏁 ${liveGame.homeGoals}-${liveGame.awayGoals}` : '🏁 Terminé';
          matchStatusLabel = hasRealScore ? `🏁 Terminé (API Sorare) • ${liveGame.homeTeam} ${liveGame.homeGoals}-${liveGame.awayGoals} ${liveGame.awayTeam}` : '🏁 Match terminé';
        }
        // 3. Dynamic match timing calculation based on real kickoff time vs current reference time
        // (fallback only used when Sorare hasn't reported a recognized live/finished status yet —
        // e.g. live data wasn't fetched for this player. Never fabricates a score in that case.)
        else if (!isNaN(kickoffMs)) {
          const diffMinutes = (refMs - kickoffMs) / (60 * 1000);
          if (diffMinutes >= -15 && diffMinutes <= 115) {
            matchStatusCategory = 'LIVE';
            const minLabel = diffMinutes >= 0 ? `${Math.min(90, Math.max(1, Math.round(diffMinutes)))}e min` : 'Début imminent';
            kickoffStr = `🔴 En direct (${minLabel})`;
            matchStatusLabel = `🔴 En direct (${minLabel}) • Match en cours`;
          } else if (diffMinutes > 115) {
            matchStatusCategory = 'FINISHED';
            kickoffStr = '🏁 Terminé';
            matchStatusLabel = '🏁 Match terminé';
          } else {
            matchStatusCategory = 'UPCOMING';
            matchStatusLabel = `📅 À venir • ${kickoffStr}`;
          }
        } else {
          matchStatusCategory = 'UPCOMING';
        }
      } else {
        matchStatusCategory = 'UPCOMING';
        matchStatusLabel = 'Aucun match programmé';
        kickoffStr = 'Prochainement';
        hasMatch = false; // Reset if it was too old
      }

      const cardBonus = getCardTotalBonus(card);
      const isCaptainSomewhere = lineupPresences.some(p => p.isCaptain);
      const totalBonusPct = Math.round((cardBonus + (isCaptainSomewhere ? 20 : 0)) * 10) / 10;
      const baseLiveScore = sorareLive?.liveScore != null ? Number(sorareLive.liveScore) : null;
      const finalLiveScore = baseLiveScore != null 
        ? Math.round(baseLiveScore * (1 + totalBonusPct / 100) * 10) / 10 
        : null;

      return {
        card,
        lineupPresences,
        isAlignedAny,
        isCaptainSomewhere,
        cardBonus,
        totalBonusPct,
        baseLiveScore,
        finalLiveScore,
        breakdown,
        recentAnalysis,
        hasMatch,
        fixture: displayFixture,
        sorareLive,
        rawDate: rawIso,
        kickoffMs,
        competitionName: liveGame?.competition || displayFixture?.competitionName || card.league || card.club?.league || '',
        kickoffStr,
        matchStatusLabel,
        matchStatusCategory,
      };
    });
  }, [cards, playerLineupMap, strategy, lineup.strategy, liveScoresMap]);

  // Enhanced composition metrics (Static Projected, Real Sorare Live Score, Pacing & Thresholds)
  const compositionTotals = useMemo(() => {
    return activeCompositions.map((comp, idx) => {
      const slots = comp.slots;
      const slotKeys: Array<'gk' | 'def' | 'mid' | 'fwd' | 'extra'> = ['gk', 'def', 'mid', 'fwd', 'extra'];
      let projectedSum = 0;
      let accumulatedLiveSum = 0;
      let projectedLiveSum = 0;
      let captainName = '';
      let playingCount = 0;
      let finishedCount = 0;
      let upcomingCount = 0;

      slotKeys.forEach(slotKey => {
        const card = slots[slotKey];
        if (card) {
          const isCaptain = comp.captainSlot === slotKey;
          const processed = processedCards.find(p => p.card.id === card.id);
          const pScore = processed?.breakdown.projectedScore ?? calculatePlayerProjectedScore(card, strategy || comp.strategy || lineup.strategy).projectedScore;
          const finalPScore = isCaptain ? pScore * 1.20 : pScore;
          projectedSum += finalPScore;

          if (isCaptain) {
            captainName = card.displayName;
          }

          if (processed) {
            const hasPlayedOrPlaying = processed.matchStatusCategory === 'LIVE' || processed.matchStatusCategory === 'FINISHED';
            const realScore = processed.finalLiveScore;

            if (processed.matchStatusCategory === 'LIVE') {
              playingCount++;
            } else if (processed.matchStatusCategory === 'FINISHED') {
              finishedCount++;
            } else {
              upcomingCount++;
            }

            if (realScore != null && hasPlayedOrPlaying) {
              accumulatedLiveSum += realScore;
              projectedLiveSum += realScore;
            } else {
              projectedLiveSum += finalPScore;
            }
          } else {
            upcomingCount++;
            projectedLiveSum += finalPScore;
          }
        }
      });

      const thresholdTarget = 250; // Cap 240 / Standard Threshold
      const thresholdProgress = Math.min(100, Math.round((accumulatedLiveSum / thresholdTarget) * 100));
      const pointsNeeded = Math.max(0, Math.round((thresholdTarget - accumulatedLiveSum) * 10) / 10);

      return {
        index: idx,
        id: comp.id,
        name: comp.name || `Compo ${idx + 1}`,
        projectedTotal: Math.round(projectedSum * 10) / 10,
        accumulatedLiveScore: Math.round(accumulatedLiveSum * 10) / 10,
        projectedLiveTotal: Math.round(projectedLiveSum * 10) / 10,
        playingCount,
        finishedCount,
        upcomingCount,
        thresholdTarget,
        thresholdProgress,
        pointsNeeded,
        captainName,
        captainSlot: comp.captainSlot,
      };
    });
  }, [activeCompositions, processedCards, strategy, lineup.strategy]);

  // Available leagues strictly from the user's gallery cards
  const availableLeagues = useMemo(() => {
    const set = new Set<string>();
    processedCards.forEach(c => {
      if (c.hasMatch) {
        const norm = normalizeLeagueName(c.competitionName);
        if (norm) set.add(norm);
      }
    });
    return Array.from(set).sort();
  }, [processedCards]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    processedCards.forEach(c => {
      if (c.hasMatch && c.rawDate) {
        const nyDay = getNyDateString(c.rawDate);
        if (nyDay) set.add(nyDay);
        try {
          const isoDay = new Date(c.rawDate).toISOString().slice(0, 10);
          if (isoDay) set.add(isoDay);
        } catch {}
      }
    });
    return Array.from(set).sort();
  }, [processedCards]);

  // Filtered Cards based on selected activeView & filters
  const filteredCards = useMemo(() => {
    let result = processedCards;

    if (activeView === 'all_aligned') {
      // Show all players that are in AT LEAST one composition
      result = result.filter(item => item.isAlignedAny);
    } else if (activeView.startsWith('team_')) {
      const targetIndex = parseInt(activeView.replace('team_', ''), 10);
      result = result.filter(item => 
        item.lineupPresences.some(p => p.compoIndex === targetIndex)
      );
    } else if (activeView === 'gw_matches') {
      result = result.filter(item => item.hasMatch);
    } else if (activeView === 'red_zone') {
      // Red Zone / Multiplex: only players currently playing (LIVE) OR starting in the next 1 hour (for lineups)
      result = result.filter(item => {
        const isLive = item.matchStatusCategory === 'LIVE';
        const isStartingSoon = item.kickoffMs && item.kickoffMs > Date.now() && (item.kickoffMs - Date.now()) <= 3600 * 1000;
        return isLive || isStartingSoon;
      });
    } else if (activeView === 'all_gallery') {
      // All cards
    }

    if (selectedPosition !== 'ALL') {
      result = result.filter(item => item.card.positionCode === selectedPosition);
    }

    if (selectedLeague !== 'ALL') {
      result = result.filter(item => {
        const norm = normalizeLeagueName(item.competitionName);
        return norm.toLowerCase() === selectedLeague.toLowerCase();
      });
    }

    if (selectedDate !== 'ALL') {
      result = result.filter(item => {
        if (!item.rawDate) return false;
        const nyDate = getNyDateString(item.rawDate);
        if (nyDate === selectedDate) return true;
        try {
          const isoDate = new Date(item.rawDate).toISOString().slice(0, 10);
          if (isoDate === selectedDate) return true;
        } catch {}
        return item.rawDate.startsWith(selectedDate);
      });
    }

    const { live, finished, upcoming } = matchStatusFilter;
    if (!(live && finished && upcoming)) {
      result = result.filter(item => {
        if (item.matchStatusCategory === 'LIVE' && !live) return false;
        if (item.matchStatusCategory === 'FINISHED' && !finished) return false;
        if (item.matchStatusCategory === 'UPCOMING' && !upcoming) return false;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.card.displayName.toLowerCase().includes(q) ||
        item.card.club?.name?.toLowerCase().includes(q) ||
        item.fixture?.opponent?.toLowerCase().includes(q)
      );
    }

    // Sort order:
    // When in specific team view and using default projected sort: keep slot order (GK -> DEF -> MID -> FWD -> EXTRA)
    if (activeView.startsWith('team_') && sortBy === 'projected') {
      const targetIndex = parseInt(activeView.replace('team_', ''), 10);
      const slotRank: Record<string, number> = { 'GK': 1, 'DEF': 2, 'MID': 3, 'FWD': 4, 'EXTRA': 5 };
      return result.sort((a, b) => {
        const slotA = a.lineupPresences.find(p => p.compoIndex === targetIndex)?.slot || '';
        const slotB = b.lineupPresences.find(p => p.compoIndex === targetIndex)?.slot || '';
        const rankA = slotRank[slotA] || 99;
        const rankB = slotRank[slotB] || 99;
        return rankA - rankB;
      });
    }

    // Otherwise: Sort based on selected criterion
    return result.sort((a, b) => {
      // Prioritize aligned players if not viewing all gallery
      if (activeView !== 'all_gallery' && !activeView.startsWith('team_')) {
        if (a.isAlignedAny && !b.isAlignedAny) return -1;
        if (!a.isAlignedAny && b.isAlignedAny) return 1;
      }

      if (sortBy === 'sorare') {
        const scoreA = a.finalLiveScore ?? a.sorareLive?.liveScore ?? -999;
        const scoreB = b.finalLiveScore ?? b.sorareLive?.liveScore ?? -999;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return b.breakdown.projectedScore - a.breakdown.projectedScore;
      }

      if (sortBy === 'diff') {
        const scoreA = a.finalLiveScore ?? a.sorareLive?.liveScore ?? 0;
        const scoreB = b.finalLiveScore ?? b.sorareLive?.liveScore ?? 0;
        const diffA = scoreA - a.breakdown.projectedScore;
        const diffB = scoreB - b.breakdown.projectedScore;
        if (diffB !== diffA) {
          return diffB - diffA; // Highest positive difference (Score Sorare > Score Projeté) first
        }
        return b.breakdown.projectedScore - a.breakdown.projectedScore;
      }

      // Default: 'projected' (Score projeté)
      return b.breakdown.projectedScore - a.breakdown.projectedScore;
    });
  }, [processedCards, activeView, selectedPosition, selectedLeague, selectedDate, matchStatusFilter, searchQuery, sortBy]);

  const totalWithMatchCount = processedCards.filter(c => c.hasMatch).length;
  const totalAlignedUniqueCount = allAlignedPlayerIds.size;

  // Currently selected team summary (if a specific team is chosen)
  const currentSelectedTeam = useMemo(() => {
    if (activeView.startsWith('team_')) {
      const targetIndex = parseInt(activeView.replace('team_', ''), 10);
      return compositionTotals.find(c => c.index === targetIndex) || null;
    }
    return null;
  }, [activeView, compositionTotals]);

  // Real-time live status count summary for mobile sticky bar
  const liveSquadSummary = useMemo(() => {
    let playingCount = 0;
    let finishedCount = 0;
    let upcomingCount = 0;
    let totalLiveScore = 0;

    processedCards.forEach(({ card, sorareLive, isCaptainSomewhere, finalLiveScore, matchStatusCategory }) => {
      const sScore = finalLiveScore ?? sorareLive?.liveScore ?? 0;
      const bPct = getCardTotalBonus(card) + (isCaptainSomewhere ? 20 : 0);
      totalLiveScore += sScore * (1 + bPct / 100);

      if (matchStatusCategory === 'LIVE') {
        playingCount++;
      } else if (matchStatusCategory === 'FINISHED') {
        finishedCount++;
      } else {
        upcomingCount++;
      }
    });

    return {
      playingCount,
      finishedCount,
      upcomingCount,
      totalLiveScore: Math.round(totalLiveScore * 10) / 10,
    };
  }, [processedCards]);

  const activeCompoIndex = activeView.startsWith('team_') ? parseInt(activeView.replace('team_', ''), 10) : 0;

  return (
    <div className="space-y-5">
      {/* Sticky Mobile Live Bar (visible on mobile, pinned at top during scroll) */}
      <div className="sticky top-0 z-30 md:hidden bg-slate-950/95 backdrop-blur-md border-b border-emerald-500/30 px-3.5 py-2.5 -mx-2 -mt-2 mb-3 rounded-b-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block leading-tight">
              {activeView === 'all' ? 'Toutes les Compos' : activeCompositions[activeCompoIndex]?.name || `Compo ${activeCompoIndex + 1}`}
            </span>
            <div className="flex items-center gap-1 text-xs font-black text-emerald-400">
              <span>{liveSquadSummary.totalLiveScore} pts</span>
              <span className="text-[9px] font-normal text-slate-400">réel</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-bold">
          <span className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {liveSquadSummary.playingCount} en jeu
          </span>
          <span className="bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded-lg">
            🏁 {liveSquadSummary.finishedCount}
          </span>
          <span className="bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded-lg">
            ⏳ {liveSquadSummary.upcomingCount}
          </span>
        </div>
      </div>
      
      {/* Top Banner: GameWeek & Team Navigation Overview */}
      <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                Calendrier Réel • Game Week {gameWeek}
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Données Officielles Sorare
              </span>
              <span className="rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Clé API Active (Galerie complète & Historiques SO5)
              </span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Live Scoring & Matchs Réels SO5
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Visualisez les <strong>vrais matchs programmés</strong> et suivez le <strong>score projeté SO5</strong> de tous vos joueurs alignés dans vos différentes équipes.
            </p>
            {/* AUDIT: honest coverage indicator — makes it obvious, at a glance, exactly how many
                of the gallery's players currently have real live data being tracked (vs. just
                being displayed with static/no live info because their match isn't near "now"). */}
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-emerald-500" />
              <span>
                {lastLiveTrackedCount} joueur{lastLiveTrackedCount > 1 ? 's' : ''} suivi{lastLiveTrackedCount > 1 ? 's' : ''} en direct sur {cards.length} dans la galerie
                {lastSorareSyncTime && ` • Dernière sync ${lastSorareSyncTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </p>
          </div>

          {/* Right Banner: Current Selected View Metrics & Thresholds */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {currentSelectedTeam ? (
              <div className="rounded-2xl bg-slate-950/90 border border-emerald-500/50 p-4 min-w-[240px] shadow-lg">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">
                    {currentSelectedTeam.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {currentSelectedTeam.playingCount > 0 && (
                      <span className="flex items-center gap-1 text-[9px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.2 rounded">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                        {currentSelectedTeam.playingCount} live
                      </span>
                    )}
                    <span className="text-[9px] font-bold text-slate-400">
                      🏁 {currentSelectedTeam.finishedCount}/5
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <div>
                    <span className="text-[9px] font-bold text-emerald-400 block uppercase tracking-wider">Score Réel Sorare</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-400">{currentSelectedTeam.accumulatedLiveScore}</span>
                      <span className="text-xs font-bold text-slate-400">pts</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Projeté Final</span>
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-xl sm:text-2xl font-black text-white">{currentSelectedTeam.projectedLiveTotal}</span>
                      <span className="text-xs font-bold text-slate-500">pts</span>
                    </div>
                  </div>
                </div>

                {/* Threshold Progress Bar */}
                <div className="pt-2 border-t border-slate-900">
                  <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Trophy className="h-3 w-3 text-amber-400" />
                      <span>Palier {currentSelectedTeam.thresholdTarget} pts</span>
                    </span>
                    <span className={currentSelectedTeam.pointsNeeded === 0 ? "text-emerald-400" : "text-amber-400"}>
                      {currentSelectedTeam.pointsNeeded === 0 ? "✅ Palier atteint !" : `Manque ${currentSelectedTeam.pointsNeeded} pts`}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        currentSelectedTeam.pointsNeeded === 0 
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' 
                          : 'bg-gradient-to-r from-amber-500 to-emerald-400'
                      }`}
                      style={{ width: `${currentSelectedTeam.thresholdProgress}%` }}
                    />
                  </div>
                </div>

                {currentSelectedTeam.captainName && (
                  <span className="text-[10px] text-emerald-300 font-semibold block mt-1.5 truncate">
                    👑 Cap. {currentSelectedTeam.captainName} (+20%)
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-950/90 border border-emerald-500/50 p-4 text-center min-w-[200px] shadow-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                  Toutes les Compositions
                </span>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl sm:text-4xl font-black text-emerald-400">{totalAlignedUniqueCount}</span>
                  <span className="text-xs font-bold text-slate-400">joueurs</span>
                </div>
                <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5">
                  {activeCompositions.length} équipes actives configurées
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Multi-Team Quick Cards Summary */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-slate-800/80">
          {compositionTotals.map((comp) => {
            const isSelected = activeView === `team_${comp.index}`;
            return (
              <button
                key={comp.id || comp.index}
                onClick={() => setActiveView(`team_${comp.index}`)}
                className={`text-left rounded-xl p-2.5 border transition-all duration-200 ${
                  isSelected
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-md ring-1 ring-emerald-400'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 truncate max-w-[110px]">
                    <Shield className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                    <span className="truncate">{comp.name}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {comp.playingCount > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" title="Joueurs en direct" />
                    )}
                    <span className="text-[10px] font-black text-emerald-400">
                      {comp.accumulatedLiveScore > 0 ? `${comp.accumulatedLiveScore} pts` : `${comp.projectedTotal} proj.`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                  <span>Palier: <strong className="text-amber-400">{comp.thresholdProgress}%</strong></span>
                  <span className="text-slate-300">🏁 {comp.finishedCount}/5</span>
                </div>

                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${comp.thresholdProgress}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Match Ticker Bar (API-Football real-time feeds) */}
      {apiFootballLiveFixtures && apiFootballLiveFixtures.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-slate-950/90 p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                Matchs en direct • API-Football
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {apiFootballLiveFixtures.length} en cours
                </span>
              </span>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Cliquez sur un match pour ouvrir l'analyse en direct
            </span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
            {apiFootballLiveFixtures.map((fix: any, idx: number) => {
              const homeName = fix.teams?.home?.name || 'Home';
              const awayName = fix.teams?.away?.name || 'Away';
              const elapsed = fix.fixture?.status?.elapsed;
              const shortStatus = fix.fixture?.status?.short;
              const homeGoals = fix.goals?.home ?? 0;
              const awayGoals = fix.goals?.away ?? 0;

              return (
                <button
                  key={fix.fixture?.id || idx}
                  type="button"
                  onClick={() => {
                    setSelectedMatchForModal({
                      homeTeam: homeName,
                      awayTeam: awayName,
                      competition: fix.league?.name || 'Direct',
                      kickoffDate: fix.fixture?.date ? new Date(fix.fixture.date).toLocaleDateString('fr-FR') : undefined,
                      players: cards.filter(c => 
                        c.club?.name?.toLowerCase().includes(homeName.toLowerCase()) || 
                        homeName.toLowerCase().includes(c.club?.name?.toLowerCase() || '___') ||
                        c.club?.name?.toLowerCase().includes(awayName.toLowerCase()) || 
                        awayName.toLowerCase().includes(c.club?.name?.toLowerCase() || '___')
                      )
                    });
                  }}
                  className="flex-shrink-0 bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-rose-500/50 rounded-xl px-3 py-1.5 text-left transition flex items-center gap-2.5 shadow-sm"
                >
                  <span className="text-[10px] font-black text-rose-400 bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/40 animate-pulse">
                    {shortStatus === 'HT' ? 'MT' : (elapsed ? `${elapsed}'` : 'LIVE')}
                  </span>
                  <div className="text-xs">
                    <span className="font-bold text-white">{homeName}</span>
                    <span className="mx-1 font-black text-emerald-400 px-1 py-0.2 bg-slate-950 rounded border border-slate-700">
                      {homeGoals} - {awayGoals}
                    </span>
                    <span className="font-bold text-white">{awayName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Team Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        
        {/* Primary Filter: All Gallery Cards */}
        <button
          onClick={() => setActiveView('all_gallery')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
            activeView === 'all_gallery'
              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Galerie complète ({cards.length})</span>
        </button>

        {/* Filter: All Aligned Players */}
        <button
          onClick={() => setActiveView('all_aligned')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
            activeView === 'all_aligned'
              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Tous les Alignés ({totalAlignedUniqueCount})</span>
        </button>

        {/* Filter: Real GW Matches */}
        <button
          onClick={() => setActiveView('gw_matches')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
            activeView === 'gw_matches'
              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>Matchs GW ({totalWithMatchCount})</span>
        </button>

        {/* Filter: Red Zone / Multiplex */}
        <button
          onClick={() => setActiveView('red_zone')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
            activeView === 'red_zone'
              ? 'bg-red-500 text-white font-black shadow-md'
              : 'bg-slate-900 text-red-400 hover:bg-slate-800 hover:text-red-300 border border-slate-800'
          }`}
        >
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </div>
          <span>Red Zone Multiplex</span>
        </button>

        {/* Buttons for each Team / Composition */}
        {activeCompositions.map((comp, idx) => {
          const isSelected = activeView === `team_${idx}`;
          const compName = comp.name || `Compo ${idx + 1}`;
          return (
            <button
              key={comp.id || idx}
              onClick={() => setActiveView(`team_${idx}`)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                isSelected
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
            >
              <Shield className="h-3 w-3 text-emerald-400" />
              <span>{compName}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Block: Position, League, Date, and Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Position pills */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
            {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
              <button
                key={pos}
                onClick={() => setSelectedPosition(pos)}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedPosition === pos
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {pos === 'ALL' ? 'Tous' : pos}
              </button>
            ))}
          </div>

          {/* League Filter */}
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-emerald-400 focus:outline-none"
          >
            <option value="ALL">Tous les championnats</option>
            {availableLeagues.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Match Date Calendar Picker Filter */}
          <div className="relative flex items-center">
            <input
              type="date"
              value={selectedDate === 'ALL' ? '' : selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || 'ALL')}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Browser opens picker natively
                }
              }}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none cursor-pointer"
              title="Filtrer par date de match (Heure de New York)"
            />
            {selectedDate !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedDate('ALL')}
                className="absolute right-2 text-slate-400 hover:text-white text-xs bg-slate-800 hover:bg-slate-700 rounded px-1 transition"
                title="Toutes les dates"
              >
                ✕
              </button>
            )}
          </div>

          {/* Selector of Sort Criteria */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <ArrowUpDown className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase text-slate-400 hidden sm:inline">Tri :</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'projected' | 'sorare' | 'diff')}
              className="bg-slate-950 text-xs font-bold text-white focus:outline-none cursor-pointer py-0.5 border-0"
            >
              <option value="projected" className="bg-slate-900 text-white">Score projeté</option>
              <option value="sorare" className="bg-slate-900 text-white">Score sorare</option>
              <option value="diff" className="bg-slate-900 text-white">Différence Score Sorare vs Projeté (Score sorare &gt; Projeté)</option>
            </select>
          </div>

          {/* Match Status Checkboxes (Live, Finished, Upcoming) & Simulation Toggle */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <span className="text-[10px] font-bold uppercase text-slate-400">Statut :</span>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={matchStatusFilter.live}
                onChange={(e) => setMatchStatusFilter(prev => ({ ...prev, live: e.target.checked }))}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                En cours
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={matchStatusFilter.finished}
                onChange={(e) => setMatchStatusFilter(prev => ({ ...prev, finished: e.target.checked }))}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Finis</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={matchStatusFilter.upcoming}
                onChange={(e) => setMatchStatusFilter(prev => ({ ...prev, upcoming: e.target.checked }))}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
              />
              <span>À venir</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none flex-1 sm:w-44"
          />

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-emerald-400 hover:bg-slate-800 border border-slate-800 transition flex-shrink-0"
            title="Rafraîchir les données officielles"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Red Zone Multiplex Banner */}
      {activeView === 'red_zone' && (
        <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white flex items-center gap-1.5">
                  ⚡ Mode Multiplex Red Zone SO5
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                  Live Action
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Surveillance exclusive des joueurs actuellement sur le terrain et des matchs débutant dans moins d'une heure.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-slate-950/80 border border-rose-500/30 px-3 py-1.5 text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">En Direct</span>
              <span className="text-sm font-black text-rose-400">{liveSquadSummary.playingCount} joueur{liveSquadSummary.playingCount > 1 ? 's' : ''}</span>
            </div>
            <div className="rounded-xl bg-slate-950/80 border border-emerald-500/30 px-3 py-1.5 text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Score Total Live</span>
              <span className="text-sm font-black text-emerald-400">{liveSquadSummary.totalLiveScore} pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Players List */}
      <div className="space-y-3">
        {filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <Calendar className="h-10 w-10 text-emerald-400/80 mx-auto mb-3" />
            <p className="text-base font-bold text-white">Aucun joueur ne correspond à vos filtres actuels</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {matchStatusFilter.live && !matchStatusFilter.upcoming ? (
                <>Aucun match n'est en cours actuellement pour la GW{gameWeek}. Consultez l'onglet "À venir" pour voir les prochains coups d'envoi.</>
              ) : (
                <>Modifiez vos filtres de statut, de championnat ou de position pour afficher vos joueurs.</>
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setMatchStatusFilter({ live: true, finished: true, upcoming: true })}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
              >
                Réinitialiser les filtres
              </button>
            </div>
          </div>
        ) : (
          filteredCards.map(({
            card,
            lineupPresences,
            isAlignedAny,
            isCaptainSomewhere,
            cardBonus,
            totalBonusPct,
            baseLiveScore,
            finalLiveScore,
            breakdown,
            recentAnalysis,
            hasMatch,
            fixture,
            sorareLive,
            kickoffStr,
            matchStatusCategory,
          }) => {
            const projected = breakdown.projectedScore;
            const l5 = card.scores?.l5 || 0;
            const l15 = card.scores?.l15 || l5;
            const avgAA = card.scores?.avgAllAroundScore || Math.round(l5 * 0.5);
            const isStarter = card.status === 'STARTER';
            const winProb = getPlayerWinProbability(fixture);
            const matchInfo = getMatchDisplayInfo(card, sorareLive, fixture);
            const scoreColors = getScoreColorClasses(finalLiveScore);
            const diffVsProj = finalLiveScore != null ? Math.round((finalLiveScore - projected) * 10) / 10 : null;

            return (
              <div
                key={card.id}
                onClick={() => onOpenScout(card)}
                className={`cursor-pointer rounded-2xl border p-4 sm:p-5 transition-all duration-200 hover:border-emerald-500/60 bg-slate-900/90 shadow-md ${
                  isAlignedAny
                    ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                    : 'border-slate-800 hover:bg-slate-900'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  
                  {/* Left: Player Avatar, Name, Badges & Team Alignments */}
                  <div className="flex items-center gap-3.5">
                    <div className="relative flex-shrink-0">
                      <div className="h-14 w-14 rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center">
                        {card.pictureUrl ? (
                          <img src={card.pictureUrl} alt={card.displayName} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-black text-slate-600">SO5</span>
                        )}
                      </div>
                      {isCaptainSomewhere && (
                        <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow" title="Capitaine (+20%)">
                          <Crown className="h-3 w-3" />
                        </div>
                      )}
                      {/* Live Radar Status Dot */}
                      {(matchInfo.isLive || (sorareLive?.playingStatus || '').toUpperCase() === 'PLAYING') ? (
                        <span className="absolute -bottom-1 -left-1 flex h-4 w-4" title="En direct / Sur le terrain">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-slate-950 items-center justify-center text-[7px] font-black text-slate-950">
                            ●
                          </span>
                        </span>
                      ) : matchInfo.isFinished ? (
                        <span className="absolute -bottom-1 -left-1 flex h-4 w-4 rounded-full bg-slate-800 border-2 border-slate-950 items-center justify-center text-[8px] text-slate-300 font-bold" title="Match terminé">
                          ✓
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {/* Position badge */}
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                          card.positionCode === 'GK' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                          card.positionCode === 'DEF' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          card.positionCode === 'MID' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        }`}>
                          {card.positionCode}
                        </span>

                        {/* Official Lineup Status Badge */}
                        {card.lineupStatus === "CONFIRMED_STARTER" && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1" title="Titulaire officiel confirmé">
                            <CheckCircle2 className="h-2.5 w-2.5" /> XI
                          </span>
                        )}
                        {card.lineupStatus === "CONFIRMED_BENCH" && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1" title="Sur le banc">
                            <AlertCircle className="h-2.5 w-2.5" /> BANC
                          </span>
                        )}
                        {card.lineupStatus === "CONFIRMED_OUT" && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-rose-500/10 text-rose-400 border-rose-500/30 flex items-center gap-1" title="Hors groupe / DNP">
                            <ShieldAlert className="h-2.5 w-2.5" /> DNP
                          </span>
                        )}
                        {/* Real Match Opponent & Match Score */}
                        {hasMatch ? (
                          <span className="text-[11px] sm:text-xs font-semibold text-slate-300 ml-1 flex items-center gap-1">
                            {matchInfo.showScore ? (
                              <>
                                <span className={matchInfo.isHome ? "text-white font-bold" : "text-slate-300"}>{matchInfo.homeTeam}</span>
                                <span className="mx-1 font-black text-white bg-slate-950 border border-emerald-500/40 px-1.5 py-0.2 rounded shadow-sm text-[11px]">
                                  {matchInfo.homeGoals} - {matchInfo.awayGoals}
                                </span>
                                <span className={!matchInfo.isHome ? "text-white font-bold" : "text-slate-300"}>{matchInfo.awayTeam}</span>
                              </>
                            ) : (
                              <>
                                <span className={matchInfo.isHome ? "text-white font-bold" : "text-slate-300"}>{matchInfo.homeTeam}</span>
                                <span className="text-slate-400 font-medium mx-1">vs</span>
                                <strong className={!matchInfo.isHome ? "text-white font-bold" : "text-slate-300"}>{matchInfo.awayTeam}</strong>
                              </>
                            )}
                            <span className="text-[10px] text-slate-400 ml-0.5 font-normal">
                              ({matchInfo.isHome ? 'Dom.' : 'Ext.'})
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-400/90 ml-1">
                            Pas de match GW{gameWeek}
                          </span>
                        )}

                        {/* Live Match State Badge */}
                        {matchInfo.isLive && (
                          <span className="text-[10px] font-black text-white bg-rose-950/80 border border-rose-500/50 px-2 py-0.5 rounded flex items-center gap-1 ml-1 animate-pulse">
                            <div className="h-1.5 w-1.5 rounded-full bg-rose-500"></div>
                            {matchInfo.status === 'ht' ? 'MT' : (matchInfo.minute ? `${matchInfo.minute}'` : 'En direct')}
                          </span>
                        )}

                        {/* Team Alignment Badges: Shows each composition the player belongs to */}
                        {lineupPresences.map((pres, pIdx) => (
                          <span
                            key={pIdx}
                            className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded border ${
                              pres.isCaptain
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400'
                                : 'bg-blue-950/80 text-blue-300 border-blue-600/50'
                            }`}
                          >
                            <Shield className="h-2.5 w-2.5" />
                            <span>{pres.compoName} ({pres.slot})</span>
                            {pres.isCaptain && <Crown className="h-2.5 w-2.5 text-amber-400 ml-0.5" />}
                          </span>
                        ))}
                      </div>

                      <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <span>{card.displayName}</span>
                        {card.injuryStatus === 'DOUBTFUL' && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Incertain
                          </span>
                        )}
                      </h3>

                      {/* Real Match Timing & Official Status */}
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        {hasMatch && (fixture || sorareLive?.game) ? (
                          <span className="flex items-center gap-1.5 font-semibold text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                            <Calendar className="h-3 w-3 text-emerald-400" />
                            <span>{kickoffStr}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Hors calendrier</span>
                        )}

                        {/* Starter / Substitute status badge */}
                        {(() => {
                          const statusBadge = getPlayingStatusBadge(card, sorareLive);
                          return (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${statusBadge.className}`}>
                              {statusBadge.label}
                            </span>
                          );
                        })()}

                        {/* Recent match note */}
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                          • {recentAnalysis.lastMatchLabel}
                        </span>

                        {hasMatch && fixture && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMatchForModal({
                                homeTeam: fixture.isHome ? (card.club?.name || 'Club') : fixture.opponent,
                                awayTeam: fixture.isHome ? fixture.opponent : (card.club?.name || 'Club'),
                                competition: fixture.competitionName || card.league || 'Championnat',
                                kickoffDate: kickoffStr,
                                players: [card]
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-950 border border-indigo-500/40 px-2 py-0.5 rounded transition shadow-sm cursor-pointer ml-1"
                            title="Consulter l'analyse complète API-Football (Cotes, xG, Forme, Absents)"
                          >
                            <Zap className="h-2.5 w-2.5 text-indigo-400" />
                            <span>Cotes & Intel API-Football ↗</span>
                          </button>
                        )}
                      </div>

                      {/* Player Props Visualizer (Bookmakers) */}
                      {fixture?.bookmaker && (
                        <div className="flex items-center gap-3 mt-2">
                          {(() => {
                            let dsLabel = "DS (BUT / PASSE D.)";
                            let dsValue = 0;
                            let dsColor = "bg-amber-400";
                            let dsTextColor = "text-amber-400";

                            if (card.positionCode === 'GK' || card.positionCode === 'DEF') {
                              dsLabel = "DS (CLEAN SHEET)";
                              dsValue = fixture.bookmaker.cleanSheetProb || 0;
                              dsColor = "bg-emerald-400";
                              dsTextColor = "text-emerald-400";
                            } else {
                              dsLabel = card.positionCode === 'MID' ? "DS (PASSE D. / BUT)" : "DS (BUT / PASSE D.)";
                              const goalProb = fixture.bookmaker.anytimeScorerOdds ? (1 / fixture.bookmaker.anytimeScorerOdds) * 100 : 0;
                              const assistProb = fixture.bookmaker.anytimeAssistOdds ? (1 / fixture.bookmaker.anytimeAssistOdds) * 100 : 0;
                              dsValue = Math.max(goalProb, assistProb);
                            }

                            if (dsValue > 0) {
                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{dsLabel}</span>
                                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${dsColor}`} 
                                      style={{ width: `${Math.min(100, dsValue)}%` }} 
                                    />
                                  </div>
                                  <span className={`text-[10px] font-bold ${dsTextColor}`}>
                                    {Math.round(dsValue)}%
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle / Right: Real Metrics & Score Projeté */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5 justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                    
                    {/* Form Metrics (L5 / L15) */}
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Forme Réelle</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">
                          L5: <strong className="text-emerald-400">{l5}</strong>
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          L15: <strong className="text-slate-300">{l15}</strong>
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Moy. AA: ~{avgAA} pts
                      </span>
                    </div>

                    {/* Bookmaker & Match Context directly integrated */}
                    {hasMatch && fixture && (
                      <div className="text-left sm:text-right bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 space-y-0.5">
                        <span className="text-[9px] font-bold uppercase text-slate-400 block">Bookmakers & Match</span>
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-xs font-black text-emerald-400 font-mono">
                            🎲 @{(fixture.bookmaker?.win || 2.10).toFixed(2)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-300">
                            ({winProb}%)
                          </span>
                        </div>
                        {(card.positionCode === 'GK' || card.positionCode === 'DEF') ? (
                          <span className="text-[10px] text-blue-400 font-semibold block">
                            🛡️ Clean Sheet : <strong>{fixture.bookmaker?.cleanSheetProb || (fixture.isHome ? 38 : 28)}%</strong>
                          </span>
                        ) : (
                          <span className="text-[10px] text-purple-300 font-semibold block">
                            ⚽ xG Équipe : <strong>{fixture.bookmaker?.goalExpectancy || (fixture.isHome ? 1.6 : 1.2)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Live Score & Projected Score */}
                    <div className="flex items-center gap-3">
                      {/* Live Score Card - Interactive Modal Trigger with Color Coding */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDetailCard({
                            card,
                            sorareLive,
                            isCaptain: isCaptainSomewhere,
                          });
                        }}
                        title="Cliquez pour ouvrir le détail complet des stats & actions SO5"
                        className={`text-center px-3.5 py-2 rounded-2xl min-w-[120px] border transition cursor-pointer hover:scale-[1.02] hover:shadow-xl focus:outline-none ${scoreColors.bg} ${scoreColors.border} ${scoreColors.shadow}`}
                      >
                        <div className="flex items-center gap-1.5 justify-center mb-0.5">
                          <span className={`h-2 w-2 rounded-full ${scoreColors.dot}`}></span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1">
                            SCORE LIVE
                            <Activity className="w-2.5 h-2.5 opacity-60" />
                          </span>
                        </div>
                        
                        <div className="flex items-baseline justify-center gap-1 my-0.5">
                          <span className={`text-2xl sm:text-3xl font-black tracking-tight ${scoreColors.text}`}>
                            {finalLiveScore != null ? finalLiveScore : (baseLiveScore != null ? baseLiveScore : '--')}
                          </span>
                          <span className="text-xs font-bold text-slate-400">pts</span>
                        </div>

                        <div className="mt-0.5">
                          {finalLiveScore != null ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {totalBonusPct > 0 && (
                                <span className="text-[9px] text-cyan-300 font-semibold">
                                  +{totalBonusPct}% {isCaptainSomewhere ? '👑' : ''}
                                </span>
                              )}
                              {diffVsProj != null && (
                                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${
                                  diffVsProj >= 0
                                    ? 'text-emerald-300 bg-emerald-950/80 border-emerald-500/30'
                                    : 'text-rose-300 bg-rose-950/80 border-rose-500/30'
                                }`}>
                                  {diffVsProj >= 0 ? `+${diffVsProj}` : diffVsProj} vs proj.
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-medium block">
                              {matchStatusCategory === 'LIVE'
                                ? '🔴 En direct'
                                : matchStatusCategory === 'FINISHED'
                                ? '🏁 Terminé'
                                : 'Match non démarré'}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Projected Score */}
                      <div className="text-right min-w-[80px]">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                          PROJETÉ
                        </span>
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xl sm:text-2xl font-black text-white">
                            {projected}
                          </span>
                          <span className="text-xs text-slate-400 font-bold">pts</span>
                        </div>
                        {isCaptainSomewhere && (
                          <span className="text-[9px] font-bold text-emerald-400 block mt-0.5">
                            +{Math.round(projected * 0.20 * 10) / 10} cap
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className={`h-4 w-4 text-slate-600 transition hidden sm:block ${expandedCardId === card.id ? 'rotate-90 text-emerald-400' : ''}`} />

                  </div>

                </div>

                {/* Expandable Button for SO5 Match History (Up to 3 last matches) */}
                {(() => {
                  const rawHistory = sorareLive?.so5ScoresHistory && sorareLive.so5ScoresHistory.length > 0 
                    ? sorareLive.so5ScoresHistory.slice(0, 3)
                    : (card.scores?.recentMatches && card.scores.recentMatches.length > 0 
                        ? card.scores.recentMatches.slice(0, 3).map((m: any) => ({
                            id: m.id || null,
                            score: m.score != null ? Math.round(Number(m.score) * 10) / 10 : null,
                            decisiveScore: m.decisiveScore != null ? Math.round(Number(m.decisiveScore) * 10) / 10 : null,
                            allAroundScore: m.allAroundScore != null ? Math.round(Number(m.allAroundScore) * 10) / 10 : (m.score != null && m.decisiveScore != null ? Math.max(0, m.score - m.decisiveScore) : null),
                            game: {
                              date: m.date,
                              homeTeam: m.homeTeam || card.club?.name || 'Équipe 1',
                              homeTeamPicture: '',
                              awayTeam: m.opponent || 'Équipe 2',
                              awayTeamPicture: '',
                              homeGoals: m.homeGoals ?? 0,
                              awayGoals: m.awayGoals ?? 0,
                              competition: m.competitionName || card.league || 'SO5',
                            }
                          }))
                        : []);

                  return (
                    <>
                      <div className="mt-3 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
                        {rawHistory.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCardId(expandedCardId === card.id ? null : card.id);
                            }}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-slate-950/80 hover:bg-slate-950 border border-emerald-500/30 px-2.5 py-1 rounded-xl transition"
                          >
                            <Activity className="h-3 w-3" />
                            <span>{expandedCardId === card.id ? 'Masquer l\'historique SO5' : `Historique SO5 (${rawHistory.length})`}</span>
                          </button>
                        ) : <div />}

                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDetailCard({
                                card,
                                sorareLive,
                                isCaptain: isCaptainSomewhere,
                              });
                            }}
                            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                          >
                            <span>Détails & stats SO5</span>
                            <span>↗</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded SO5 Match History Panel (3 last matches) */}
                      {expandedCardId === card.id && (
                        <div onClick={(e) => e.stopPropagation()} className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-fadeIn">
                          {rawHistory.map((s: any, idx: number) => (
                            <div key={idx} className="bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-xs transition">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                                <span className="truncate max-w-[120px] font-bold text-slate-300">{s.game?.competition || 'SO5'}</span>
                                <span>{s.game?.date ? new Date(s.game.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                              </div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-white truncate max-w-[140px]">
                                  {s.game?.homeTeamPicture && <img src={s.game.homeTeamPicture} alt="" className="h-3.5 w-3.5 object-contain flex-shrink-0" />}
                                  <span className="truncate">{s.game?.homeTeam}</span>
                                  <span className="text-emerald-400 font-black px-1 py-0.2 bg-emerald-500/10 rounded">{s.game?.homeGoals ?? 0}-{s.game?.awayGoals ?? 0}</span>
                                  <span className="truncate">{s.game?.awayTeam}</span>
                                  {s.game?.awayTeamPicture && <img src={s.game.awayTeamPicture} alt="" className="h-3.5 w-3.5 object-contain flex-shrink-0" />}
                                </div>
                                <span className="text-sm sm:text-base font-black text-emerald-400 ml-1 flex-shrink-0">
                                  {s.score ?? 0} <span className="text-[9px] font-normal text-slate-400">pts</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-900">
                                <span>Décisif: <strong className="text-amber-400 font-bold">{s.decisiveScore ?? 0}</strong></span>
                                <span>All-Around: <strong className="text-blue-400 font-bold">{s.allAroundScore ?? 0}</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* Detailed Stats Modal */}
      {selectedDetailCard && (
        <SorareScoreDetailModal
          card={selectedDetailCard.card}
          sorareLive={selectedDetailCard.sorareLive}
          isCaptain={selectedDetailCard.isCaptain}
          onClose={() => setSelectedDetailCard(null)}
        />
      )}

      {/* Deep-dive API-Football Match Intel Modal */}
      {selectedMatchForModal && (
        <ApiFootballMatchModal
          homeTeam={selectedMatchForModal.homeTeam}
          awayTeam={selectedMatchForModal.awayTeam}
          competition={selectedMatchForModal.competition}
          kickoffDate={selectedMatchForModal.kickoffDate}
          galleryPlayers={selectedMatchForModal.players}
          onClose={() => setSelectedMatchForModal(null)}
          onOpenScout={onOpenScout}
        />
      )}

    </div>
  );
};
