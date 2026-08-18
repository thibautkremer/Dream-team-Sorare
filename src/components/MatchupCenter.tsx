import React from 'react';
import { BarChart3, ShieldCheck, Target, Zap, Calendar, Search, Filter, Sparkles, ChevronRight, TrendingUp } from 'lucide-react';
import { SorareCard, GameWeekInfo, StrategyType } from '../types';
import { formatKickoffDate, getPlayerWinProbability, calculatePlayerProjectedScore } from '../utils/optimizer';
import { getCardTotalBonus } from '../utils/sorareSlug';
export { getCardTotalBonus };

interface MatchupCenterProps {
  cards: SorareCard[];
  gameWeek: GameWeekInfo;
  onOpenScout: (card: SorareCard) => void;
  strategy?: StrategyType;
}

interface FixtureAggregate {
  club: string;
  opponent: string;
  isHome: boolean;
  difficulty: number;
  competition: string;
  country?: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  kickoffRelative?: string;
  cleanSheetProb: number;
  goalExpectancy: number;
  winOdds: number;
  drawOdds: number;
  lossOdds: number;
  players: SorareCard[];
}

export function isSamePlayer(c1: SorareCard, c2: SorareCard): boolean {
  if (!c1 || !c2) return false;
  if (c1.id === c2.id) return true;

  const name1 = (c1.displayName || c1.name || '').trim().toLowerCase();
  const name2 = (c2.displayName || c2.name || '').trim().toLowerCase();
  if (name1 && name2 && name1 === name2) return true;

  if (c1.matchName && c2.matchName && c1.matchName.trim().toLowerCase() === c2.matchName.trim().toLowerCase()) {
    return true;
  }

  if (c1.slug && c2.slug) {
    const baseSlug1 = c1.slug.split('-202')[0]?.toLowerCase();
    const baseSlug2 = c2.slug.split('-202')[0]?.toLowerCase();
    if (baseSlug1 && baseSlug2 && baseSlug1 === baseSlug2) return true;
  }

  return false;
}

