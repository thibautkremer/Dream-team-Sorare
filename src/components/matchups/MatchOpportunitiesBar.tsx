import React from 'react';
import { Shield, Flame, Target, Sparkles, TrendingUp, ChevronRight, Award, Trophy } from 'lucide-react';
import { SorareCard } from '../../types';

interface TopCleanSheetItem {
  club: string;
  opponent: string;
  isHome: boolean;
  csProb: number;
  csOdds: number;
  gkDefCount: number;
  competition: string;
}

interface TopOffensiveMatchItem {
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  totalXG: number;
  bttsProb: number;
  fwdMidCount: number;
  competition: string;
}

interface TopValuePlayerItem {
  card: SorareCard;
  projectedScore: number;
  winProb: number;
  scorerOdds?: number;
  bonusPct: number;
}

interface MatchOpportunitiesBarProps {
  topCleanSheets: TopCleanSheetItem[];
  topOffensiveMatches: TopOffensiveMatchItem[];
  topValuePlayers: TopValuePlayerItem[];
  onSelectClub: (clubName: string) => void;
  onOpenScout: (card: SorareCard) => void;
  onFilterCS: () => void;
  onFilterXG: () => void;
}

export const MatchOpportunitiesBar: React.FC<MatchOpportunitiesBarProps> = ({
  topCleanSheets,
  topOffensiveMatches,
  topValuePlayers,
  onSelectClub,
  onOpenScout,
  onFilterCS,
  onFilterXG,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Box 1: Top Clean Sheet Locks */}
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-300">
                  Top Clean Sheet Locks
                </h3>
                <span className="text-[10px] text-slate-400">Idéal pour Stacks GK + DEF</span>
              </div>
            </div>
            <button
              onClick={onFilterCS}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-950/80 border border-blue-500/40 px-2 py-0.5 rounded-lg transition"
            >
              Filtrer
            </button>
          </div>

          <div className="space-y-2">
            {topCleanSheets.slice(0, 3).map((item, idx) => (
              <button
                key={`cs-${idx}`}
                onClick={() => onSelectClub(item.club)}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-blue-500/50 transition text-left group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white group-hover:text-blue-300 transition truncate">
                      {item.club}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {item.isHome ? '🏠 vs' : '✈️ @'} {item.opponent}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>{item.competition}</span>
                    {item.gkDefCount > 0 && (
                      <span className="text-blue-400 font-bold bg-blue-950/60 px-1 rounded">
                        {item.gkDefCount} GK/DEF galerie
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span className="text-xs font-black text-blue-400 font-mono block">
                    {item.csProb}% CS
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    @{item.csOdds.toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Box 2: Top Matchs Offensifs / xG Boomers */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-purple-300">
                  Matchs à Haut xG (Buts)
                </h3>
                <span className="text-[10px] text-slate-400">Idéal pour MID + FWD Décisifs</span>
              </div>
            </div>
            <button
              onClick={onFilterXG}
              className="text-[10px] font-bold text-purple-400 hover:text-purple-300 bg-purple-950/80 border border-purple-500/40 px-2 py-0.5 rounded-lg transition"
            >
              Filtrer
            </button>
          </div>

          <div className="space-y-2">
            {topOffensiveMatches.slice(0, 3).map((item, idx) => (
              <button
                key={`xg-${idx}`}
                onClick={() => onSelectClub(item.homeTeam)}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-purple-500/50 transition text-left group"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-white group-hover:text-purple-300 transition truncate block">
                    {item.homeTeam} vs {item.awayTeam}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>BTTS: {item.bttsProb}%</span>
                    {item.fwdMidCount > 0 && (
                      <span className="text-purple-400 font-bold bg-purple-950/60 px-1 rounded">
                        {item.fwdMidCount} Attaquants galerie
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span className="text-xs font-black text-purple-300 font-mono block">
                    {item.totalXG.toFixed(1)} xG
                  </span>
                  <span className="text-[9px] text-emerald-400 font-bold">
                    Match ouvert
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Box 3: Top Value Attaquants / Buteurs */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                  Top Cartes Sorare en Vue
                </h3>
                <span className="text-[10px] text-slate-400">Fort % victoire & projection</span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-lg">
              GW Focus
            </span>
          </div>

          <div className="space-y-2">
            {topValuePlayers.slice(0, 3).map((item, idx) => (
              <button
                key={`val-${idx}`}
                onClick={() => onOpenScout(item.card)}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 transition text-left group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">
                      {item.card.positionCode}
                    </span>
                    <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition truncate">
                      {item.card.displayName || item.card.name}
                    </span>
                    {item.bonusPct > 0 && (
                      <span className="text-[9px] font-bold text-amber-400">
                        +{item.bonusPct}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>{item.card.club?.name}</span>
                    <span className="text-emerald-400 font-semibold">
                      🎲 {item.winProb}% Win
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span className="text-xs font-black text-emerald-300 font-mono block">
                    {item.projectedScore} pts
                  </span>
                  {item.scorerOdds ? (
                    <span className="text-[9px] text-rose-400 font-mono">
                      ⚽ @{item.scorerOdds.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-500">
                      L5: {item.card.scores?.l5 || 0}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
