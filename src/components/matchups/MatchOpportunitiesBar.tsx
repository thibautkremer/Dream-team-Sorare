import React, { useState } from 'react';
import { Shield, Flame, Target, Sparkles, TrendingUp, ChevronRight, Award, Trophy, AlertTriangle, Layers, Zap } from 'lucide-react';
import { SorareCard } from '../../types';

export interface TopCleanSheetItem {
  club: string;
  opponent: string;
  isHome: boolean;
  csProb: number;
  csOdds: number;
  gkDefCount: number;
  competition: string;
}

export interface TopOffensiveMatchItem {
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  totalXG: number;
  bttsProb: number;
  fwdMidCount: number;
  competition: string;
}

export interface TopValuePlayerItem {
  card: SorareCard;
  projectedScore: number;
  winProb: number;
  scorerOdds?: number;
  bonusPct: number;
  captainProjectedScore?: number;
}

export interface StackingClubItem {
  club: string;
  opponent: string;
  isHome: boolean;
  cardCount: number;
  gkDefCount: number;
  fwdMidCount: number;
  csProb: number;
  winProb: number;
  stackType: 'DEFENSIVE' | 'OFFENSIVE' | 'BALANCED';
}

export interface ConflictMatchItem {
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  homePlayers: SorareCard[];
  awayPlayers: SorareCard[];
  hasGkConflict: boolean;
}

interface MatchOpportunitiesBarProps {
  topCleanSheets: TopCleanSheetItem[];
  topOffensiveMatches: TopOffensiveMatchItem[];
  topValuePlayers: TopValuePlayerItem[];
  stackingClubs?: StackingClubItem[];
  conflicts?: ConflictMatchItem[];
  onSelectClub: (clubName: string) => void;
  onOpenScout: (card: SorareCard) => void;
  onFilterCS: () => void;
  onFilterXG: () => void;
  onFilterStacking?: () => void;
  onFilterConflicts?: () => void;
  onOpenH2HModal?: () => void;
}

