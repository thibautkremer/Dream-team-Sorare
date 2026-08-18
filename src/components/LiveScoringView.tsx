import React, { useState, useMemo } from 'react';
import { RefreshCw, Zap, Clock, Trophy, Crown, CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, Activity, Flame, Shield, Calendar, TrendingUp, AlertTriangle, Users, Layers } from 'lucide-react';
import { SorareCard, Lineup } from '../types';
import { calculatePlayerProjectedScore, formatKickoffDate, getPlayerWinProbability, getPlayerRecentMatchAnalysis } from '../utils/optimizer';

interface LiveScoringViewProps {
  cards: SorareCard[];
  lineup: Lineup;
  compositions?: Lineup[];
  onOpenScout: (card: SorareCard) => void;
  gameWeek: number;
}

export const LiveScoringView: React.FC<LiveScoringViewProps> = ({
  cards,
  lineup,
  compositions = [],
  onOpenScout,
  gameWeek,
}) => {
  // Navigation mode: 'all_aligned' (all players across all lineups), 'team_0', 'team_1', 'team_2', 'team_3', 'gw_matches', 'all_gallery'
  const [activeView, setActiveView] = useState<string>('all_aligned');
  const [selectedPosition, setSelectedPosition] = useState<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshed(new Date());
      setIsRefreshing(false);
    }, 400);
  };

  // Safe lineups list (ensure at least current lineup exists)
  const activeCompositions: Lineup[] = useMemo(() => {
    if (compositions && compositions.length > 0) {
      return compositions;
    }
    return [lineup];
  }, [compositions, lineup]);

  // Build a lookup map of player id -> array of { compoIndex, compoName, isCaptain, slot }
  const playerLineupMap = useMemo(() => {
    const map = new Map<string, Array<{ compoIndex: number; compoName: string; isCaptain: boolean; slot: string }>>();
    
    activeCompositions.forEach((comp, idx) => {
      const compName = comp.name || `Équipe ${idx + 1}`;
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
          const breakdown = calculatePlayerProjectedScore(card);
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
        name: comp.name || `Équipe ${idx + 1}`,
        projectedTotal: Math.round(sum * 10) / 10,
        captainName,
        captainSlot: comp.captainSlot,
      };
    });
  }, [activeCompositions]);

  // Compute real projected scores and data for each card
  const processedCards = useMemo(() => {
    return cards.map(card => {
      const lineupPresences = playerLineupMap.get(card.id) || [];
      const isAlignedAny = lineupPresences.length > 0;
      const breakdown = calculatePlayerProjectedScore(card);
      const recentAnalysis = getPlayerRecentMatchAnalysis(card);
      const fixture = card.upcomingFixture;
      const hasMatch = fixture && fixture.hasUpcomingMatch !== false;

      let matchStatusLabel = 'À venir';
      let kickoffStr = 'Date à confirmer';

      if (fixture) {
        kickoffStr = fixture.kickoffFormatted || formatKickoffDate(fixture.kickoffDate);
        if (fixture.kickoffRelative) {
          matchStatusLabel = `${kickoffStr} (${fixture.kickoffRelative})`;
        } else {
          matchStatusLabel = kickoffStr;
        }
      } else {
        matchStatusLabel = 'Aucun match programmé';
      }

      return {
        card,
        lineupPresences,
        isAlignedAny,
        breakdown,
        recentAnalysis,
        hasMatch,
        fixture,
        kickoffStr,
        matchStatusLabel,
      };
    });
  }, [cards, playerLineupMap]);

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.card.displayName.toLowerCase().includes(q) ||
        item.card.club?.name?.toLowerCase().includes(q) ||
        item.fixture?.opponent?.toLowerCase().includes(q)
      );
    }

    // Sort order:
    // When in specific team view: sort by slot order (GK -> DEF -> MID -> FWD -> EXTRA)
    if (activeView.startsWith('team_')) {
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

    // Otherwise: Aligned players first, then by projected score desc
    return result.sort((a, b) => {
      if (a.isAlignedAny && !b.isAlignedAny) return -1;
      if (!a.isAlignedAny && b.isAlignedAny) return 1;
      return b.breakdown.projectedScore - a.breakdown.projectedScore;
    });
  }, [processedCards, activeView, selectedPosition, searchQuery]);

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
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                Calendrier Réel • Game Week {gameWeek || 48}
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Données Officielles Sorare
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
          
          {/* Button: All Aligned Players */}
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

          {/* Buttons for each Team / Composition */}
          {activeCompositions.map((comp, idx) => {
            const isSelected = activeView === `team_${idx}`;
            const compName = comp.name || `Équipe ${idx + 1}`;
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

          {/* Additional Filter: Real GW Matches */}
          <button
            onClick={() => setActiveView('gw_matches')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
              activeView === 'gw_matches'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            <Calendar className="h-3 w-3" />
            <span>Matchs GW ({totalWithMatchCount})</span>
          </button>

          {/* Additional Filter: All Gallery */}
          <button
            onClick={() => setActiveView('all_gallery')}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition whitespace-nowrap ${
              activeView === 'all_gallery'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
            }`}
          >
            Galerie ({cards.length})
          </button>
        </div>

        {/* Position pills & Search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
            {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
              <button
                key={pos}
                onClick={() => setSelectedPosition(pos)}
                className={`px-2 py-1 rounded-lg transition ${
                  selectedPosition === pos
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {pos === 'ALL' ? 'Tous' : pos}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none w-32 sm:w-36"
          />

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 hover:bg-slate-800 border border-slate-800 transition"
            title="Rafraîchir les données officielles"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Players List */}
      <div className="space-y-3">
        {filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-bold text-white">Aucun joueur correspondant</p>
            <p className="text-xs text-slate-400 mt-1">Modifiez vos filtres ou sélectionnez une autre équipe.</p>
          </div>
        ) : (
          filteredCards.map(({ card, lineupPresences, isAlignedAny, breakdown, recentAnalysis, hasMatch, fixture, kickoffStr }) => {
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
                        {hasMatch && fixture ? (
                          <span className="text-xs font-semibold text-slate-300 ml-1">
                            {card.club?.name} vs <strong className="text-white">{fixture.opponent}</strong>
                            <span className="text-[10px] text-slate-400 ml-1">
                              ({fixture.isHome ? 'Dom.' : 'Ext.'})
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-400/90 ml-1">
                            Pas de match GW48
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
                        {hasMatch && fixture ? (
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

                    {/* Big Projected Score */}
                    <div className="text-right min-w-[90px]">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Score Projeté</span>
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                          {projected}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">pts</span>
                      </div>
                      {isCaptainSomewhere && (
                        <span className="text-[10px] font-bold text-emerald-400 block">
                          +{Math.round(projected * 0.20 * 10) / 10} cap ({Math.round(projected * 1.20 * 10) / 10})
                        </span>
                      )}
                    </div>

                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 transition hidden sm:block" />

                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
