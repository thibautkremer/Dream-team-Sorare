import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, Sparkles, Trophy, Users, Award, CheckCircle2, Clock } from 'lucide-react';
import { SorareCard, Lineup } from '../../types';
import { getCardTotalBonus, getPlayerStars } from '../../utils/sorareSlug';
import { getLineupClubStacks, getLineupOpponentConflicts } from '../../utils/optimizer';

interface PitchTournamentRulesProps {
  lineup: Lineup;
  allCards: SorareCard[];
}

export const PitchTournamentRules: React.FC<PitchTournamentRulesProps> = ({ lineup, allCards }) => {
  const validation = useMemo(() => {
    const slots = Object.values(lineup.slots).filter((c): c is SorareCard => c !== null);
    
    // 1. Cap 240 / Cap 270 Check
    const totalL15 = slots.reduce((acc, c) => acc + (c.scores.l15 || 0), 0);
    const isCap240Valid = totalL15 <= 240;
    const isCap270Valid = totalL15 <= 270;

    // 2. Under 23 Eligibility (All players age <= 23)
    const u23EligibleCount = slots.filter(c => typeof c.age === 'number' && c.age <= 23).length;
    const isFullU23 = slots.length === 5 && u23EligibleCount === 5;

    // 3. In-Season Percentage (Season >= 2024 cards)
    const inSeasonCount = slots.filter(c => typeof c.seasonYear === 'number' && c.seasonYear >= 2024).length;
    const inSeasonPct = slots.length > 0 ? Math.round((inSeasonCount / slots.length) * 100) : 0;

    // 4. Stacks and conflicts
    const stacks = getLineupClubStacks(lineup.slots);
    const conflicts = getLineupOpponentConflicts(lineup.slots);

    // 5. Best Captain Recommendation
    let bestCaptainSlot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra' = lineup.captainSlot;
    let maxBase = -1;
    (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
      const card = lineup.slots[slotKey];
      if (card && card.scores.l5 > maxBase) {
        maxBase = card.scores.l5;
        bestCaptainSlot = slotKey;
      }
    });

    const isCurrentCaptainOptimal = bestCaptainSlot === lineup.captainSlot;
    const recommendedCaptainName = lineup.slots[bestCaptainSlot]?.displayName || '';

    return {
      slotsCount: slots.length,
      totalL15,
      isCap240Valid,
      isCap270Valid,
      u23EligibleCount,
      isFullU23,
      inSeasonCount,
      inSeasonPct,
      stacks,
      conflicts,
      isCurrentCaptainOptimal,
      recommendedCaptainName,
      bestCaptainSlot,
    };
  }, [lineup]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Diagnostic & Règles de Tournois Sorare</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-full border border-emerald-500/20 lowercase">
                5 slots vérifiés
              </span>
            </h4>
            <p className="text-[10px] text-slate-400">Éligibilité automatique aux compétitions Sorare (In-Season, Cap 240, U23, Synergies)</p>
          </div>
        </div>

        {/* Stacking indicator */}
        <div className="flex items-center gap-2 flex-wrap">
          {validation.stacks.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 px-2.5 py-1 rounded-xl">
              <Users className="h-3 w-3 text-cyan-400" />
              <span>Stack {validation.stacks.map(s => `${s.count}x ${s.clubName}`).join(', ')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-xl">
              <span>Joueurs de 5 clubs différents</span>
            </span>
          )}
        </div>
      </div>

      {/* Grid of tournament checks */}
      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        
        {/* 1. Cap 240 / Cap 270 Checker */}
        <div className="rounded-xl bg-slate-950/80 p-2.5 border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Budget L15 (Cap)</span>
            <span className={`font-mono font-black ${validation.totalL15 <= 240 ? 'text-emerald-400' : validation.totalL15 <= 270 ? 'text-amber-400' : 'text-slate-300'}`}>
              {validation.totalL15} pts
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              validation.isCap240Valid 
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' 
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}>
              {validation.isCap240Valid ? '✓ Cap 240 OK' : '✕ Cap 240 dépassé'}
            </span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
              validation.isCap270Valid 
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' 
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}>
              {validation.isCap270Valid ? '✓ Cap 270 OK' : '✕ Cap 270'}
            </span>
          </div>
        </div>

        {/* 2. In-Season vs Classic */}
        <div className="rounded-xl bg-slate-950/80 p-2.5 border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>In-Season (2024+)</span>
            <span className="font-mono font-black text-amber-300">
              {validation.inSeasonPct}%
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px]">
            <span className="text-slate-400">{validation.inSeasonCount}/5 cartes de la saison</span>
            <span className="text-amber-400 font-bold">
              {validation.inSeasonCount === 5 ? '⚡ 100% In-Season' : 'Classic / Mix'}
            </span>
          </div>
        </div>

        {/* 3. U23 Eligibility */}
        <div className="rounded-xl bg-slate-950/80 p-2.5 border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Éligibilité U23</span>
            <span className="font-mono font-black text-cyan-300">
              {validation.u23EligibleCount}/5 U23
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px]">
            <span className="text-slate-400">&le; 23 ans requis</span>
            <span className={`font-bold ${validation.isFullU23 ? 'text-cyan-400' : 'text-slate-500'}`}>
              {validation.isFullU23 ? '✓ Éligible All-Star U23' : 'Mix Âges'}
            </span>
          </div>
        </div>

        {/* 4. Captain Optimization Status */}
        <div className="rounded-xl bg-slate-950/80 p-2.5 border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Conseil Capitaine</span>
            <Trophy className="h-3 w-3 text-amber-400" />
          </div>
          <div className="mt-1.5 text-[9px]">
            {validation.isCurrentCaptainOptimal ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Capitaine optimal assigné</span>
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-1 truncate">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="truncate">Suggéré : {validation.recommendedCaptainName}</span>
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
