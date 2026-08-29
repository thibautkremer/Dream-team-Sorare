import React, { useState, useMemo } from 'react';
import { Shield, Flame, Activity, Sparkles, ChevronDown, ChevronRight, Zap, Star, Filter, ArrowRight, Layers, Trophy } from 'lucide-react';
import { SorareCard, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate } from '../../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus } from '../../utils/sorareSlug';

interface GalleryStacksViewProps {
  cards: SorareCard[];
  onOpenScout: (card: SorareCard) => void;
  onFilterByClub: (clubName: string) => void;
  onReplacePlayer: (card: SorareCard) => void;
  strategy?: StrategyType;
  projectionsMap: Map<string, any>;
  playerLineupMap?: Map<string, Array<{ compoIndex: number; compoName: string }>>;
}

export const GalleryStacksView: React.FC<GalleryStacksViewProps> = ({
  cards,
  onOpenScout,
  onFilterByClub,
  onReplacePlayer,
  strategy = 'BALANCED',
  projectionsMap,
  playerLineupMap,
}) => {
  const [expandedClubs, setExpandedClubs] = useState<Record<string, boolean>>({});
  const [minCardsCount, setMinCardsCount] = useState<number>(2);
  const [stackTypeFilter, setStackTypeFilter] = useState<'ALL' | 'GK_DEF' | 'MID_FWD' | 'FULL_STACK'>('ALL');
  const [sortBy, setSortBy] = useState<'COUNT_DESC' | 'PROJ_DESC' | 'FDR_ASC' | 'NAME_ASC'>('COUNT_DESC');

  // Compute club groupings and synergies
  const clubStacks = useMemo(() => {
    const map = new Map<string, {
      clubName: string;
      logo?: string;
      league?: string;
      cards: SorareCard[];
      gkCount: number;
      defCount: number;
      midCount: number;
      fwdCount: number;
      hasGkDefStack: boolean;
      hasMidFwdStack: boolean;
      hasFullStack: boolean;
      upcomingFixture?: any;
      winProb: number;
      fdr: number;
      avgProj: number;
      totalProj: number;
    }>();

    cards.forEach((card) => {
      const clubName = card.club?.name || 'Club Indéterminé';
      if (!map.has(clubName)) {
        const fixture = card.upcomingFixture;
        const winProb = fixture ? getPlayerWinProbability(fixture) : 0;
        const fdr = fixture?.difficultyRating || 3;

        map.set(clubName, {
          clubName,
          logo: card.club?.pictureUrl || card.club?.logo,
          league: card.league || card.club?.league,
          cards: [],
          gkCount: 0,
          defCount: 0,
          midCount: 0,
          fwdCount: 0,
          hasGkDefStack: false,
          hasMidFwdStack: false,
          hasFullStack: false,
          upcomingFixture: fixture,
          winProb,
          fdr,
          avgProj: 0,
          totalProj: 0,
        });
      }

      const entry = map.get(clubName)!;
      entry.cards.push(card);
      if (card.positionCode === 'GK') entry.gkCount++;
      else if (card.positionCode === 'DEF') entry.defCount++;
      else if (card.positionCode === 'MID') entry.midCount++;
      else if (card.positionCode === 'FWD') entry.fwdCount++;
    });

    // Calculate metrics and synergies for each club
    const list = Array.from(map.values()).map((entry) => {
      entry.hasGkDefStack = entry.gkCount >= 1 && entry.defCount >= 1;
      entry.hasMidFwdStack = entry.midCount >= 1 && entry.fwdCount >= 1;
      entry.hasFullStack = entry.cards.length >= 4 && entry.gkCount >= 1 && (entry.defCount + entry.midCount + entry.fwdCount >= 3);

      let sumProj = 0;
      entry.cards.forEach((c) => {
        const cached = projectionsMap.get(c.id);
        const p = cached ? cached.projectedScore : calculatePlayerProjectedScore(c, strategy).projectedScore;
        sumProj += p;
      });

      entry.totalProj = Math.round(sumProj * 10) / 10;
      entry.avgProj = entry.cards.length > 0 ? Math.round((sumProj / entry.cards.length) * 10) / 10 : 0;
      return entry;
    });

    return list;
  }, [cards, projectionsMap, strategy]);

  // Filtered and sorted club stacks
  const filteredStacks = useMemo(() => {
    return clubStacks
      .filter((s) => {
        if (s.cards.length < minCardsCount) return false;
        if (stackTypeFilter === 'GK_DEF' && !s.hasGkDefStack) return false;
        if (stackTypeFilter === 'MID_FWD' && !s.hasMidFwdStack) return false;
        if (stackTypeFilter === 'FULL_STACK' && !s.hasFullStack) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'COUNT_DESC':
            return b.cards.length - a.cards.length;
          case 'PROJ_DESC':
            return b.avgProj - a.avgProj;
          case 'FDR_ASC':
            return a.fdr - b.fdr;
          case 'NAME_ASC':
            return a.clubName.localeCompare(b.clubName);
          default:
            return 0;
        }
      });
  }, [clubStacks, minCardsCount, stackTypeFilter, sortBy]);

  const toggleClubExpand = (clubName: string) => {
    setExpandedClubs((prev) => ({
      ...prev,
      [clubName]: !prev[clubName],
    }));
  };

  return (
    <div className="space-y-6">
      
      {/* Header Info & Filters */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Détecteur de Stacks & Synergies Clubs</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Identifiez vos blocs d'équipe pour maximiser les clean sheets (GK+DEF) et les combos offensifs (MID+FWD).
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Stack Type */}
            <select
              value={stackTypeFilter}
              onChange={(e) => setStackTypeFilter(e.target.value as any)}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value="ALL">Toutes les synergies</option>
              <option value="GK_DEF">🛡️ Stacks Défensifs (GK + DEF)</option>
              <option value="MID_FWD">⚡ Stacks Offensifs (MID + FWD)</option>
              <option value="FULL_STACK">👑 Ossatures Complètes (4+ cartes)</option>
            </select>

            {/* Min Cards */}
            <select
              value={minCardsCount}
              onChange={(e) => setMinCardsCount(Number(e.target.value))}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value={1}>≥ 1 carte</option>
              <option value={2}>≥ 2 cartes (Duo)</option>
              <option value={3}>≥ 3 cartes (Trio)</option>
              <option value={4}>≥ 4 cartes (Ossature)</option>
              <option value={5}>≥ 5 cartes (Stack 100%)</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value="COUNT_DESC">Nombre de cartes (Décroissant)</option>
              <option value="PROJ_DESC">Score Moyen Projeté (Décroissant)</option>
              <option value="FDR_ASC">Calendrier le plus facile (FDR)</option>
              <option value="NAME_ASC">Nom du Club (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Global Summary Badges */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-slate-800/80">
          <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Clubs Disponibles</span>
            <span className="text-base font-black text-white">{clubStacks.length}</span>
          </div>
          <div className="rounded-xl bg-emerald-950/30 p-2.5 border border-emerald-500/20 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block">Stacks GK + DEF</span>
            <span className="text-base font-black text-emerald-400">
              {clubStacks.filter((s) => s.hasGkDefStack).length} clubs
            </span>
          </div>
          <div className="rounded-xl bg-amber-950/30 p-2.5 border border-amber-500/20 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-400 block">Combos MID + FWD</span>
            <span className="text-base font-black text-amber-400">
              {clubStacks.filter((s) => s.hasMidFwdStack).length} clubs
            </span>
          </div>
          <div className="rounded-xl bg-purple-950/30 p-2.5 border border-purple-500/20 text-center">
            <span className="text-[10px] uppercase font-bold text-purple-400 block">Ossatures Complètes (4+)</span>
            <span className="text-base font-black text-purple-400">
              {clubStacks.filter((s) => s.hasFullStack).length} clubs
            </span>
          </div>
        </div>
      </div>

      {/* Stacks List */}
      <div className="space-y-4">
        {filteredStacks.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <Shield className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">Aucun stack ne correspond aux filtres sélectionnés</p>
            <p className="text-xs text-slate-500 mt-1">Essayez de réduire le nombre minimum de cartes requis.</p>
          </div>
        ) : (
          filteredStacks.map((stack) => {
            const isExpanded = !!expandedClubs[stack.clubName];
            const f = stack.upcomingFixture;

            return (
              <div
                key={stack.clubName}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden backdrop-blur-md transition hover:border-slate-700"
              >
                {/* Main Card Header */}
                <div
                  onClick={() => toggleClubExpand(stack.clubName)}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center p-1 shrink-0 overflow-hidden shadow">
                      {stack.logo ? (
                        <img
                          src={stack.logo}
                          alt={stack.clubName}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Shield className="h-6 w-6 text-slate-500" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-black text-white">{stack.clubName}</h4>
                        <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.2 text-[10px] font-black">
                          {stack.cards.length} carte{stack.cards.length > 1 ? 's' : ''}
                        </span>
                        {stack.league && (
                          <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {stack.league}
                          </span>
                        )}
                      </div>

                      {/* Position counts pills */}
                      <div className="flex items-center gap-1.5 mt-2 text-[11px]">
                        <span className={`px-2 py-0.5 rounded font-black border ${
                          stack.gkCount > 0 ? 'bg-lime-500/20 text-lime-300 border-lime-500/40' : 'bg-slate-950 text-slate-600 border-slate-800'
                        }`}>
                          {stack.gkCount} GK
                        </span>
                        <span className={`px-2 py-0.5 rounded font-black border ${
                          stack.defCount > 0 ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-slate-950 text-slate-600 border-slate-800'
                        }`}>
                          {stack.defCount} DEF
                        </span>
                        <span className={`px-2 py-0.5 rounded font-black border ${
                          stack.midCount > 0 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-950 text-slate-600 border-slate-800'
                        }`}>
                          {stack.midCount} MID
                        </span>
                        <span className={`px-2 py-0.5 rounded font-black border ${
                          stack.fwdCount > 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-600 border-slate-800'
                        }`}>
                          {stack.fwdCount} FWD
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Synergies Badges & Match Details */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Synergies Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {stack.hasGkDefStack && (
                        <span className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300 shadow-sm">
                          <Shield className="h-3 w-3 text-emerald-400" />
                          <span>Stack Défensif (GK+DEF)</span>
                        </span>
                      )}
                      {stack.hasMidFwdStack && (
                        <span className="flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 shadow-sm">
                          <Flame className="h-3 w-3 text-amber-400" />
                          <span>Combo Offensif (MID+FWD)</span>
                        </span>
                      )}
                      {stack.hasFullStack && (
                        <span className="flex items-center gap-1 rounded-lg bg-purple-500/15 border border-purple-500/40 px-2 py-1 text-[10px] font-bold text-purple-300 shadow-sm">
                          <Trophy className="h-3 w-3 text-purple-400" />
                          <span>Ossature 4+</span>
                        </span>
                      )}
                    </div>

                    {/* Fixture & Stats */}
                    {f && (
                      <div className="rounded-xl bg-slate-950/80 p-2 border border-slate-800 text-right shrink-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1 justify-end">
                          <span>{f.isHome ? '🏠 vs' : '✈️ @'} {f.opponent}</span>
                          <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                            stack.fdr <= 2 ? 'bg-emerald-500/20 text-emerald-300' : stack.fdr === 3 ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            FDR {stack.fdr}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 justify-end">
                          <span>{stack.winProb}% vic.</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">Moy. Proj: {stack.avgProj} pts</span>
                        </div>
                      </div>
                    )}

                    {/* Quick filter & expand toggle */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFilterByClub(stack.clubName);
                        }}
                        className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 transition flex items-center gap-1"
                        title="Filtrer toute la galerie sur ce club"
                      >
                        <Filter className="h-3 w-3" />
                        <span>Filtrer</span>
                      </button>

                      <button
                        type="button"
                        className="rounded-xl p-2 text-slate-400 hover:text-white transition"
                      >
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Player Cards Grid */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/40">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Cartes du club ({stack.cards.length}) :
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {stack.cards.map((card) => {
                        const posBadge = formatPositionBadge(card.positionCode);
                        const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
                        const bonus = getCardTotalBonus(card);
                        const cached = projectionsMap.get(card.id);
                        const pScore = cached?.projectedScore ?? calculatePlayerProjectedScore(card, strategy).projectedScore;

                        const alignedCompos = playerLineupMap?.get(card.id) || [];

                        return (
                          <div
                            key={card.id}
                            onClick={() => onOpenScout(card)}
                            className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 hover:border-emerald-500/50 hover:bg-slate-850 transition cursor-pointer flex flex-col justify-between shadow"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`flex h-5 w-7 items-center justify-center rounded text-[10px] font-black border ${posBadge.bg} ${posBadge.text} border-slate-700`}>
                                  {card.positionCode}
                                </span>
                                <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                                <span className="text-[9px] font-bold text-amber-300 bg-amber-950/60 px-1 py-0.2 rounded">
                                  +{bonus}%
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <div className="h-10 w-10 rounded-lg bg-slate-950 border border-slate-700 shrink-0 overflow-hidden">
                                  {card.pictureUrl ? (
                                    <img
                                      src={card.pictureUrl}
                                      alt={card.displayName}
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-xs font-bold text-slate-500">
                                      {card.positionCode}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h6 className="text-xs font-bold text-white truncate">{card.displayName}</h6>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    L5: <strong className="text-slate-200">{card.scores.l5 || 0}</strong> • Proj: <strong className="text-emerald-400">{pScore} pts</strong>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                              {alignedCompos.length > 0 ? (
                                <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                                  <Layers className="h-2.5 w-2.5" />
                                  <span>{alignedCompos.length} compo(s)</span>
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-slate-500">
                                  Non aligné
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReplacePlayer(card);
                                }}
                                className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition"
                              >
                                Aligner
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
