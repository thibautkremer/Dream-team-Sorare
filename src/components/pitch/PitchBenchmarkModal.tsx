import React, { useMemo } from 'react';
import { X, Scale, Sparkles, TrendingUp, Trophy, ArrowRight, ShieldCheck } from 'lucide-react';
import { Lineup, SorareCard } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability } from '../../utils/optimizer';
import { getCardTotalBonus } from '../../utils/sorareSlug';

interface PitchBenchmarkModalProps {
  compositions: Lineup[];
  allCards: SorareCard[];
  initialCompoAIndex?: number;
  initialCompoBIndex?: number;
  onClose: () => void;
  onSelectComposition: (index: number) => void;
}

export const PitchBenchmarkModal: React.FC<PitchBenchmarkModalProps> = ({
  compositions,
  allCards,
  initialCompoAIndex = 0,
  initialCompoBIndex = 1,
  onClose,
  onSelectComposition,
}) => {
  const [indexA, setIndexA] = React.useState<number>(initialCompoAIndex);
  const [indexB, setIndexB] = React.useState<number>(
    initialCompoBIndex < compositions.length ? initialCompoBIndex : (compositions.length > 1 ? 1 : 0)
  );

  const compoA = compositions[indexA] || compositions[0];
  const compoB = compositions[indexB] || compositions[1] || compositions[0];

  const getCompoStats = (lineup: Lineup) => {
    const slotsArr = (['gk', 'def', 'mid', 'fwd', 'extra'] as const)
      .map(slotKey => ({ slotKey, card: lineup.slots[slotKey] }))
      .filter((item): item is { slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra'; card: SorareCard } => item.card !== null);

    const breakdowns = slotsArr.map(({ slotKey, card }) => {
      const b = calculatePlayerProjectedScore(card, lineup.strategy, allCards);
      const isCap = lineup.captainSlot === slotKey;
      const bonusIfCap = isCap ? Math.round((b.baseProjectedScore * 0.20) * 10) / 10 : 0;
      return {
        card,
        slotKey,
        isCap,
        breakdown: b,
        finalScore: Math.round((b.projectedScore + bonusIfCap) * 10) / 10,
        floor: b.projectedFloor,
        ceiling: Math.round((b.projectedCeiling + bonusIfCap) * 10) / 10,
        winProb: getPlayerWinProbability(card.upcomingFixture),
      };
    });

    const totalProjected = Math.round(breakdowns.reduce((acc, x) => acc + x.finalScore, 0) * 10) / 10;
    const totalFloor = Math.round(breakdowns.reduce((acc, x) => acc + x.floor, 0) * 10) / 10;
    const totalCeiling = Math.round(breakdowns.reduce((acc, x) => acc + x.ceiling, 0) * 10) / 10;
    const avgWinProb = breakdowns.length > 0
      ? Math.round(breakdowns.reduce((acc, x) => acc + x.winProb, 0) / breakdowns.length)
      : 0;

    const gk = lineup.slots.gk;
    const def = lineup.slots.def;
    const csGk = gk?.upcomingFixture?.bookmaker?.cleanSheetProb || (gk?.upcomingFixture?.isHome ? 38 : 28);
    const csDef = def?.upcomingFixture?.bookmaker?.cleanSheetProb || (def?.upcomingFixture?.isHome ? 38 : 28);
    const avgCs = Math.round((csGk + csDef) / 2);

    return {
      lineup,
      breakdowns,
      totalProjected,
      totalFloor,
      totalCeiling,
      avgWinProb,
      avgCs,
    };
  };

  const statsA = useMemo(() => getCompoStats(compoA), [compoA, allCards]);
  const statsB = useMemo(() => getCompoStats(compoB), [compoB, allCards]);

  const scoreDiff = Math.round((statsA.totalProjected - statsB.totalProjected) * 10) / 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[90vh] rounded-3xl border border-emerald-500/40 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Banc d'Essai : Comparateur de Compositions</span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  Scénario & Plafond
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Comparez les plafonds, planchers de sécurité et probabilités de deux compositions côte à côte
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Top Selectors & Score Summary Comparison Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Compo A Card */}
            <div className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-xl border border-emerald-500/30">
                  Composition A
                </span>
                <select
                  value={indexA}
                  onChange={(e) => setIndexA(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-xl px-3 py-1.5 focus:border-emerald-400 focus:outline-none"
                >
                  {compositions.map((c, i) => (
                    <option key={c.id || i} value={i}>
                      Compo {i + 1} : {c.name || `Compo ${i + 1}`} ({c.projectedTotalWithCaptain} pts)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-3xl font-black text-emerald-400 font-mono">
                    {statsA.totalProjected}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold ml-1.5">pts projetés</span>
                </div>
                <div className="text-right text-xs">
                  <span className="text-slate-400 block">Fourchette</span>
                  <strong className="text-slate-200 font-mono">{statsA.totalFloor} - {statsA.totalCeiling} pts</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-900/60 text-xs">
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Win Rate Équipes</span>
                  <strong className="text-emerald-400 font-black">{statsA.avgWinProb}%</strong>
                </div>
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Clean Sheet (GK+DEF)</span>
                  <strong className="text-blue-400 font-black">{statsA.avgCs}%</strong>
                </div>
              </div>
            </div>

            {/* Compo B Card */}
            <div className="rounded-2xl border-2 border-blue-500/60 bg-blue-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-blue-400 bg-blue-500/15 px-2.5 py-1 rounded-xl border border-blue-500/30">
                  Composition B
                </span>
                <select
                  value={indexB}
                  onChange={(e) => setIndexB(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-xl px-3 py-1.5 focus:border-blue-400 focus:outline-none"
                >
                  {compositions.map((c, i) => (
                    <option key={c.id || i} value={i}>
                      Compo {i + 1} : {c.name || `Compo ${i + 1}`} ({c.projectedTotalWithCaptain} pts)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-3xl font-black text-blue-400 font-mono">
                    {statsB.totalProjected}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold ml-1.5">pts projetés</span>
                </div>
                <div className="text-right text-xs">
                  <span className="text-slate-400 block">Fourchette</span>
                  <strong className="text-slate-200 font-mono">{statsB.totalFloor} - {statsB.totalCeiling} pts</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-900/60 text-xs">
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Win Rate Équipes</span>
                  <strong className="text-blue-400 font-black">{statsB.avgWinProb}%</strong>
                </div>
                <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Clean Sheet (GK+DEF)</span>
                  <strong className="text-blue-400 font-black">{statsB.avgCs}%</strong>
                </div>
              </div>
            </div>

          </div>

          {/* Differential Bar */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs sm:text-sm">
            <span className="font-bold text-slate-300">Différentiel Prévisionnel :</span>
            <span className={`font-black font-mono px-3 py-1 rounded-xl border ${
              scoreDiff > 0
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : scoreDiff < 0
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {scoreDiff > 0 ? `+${scoreDiff} pts pour Compo A` : scoreDiff < 0 ? `+${Math.abs(scoreDiff)} pts pour Compo B` : 'Égalité parfaite'}
            </span>
          </div>

          {/* Slot by Slot Comparison Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Comparaison Poste par Poste
            </h4>

            <div className="space-y-2">
              {(['gk', 'def', 'mid', 'fwd', 'extra'] as const).map(slotKey => {
                const itemA = statsA.breakdowns.find(x => x.slotKey === slotKey);
                const itemB = statsB.breakdowns.find(x => x.slotKey === slotKey);
                const pA = itemA?.card;
                const pB = itemB?.card;

                return (
                  <div
                    key={slotKey}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 items-center"
                  >
                    {/* Left Slot (Compo A) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-black text-slate-400 uppercase shrink-0">
                          {slotKey}
                        </span>
                        {pA ? (
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              {pA.displayName} {itemA?.isCap ? '👑' : ''}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate block">
                              {pA.club?.name} (vs {pA.upcomingFixture?.opponent || 'GW'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 italic">Vide</span>
                        )}
                      </div>
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        {itemA?.finalScore || 0} pts
                      </span>
                    </div>

                    {/* Right Slot (Compo B) */}
                    <div className="flex items-center justify-between gap-2 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-black text-slate-400 uppercase shrink-0">
                          {slotKey}
                        </span>
                        {pB ? (
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              {pB.displayName} {itemB?.isCap ? '👑' : ''}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate block">
                              {pB.club?.name} (vs {pB.upcomingFixture?.opponent || 'GW'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 italic">Vide</span>
                        )}
                      </div>
                      <span className="text-xs font-black text-blue-400 font-mono">
                        {itemB?.finalScore || 0} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
          >
            Fermer
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectComposition(indexA);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-black text-slate-950 transition"
            >
              Activer Compo A sur le terrain
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectComposition(indexB);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-xs font-black text-white transition"
            >
              Activer Compo B sur le terrain
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