export const MatchupCenter: React.FC<MatchupCenterProps> = ({ cards, gameWeek, onOpenScout, strategy }) => {
  // Extract unique fixtures from cards
  const fixtureMap = new Map<string, FixtureAggregate>();

  cards.forEach(card => {
    if (card.upcomingFixture) {
      const key = `${card.club?.name || 'Club'}-vs-${card.upcomingFixture.opponent}`;
      if (!fixtureMap.has(key)) {
        fixtureMap.set(key, {
          club: card.club?.name || 'Club',
          opponent: card.upcomingFixture.opponent,
          isHome: card.upcomingFixture.isHome,
          difficulty: card.upcomingFixture.difficultyRating,
          competition: card.upcomingFixture.competitionName || 'Championnat',
          country: card.club?.country,
          kickoffDate: card.upcomingFixture.kickoffDate,
          kickoffFormatted: card.upcomingFixture.kickoffFormatted,
          kickoffRelative: card.upcomingFixture.kickoffRelative,
          cleanSheetProb: card.upcomingFixture.bookmaker?.cleanSheetProb || 30,
          goalExpectancy: card.upcomingFixture.bookmaker?.goalExpectancy || 1.4,
          winOdds: card.upcomingFixture.bookmaker?.win || 2.5,
          drawOdds: card.upcomingFixture.bookmaker?.draw || 3.3,
          lossOdds: card.upcomingFixture.bookmaker?.loss || 2.8,
          players: [card],
        });
      } else {
        const fixture = fixtureMap.get(key)!;
        // Deduplicate player: Keep strictly ONE card per player (highest bonus percentage)
        const existingIdx = fixture.players.findIndex(p => isSamePlayer(p, card));

        if (existingIdx === -1) {
          fixture.players.push(card);
        } else {
          const existingCard = fixture.players[existingIdx];
          const existingBonus = getCardTotalBonus(existingCard);
          const newBonus = getCardTotalBonus(card);
          if (newBonus > existingBonus) {
            fixture.players[existingIdx] = card;
          }
        }
      }
    }
  });

  // State for filtering and sorting
  const [selectedCompetition, setSelectedCompetition] = React.useState<string>('ALL');
  const [minWinChance, setMinWinChance] = React.useState<number>(0);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [selectedDay, setSelectedDay] = React.useState<string>('ALL');
  const [sortBy, setSortBy] = React.useState<'DATE_ASC' | 'WIN_DESC' | 'CS_DESC' | 'XG_DESC' | 'DIFFICULTY_ASC'>('DATE_ASC');

  // Competitions list
  const competitions = React.useMemo(() => {
    const list = new Set<string>();
    Array.from(fixtureMap.values()).forEach(f => {
      if (f.competition) list.add(f.competition);
    });
    return ['ALL', ...Array.from(list).sort()];
  }, [cards]);

  const daysOptions = [
    { value: 'ALL', label: 'Tous les jours' },
    { value: 'vendredi', label: 'Vendredi 21 août' },
    { value: 'samedi', label: 'Samedi 22 août' },
    { value: 'dimanche', label: 'Dimanche 23 août' },
    { value: 'lundi', label: 'Lundi 24 août' },
  ];

  // Processed (filtered and sorted) fixtures
  const processedFixtures = React.useMemo(() => {
    let result = Array.from(fixtureMap.values());

    // Search query (club or opponent)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(f => 
        f.club.toLowerCase().includes(q) || 
        f.opponent.toLowerCase().includes(q) ||
        f.players.some(p => p.displayName.toLowerCase().includes(q))
      );
    }

    // Competition filter
    if (selectedCompetition !== 'ALL') {
      result = result.filter(f => f.competition === selectedCompetition);
    }

    // Min win chance
    if (minWinChance > 0) {
      result = result.filter(f => {
        const winProb = f.winOdds > 1 ? Math.round((1 / f.winOdds) * 100) : Math.round(f.winOdds);
        return winProb >= minWinChance;
      });
    }

    // Day filter
    if (selectedDay !== 'ALL') {
      result = result.filter(f => {
        if (!f.kickoffDate) return false;
        const dateObj = new Date(f.kickoffDate);
        const dayStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
        return dayStr.includes(selectedDay.toLowerCase());
      });
    }

    // Sorting
    return result.sort((a, b) => {
      switch (sortBy) {
        case 'DATE_ASC':
          const tA = a.kickoffDate ? new Date(a.kickoffDate).getTime() : 0;
          const tB = b.kickoffDate ? new Date(b.kickoffDate).getTime() : 0;
          return tA - tB;
        case 'WIN_DESC':
          const wA = a.winOdds > 1 ? Math.round((1 / a.winOdds) * 100) : a.winOdds;
          const wB = b.winOdds > 1 ? Math.round((1 / b.winOdds) * 100) : b.winOdds;
          return wB - wA;
        case 'CS_DESC':
          return b.cleanSheetProb - a.cleanSheetProb;
        case 'XG_DESC':
          return b.goalExpectancy - a.goalExpectancy;
        case 'DIFFICULTY_ASC':
          return a.difficulty - b.difficulty;
        default:
          return 0;
      }
    });
  }, [cards, selectedCompetition, minWinChance, searchQuery, selectedDay, sortBy]);

  const getFDRBadge = (rating: number) => {
    switch (rating) {
      case 1:
        return { label: 'FDR 1 (Très Facile)', color: 'text-emerald-400 bg-emerald-950/90 border-emerald-500/50' };
      case 2:
        return { label: 'FDR 2 (Favorable)', color: 'text-teal-300 bg-teal-950/90 border-teal-500/50' };
      case 3:
        return { label: 'FDR 3 (Équilibré)', color: 'text-amber-300 bg-amber-950/60 border-amber-500/30' };
      case 4:
        return { label: 'FDR 4 (Délicat)', color: 'text-orange-400 bg-orange-950/60 border-orange-500/30' };
      case 5:
      default:
        return { label: 'FDR 5 (Très Dur)', color: 'text-rose-400 bg-rose-950/80 border-rose-500/40' };
    }
  };

  const getPositionStyle = (posCode: string) => {
    switch (posCode) {
      case 'GK':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'DEF':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'MID':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'FWD':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Calendrier Officiel SO5 & Cotes Bookmakers</span>
                </h2>
                <p className="text-xs text-slate-400">
                  {gameWeek.label} • Dates et horaires précis des matchs pour l'ensemble des {cards.length.toLocaleString('fr-FR')} cartes de votre galerie.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 border border-slate-800 text-xs text-slate-300 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Clôture SO5 : Samedi 22 août à 13h30 UTC</span>
          </div>
        </div>

        {/* Quick league chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-4">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3 text-emerald-400" />
            <span>Ligue :</span>
          </span>
          {competitions.map((comp) => (
            <button
              key={comp}
              onClick={() => setSelectedCompetition(comp)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition border ${
                selectedCompetition === comp
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {comp === 'ALL' ? 'Tous les championnats' : comp}
            </button>
          ))}
        </div>
      </div>

      {/* Filtering & Sorting Controls Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5 shadow-md backdrop-blur-md space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          
          {/* Rechercher une équipe ou un joueur */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Search className="h-3 w-3 text-emerald-400" />
              <span>Rechercher club ou joueur</span>
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: PSG, Real Madrid, Dembélé..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* Jour du match */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3 text-emerald-400" />
              <span>Jour du match</span>
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
            >
              {daysOptions.map(d => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* % Victoire minimum */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                % Victoire Minimum
              </label>
              <span className="text-xs font-bold text-emerald-400">
                {minWinChance === 0 ? 'Sans min.' : `≥ ${minWinChance}%`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="75"
              step="5"
              value={minWinChance}
              onChange={(e) => setMinWinChance(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 mt-2.5"
            />
          </div>

          {/* Tri */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trier les matchs par</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
            >
              <option value="DATE_ASC">📅 Chronologie (Date/Heure)</option>
              <option value="WIN_DESC">📈 % Victoire le plus élevé</option>
              <option value="CS_DESC">🛡️ % Clean Sheet gardien / défense</option>
              <option value="XG_DESC">⚽ Espérance Buts (xG équipe)</option>
              <option value="DIFFICULTY_ASC">🟢 Difficulté (Faciles en premier)</option>
            </select>
          </div>

        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">
            {processedFixtures.length} match(s) correspondant(s)
          </span>
          {(searchQuery || selectedCompetition !== 'ALL' || selectedDay !== 'ALL' || minWinChance > 0) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCompetition('ALL');
                setSelectedDay('ALL');
                setMinWinChance(0);
              }}
              className="text-xs font-bold text-emerald-400 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      {/* Matchups List */}
      <div className="space-y-4">
        {processedFixtures.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <Calendar className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-bold text-white">Aucun match trouvé</p>
            <p className="text-xs text-slate-400 mt-1">Essayez d'assouplir vos critères de recherche ou de filtre de championnat.</p>
          </div>
        ) : (
          processedFixtures.map((fixture, idx) => {
            const fdr = getFDRBadge(fixture.difficulty);
            const winProb = fixture.winOdds > 1 ? Math.round((1 / fixture.winOdds) * 100) : Math.round(fixture.winOdds);
            const formattedDate = fixture.kickoffFormatted || formatKickoffDate(fixture.kickoffDate);

            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  
                  {/* Match Title & Info */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${fdr.color}`}>
                        {fdr.label}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {fixture.competition}
                      </span>
                      <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5 bg-slate-950 px-2.5 py-0.5 rounded-md border border-slate-800">
                        <Calendar className="h-3 w-3 text-emerald-400" />
                        <span>{formattedDate}</span>
                        {fixture.kickoffRelative && (
                          <span className="text-[10px] text-emerald-400 font-bold ml-1">
                            ({fixture.kickoffRelative})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-base font-black text-white">
                      <span className="text-emerald-400">{fixture.club}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {fixture.isHome ? 'Domicile 🏠' : 'Extérieur ✈️'}
                      </span>
                      <span className="text-slate-600 font-normal">vs</span>
                      <span className="text-slate-200">{fixture.opponent}</span>
                    </div>
                  </div>

                  {/* Odds & Metrics Bar */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
                    
                    {/* Win Odds */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Cote Victoire</span>
                      <span className="text-sm font-black text-emerald-400">{typeof fixture.winOdds === 'number' ? fixture.winOdds.toFixed(2) : fixture.winOdds}</span>
                      <span className="block text-[9px] text-emerald-300 font-semibold">{winProb}% chance</span>
                    </div>

                    {/* Clean Sheet */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Clean Sheet %</span>
                      <span className={`text-sm font-black ${fixture.cleanSheetProb >= 45 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {fixture.cleanSheetProb}%
                      </span>
                      <span className="block text-[9px] text-slate-500">Pour GK / DEF</span>
                    </div>

                    {/* Goal Expectancy */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Espérance Buts</span>
                      <span className="text-sm font-black text-purple-400">{fixture.goalExpectancy} xG</span>
                      <span className="block text-[9px] text-slate-500">Attaque équipe</span>
                    </div>

                    {/* 1N2 Odds */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">1 / N / 2</span>
                      <span className="text-xs font-bold text-slate-300">
                        {fixture.winOdds} / {fixture.drawOdds} / {fixture.lossOdds}
                      </span>
                      <span className="block text-[9px] text-slate-500">Marché 1N2</span>
                    </div>
                  </div>
                </div>

                {/* Players in User Gallery */}
                <div className="mt-4 border-t border-slate-800/60 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400">
                      {fixture.players.length} joueur{fixture.players.length > 1 ? 's' : ''} dans votre galerie Thib 8 :
                    </span>
                    <span className="text-[10px] text-slate-500">Cliquez pour voir la fiche détaillée</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2.5">
                    {fixture.players.map((p) => {
                      const pStyle = getPositionStyle(p.positionCode);
                      const breakdown = calculatePlayerProjectedScore(p, strategy);
                      const projected = breakdown.projectedScore;
                      const isStarter = p.status === 'STARTER';
                      const bonusPct = getCardTotalBonus(p);

                      return (
                        <button
                          key={p.id}
                          onClick={() => onOpenScout(p)}
                          className="flex items-center gap-2.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs text-slate-200 hover:bg-emerald-500/15 hover:border-emerald-500/50 border border-slate-800 transition shadow-sm group"
                        >
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-black border ${pStyle}`}>
                            {p.positionCode}
                          </span>
                          
                          <span className="font-bold group-hover:text-emerald-300 transition">
                            {p.displayName}
                          </span>

                          {/* Bonus badge */}
                          {bonusPct > 0 && (
                            <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 rounded shadow-sm" title={`Bonus de carte : +${bonusPct}%`}>
                              +{bonusPct}% bonus
                            </span>
                          )}

                          {/* Score Projeté Badge avec détail Base + Bonus */}
                          <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-bold px-2 py-0.5 rounded-md text-[11px] shadow-sm">
                            <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span className="text-slate-300 font-semibold" title="Score de base">{breakdown.baseProjectedScore} pts</span>
                            <span className="text-amber-300 font-bold" title={`Bonus de carte de +${breakdown.cardBonusPercentage}% (soit +${breakdown.cardBonusScore} pts)`}>+{breakdown.cardBonusPercentage}% (+{breakdown.cardBonusScore} pts)</span>
                            <span className="font-black text-emerald-300 bg-emerald-500/20 px-1 rounded" title="Total projeté (Base + Bonus)">= {projected} pts</span>
                          </div>

                          {/* L5 Score */}
                          <span className="text-[10px] text-slate-400 font-semibold">
                            L5: <strong className="text-slate-200">{p.scores?.l5 || 0}</strong>
                          </span>

                          {/* Starter indicator */}
                          {isStarter ? (
                            <span className="text-[9px] font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-1.5 py-0.5 rounded">
                              Titulaire
                            </span>
                          ) : (
                            <span className="text-[9px] font-medium text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                              {p.status === 'REGULAR' ? 'Rotation' : 'Rempl.'}
                            </span>
                          )}

                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-emerald-400 transition ml-0.5" />
                        </button>
                      );
                    })}
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
