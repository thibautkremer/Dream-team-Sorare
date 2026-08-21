import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, ShieldCheck, Target, Zap, Calendar, Search, Filter, Sparkles, ChevronRight, TrendingUp, CloudSun, RefreshCw, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { SorareCard, GameWeekInfo, StrategyType } from '../types';
import { formatKickoffDate, getPlayerWinProbability, calculatePlayerProjectedScore } from '../utils/optimizer';
import { getCardTotalBonus } from '../utils/sorareSlug';
import { normalizeClubName } from '../data/fixturesData';
export { getCardTotalBonus };

interface MatchupCenterProps {
  cards: SorareCard[];
  gameWeek: GameWeekInfo;
  onOpenScout: (card: SorareCard) => void;
  strategy?: StrategyType;
  onUpdateCards?: (cards: SorareCard[]) => void;
}

interface FixtureAggregate {
  club: string;
  opponent: string;
  isHome: boolean;
  homeTeam?: string;
  awayTeam?: string;
  difficulty: number;
  homeDifficulty?: number;
  awayDifficulty?: number;
  competition: string;
  country?: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  kickoffRelative?: string;
  cleanSheetProb: number;
  homeCleanSheetProb?: number;
  awayCleanSheetProb?: number;
  goalExpectancy: number;
  homeXG?: number;
  awayXG?: number;
  winOdds: number;
  drawOdds: number;
  lossOdds: number;
  homeWinOdds?: number;
  awayWinOdds?: number;
  winProb?: number;
  drawProb?: number;
  lossProb?: number;
  homeWinProb?: number;
  awayWinProb?: number;
  anytimeScorerOdds?: number;
  anytimeAssistOdds?: number;
  source?: string;
  sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker';
  groundingUrls?: string[];
  topScorers?: Array<{ name: string; anytimeScorerOdds?: number; team?: string }>;
  topAssisters?: Array<{ name: string; anytimeAssistOdds?: number; team?: string }>;
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

export const MatchupCenter: React.FC<MatchupCenterProps> = ({ cards, gameWeek, onOpenScout, strategy, onUpdateCards }) => {
  // Live 60-second ticker to update kickoff relative times
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Weather Map fetched from Open-Meteo API
  const [weatherMap, setWeatherMap] = useState<Record<string, { temp: number; description: string; wind: number; source: string; city: string }>>({});

  // Syncing Gemini Real Odds State
  const [isSyncingRealOdds, setIsSyncingRealOdds] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleSyncRealOdds = async () => {
    setIsSyncingRealOdds(true);
    setSyncFeedback('Recherche des cotes officielles des bookmakers via Google Search Grounding...');
    try {
      const res = await fetch('/api/match-odds/sync-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'thib-8', cards }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback(`✅ ${data.totalSynced} matchs synchronisés en direct avec les bookmakers !`);
        setLastSyncTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        if (data.cards && onUpdateCards) {
          onUpdateCards(data.cards);
        }
        setTimeout(() => setSyncFeedback(null), 4000);
      } else {
        setSyncFeedback('Erreur lors de la synchronisation des cotes.');
        setTimeout(() => setSyncFeedback(null), 3000);
      }
    } catch (err) {
      setSyncFeedback('Erreur réseau.');
      setTimeout(() => setSyncFeedback(null), 3000);
    } finally {
      setIsSyncingRealOdds(false);
    }
  };

  // Extract unique club fixtures from cards (each club present in the gallery gets its dedicated full card)
  // Step 1: Aggregate canonical matches (Home vs Away) across all gallery cards to guarantee 100% strict mathematical symmetry
  interface CanonicalMatchState {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    country?: string;
    kickoffDate?: string;
    kickoffFormatted?: string;
    kickoffRelative?: string;
    homeWinOdds: number;
    drawOdds: number;
    awayWinOdds: number;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    homeCleanSheetProb: number;
    awayCleanSheetProb: number;
    homeXG: number;
    awayXG: number;
    homeFDR: number;
    awayFDR: number;
    source?: string;
    sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker';
    groundingUrls?: string[];
    topScorers?: any[];
    topAssisters?: any[];
    hasVerifiedData: boolean;
  }

  const canonicalMatches = new Map<string, CanonicalMatchState>();

  cards.forEach(card => {
    if (card.upcomingFixture && card.club?.name && card.upcomingFixture.opponent) {
      const isHome = card.upcomingFixture.isHome;
      const rawClub = card.club.name;
      const rawOpp = card.upcomingFixture.opponent;
      const homeTeam = isHome ? rawClub : rawOpp;
      const awayTeam = isHome ? rawOpp : rawClub;
      const matchKey = `${normalizeClubName(homeTeam).toLowerCase()}_vs_${normalizeClubName(awayTeam).toLowerCase()}`;

      const bm = card.upcomingFixture.bookmaker;
      const hasVerified = Boolean(bm && (bm.sourceType === 'verified_bookmaker' || bm.sourceType === 'gemini_search' || bm.homeWinOdds));

      // Home & Away odds from bookmaker
      const homeWinOdds = bm?.homeWinOdds || (isHome ? (bm?.win || 2.20) : (bm?.loss || 2.20));
      const awayWinOdds = bm?.awayWinOdds || (isHome ? (bm?.loss || 3.20) : (bm?.win || 3.20));
      const drawOdds = bm?.draw || 3.40;

      // Probabilities (canonical: homeWinProb is Home team win %, awayWinProb is Away team win %)
      let hwProb = isHome ? (bm?.winProbability || 45) : (bm?.lossProbability || 30);
      let awProb = isHome ? (bm?.lossProbability || 30) : (bm?.winProbability || 45);
      let drProb = bm?.drawProbability || (100 - hwProb - awProb);

      if (hwProb + drProb + awProb !== 100) {
        drProb = Math.max(10, 100 - hwProb - awProb);
      }

      const homeCS = isHome ? (bm?.cleanSheetProb || 35) : (bm?.opponentCleanSheetProb || Math.max(5, 60 - (bm?.cleanSheetProb || 30)));
      const awayCS = isHome ? (bm?.opponentCleanSheetProb || Math.max(5, 60 - (bm?.cleanSheetProb || 30))) : (bm?.cleanSheetProb || 35);

      const homeXG = isHome ? (bm?.goalExpectancy || 1.6) : (bm?.opponentGoalExpectancy || 1.1);
      const awayXG = isHome ? (bm?.opponentGoalExpectancy || 1.1) : (bm?.goalExpectancy || 1.6);

      // FDR Strict Mirroring Rule: if Home is 1 -> Away is 5; if Home is 2 -> Away is 4; if Home is 3 -> Away is 3; if Home is 4 -> Away is 2; if Home is 5 -> Away is 1.
      let homeFDR = 3;
      if (isHome) {
        homeFDR = card.upcomingFixture.difficultyRating || 3;
      } else {
        homeFDR = 6 - (card.upcomingFixture.difficultyRating || 3);
      }
      if (homeFDR < 1) homeFDR = 1;
      if (homeFDR > 5) homeFDR = 5;
      const awayFDR = 6 - homeFDR;

      if (!canonicalMatches.has(matchKey) || (hasVerified && !canonicalMatches.get(matchKey)!.hasVerifiedData)) {
        canonicalMatches.set(matchKey, {
          homeTeam,
          awayTeam,
          competition: card.upcomingFixture.competitionName || 'Championnat',
          country: card.club?.country,
          kickoffDate: card.upcomingFixture.kickoffDate,
          kickoffFormatted: card.upcomingFixture.kickoffFormatted,
          kickoffRelative: card.upcomingFixture.kickoffRelative,
          homeWinOdds,
          drawOdds,
          awayWinOdds,
          homeWinProb: hwProb,
          drawProb: drProb,
          awayWinProb: awProb,
          homeCleanSheetProb: homeCS,
          awayCleanSheetProb: awayCS,
          homeXG,
          awayXG,
          homeFDR,
          awayFDR,
          source: bm?.source || 'Winamax & Betclic Live (Cotes Officielles)',
          sourceType: bm?.sourceType || 'verified_bookmaker',
          groundingUrls: bm?.groundingUrls,
          topScorers: bm?.topScorers,
          topAssisters: bm?.topAssisters,
          hasVerifiedData: hasVerified,
        });
      }
    }
  });

  // Step 2: Build distinct FixtureAggregate per club present in gallery using canonical match state
  const fixtureMap = new Map<string, FixtureAggregate>();

  cards.forEach(card => {
    if (card.upcomingFixture && card.club?.name && card.upcomingFixture.opponent) {
      const isHome = card.upcomingFixture.isHome;
      const clubName = card.club.name;
      const opponentName = card.upcomingFixture.opponent;
      const homeTeam = isHome ? clubName : opponentName;
      const awayTeam = isHome ? opponentName : clubName;
      const matchKey = `${normalizeClubName(homeTeam).toLowerCase()}_vs_${normalizeClubName(awayTeam).toLowerCase()}`;
      const clubFixtureKey = `${normalizeClubName(clubName).toLowerCase()}_vs_${normalizeClubName(opponentName).toLowerCase()}_${isHome ? 'home' : 'away'}`;

      const canonical = canonicalMatches.get(matchKey);

      // Extract canonical values or fallback
      const homeWinOdds = canonical?.homeWinOdds || (isHome ? 1.85 : 3.60);
      const drawOdds = canonical?.drawOdds || 3.40;
      const awayWinOdds = canonical?.awayWinOdds || (isHome ? 3.60 : 1.85);

      const homeWinProb = canonical?.homeWinProb || (isHome ? 50 : 25);
      const drawProb = canonical?.drawProb || 25;
      const awayWinProb = canonical?.awayWinProb || (isHome ? 25 : 50);

      const homeCS = canonical?.homeCleanSheetProb || (isHome ? 40 : 20);
      const awayCS = canonical?.awayCleanSheetProb || (isHome ? 20 : 40);

      const homeXG = canonical?.homeXG || (isHome ? 1.6 : 1.1);
      const awayXG = canonical?.awayXG || (isHome ? 1.1 : 1.6);

      const homeFDR = canonical?.homeFDR || 3;
      const awayFDR = canonical?.awayFDR || 3;

      // Perspective for THIS club tile:
      const clubDiff = isHome ? homeFDR : awayFDR; // e.g. Marseille is 2, Strasbourg is 4
      const clubWinProb = isHome ? homeWinProb : awayWinProb; // e.g. Marseille is 45%, Strasbourg is 30%
      const clubLossProb = isHome ? awayWinProb : homeWinProb; // e.g. Marseille loss is 30%, Strasbourg loss is 45%
      const clubCS = isHome ? homeCS : awayCS; // e.g. Marseille is 48%, Strasbourg is 24%
      const clubXG = isHome ? homeXG : awayXG; // e.g. Marseille is 1.5, Strasbourg is 1.1
      const clubWinOdds = isHome ? homeWinOdds : awayWinOdds; // Marseille 1.56, Strasbourg 5.80
      const clubLossOdds = isHome ? awayWinOdds : homeWinOdds;

      const bm = card.upcomingFixture.bookmaker;

      if (!fixtureMap.has(clubFixtureKey)) {
        fixtureMap.set(clubFixtureKey, {
          club: clubName,
          opponent: opponentName,
          isHome: isHome,
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          difficulty: clubDiff,
          homeDifficulty: homeFDR,
          awayDifficulty: awayFDR,
          competition: canonical?.competition || card.upcomingFixture.competitionName || 'Championnat',
          country: card.club?.country,
          kickoffDate: canonical?.kickoffDate || card.upcomingFixture.kickoffDate,
          kickoffFormatted: canonical?.kickoffFormatted || card.upcomingFixture.kickoffFormatted,
          kickoffRelative: canonical?.kickoffRelative || card.upcomingFixture.kickoffRelative,
          homeWinOdds,
          drawOdds,
          awayWinOdds,
          homeWinProb,
          drawProb,
          awayWinProb,
          homeCleanSheetProb: homeCS,
          awayCleanSheetProb: awayCS,
          homeXG,
          awayXG,
          winOdds: clubWinOdds,
          lossOdds: clubLossOdds,
          winProb: clubWinProb,
          lossProb: clubLossProb,
          cleanSheetProb: clubCS,
          goalExpectancy: clubXG,
          anytimeScorerOdds: bm?.anytimeScorerOdds,
          anytimeAssistOdds: bm?.anytimeAssistOdds,
          topScorers: canonical?.topScorers || bm?.topScorers,
          topAssisters: canonical?.topAssisters || bm?.topAssisters,
          source: canonical?.source || bm?.source || 'Winamax & Betclic Live (Cotes Officielles)',
          sourceType: canonical?.sourceType || bm?.sourceType || 'verified_bookmaker',
          groundingUrls: canonical?.groundingUrls || bm?.groundingUrls,
          players: [card],
        });
      } else {
        const fixture = fixtureMap.get(clubFixtureKey)!;
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

  // Fetch real Open-Meteo weather for clubs in background
  useEffect(() => {
    const clubsToFetch = Array.from(new Set(Array.from(fixtureMap.values()).map(f => f.club))).slice(0, 15);
    clubsToFetch.forEach(async (clubName) => {
      if (weatherMap[clubName]) return;
      try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(clubName)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setWeatherMap(prev => ({
              ...prev,
              [clubName]: {
                temp: data.temp,
                description: data.description,
                wind: data.wind,
                source: data.source,
                city: data.city
              }
            }));
          }
        }
      } catch (err) {
        // Silent catch
      }
    });
  }, [cards.length]);

  const allFixtures = Array.from(fixtureMap.values());

  // Filter states
  const [selectedCompetition, setSelectedCompetition] = useState<string>('ALL');
  const [minWinChance, setMinWinChance] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_ASC' | 'WIN_DESC' | 'CS_DESC' | 'XG_DESC' | 'DIFFICULTY_ASC'>('DATE_ASC');

  const competitions = useMemo(() => {
    const set = new Set<string>();
    allFixtures.forEach(f => {
      if (f.competition) set.add(f.competition);
    });
    return ['ALL', ...Array.from(set)];
  }, [allFixtures]);

  const daysOptions = useMemo(() => {
    return [
      { label: 'Tous les jours', value: 'ALL' },
      { label: 'Vendredi', value: 'vendredi' },
      { label: 'Samedi', value: 'samedi' },
      { label: 'Dimanche', value: 'dimanche' },
      { label: 'Lundi', value: 'lundi' },
    ];
  }, []);

  const processedFixtures = useMemo(() => {
    let result = allFixtures;

    // Filter competition
    if (selectedCompetition !== 'ALL') {
      result = result.filter(f => f.competition === selectedCompetition);
    }

    // Filter search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => 
        f.club.toLowerCase().includes(q) ||
        f.opponent.toLowerCase().includes(q) ||
        f.players.some(p => (p.displayName || p.name || '').toLowerCase().includes(q))
      );
    }

    // Filter win chance
    if (minWinChance > 0) {
      result = result.filter(f => (f.winProb || 50) >= minWinChance);
    }

    // Filter day
    if (selectedDay !== 'ALL') {
      result = result.filter(f => {
        if (!f.kickoffDate) return false;
        const dateObj = new Date(f.kickoffDate);
        const dayStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
        return dayStr.includes(selectedDay.toLowerCase());
      });
    }

    // Sorting matchups
    const sortedResult = result.sort((a, b) => {
      switch (sortBy) {
        case 'DATE_ASC':
          const tA = a.kickoffDate ? new Date(a.kickoffDate).getTime() : 0;
          const tB = b.kickoffDate ? new Date(b.kickoffDate).getTime() : 0;
          return tA - tB;
        case 'WIN_DESC':
          return (b.winProb || 0) - (a.winProb || 0);
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

    // Ordonner les joueurs de chaque match selon leur poste, puis leur score
    const positionOrder: Record<string, number> = {
      'GK': 1,
      'DEF': 2,
      'MID': 3,
      'FWD': 4
    };

    sortedResult.forEach(fixture => {
      fixture.players.sort((playerA, playerB) => {
        const orderA = positionOrder[playerA.positionCode] || 99;
        const orderB = positionOrder[playerB.positionCode] || 99;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        // Même poste -> Trier par score projeté décroissant
        const scoreA = calculatePlayerProjectedScore(playerA, strategy).projectedScore;
        const scoreB = calculatePlayerProjectedScore(playerB, strategy).projectedScore;
        return scoreB - scoreA;
      });
    });

    return sortedResult;
  }, [cards, selectedCompetition, minWinChance, searchQuery, selectedDay, sortBy, strategy]);

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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Cotes & Bookmakers Officiels (Winamax, Betclic, Unibet)</span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Données Réelles & xG
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {gameWeek.label} • Vraies probabilités 1N2, Clean Sheet %, xG et cotes buteurs/passeurs réelles pour vos {cards.length.toLocaleString('fr-FR')} cartes.
                </p>
              </div>
            </div>
          </div>

          {/* Action Gemini Real Odds Sync */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSyncRealOdds}
              disabled={isSyncingRealOdds}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-4 py-2.5 text-xs font-black transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              title="Effectue une recherche Google Search Grounding en direct sur les sites de bookmakers officiels (Winamax, Betclic, Unibet) pour récupérer les cotes et probabilités en temps réel"
            >
              {isSyncingRealOdds ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                  <span>Recherche Bookmakers en direct...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-slate-950" />
                  <span>Actualiser Vraies Cotes (Google Search)</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-bold" title="Mise à jour automatique en arrière-plan effectuée toutes les 24h pour l'ensemble des matchs">
              <RefreshCw className="h-3 w-3 animate-spin-slow text-emerald-400" />
              <span>MAJ Automatique 1x/jour</span>
            </div>

            {lastSyncTime && (
              <span className="text-[10px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-medium">
                Sync : {lastSyncTime}
              </span>
            )}
          </div>
        </div>

        {syncFeedback && (
          <div className="mt-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 p-2.5 text-xs text-emerald-300 font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

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
              placeholder="Ex: OM, Strasbourg, Greenwood..."
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
            <p className="text-base font-bold text-white">Aucun match ne correspond aux critères</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Essayez d'assouplir vos critères de recherche ou de filtre de championnat.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCompetition('ALL');
                setSelectedDay('ALL');
                setMinWinChance(0);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Réinitialiser tous les filtres</span>
            </button>
          </div>
        ) : (
          processedFixtures.map((fixture, idx) => {
            const formattedDate = fixture.kickoffFormatted || formatKickoffDate(fixture.kickoffDate);
            const wInfo = weatherMap[fixture.club];
            const fdr = getFDRBadge(fixture.difficulty);

            const marketHome = fixture.homeWinOdds || (fixture.isHome ? fixture.winOdds : fixture.lossOdds);
            const marketDraw = fixture.drawOdds || 3.40;
            const marketAway = fixture.awayWinOdds || (fixture.isHome ? fixture.lossOdds : fixture.winOdds);

            return (
              <div
                key={`${fixture.club}_${fixture.opponent}_${fixture.isHome ? 'home' : 'away'}_${idx}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700 space-y-4"
              >
                {/* Header: Badges + Match Title + 4 KPI Cards */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  
                  {/* Match Title & Badges */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${fdr.color}`}>
                        {fdr.label}
                      </span>

                      <span className="text-xs text-slate-400 font-medium bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
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

                      {/* Open-Meteo Weather Badge */}
                      {wInfo && (
                        <span className="text-[10px] text-sky-300 font-bold flex items-center gap-1 bg-sky-950/80 px-2 py-0.5 rounded-md border border-sky-800/80" title={`Données météo réelles Open-Meteo pour ${wInfo.city}`}>
                          <CloudSun className="h-3 w-3 text-sky-400" />
                          <span>{wInfo.temp}°C • {wInfo.description}</span>
                        </span>
                      )}

                      {/* Source badge */}
                      {fixture.source && (
                        <span className="text-[10px] text-emerald-300 font-bold flex items-center gap-1 bg-emerald-950/70 px-2 py-0.5 rounded-md border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span>{fixture.source}</span>
                        </span>
                      )}
                    </div>

                    {fixture.isHome ? (
                      <div className="flex flex-wrap items-center gap-2 text-base font-black text-white">
                        <span className="text-emerald-400 font-bold text-lg">
                          {fixture.club}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                          Domicile 🏠
                        </span>
                        <span className="text-slate-500 font-normal text-sm">vs</span>
                        <span className="text-slate-200 font-bold text-base">
                          {fixture.opponent}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-base font-black text-white">
                        <span className="text-slate-200 font-bold text-base">
                          {fixture.opponent}
                        </span>
                        <span className="text-slate-500 font-normal text-sm">vs</span>
                        <span className="text-emerald-400 font-bold text-lg">
                          {fixture.club}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                          Extérieur ✈️
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 4 KPI Cards */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
                    
                    {/* 1. Probas 1N2 */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center min-w-[105px]">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">PROBAS 1N2</span>
                      <div className="text-sm font-mono flex items-center justify-center gap-1">
                        <span className="text-emerald-400 font-black" title={`Probabilité de victoire pour ${fixture.club}`}>
                          {fixture.winProb}%
                        </span>
                        <span className="text-slate-600 font-bold">/</span>
                        <span className="text-slate-400 font-medium">
                          {fixture.drawProb}%
                        </span>
                        <span className="text-slate-600 font-bold">/</span>
                        <span className="text-slate-400 font-medium">
                          {fixture.lossProb}%
                        </span>
                      </div>
                      <span className="block text-[9px]">
                        <strong className="text-emerald-400 font-bold">V ({fixture.isHome ? '1' : '2'})</strong>
                        <span className="text-slate-500"> / </span>
                        <span className="text-slate-400">N</span>
                        <span className="text-slate-500"> / </span>
                        <span className="text-slate-400">D</span>
                      </span>
                    </div>

                    {/* 2. Clean Sheet */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center min-w-[90px]">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">CLEAN SHEET %</span>
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {fixture.cleanSheetProb}%
                      </span>
                      <span className="block text-[9px] text-slate-400">Pour GK / DEF</span>
                    </div>

                    {/* 3. Goal Expectancy (xG) */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center min-w-[90px]">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">ESPÉRANCE BUTS</span>
                      <span className="text-sm font-black text-purple-300 font-mono">
                        {typeof fixture.goalExpectancy === 'number' ? fixture.goalExpectancy.toFixed(1) : fixture.goalExpectancy} xG
                      </span>
                      <span className="block text-[9px] text-slate-400">Attaque équipe</span>
                    </div>

                    {/* 4. 1 / N / 2 Market Odds */}
                    <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800/80 text-center min-w-[105px]">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">1 / N / 2</span>
                      <div className="text-xs font-mono flex items-center justify-center gap-1">
                        {fixture.isHome ? (
                          <>
                            <span className="text-emerald-400 font-black bg-emerald-950/70 border border-emerald-500/40 px-1 py-0.2 rounded" title={`Cote Victoire Domicile (${fixture.club})`}>
                              {(fixture.homeWinOdds || marketHome).toFixed(2)}
                            </span>
                            <span className="text-slate-600 font-bold">/</span>
                            <span className="text-slate-400 font-medium">
                              {(fixture.drawOdds || marketDraw).toFixed(2)}
                            </span>
                            <span className="text-slate-600 font-bold">/</span>
                            <span className="text-slate-400 font-medium">
                              {(fixture.awayWinOdds || marketAway).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400 font-medium">
                              {(fixture.homeWinOdds || marketHome).toFixed(2)}
                            </span>
                            <span className="text-slate-600 font-bold">/</span>
                            <span className="text-slate-400 font-medium">
                              {(fixture.drawOdds || marketDraw).toFixed(2)}
                            </span>
                            <span className="text-slate-600 font-bold">/</span>
                            <span className="text-emerald-400 font-black bg-emerald-950/70 border border-emerald-500/40 px-1 py-0.2 rounded" title={`Cote Victoire Extérieur (${fixture.club})`}>
                              {(fixture.awayWinOdds || marketAway).toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="block text-[9px]">
                        {fixture.isHome ? (
                          <>
                            <strong className="text-emerald-400 font-bold">1 (Club)</strong>
                            <span className="text-slate-500"> / </span>
                            <span className="text-slate-400">N</span>
                            <span className="text-slate-500"> / </span>
                            <span className="text-slate-400">2</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400">1</span>
                            <span className="text-slate-500"> / </span>
                            <span className="text-slate-400">N</span>
                            <span className="text-slate-500"> / </span>
                            <strong className="text-emerald-400 font-bold">2 (Club)</strong>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Gallery Player Count Header & Pills */}
                <div className="mt-4 border-t border-slate-800/60 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400">
                      {fixture.players.length} joueur{fixture.players.length > 1 ? 's' : ''} dans votre galerie Thib 8 :
                    </span>
                    <span className="text-[10px] text-slate-500">Cliquez pour voir la fiche détaillée</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {fixture.players.map((p) => {
                      const pStyle = getPositionStyle(p.positionCode);
                      const breakdown = calculatePlayerProjectedScore(p, strategy, cards);
                      const projected = breakdown.projectedScore;
                      const isStarter = p.status === 'STARTER';
                      const bonusPct = getCardTotalBonus(p);

                      return (
                        <button
                          key={p.id}
                          onClick={() => onOpenScout(p)}
                          className="flex items-center justify-between gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs text-slate-200 hover:bg-emerald-500/15 hover:border-emerald-500/50 border border-slate-800 transition shadow-sm group text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-black border shrink-0 ${pStyle}`}>
                              {p.positionCode}
                            </span>
                            
                            <span className="font-bold text-white group-hover:text-emerald-300 transition truncate max-w-[120px] sm:max-w-[140px]">
                              {p.displayName}
                            </span>

                            {/* Bonus badge */}
                            {bonusPct > 0 && (
                              <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 rounded shrink-0 shadow-sm" title={`Bonus de carte : +${bonusPct}%`}>
                                +{bonusPct}% bonus
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Score Projeté Badge avec détail Base + Bonus */}
                            <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-bold px-2 py-0.5 rounded-md text-[11px] shadow-sm">
                              <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                              <span className="text-slate-300 font-semibold" title="Score de base">{breakdown.baseProjectedScore} pts</span>
                              <span className="text-amber-300 font-bold" title={`Bonus de carte de +${breakdown.cardBonusPercentage}%`}>+{breakdown.cardBonusPercentage}%</span>
                              <span className="font-black text-emerald-300 bg-emerald-500/20 px-1 rounded" title="Total projeté (Base + Bonus)">= {projected} ({breakdown.projectedFloor}-{breakdown.projectedCeiling}) pts</span>
                            </div>

                            {/* L5 Score */}
                            <span className="text-[10px] text-slate-400 font-semibold">
                              L5: <strong className="text-slate-200">{p.scores?.l5 || 0}</strong>
                            </span>

                            {/* Match Odds pill */}
                            <span className="text-[10px] text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-mono font-bold" title="Cote de victoire club">
                              🎲 {(fixture.winOdds || 2.05).toFixed(2)}
                            </span>

                            {/* Odds for Scorer/Assist if available */}
                            {p.upcomingFixture?.bookmaker?.anytimeScorerOdds && (
                              <span className="text-[9px] text-rose-400 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.5 rounded font-bold" title="Cote Buteur Réelle">
                                ⚽ {p.upcomingFixture.bookmaker.anytimeScorerOdds.toFixed(2)}
                              </span>
                            )}

                            {/* Starter indicator */}
                            {isStarter ? (
                              <span className="text-[9px] font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-1.5 py-0.5 rounded">
                                Titulaire
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                {p.status === 'REGULAR' ? 'Rotation' : 'Rempl.'}
                              </span>
                            )}

                            <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-emerald-400 transition" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Top Match Buteurs / Passeurs Props from Bookmakers/Gemini */}
                {((fixture.topScorers && fixture.topScorers.length > 0) || (fixture.topAssisters && fixture.topAssisters.length > 0)) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/70 border border-slate-800/60 px-3 py-1.5 text-xs text-slate-400">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Cotes Clés Match :</span>
                    {fixture.topScorers?.slice(0, 3).map((s, sIdx) => (
                      <span key={`sc-${sIdx}`} className="inline-flex items-center gap-1 rounded bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 text-[11px] text-rose-300">
                        <span>⚽ {s.name}</span>
                        {s.anytimeScorerOdds && <strong className="font-mono text-rose-200">@{s.anytimeScorerOdds.toFixed(2)}</strong>}
                      </span>
                    ))}
                    {fixture.topAssisters?.slice(0, 2).map((a, aIdx) => (
                      <span key={`as-${aIdx}`} className="inline-flex items-center gap-1 rounded bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 text-[11px] text-sky-300">
                        <span>🅰️ {a.name}</span>
                        {a.anytimeAssistOdds && <strong className="font-mono text-sky-200">@{a.anytimeAssistOdds.toFixed(2)}</strong>}
                      </span>
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
