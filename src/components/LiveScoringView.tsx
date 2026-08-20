import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { RefreshCw, Zap, Clock, Trophy, Crown, CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, Activity, Flame, Shield, Calendar, TrendingUp, AlertTriangle, Users, Layers, Radio, ArrowUpDown } from 'lucide-react';
import { SorareCard, Lineup, StrategyType } from '../types';
import { calculatePlayerProjectedScore, formatKickoffDate, getPlayerWinProbability, getPlayerRecentMatchAnalysis } from '../utils/optimizer';
import { StorageService } from '../utils/storage';

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
    finished: true,
    upcoming: true,
  });
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sorare Direct GraphQL Live Scoring state
  const [liveScoresMap, setLiveScoresMap] = useState<Record<string, any>>({});
  const [liveSyncStatus, setLiveSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [lastSorareSyncTime, setLastSorareSyncTime] = useState<Date | null>(null);

  const fetchSorareLiveScores = useCallback(async (slugsToFetch?: string[]) => {
    setIsRefreshing(true);
    setLiveSyncStatus('loading');
    try {
      const username = StorageService.getUsername() || 'thib-8';
      const apiKey = StorageService.getApiKey() || '';
      
      const payloadSlugs = slugsToFetch || [];
      
      let res;
      if (payloadSlugs.length > 0) {
        res = await fetch(`/api/sorare/live-scoring`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-sorare-api-key': apiKey } : {})
          },
          body: JSON.stringify({ username, slugs: payloadSlugs })
        });
      } else {
        // No active slugs aligned. Skip the request entirely to save API quota and rate limits.
        setLiveSyncStatus('idle');
        setIsRefreshing(false);
        setLastRefreshed(new Date());
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.liveScores) {
          setLiveScoresMap(data.liveScores);
          setLiveSyncStatus('success');
          setLastSorareSyncTime(new Date());
        } else {
          setLiveSyncStatus('error');
        }
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
  }, []);

  // Safe lineups list (ensure at least current lineup exists)
  const activeCompositions: Lineup[] = useMemo(() => {
    if (compositions && compositions.length > 0) {
      return compositions;
    }
    return [lineup];
  }, [compositions, lineup]);

  // Extract unique active player slugs
  const activeSlugs = useMemo(() => {
    const slugSet = new Set<string>();
    activeCompositions.forEach(comp => {
      Object.values(comp.slots).forEach(card => {
        if (card && card.slug) {
          slugSet.add(card.slug);
        }
      });
    });
    return Array.from(slugSet);
  }, [activeCompositions]);

  // Fetch real live scores from Sorare GraphQL on component mount and refresh every 60s
  useEffect(() => {
    fetchSorareLiveScores(activeSlugs);
    const interval = setInterval(() => {
      fetchSorareLiveScores(activeSlugs);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchSorareLiveScores, activeSlugs]);

  const handleManualRefresh = () => {
    fetchSorareLiveScores(activeSlugs);
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

  // Calculate projected score for each composition
  const compositionTotals = useMemo(() => {
    return activeCompositions.map((comp, idx) => {
      const slots = comp.slots;
      const slotKeys: Array<'gk' | 'def' | 'mid' | 'fwd' | 'extra'> = ['gk', 'def', 'mid', 'fwd', 'extra'];
      let sum = 0;
      let captainName = '';

      slotKeys.forEach(slotKey => {
        const card = slots[slotKey];
        if (card) {
          const activeStrat = strategy || comp.strategy || lineup.strategy;
          const breakdown = calculatePlayerProjectedScore(card, activeStrat);
          const score = breakdown.projectedScore;
          if (comp.captainSlot === slotKey) {
            sum += score * 1.20;
            captainName = card.displayName;
          } else {
            sum += score;
          }
        }
      });

      return {
        index: idx,
        id: comp.id,
        name: comp.name || `Compo ${idx + 1}`,
        projectedTotal: Math.round(sum * 10) / 10,
        captainName,
        captainSlot: comp.captainSlot,
      };
    });
  }, [activeCompositions]);

  // Compute real projected scores and data for each card (including direct Sorare API live scores)
  const processedCards = useMemo(() => {
    return cards.map(card => {
      const lineupPresences = playerLineupMap.get(card.id) || [];
      const isAlignedAny = lineupPresences.length > 0;
      const breakdown = calculatePlayerProjectedScore(card, strategy || lineup.strategy);
      const recentAnalysis = getPlayerRecentMatchAnalysis(card);
      
      const cardCleanId = card.id ? card.id.replace('Card:', '') : '';
      const sorareLive = liveScoresMap[card.id] ||
        liveScoresMap[`Card:${card.id}`] ||
        liveScoresMap[cardCleanId] ||
        (card.slug ? liveScoresMap[card.slug] : null) ||
        ((card as any).playerSlug ? liveScoresMap[(card as any).playerSlug] : null) ||
        (card.displayName ? liveScoresMap[card.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')] : null);

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

      if (hasMatch && (liveGame || fixture)) {
        kickoffStr = liveGame?.date ? formatKickoffDate({ kickoffDate: liveGame.date }) : (fixture ? formatKickoffDate(fixture) : 'Prochainement');
        
        const relLower = (fixture?.kickoffRelative || '').toLowerCase();

        // 1. Check real official live indicators from Sorare API or fixture status
        if (statusLower === 'live' || statusLower === 'in_play' || statusLower === 'ht' || relLower.includes('en direct') || relLower.includes('en cours')) {
          matchStatusCategory = 'LIVE';
          kickoffStr = '🔴 En direct';
          matchStatusLabel = liveGame ? `🔴 En direct (API Sorare) • ${liveGame.homeTeam} ${liveGame.homeGoals}-${liveGame.awayGoals} ${liveGame.awayTeam}` : '🔴 En direct • Match en cours';
        }
        // 2. Check real official finished indicators
        else if (statusLower === 'finished' || statusLower === 'played' || statusLower === 'ft' || relLower.includes('terminé') || relLower.includes('hier')) {
          matchStatusCategory = 'FINISHED';
          kickoffStr = '🏁 Terminé';
          matchStatusLabel = liveGame ? `🏁 Terminé (API Sorare) • ${liveGame.homeTeam} ${liveGame.homeGoals}-${liveGame.awayGoals} ${liveGame.awayTeam}` : '🏁 Match terminé';
        }
        // 3. Dynamic match timing calculation based on real kickoff time vs current reference time
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

      return {
        card,
        lineupPresences,
        isAlignedAny,
        breakdown,
        recentAnalysis,
        hasMatch,
        fixture: displayFixture,
        sorareLive,
        rawDate: rawIso,
        competitionName: liveGame?.competition || displayFixture?.competitionName || card.league || card.club?.league || '',
        kickoffStr,
        matchStatusLabel,
        matchStatusCategory,
      };
    });
  }, [cards, playerLineupMap, strategy, lineup.strategy, liveScoresMap]);

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
        const scoreA = a.sorareLive?.liveScore ?? -999;
        const scoreB = b.sorareLive?.liveScore ?? -999;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return b.breakdown.projectedScore - a.breakdown.projectedScore;
      }

      if (sortBy === 'diff') {
        const scoreA = a.sorareLive?.liveScore ?? 0;
        const scoreB = b.sorareLive?.liveScore ?? 0;
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

  return (
    <div className="space-y-5">
      
      {/* Top Banner: GameWeek & Team Navigation Overview */}
      <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                Calendrier Réel • Game Week {gameWeek || 48}
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
          </div>

          {/* Right Banner: Current Selected View Metrics */}
          <div className="flex items-center gap-3">
            {currentSelectedTeam ? (
              <div className="rounded-2xl bg-slate-950/90 border border-emerald-500/50 p-4 text-center min-w-[190px] shadow-lg">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                  Proj. {currentSelectedTeam.name}
                </span>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl sm:text-4xl font-black text-emerald-400">{currentSelectedTeam.projectedTotal}</span>
                  <span className="text-xs font-bold text-slate-400">pts</span>
                </div>
                {currentSelectedTeam.captainName && (
                  <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5">
                    👑 Cap. {currentSelectedTeam.captainName} (+20%)
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-950/90 border border-emerald-500/50 p-4 text-center min-w-[190px] shadow-lg">
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
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Shield className="h-3 w-3 text-emerald-400" />
                    <span>{comp.name}</span>
                  </span>
                  <span className="text-[10px] font-black text-emerald-400">
                    {comp.projectedTotal} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 truncate">
                    Cap: <strong className="text-slate-200">{comp.captainName || 'Auto'}</strong>
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                    isSelected ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}>
                    5 j.
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

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

      {/* Players List */}
      <div className="space-y-3">
        {filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <Calendar className="h-10 w-10 text-emerald-400/80 mx-auto mb-3" />
            <p className="text-base font-bold text-white">Aucun joueur ne correspond à vos filtres actuels</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {matchStatusFilter.live && !matchStatusFilter.upcoming ? (
                <>Aucun match n'est en cours actuellement. Les premiers matchs officiels de la GW{gameWeek || 48} debutent à partir de <strong>Vendredi 21 août</strong>.</>
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
          filteredCards.map(({ card, lineupPresences, isAlignedAny, breakdown, recentAnalysis, hasMatch, fixture, sorareLive, kickoffStr }) => {
            const projected = breakdown.projectedScore;
            const l5 = card.scores?.l5 || 0;
            const l15 = card.scores?.l15 || l5;
            const avgAA = card.scores?.avgAllAroundScore || Math.round(l5 * 0.5);
            const isStarter = card.status === 'STARTER';
            const winProb = getPlayerWinProbability(fixture);

            // Check if player is captain in any active composition
            const captainInTeams = lineupPresences.filter(p => p.isCaptain);
            const isCaptainSomewhere = captainInTeams.length > 0;

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

                        {/* Real Match Opponent */}
                        {hasMatch && (fixture || sorareLive?.game) ? (
                          <span className="text-xs font-semibold text-slate-300 ml-1">
                            {card.club?.name || sorareLive?.game?.homeTeam} vs <strong className="text-white">{fixture?.opponent || sorareLive?.game?.awayTeam}</strong>
                            {fixture && (
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({fixture.isHome ? 'Dom.' : 'Ext.'})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-400/90 ml-1">
                            Pas de match GW48
                          </span>
                        )}

                        {/* Real Match Score Badge from Sorare API */}
                        {sorareLive?.game && (sorareLive.game.statusTyped === 'in_play' || sorareLive.game.statusTyped === 'played' || sorareLive.game.statusTyped === 'finished' || sorareLive.game.statusTyped === 'ft') && (
                          <span className="text-[10px] font-black text-white bg-slate-950 border border-emerald-500/40 px-2 py-0.5 rounded flex items-center gap-1.5 ml-1">
                            {sorareLive.game.homeTeamPicture && (
                              <img src={sorareLive.game.homeTeamPicture} alt="" className="h-3.5 w-3.5 object-contain" />
                            )}
                            <span className="text-emerald-400 font-bold">{sorareLive.game.homeTeam}</span>
                            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-black">
                              {sorareLive.game.homeGoals} - {sorareLive.game.awayGoals}
                            </span>
                            <span className="text-emerald-400 font-bold">{sorareLive.game.awayTeam}</span>
                            {sorareLive.game.awayTeamPicture && (
                              <img src={sorareLive.game.awayTeamPicture} alt="" className="h-3.5 w-3.5 object-contain" />
                            )}
                          </span>
                        )}
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

                        {/* Starter status badge */}
                        {isStarter ? (
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-1.5 py-0.5 rounded">
                            ⚡ Titulaire confirmé
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {card.status === 'REGULAR' ? '🔄 Rotation' : 'Remplaçant'}
                          </span>
                        )}

                        {/* Recent match note */}
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                          • {recentAnalysis.lastMatchLabel}
                        </span>
                      </div>
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

                    {/* Bookmaker Win chance if match exists */}
                    {hasMatch && fixture && (
                      <div className="text-left sm:text-right bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                        <span className="text-[9px] font-bold uppercase text-slate-400 block">Cote Match</span>
                        <span className="text-xs font-black text-emerald-400">
                          {winProb}% vic.
                        </span>
                        {fixture.bookmaker?.cleanSheetProb && (card.positionCode === 'GK' || card.positionCode === 'DEF') && (
                          <span className="text-[9px] text-blue-400 font-semibold block">
                            CS: {fixture.bookmaker.cleanSheetProb}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* Live Score & Projected Score */}
                    <div className="flex items-center gap-3">
                      {/* Live Score Card */}
                      <div className={`text-right px-3 py-1.5 rounded-2xl min-w-[110px] border transition ${
                        sorareLive?.liveScore != null
                          ? 'bg-emerald-950/50 border-emerald-500/40'
                          : 'bg-slate-950/60 border-slate-800'
                      }`}>
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className={`h-2 w-2 rounded-full ${
                            sorareLive?.liveScore != null ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                          }`}></span>
                          <span className={`text-[9px] font-black uppercase ${
                            sorareLive?.liveScore != null ? 'text-emerald-400' : 'text-slate-400'
                          }`}>
                            {sorareLive?.liveScore != null ? 'Score en direct' : 'Score Live'}
                          </span>
                        </div>
                        
                        <div className="flex items-baseline justify-end gap-1 my-0.5">
                          <span className={`text-xl sm:text-2xl font-black ${
                            sorareLive?.liveScore != null ? 'text-white' : 'text-slate-500'
                          }`}>
                            {sorareLive?.liveScore != null ? sorareLive.liveScore : '--'}
                          </span>
                          <span className={`text-xs font-bold ${
                            sorareLive?.liveScore != null ? 'text-emerald-400' : 'text-slate-600'
                          }`}>pts</span>
                        </div>

                        {sorareLive?.liveScore != null ? (
                          <>
                            {sorareLive.decisiveScore != null && (
                              <span className="text-[9px] text-amber-400 font-semibold block text-right">
                                Décisif: {sorareLive.decisiveScore} pts
                              </span>
                            )}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              {Math.round((sorareLive.liveScore - projected) * 10) / 10 >= 0 ? (
                                <span className="text-[9px] font-black text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                                  +{Math.round((sorareLive.liveScore - projected) * 10) / 10} vs proj.
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-rose-300 bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.2 rounded">
                                  {Math.round((sorareLive.liveScore - projected) * 10) / 10} vs proj.
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-[9px] text-slate-500 block text-right font-medium">
                            Match non démarré
                          </span>
                        )}
                      </div>

                      {/* Projected Score */}
                      <div className="text-right min-w-[85px]">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Projeté</span>
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xl sm:text-2xl font-black text-slate-300">
                            {projected}
                          </span>
                          <span className="text-xs text-slate-500 font-bold">pts</span>
                        </div>
                        {isCaptainSomewhere && (
                          <span className="text-[9px] font-bold text-emerald-400 block">
                            +{Math.round(projected * 0.20 * 10) / 10} cap
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className={`h-4 w-4 text-slate-600 transition hidden sm:block ${expandedCardId === card.id ? 'rotate-90 text-emerald-400' : ''}`} />

                  </div>

                </div>

                {/* Expandable Button for SO5 Match History */}
                {sorareLive?.so5ScoresHistory && sorareLive.so5ScoresHistory.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCardId(expandedCardId === card.id ? null : card.id);
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-slate-950/80 hover:bg-slate-950 border border-emerald-500/30 px-2.5 py-1 rounded-xl transition"
                    >
                      <Activity className="h-3 w-3" />
                      <span>{expandedCardId === card.id ? 'Masquer l\'historique SO5' : `Voir l'historique SO5 (${sorareLive.so5ScoresHistory.length} derniers matchs)`}</span>
                    </button>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Source : API Officielle Sorare
                    </span>
                  </div>
                )}

                {/* Expanded SO5 Match History Panel */}
                {expandedCardId === card.id && sorareLive?.so5ScoresHistory && (
                  <div onClick={(e) => e.stopPropagation()} className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-fadeIn">
                    {sorareLive.so5ScoresHistory.map((s: any, idx: number) => (
                      <div key={idx} className="bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-xs transition">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                          <span className="truncate max-w-[120px] font-bold text-slate-300">{s.game?.competition || 'SO5'}</span>
                          <span>{s.game?.date ? new Date(s.game.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-white truncate max-w-[140px]">
                            {s.game?.homeTeamPicture && <img src={s.game.homeTeamPicture} alt="" className="h-3.5 w-3.5 object-contain flex-shrink-0" />}
                            <span className="truncate">{s.game?.homeTeam}</span>
                            <span className="text-emerald-400 font-black px-1 py-0.2 bg-emerald-500/10 rounded">{s.game?.homeGoals}-{s.game?.awayGoals}</span>
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
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
