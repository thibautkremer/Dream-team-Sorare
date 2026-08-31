import React, { useState } from 'react';
import { X, ArrowRightLeft, Shield, Flame, Sparkles, TrendingUp, CloudSun, Target, CheckCircle2, ChevronRight, Award } from 'lucide-react';
import { SorareCard, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, formatKickoffDate } from '../../utils/optimizer';
import { getCardTotalBonus } from '../../utils/sorareSlug';

interface FixtureOption {
  key: string;
  club: string;
  opponent: string;
  isHome: boolean;
  competition: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  homeWinOdds: number;
  drawOdds: number;
  awayWinOdds: number;
  homeWinProb?: number;
  awayWinProb?: number;
  drawProb?: number;
  winOdds: number;
  winProb?: number;
  cleanSheetProb: number;
  goalExpectancy: number;
  players: SorareCard[];
  weather?: { temp: number; description: string; wind: number; city: string };
}

interface MatchH2HComparatorModalProps {
  fixtures: FixtureOption[];
  strategy?: StrategyType;
  allCards: SorareCard[];
  initialMatchA?: string;
  initialMatchB?: string;
  onClose: () => void;
  onOpenScout: (card: SorareCard) => void;
}

export const MatchH2HComparatorModal: React.FC<MatchH2HComparatorModalProps> = ({
  fixtures,
  strategy = 'BALANCED',
  allCards,
  initialMatchA,
  initialMatchB,
  onClose,
  onOpenScout,
}) => {
  const [matchAKey, setMatchAKey] = useState<string>(initialMatchA || (fixtures[0]?.key || ''));
  const [matchBKey, setMatchBKey] = useState<string>(initialMatchB || (fixtures[1]?.key || fixtures[0]?.key || ''));

  const fixtureA = fixtures.find(f => f.key === matchAKey) || fixtures[0];
  const fixtureB = fixtures.find(f => f.key === matchBKey) || fixtures[1] || fixtures[0];

  if (!fixtureA || !fixtureB) return null;

  // Calcul des scores moyens projetés des joueurs de chaque match
  const getAverageProjScore = (fix: FixtureOption) => {
    if (!fix.players.length) return 0;
    const sum = fix.players.reduce((acc, p) => acc + calculatePlayerProjectedScore(p, strategy, allCards).projectedScore, 0);
    return Math.round((sum / fix.players.length) * 10) / 10;
  };

  const avgScoreA = getAverageProjScore(fixtureA);
  const avgScoreB = getAverageProjScore(fixtureB);

  // Verdict d'arbitrage
  const getArbitrageVerdict = () => {
    let scoreA_advantage = 0;
    let scoreB_advantage = 0;

    // Win probability
    if ((fixtureA.winProb || 40) > (fixtureB.winProb || 40) + 5) scoreA_advantage += 1;
    else if ((fixtureB.winProb || 40) > (fixtureA.winProb || 40) + 5) scoreB_advantage += 1;

    // Clean sheet
    if (fixtureA.cleanSheetProb > fixtureB.cleanSheetProb + 5) scoreA_advantage += 1;
    else if (fixtureB.cleanSheetProb > fixtureA.cleanSheetProb + 5) scoreB_advantage += 1;

    // Goal expectancy
    if (fixtureA.goalExpectancy > fixtureB.goalExpectancy + 0.3) scoreA_advantage += 1;
    else if (fixtureB.goalExpectancy > fixtureA.goalExpectancy + 0.3) scoreB_advantage += 1;

    // Player average score
    if (avgScoreA > avgScoreB + 2) scoreA_advantage += 1;
    else if (avgScoreB > avgScoreA + 2) scoreB_advantage += 1;

    if (scoreA_advantage > scoreB_advantage) {
      return {
        winner: fixtureA.club,
        badgeColor: 'text-emerald-400 bg-emerald-950/80 border-emerald-500/50',
        text: `Avantage net pour **${fixtureA.club}** : Probabilité de victoire supérieure (${fixtureA.winProb || 50}% vs ${fixtureB.winProb || 50}%) et meilleures perspectives de scoring SO5 (+${Math.max(0, Math.round((avgScoreA - avgScoreB) * 10) / 10)} pts en moyenne).`,
      };
    } else if (scoreB_advantage > scoreA_advantage) {
      return {
        winner: fixtureB.club,
        badgeColor: 'text-teal-300 bg-teal-950/80 border-teal-500/50',
        text: `Avantage net pour **${fixtureB.club}** : Meilleures cotes globales et projection d'effectif plus solide (+${Math.max(0, Math.round((avgScoreB - avgScoreA) * 10) / 10)} pts en moyenne).`,
      };
    }
    return {
      winner: 'Équilibré',
      badgeColor: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
      text: `Matchups très serrés entre **${fixtureA.club}** et **${fixtureB.club}**. Privilégiez les joueurs avec le plus haut bonus de carte ou la meilleure forme récente L5.`,
    };
  };

  const verdict = getArbitrageVerdict();

  const renderSide = (fix: FixtureOption, label: string) => {
    const isHome = fix.isHome;
    const formattedDate = fix.kickoffFormatted || formatKickoffDate(fix.kickoffDate);

    return (
      <div className="flex-1 space-y-4 bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 flex flex-col justify-between">
        <div className="space-y-3">
          {/* Header Match */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
              {label}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {formattedDate}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span className="text-emerald-400">{fix.club}</span>
              <span className="text-xs text-slate-400 font-normal">{isHome ? '🏠 (Dom)' : '✈️ (Ext)'}</span>
              <span className="text-xs text-slate-500">vs</span>
              <span className="text-slate-300">{fix.opponent}</span>
            </h3>
            <span className="text-[11px] text-slate-400 block mt-0.5">{fix.competition}</span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Win % */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Victoire Club</span>
              <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block">
                {fix.winProb || 45}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">@{fix.winOdds.toFixed(2)}</span>
            </div>

            {/* Clean Sheet % */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Clean Sheet %</span>
              <span className="text-base font-black text-blue-400 font-mono mt-0.5 block">
                {fix.cleanSheetProb}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono">@{(100 / Math.max(5, fix.cleanSheetProb)).toFixed(2)}</span>
            </div>

            {/* Goal Expectancy xG */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Espérance xG</span>
              <span className="text-base font-black text-purple-300 font-mono mt-0.5 block">
                {fix.goalExpectancy.toFixed(1)} xG
              </span>
              <span className="text-[10px] text-slate-400">Attaque</span>
            </div>
          </div>

          {/* Weather & Play Conditions */}
          {fix.weather && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CloudSun className="h-4 w-4 text-sky-400" />
                <span className="text-slate-300 font-medium">{fix.weather.temp}°C • {fix.weather.description}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Vent {fix.weather.wind} km/h</span>
            </div>
          )}

          {/* Gallery Players in this match */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Joueurs dans votre galerie ({fix.players.length}) :</span>
              <span className="text-emerald-400 font-mono">Moy. {avgScoreA} pts</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {fix.players.map((p) => {
                const breakdown = calculatePlayerProjectedScore(p, strategy, allCards);
                const bonusPct = getCardTotalBonus(p);

                return (
                  <button
                    key={p.id}
                    onClick={() => onOpenScout(p)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 transition text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 shrink-0">
                        {p.positionCode}
                      </span>
                      <span className="text-xs font-bold text-white group-hover:text-emerald-300 truncate">
                        {p.displayName || p.name}
                      </span>
                      {bonusPct > 0 && (
                        <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/30 px-1 py-0.2 rounded">
                          +{bonusPct}%
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        {breakdown.projectedScore} pts
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-emerald-400 transition" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-inner">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Comparateur Face-à-Face & Arbitrage SO5</span>
                <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                  H2H Matchups
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Comparez 2 rencontres côte à côte pour trancher vos choix de titulaires et de capitaine.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Matchup A :
            </label>
            <select
              value={matchAKey}
              onChange={(e) => setMatchAKey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-emerald-400 focus:outline-none"
            >
              {fixtures.map(f => (
                <option key={`optA-${f.key}`} value={f.key}>
                  {f.club} vs {f.opponent} ({f.competition})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Matchup B :
            </label>
            <select
              value={matchBKey}
              onChange={(e) => setMatchBKey(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-emerald-400 focus:outline-none"
            >
              {fixtures.map(f => (
                <option key={`optB-${f.key}`} value={f.key}>
                  {f.club} vs {f.opponent} ({f.competition})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Arbitrage Verdict Banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <Award className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-200">
              <span className="font-bold text-white block mb-0.5">Verdict d'Arbitrage Tactique :</span>
              <p className="leading-relaxed text-slate-300">{verdict.text}</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 text-xs font-black rounded-xl border shrink-0 ${verdict.badgeColor}`}>
            {verdict.winner}
          </span>
        </div>

        {/* Side-by-Side Comparator Grid */}
        <div className="flex flex-col sm:flex-row gap-4">
          {renderSide(fixtureA, 'Matchup A')}
          {renderSide(fixtureB, 'Matchup B')}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            Fermer le comparateur
          </button>
        </div>

      </div>
    </div>
  );
};