export const MatchOpportunitiesBar: React.FC<MatchOpportunitiesBarProps> = ({
  topCleanSheets,
  topOffensiveMatches,
  topValuePlayers,
  stackingClubs = [],
  conflicts = [],
  onSelectClub,
  onOpenScout,
  onFilterCS,
  onFilterXG,
  onFilterStacking,
  onFilterConflicts,
  onOpenH2HModal,
}) => {
  const [activeTab, setActiveTab] = useState<'RADAR' | 'STACKING' | 'CONFLICTS'>('RADAR');

  return (
    <div className="space-y-3">
      {/* Sub-navigation bar for Opportunities */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto touch-scroll-x">
          <button
            onClick={() => setActiveTab('RADAR')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'RADAR'
                ? 'bg-emerald-500 text-slate-950 font-black shadow'
                : 'bg-slate-950/80 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Radar Décisions SO5 (Clean Sheet / xG / Capitaine)</span>
          </button>

          <button
            onClick={() => setActiveTab('STACKING')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeTab === 'STACKING'
                ? 'bg-indigo-500 text-slate-950 font-black shadow'
                : 'bg-slate-950/80 text-indigo-300 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Stacking Club ({stackingClubs.length} opportunités)</span>
          </button>

          {conflicts.length > 0 && (
            <button
              onClick={() => setActiveTab('CONFLICTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                activeTab === 'CONFLICTS'
                  ? 'bg-rose-500 text-slate-950 font-black shadow'
                  : 'bg-rose-950/60 text-rose-300 hover:text-white border border-rose-800/60'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Conflits Galerie ({conflicts.length} alertes)</span>
            </button>
          )}
        </div>

        {onOpenH2HModal && (
          <button
            onClick={onOpenH2HModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 text-xs font-black transition shadow cursor-pointer shrink-0"
          >
            <Zap className="h-3.5 w-3.5 text-slate-950" />
            <span>⚖️ Comparateur Face-à-Face H2H</span>
          </button>
        )}
      </div>

      {activeTab === 'RADAR' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fadeIn">
          
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
                      Radar Clean Sheet Locks
                    </h3>
                    <span className="text-[10px] text-slate-400">Pour sécuriser 60+ pts GK/DEF</span>
                  </div>
                </div>
                <button
                  onClick={onFilterCS}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-950/80 border border-blue-500/40 px-2 py-0.5 rounded-lg transition cursor-pointer"
                >
                  Filtrer
                </button>
              </div>

              <div className="space-y-2">
                {topCleanSheets.slice(0, 3).map((item, idx) => (
                  <button
                    key={`cs-${idx}`}
                    onClick={() => onSelectClub(item.club)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-blue-500/50 transition text-left group cursor-pointer"
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
                  className="text-[10px] font-bold text-purple-400 hover:text-purple-300 bg-purple-950/80 border border-purple-500/40 px-2 py-0.5 rounded-lg transition cursor-pointer"
                >
                  Filtrer
                </button>
              </div>

              <div className="space-y-2">
                {topOffensiveMatches.slice(0, 3).map((item, idx) => (
                  <button
                    key={`xg-${idx}`}
                    onClick={() => onSelectClub(item.homeTeam)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-purple-500/50 transition text-left group cursor-pointer"
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

          {/* Box 3: Top Recommandations Capitaine (+20%) */}
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">
                      Radar Capitaine (+20%)
                    </h3>
                    <span className="text-[10px] text-slate-400">Meilleurs ratios xG / Score Décisif</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-lg">
                  Top Plafond
                </span>
              </div>

              <div className="space-y-2">
                {topValuePlayers.slice(0, 3).map((item, idx) => {
                  const capScore = Math.round((item.projectedScore * 1.20) * 10) / 10;
                  return (
                    <button
                      key={`val-${idx}`}
                      onClick={() => onOpenScout(item.card)}
                      className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 transition text-left group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300">
                            {item.card.positionCode}
                          </span>
                          <span className="text-xs font-bold text-white group-hover:text-amber-300 transition truncate">
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
                        <span className="text-xs font-black text-amber-300 font-mono block">
                          Cap. ~{capScore} pts
                        </span>
                        {item.scorerOdds ? (
                          <span className="text-[9px] text-rose-400 font-mono">
                            ⚽ @{item.scorerOdds.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400">
                            Base: {item.projectedScore} pts
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'STACKING' && (
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md animate-fadeIn space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-300">
                Opportunités de Stacking Club (Doubles / Triples Combos)
              </h3>
            </div>
            {onFilterStacking && (
              <button
                onClick={onFilterStacking}
                className="text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-500/40 px-2 py-0.5 rounded-lg hover:bg-indigo-900 transition cursor-pointer"
              >
                Afficher ces clubs
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stackingClubs.length === 0 ? (
              <div className="col-span-full py-4 text-center text-xs text-slate-400">
                Aucun club avec plus de 2 joueurs dans des conditions de match très favorables pour cette GW.
              </div>
            ) : (
              stackingClubs.map((st, idx) => (
                <button
                  key={`st-${idx}`}
                  onClick={() => onSelectClub(st.club)}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 transition text-left group cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                      {st.club}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                      {st.cardCount} cartes
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {st.isHome ? '🏠 Domicile vs' : '✈️ Extérieur @'} {st.opponent}
                  </p>

                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800">
                    <span className="text-blue-400 font-bold">{st.csProb}% Clean Sheet</span>
                    <span className="text-emerald-400 font-bold">{st.winProb}% Win</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'CONFLICTS' && (
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 p-4 shadow-lg backdrop-blur-md animate-fadeIn space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-300">
                Alerte Conflits Intra-Galerie (Joueurs dans les deux équipes d'un même match)
              </h3>
            </div>
            {onFilterConflicts && (
              <button
                onClick={onFilterConflicts}
                className="text-[10px] font-bold text-rose-300 bg-rose-950 border border-rose-500/40 px-2 py-0.5 rounded-lg hover:bg-rose-900 transition cursor-pointer"
              >
                Filtrer matchs en conflit
              </button>
            )}
          </div>

          <p className="text-xs text-slate-300">
            Avoir un attaquant face à votre propre gardien/défenseur annule les probabilités de Clean Sheet mutuelles. Vérifiez ces arbitrages avant de valider vos compos :
          </p>

          <div className="space-y-2">
            {conflicts.map((c, idx) => (
              <div key={`cf-${idx}`} className="p-3 rounded-xl bg-slate-950/80 border border-rose-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-white block mb-1">{c.matchLabel}</span>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="text-emerald-400 font-semibold">{c.homeTeam} :</span>
                    <span>{c.homePlayers.map(p => `${p.displayName} (${p.positionCode})`).join(', ')}</span>
                    <span className="text-slate-500">⚡ VS ⚡</span>
                    <span className="text-teal-400 font-semibold">{c.awayTeam} :</span>
                    <span>{c.awayPlayers.map(p => `${p.displayName} (${p.positionCode})`).join(', ')}</span>
                  </div>
                </div>

                {c.hasGkConflict && (
                  <span className="text-[10px] font-black text-rose-400 bg-rose-950 border border-rose-700/60 px-2 py-1 rounded-lg shrink-0">
                    ⚠️ Risque Clean Sheet Annulé
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
