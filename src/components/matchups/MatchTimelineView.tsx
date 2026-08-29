import React from 'react';
import { Calendar, Clock, ChevronRight, Shield, Zap, ExternalLink, Flame, TrendingUp } from 'lucide-react';
import { SorareCard, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, formatKickoffDate } from '../../utils/optimizer';
import { getCardTotalBonus } from '../../utils/sorareSlug';

interface FixtureTimelineItem {
  id: string;
  club: string;
  opponent: string;
  isHome: boolean;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  kickoffRelative?: string;
  timeSlotKey: string;
  timeSlotLabel: string;
  homeWinOdds: number;
  drawOdds: number;
  awayWinOdds: number;
  homeWinProb: number;
  awayWinProb: number;
  homeCS: number;
  awayCS: number;
  homeXG: number;
  awayXG: number;
  players: SorareCard[];
  hasVerifiedData: boolean;
}

interface MatchTimelineViewProps {
  fixtures: FixtureTimelineItem[];
  strategy?: StrategyType;
  onOpenScout: (card: SorareCard) => void;
  onSelectMatch: (fixture: FixtureTimelineItem) => void;
  onDeepDiveModal: (homeTeam: string, awayTeam: string, competition?: string, kickoffDate?: string, players?: SorareCard[]) => void;
}

export const MatchTimelineView: React.FC<MatchTimelineViewProps> = ({
  fixtures,
  strategy,
  onOpenScout,
  onSelectMatch,
  onDeepDiveModal,
}) => {
  // Group fixtures by day & timeSlot
  const groupedSlots = React.useMemo(() => {
    const slotMap = new Map<string, { label: string; dateLabel: string; timestamp: number; matches: FixtureTimelineItem[] }>();

    fixtures.forEach((f) => {
      const kDate = f.kickoffDate ? new Date(f.kickoffDate) : new Date();
      const dayName = kDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
      const hours = kDate.getHours();
      const minutes = kDate.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}h${minutes}`;

      // Slot categorization
      let slotTimeName = timeStr;
      if (hours < 14) slotTimeName = `${timeStr} (Midi / Début d'après-midi)`;
      else if (hours < 18) slotTimeName = `${timeStr} (Après-midi)`;
      else slotTimeName = `${timeStr} (Soirée)`;

      const slotKey = `${kDate.toISOString().split('T')[0]}_${hours}_${minutes}`;
      const fullLabel = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} • ${slotTimeName}`;

      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, {
          label: fullLabel,
          dateLabel: dayName,
          timestamp: kDate.getTime(),
          matches: [f],
        });
      } else {
        slotMap.get(slotKey)!.matches.push(f);
      }
    });

    return Array.from(slotMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [fixtures]);

  if (fixtures.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800">
        <Calendar className="h-10 w-10 text-slate-600 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-300">Aucun match programmé sur ce créneau</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedSlots.map((slot, sIdx) => {
        const totalCardsInSlot = slot.matches.reduce((acc, m) => acc + m.players.length, 0);

        return (
          <div
            key={`slot-${sIdx}`}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 shadow-lg backdrop-blur-md space-y-4"
          >
            {/* Slot Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <span>{slot.label}</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {slot.matches.length} match{slot.matches.length > 1 ? 's' : ''} à ce créneau
                  </span>
                </div>
              </div>

              {totalCardsInSlot > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold text-xs shadow-sm">
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{totalCardsInSlot} carte{totalCardsInSlot > 1 ? 's' : ''} Sorare engagée{totalCardsInSlot > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>

            {/* Match Cards inside this slot */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {slot.matches.map((m, mIdx) => {
                const isHomeInGallery = m.isHome;
                const homeWinOddsStr = m.homeWinOdds.toFixed(2);
                const drawOddsStr = m.drawOdds.toFixed(2);
                const awayWinOddsStr = m.awayWinOdds.toFixed(2);

                return (
                  <div
                    key={`m-${mIdx}`}
                    className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3.5 flex flex-col justify-between hover:border-slate-700 transition space-y-3"
                  >
                    {/* Header: Competition & Teams */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-medium">
                            {m.competition}
                          </span>
                          {m.kickoffRelative && (
                            <span className="text-[10px] text-emerald-400 font-bold">
                              {m.kickoffRelative}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-sm font-black text-white">
                          <span className={isHomeInGallery ? 'text-emerald-400' : 'text-slate-200'}>
                            {m.homeTeam}
                          </span>
                          <span className="text-slate-500 font-normal text-xs">vs</span>
                          <span className={!isHomeInGallery ? 'text-emerald-400' : 'text-slate-200'}>
                            {m.awayTeam}
                          </span>
                        </div>
                      </div>

                      {/* Deep-dive button */}
                      <button
                        onClick={() => onDeepDiveModal(m.homeTeam, m.awayTeam, m.competition, m.kickoffDate, m.players)}
                        className="p-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900 transition text-[10px] font-bold flex items-center gap-1 shrink-0"
                        title="Ouvrir l'analyse approfondie API-Football"
                      >
                        <span>Analyse API-Football</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>

                    {/* 1N2 Odds Minimal Row */}
                    <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                      <div className={`p-1.5 rounded-lg border ${isHomeInGallery ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                        <span className="text-[9px] text-slate-400 block truncate">1 • {m.homeTeam}</span>
                        <span className="font-mono font-bold text-white text-xs">@{homeWinOddsStr}</span>
                        <span className="text-[9px] text-emerald-400 block font-semibold">{m.homeWinProb}%</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                        <span className="text-[9px] text-slate-400 block">N • Nul</span>
                        <span className="font-mono font-bold text-white text-xs">@{drawOddsStr}</span>
                        <span className="text-[9px] text-slate-400 block font-semibold">{100 - m.homeWinProb - m.awayWinProb}%</span>
                      </div>
                      <div className={`p-1.5 rounded-lg border ${!isHomeInGallery ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                        <span className="text-[9px] text-slate-400 block truncate">2 • {m.awayTeam}</span>
                        <span className="font-mono font-bold text-white text-xs">@{awayWinOddsStr}</span>
                        <span className="text-[9px] text-emerald-400 block font-semibold">{m.awayWinProb}%</span>
                      </div>
                    </div>

                    {/* Clean Sheet & xG badges */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                      <span className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-blue-400" />
                        <span>CS {m.club}: <strong className="text-blue-300">{isHomeInGallery ? m.homeCS : m.awayCS}%</strong></span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Flame className="h-3 w-3 text-purple-400" />
                        <span>xG Match: <strong className="text-purple-300">{(m.homeXG + m.awayXG).toFixed(1)}</strong></span>
                      </span>
                    </div>

                    {/* Players in gallery */}
                    {m.players.length > 0 && (
                      <div className="pt-2 border-t border-slate-900 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 block">
                          Vos joueurs ({m.players.length}) :
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {m.players.map((p) => {
                            const bonus = getCardTotalBonus(p);
                            const breakdown = calculatePlayerProjectedScore(p, strategy);
                            return (
                              <button
                                key={p.id}
                                onClick={() => onOpenScout(p)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 text-slate-200 text-xs transition group"
                              >
                                <span className="text-[9px] font-black px-1 rounded bg-slate-800 text-emerald-400">
                                  {p.positionCode}
                                </span>
                                <span className="font-bold text-white group-hover:text-emerald-300 transition truncate max-w-[110px]">
                                  {p.displayName || p.name}
                                </span>
                                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                  {breakdown.projectedScore} pts
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
