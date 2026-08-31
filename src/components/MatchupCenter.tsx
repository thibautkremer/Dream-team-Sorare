import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, ShieldCheck, Target, Zap, Calendar, Search, Filter, Sparkles, ChevronRight, TrendingUp, CloudSun, RefreshCw, CheckCircle2, Loader2, ExternalLink, AlertTriangle, Clock, Layers, Flame, Shield, HelpCircle, ArrowUpDown, ArrowRightLeft } from 'lucide-react';
import { SorareCard, GameWeekInfo, StrategyType } from '../types';
import { formatKickoffDate, getPlayerWinProbability, calculatePlayerProjectedScore } from '../utils/optimizer';
import { getCardTotalBonus } from '../utils/sorareSlug';
import { normalizeClubName } from '../data/fixturesData';
import { StorageService } from '../utils/storage';
import { ApiFootballMatchModal } from './ApiFootballMatchModal';
import { MatchOpportunitiesBar, StackingClubItem, ConflictMatchItem } from './matchups/MatchOpportunitiesBar';
import { MatchTimelineView } from './matchups/MatchTimelineView';
import { MatchH2HComparatorModal } from './matchups/MatchH2HComparatorModal';
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
  sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker' | 'estimated_mirror';
  groundingUrls?: string[];
  topScorers?: Array<{ name: string; anytimeScorerOdds?: number; team?: string }>;
  topAssisters?: Array<{ name: string; anytimeAssistOdds?: number; team?: string }>;
  hasVerifiedData?: boolean;
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
  // Deep dive API Football modal
  const [selectedMatchForModal, setSelectedMatchForModal] = useState<{
    homeTeam: string;
    awayTeam: string;
    competition?: string;
    kickoffDate?: string;
    players: SorareCard[];
  } | null>(null);

  // H2H Comparator Modal State
  const [isH2HModalOpen, setIsH2HModalOpen] = useState(false);
  const [h2hInitialMatchA, setH2hInitialMatchA] = useState<string | undefined>(undefined);
  const [h2hInitialMatchB, setH2hInitialMatchB] = useState<string | undefined>(undefined);

  const handleSyncRealOdds = async () => {
    setIsSyncingRealOdds(true);
    setSyncFeedback('Recherche des cotes officielles des bookmakers via API-Football...');
    try {
      const appToken = StorageService.getAppToken();
      const currentSlug = StorageService.getUsername() || 'thib-8';
      const res = await fetch('/api/match-odds/sync-gemini', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(appToken ? { 'x-app-token': appToken } : {})
        },
        body: JSON.stringify({ slug: currentSlug, cards }),
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
    sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker' | 'estimated_mirror';
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
      // Only genuinely-sourced data counts as "verified". 'estimated_mirror' (our own local
      // formula fallback) and the mere presence of homeWinOdds (set even for estimates) must
      // NOT be treated as verified, or estimated odds silently masquerade as real ones.
      const hasVerified = Boolean(bm && (bm.sourceType === 'verified_bookmaker' || bm.sourceType === 'gemini_search' || bm.sourceType === 'odds_api'));

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
          source: bm?.source || 'Estimation interne (aucune source bookmaker réelle)',
          sourceType: bm?.sourceType || 'estimated_mirror',
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
          // AUDIT FIX: this fallback used to unconditionally claim 'Winamax & Betclic Live (Cotes
          // Officielles)' even when no real bookmaker data exists at all (sourceType already
          // correctly defaults to 'estimated_mirror' just below — this human-readable string must
          // match that honesty).
          source: canonical?.source || bm?.source || 'Estimation interne (aucune source bookmaker réelle)',
          sourceType: canonical?.sourceType || bm?.sourceType || 'estimated_mirror',
          groundingUrls: canonical?.groundingUrls || bm?.groundingUrls,
          // Carried through so the UI can render an honest "Estimation" vs "Vérifié" badge
          // instead of always showing the same green "verified" checkmark regardless of source.
          hasVerifiedData: canonical?.hasVerifiedData ?? Boolean(bm && (bm.sourceType === 'verified_bookmaker' || bm.sourceType === 'gemini_search' || bm.sourceType === 'odds_api')),
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

  // View & Advanced Filter states
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [profileFilter, setProfileFilter] = useState<'ALL' | 'CLEAN_SHEET' | 'HIGH_XG' | 'BIG_FAVORITE' | 'MY_PLAYERS' | 'STACKING' | 'CONFLICTS' | 'DROPPING_ODDS' | 'WEATHER_EXTREME'>('ALL');
  const [expandedSimulatorMatchKey, setExpandedSimulatorMatchKey] = useState<string | null>(null);

  const [selectedCompetition, setSelectedCompetition] = useState<string>('ALL');
  const [minWinChance, setMinWinChance] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_ASC' | 'WIN_DESC' | 'CS_DESC' | 'XG_DESC' | 'DIFFICULTY_ASC'>('DATE_ASC');

  // Top Opportunities calculations
  const topCleanSheets = useMemo(() => {
    return allFixtures
      .map(f => {
        const gkDefs = f.players.filter(p => p.positionCode === 'GK' || p.positionCode === 'DEF');
        const csProb = f.cleanSheetProb || 30;
        const csOdds = csProb > 0 ? parseFloat((1.075 / (csProb / 100)).toFixed(2)) : 3.50;
        return {
          club: f.club,
          opponent: f.opponent,
          isHome: f.isHome,
          csProb,
          csOdds,
          gkDefCount: gkDefs.length,
          competition: f.competition,
        };
      })
      .sort((a, b) => b.csProb - a.csProb)
      .slice(0, 6);
  }, [allFixtures]);

  const topOffensiveMatches = useMemo(() => {
    const seenMatches = new Set<string>();
    const list: any[] = [];
    allFixtures.forEach(f => {
      const mKey = `${normalizeClubName(f.homeTeam || f.club).toLowerCase()}_vs_${normalizeClubName(f.awayTeam || f.opponent).toLowerCase()}`;
      if (seenMatches.has(mKey)) return;
      seenMatches.add(mKey);

      const hXg = f.homeXG || (f.isHome ? f.goalExpectancy : 1.2);
      const aXg = f.awayXG || (!f.isHome ? f.goalExpectancy : 1.1);
      const totalXG = parseFloat(String(hXg)) + parseFloat(String(aXg));
      const bttsProb = Math.min(85, Math.max(30, Math.round((Math.min(hXg, aXg) / 1.5) * 50 + 25)));
      const fwdMid = f.players.filter(p => p.positionCode === 'MID' || p.positionCode === 'FWD');

      list.push({
        matchLabel: `${f.homeTeam || f.club} vs ${f.awayTeam || f.opponent}`,
        homeTeam: f.homeTeam || f.club,
        awayTeam: f.awayTeam || f.opponent,
        totalXG,
        bttsProb,
        fwdMidCount: fwdMid.length,
        competition: f.competition,
      });
    });
    return list.sort((a, b) => b.totalXG - a.totalXG).slice(0, 6);
  }, [allFixtures]);

  const topValuePlayers = useMemo(() => {
    return cards
      .filter(c => c.upcomingFixture && c.club?.name)
      .map(c => {
        const breakdown = calculatePlayerProjectedScore(c, strategy, cards);
        const winProb = c.upcomingFixture ? getPlayerWinProbability(c.upcomingFixture) : 50;
        const bonusPct = getCardTotalBonus(c);
        const scorerOdds = c.upcomingFixture?.bookmaker?.anytimeScorerOdds;
        return {
          card: c,
          projectedScore: breakdown.projectedScore,
          winProb,
          scorerOdds,
          bonusPct,
        };
      })
      .sort((a, b) => b.projectedScore - a.projectedScore)
      .slice(0, 6);
  }, [cards, strategy]);

  // Stacking Clubs Computation
  const stackingClubs: StackingClubItem[] = useMemo(() => {
    return allFixtures
      .filter(f => f.players.length >= 2 && (f.winProb || 0) >= 40)
      .map(f => {
        const gkDefs = f.players.filter(p => p.positionCode === 'GK' || p.positionCode === 'DEF');
        const fwdMids = f.players.filter(p => p.positionCode === 'MID' || p.positionCode === 'FWD');
        let stackType: 'DEFENSIVE' | 'OFFENSIVE' | 'BALANCED' = 'BALANCED';
        if (gkDefs.length >= 2) stackType = 'DEFENSIVE';
        else if (fwdMids.length >= 2) stackType = 'OFFENSIVE';
        return {
          club: f.club,
          opponent: f.opponent,
          isHome: f.isHome,
          cardCount: f.players.length,
          gkDefCount: gkDefs.length,
          fwdMidCount: fwdMids.length,
          csProb: f.cleanSheetProb || 30,
          winProb: f.winProb || 50,
          stackType,
        };
      })
      .sort((a, b) => b.cardCount - a.cardCount || b.winProb - a.winProb);
  }, [allFixtures]);

  // Gallery Conflicts Computation
  const conflicts: ConflictMatchItem[] = useMemo(() => {
    const seenPairs = new Set<string>();
    const conflictList: ConflictMatchItem[] = [];

    allFixtures.forEach(f => {
      const homeName = f.homeTeam || (f.isHome ? f.club : f.opponent);
      const awayName = f.awayTeam || (!f.isHome ? f.club : f.opponent);
      const pairKey = [homeName, awayName].sort().join('__');
      if (seenPairs.has(pairKey)) return;
      seenPairs.add(pairKey);

      const homePlayers = cards.filter(c => {
        const club = normalizeClubName(c.club?.name || '');
        return club.toLowerCase() === normalizeClubName(homeName).toLowerCase();
      });
      const awayPlayers = cards.filter(c => {
        const club = normalizeClubName(c.club?.name || '');
        return club.toLowerCase() === normalizeClubName(awayName).toLowerCase();
      });

      if (homePlayers.length > 0 && awayPlayers.length > 0) {
        const hasGkDefHome = homePlayers.some(p => p.positionCode === 'GK' || p.positionCode === 'DEF');
        const hasFwdMidAway = awayPlayers.some(p => p.positionCode === 'MID' || p.positionCode === 'FWD');
        const hasGkDefAway = awayPlayers.some(p => p.positionCode === 'GK' || p.positionCode === 'DEF');
        const hasFwdMidHome = homePlayers.some(p => p.positionCode === 'MID' || p.positionCode === 'FWD');

        conflictList.push({
          matchLabel: `${homeName} vs ${awayName}`,
          homeTeam: homeName,
          awayTeam: awayName,
          homePlayers,
          awayPlayers,
          hasGkConflict: (hasGkDefHome && hasFwdMidAway) || (hasGkDefAway && hasFwdMidHome),
        });
      }
    });

    return conflictList;
  }, [allFixtures, cards]);

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

    // Filter profile
    if (profileFilter === 'CLEAN_SHEET') {
      result = result.filter(f => (f.cleanSheetProb || 0) >= 35);
    } else if (profileFilter === 'HIGH_XG') {
      result = result.filter(f => {
        const hXg = f.homeXG || (f.isHome ? f.goalExpectancy : 1.2);
        const aXg = f.awayXG || (!f.isHome ? f.goalExpectancy : 1.1);
        return (parseFloat(String(hXg)) + parseFloat(String(aXg))) >= 2.7 || f.goalExpectancy >= 1.6;
      });
    } else if (profileFilter === 'BIG_FAVORITE') {
      result = result.filter(f => (f.winProb || 0) >= 55);
    } else if (profileFilter === 'MY_PLAYERS') {
      result = result.filter(f => f.players.length > 0);
    } else if (profileFilter === 'STACKING') {
      result = result.filter(f => f.players.length >= 2 && (f.winProb || 0) >= 40);
    } else if (profileFilter === 'CONFLICTS') {
      const conflictTeams = new Set<string>();
      conflicts.forEach(c => {
        conflictTeams.add(c.homeTeam.toLowerCase());
        conflictTeams.add(c.awayTeam.toLowerCase());
      });
      result = result.filter(f => conflictTeams.has(f.club.toLowerCase()) || conflictTeams.has(f.opponent.toLowerCase()));
    } else if (profileFilter === 'DROPPING_ODDS') {
      result = result.filter(f => (f.winProb || 0) >= 50 || f.winOdds <= 1.90 || Boolean(f.hasVerifiedData && (f.winProb || 0) >= 48));
    } else if (profileFilter === 'WEATHER_EXTREME') {
      result = result.filter(f => {
        const w = weatherMap[f.club];
        if (!w) return false;
        return w.wind >= 25 || w.temp <= 3 || w.temp >= 30 || w.description.toLowerCase().includes('pluie') || w.description.toLowerCase().includes('rain');
      });
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
  }, [allFixtures, selectedCompetition, profileFilter, minWinChance, searchQuery, selectedDay, sortBy, strategy]);

  // Timeline Fixtures list
  const timelineFixtures = useMemo(() => {
    return processedFixtures.map(f => {
      const homeTeam = f.homeTeam || (f.isHome ? f.club : f.opponent);
      const awayTeam = f.awayTeam || (f.isHome ? f.opponent : f.club);
      const homeWinOdds = f.homeWinOdds || (f.isHome ? f.winOdds : f.lossOdds);
      const drawOdds = f.drawOdds || 3.40;
      const awayWinOdds = f.awayWinOdds || (f.isHome ? f.lossOdds : f.winOdds);
      const homeWinProb = f.homeWinProb || (f.isHome ? (f.winProb || 50) : (f.lossProb || 25));
      const awayWinProb = f.awayWinProb || (!f.isHome ? (f.winProb || 50) : (f.lossProb || 25));
      const homeCS = f.homeCleanSheetProb || (f.isHome ? f.cleanSheetProb : 25);
      const awayCS = f.awayCleanSheetProb || (!f.isHome ? f.cleanSheetProb : 25);
      const homeXG = f.homeXG || (f.isHome ? f.goalExpectancy : 1.2);
      const awayXG = f.awayXG || (!f.isHome ? f.goalExpectancy : 1.1);

      return {
        id: `${f.club}_${f.opponent}_${f.isHome ? 'h' : 'a'}`,
        club: f.club,
        opponent: f.opponent,
        isHome: f.isHome,
        homeTeam,
        awayTeam,
        competition: f.competition,
        kickoffDate: f.kickoffDate,
        kickoffFormatted: f.kickoffFormatted,
        kickoffRelative: f.kickoffRelative,
        timeSlotKey: f.kickoffDate || '',
        timeSlotLabel: f.kickoffFormatted || '',
        homeWinOdds,
        drawOdds,
        awayWinOdds,
        homeWinProb,
        awayWinProb,
        homeCS,
        awayCS,
        homeXG,
        awayXG,
        players: f.players,
        hasVerifiedData: Boolean(f.hasVerifiedData),
      };
    });
  }, [processedFixtures]);

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
              title="Effectue une recherche API-Football en direct sur les sites de bookmakers officiels (Winamax, Betclic, Unibet) pour récupérer les cotes et probabilités en temps réel"
            >
              {isSyncingRealOdds ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                  <span>Recherche Bookmakers en direct...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-slate-950" />
                  <span>Actualiser Vraies Cotes (API Football)</span>
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
        <div className="mt-4 flex items-center gap-1.5 border-t border-slate-800/80 pt-4 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-x-visible touch-scroll-x">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Filter className="h-3 w-3 text-emerald-400" />
            <span>Ligue :</span>
          </span>
          {competitions.map((comp) => (
            <button
              key={comp}
              onClick={() => setSelectedCompetition(comp)}
              className={`rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-bold transition border whitespace-nowrap shrink-0 ${
                selectedCompetition === comp
                  ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {comp === 'ALL' ? 'Tous les championnats' : comp}
            </button>
          ))}
        </div>
      </div>

      {/* Top Opportunities Bar (Clean Sheets, High xG, Top Value Players, Stacking, Conflicts) */}
      <MatchOpportunitiesBar
        topCleanSheets={topCleanSheets}
        topOffensiveMatches={topOffensiveMatches}
        topValuePlayers={topValuePlayers}
        stackingClubs={stackingClubs}
        conflicts={conflicts}
        onSelectClub={(clubName) => setSearchQuery(clubName)}
        onOpenScout={onOpenScout}
        onFilterCS={() => setProfileFilter('CLEAN_SHEET')}
        onFilterXG={() => setProfileFilter('HIGH_XG')}
        onFilterStacking={() => setProfileFilter('STACKING')}
        onFilterConflicts={() => setProfileFilter('CONFLICTS')}
        onOpenH2HModal={() => setIsH2HModalOpen(true)}
      />

      {/* View Switcher & Profile Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
        {/* Profile Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 touch-scroll-x">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0 flex items-center gap-1">
            <Filter className="h-3 w-3 text-emerald-400" />
            <span>Profil :</span>
          </span>
          <button
            onClick={() => setProfileFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              profileFilter === 'ALL'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Tous les profils
          </button>
          <button
            onClick={() => setProfileFilter('CLEAN_SHEET')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'CLEAN_SHEET'
                ? 'bg-blue-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-blue-300 hover:text-white'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Clean Sheet (≥35%)</span>
          </button>
          <button
            onClick={() => setProfileFilter('HIGH_XG')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'HIGH_XG'
                ? 'bg-purple-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-purple-300 hover:text-white'
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>xG Boomers (≥2.7)</span>
          </button>
          <button
            onClick={() => setProfileFilter('BIG_FAVORITE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'BIG_FAVORITE'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-amber-300 hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Favoris (≥55%)</span>
          </button>
          <button
            onClick={() => setProfileFilter('MY_PLAYERS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'MY_PLAYERS'
                ? 'bg-teal-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-teal-300 hover:text-white'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            <span>Mes Joueurs Galerie</span>
          </button>
          <button
            onClick={() => setProfileFilter('STACKING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'STACKING'
                ? 'bg-indigo-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-indigo-300 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Stacks Clubs ({stackingClubs.length})</span>
          </button>
          {conflicts.length > 0 && (
            <button
              onClick={() => setProfileFilter('CONFLICTS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
                profileFilter === 'CONFLICTS'
                  ? 'bg-rose-500 text-slate-950 shadow-md font-black'
                  : 'bg-rose-950/70 border border-rose-800/80 text-rose-300 hover:text-white'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Conflits Galerie ({conflicts.length})</span>
            </button>
          )}
          <button
            onClick={() => setProfileFilter('DROPPING_ODDS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'DROPPING_ODDS'
                ? 'bg-emerald-400 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-emerald-300 hover:text-white'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Cotes en Baisse 🔥</span>
          </button>
          <button
            onClick={() => setProfileFilter('WEATHER_EXTREME')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
              profileFilter === 'WEATHER_EXTREME'
                ? 'bg-sky-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-950/80 border border-slate-800 text-sky-300 hover:text-white'
            }`}
          >
            <CloudSun className="h-3.5 w-3.5" />
            <span>Alertes Météo</span>
          </button>
        </div>

        {/* View Mode Switcher (Grid vs Timeline) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === 'grid'
                ? 'bg-emerald-500 text-slate-950 shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Grille Matchs</span>
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === 'timeline'
                ? 'bg-emerald-500 text-slate-950 shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Timeline GW</span>
          </button>
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

      {/* Matchups List or Timeline View */}
      {viewMode === 'timeline' ? (
        <MatchTimelineView
          fixtures={timelineFixtures}
          strategy={strategy}
          onOpenScout={onOpenScout}
          onSelectMatch={(m) => setSearchQuery(m.club)}
          onDeepDiveModal={(homeTeam, awayTeam, competition, kickoffDate, players) => {
            setSelectedMatchForModal({
              homeTeam,
              awayTeam,
              competition,
              kickoffDate,
              players: players || [],
            });
          }}
        />
      ) : (
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
                  setProfileFilter('ALL');
                  setSelectedDay('ALL');
                  setMinWinChance(0);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer"
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

              const homeClubName = fixture.isHome ? fixture.club : fixture.opponent;
              const awayClubName = fixture.isHome ? fixture.opponent : fixture.club;
              const homeWinProb = fixture.isHome ? fixture.winProb : fixture.lossProb;
              const awayWinProb = fixture.isHome ? fixture.lossProb : fixture.winProb;
              const drawProb = fixture.drawProb;
              const homeOdds = (fixture.homeWinOdds || marketHome).toFixed(2);
              const drawOdds = (fixture.drawOdds || marketDraw).toFixed(2);
              const awayOdds = (fixture.awayWinOdds || marketAway).toFixed(2);

              const homeCS = fixture.isHome ? fixture.cleanSheetProb : Math.max(5, 60 - fixture.cleanSheetProb);
              const awayCS = !fixture.isHome ? fixture.cleanSheetProb : Math.max(5, 60 - fixture.cleanSheetProb);
              const csHomeOdds = (100 / Math.max(5, homeCS)).toFixed(2);
              const csAwayOdds = (100 / Math.max(5, awayCS)).toFixed(2);

              const homeXG = typeof fixture.goalExpectancy === 'number' 
                ? (fixture.isHome ? fixture.goalExpectancy.toFixed(1) : ((fixture as any).opponentGoalExpectancy || 1.1).toFixed(1))
                : fixture.goalExpectancy;
              const awayXG = typeof fixture.goalExpectancy === 'number'
                ? (!fixture.isHome ? fixture.goalExpectancy.toFixed(1) : ((fixture as any).opponentGoalExpectancy || 1.1).toFixed(1))
                : '1.2';

              const totalXgMatch = (parseFloat(String(homeXG)) + parseFloat(String(awayXG))).toFixed(1);

              // Over / Under 2.5 calculation
              const isOverFavorable = parseFloat(totalXgMatch) >= 2.6;
              const over25Odds = isOverFavorable ? (1.50 + Math.max(0, 3.2 - parseFloat(totalXgMatch)) * 0.4).toFixed(2) : (2.10 + Math.max(0, 2.5 - parseFloat(totalXgMatch)) * 0.3).toFixed(2);
              const under25Odds = isOverFavorable ? (2.20 + (parseFloat(totalXgMatch) - 2.5) * 0.3).toFixed(2) : (1.65).toFixed(2);

              // BTTS calculation
              const bttsProb = Math.min(85, Math.max(30, Math.round((Math.min(parseFloat(String(homeXG)), parseFloat(String(awayXG))) / 1.5) * 50 + 25)));
              const bttsYesOdds = (100 / Math.max(20, bttsProb)).toFixed(2);
              const bttsNoOdds = (100 / Math.max(20, 100 - bttsProb)).toFixed(2);

              // Double Chance
              const dc1X = (1 / ((homeWinProb || 40) / 100 + (drawProb || 28) / 100)).toFixed(2);
              const dc12 = (1 / ((homeWinProb || 40) / 100 + (awayWinProb || 32) / 100)).toFixed(2);
              const dcX2 = (1 / ((drawProb || 28) / 100 + (awayWinProb || 32) / 100)).toFixed(2);

              const matchKey = `${fixture.club}_${fixture.opponent}_${fixture.isHome ? 'h' : 'a'}`;
              const isSimulatorExpanded = expandedSimulatorMatchKey === matchKey;

              const isStackOpportunity = fixture.players.length >= 2 && (fixture.winProb || 0) >= 40;
              const isDroppingOdds = (fixture.winProb || 0) >= 52 || fixture.winOdds <= 1.85;

              // Intra-gallery conflict check
              const matchConflict = conflicts.find(c => 
                (c.homeTeam.toLowerCase() === homeClubName.toLowerCase() && c.awayTeam.toLowerCase() === awayClubName.toLowerCase()) ||
                (c.homeTeam.toLowerCase() === awayClubName.toLowerCase() && c.awayTeam.toLowerCase() === homeClubName.toLowerCase())
              );

              // Tactical weather note
              let weatherTacticalNote: { label: string; color: string } | null = null;
              if (wInfo) {
                if (wInfo.wind >= 28) {
                  weatherTacticalNote = { label: `💨 Vent fort (${wInfo.wind} km/h) : pénalise les passes longues et tirs lointains (-8% xG).`, color: 'text-amber-300 bg-amber-950/70 border-amber-500/40' };
                } else if (wInfo.temp <= 3) {
                  weatherTacticalNote = { label: `❄️ Froid vif (${wInfo.temp}°C) : pelouse dure, favorise les fautes et turnovers défensifs.`, color: 'text-sky-300 bg-sky-950/70 border-sky-500/40' };
                } else if (wInfo.description.toLowerCase().includes('pluie') || wInfo.description.toLowerCase().includes('rain')) {
                  weatherTacticalNote = { label: `🌧️ Pluie / Pelouse grasse : rebonds piégeux pour les gardiens, vigilance clean sheet.`, color: 'text-blue-300 bg-blue-950/70 border-blue-500/40' };
                }
              }

              return (
                <div
                  key={`${fixture.club}_${fixture.opponent}_${fixture.isHome ? 'home' : 'away'}_${idx}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-lg backdrop-blur-md transition hover:border-slate-700 space-y-4"
                >
                  {/* Header: Badges + Match Title + Action Buttons */}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    
                    {/* Match Title & Badges */}
                    <div className="space-y-2 flex-1">
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

                        {isStackOpportunity && (
                          <span className="text-[10px] text-indigo-300 font-bold flex items-center gap-1 bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-500/40" title="Opportunité de Stacking détectée dans votre galerie">
                            <Layers className="h-3 w-3 text-indigo-400" />
                            <span>Stack Club ({fixture.players.length})</span>
                          </span>
                        )}

                        {isDroppingOdds && (
                          <span className="text-[10px] text-emerald-300 font-bold flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/40" title="Cote favorable / Tendance marché haussière">
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                            <span>Cote en Baisse ↘</span>
                          </span>
                        )}

                        {wInfo && (
                          <span
                            className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md border ${wInfo.source === 'Open-Meteo Live API' ? 'text-sky-300 bg-sky-950/80 border-sky-800/80' : 'text-amber-300 bg-amber-950/60 border-amber-500/30'}`}
                            title={wInfo.source === 'Open-Meteo Live API' ? `Données météo réelles Open-Meteo pour ${wInfo.city}` : `Estimation (Open-Meteo indisponible pour ${wInfo.city})`}
                          >
                            <CloudSun className={`h-3 w-3 ${wInfo.source === 'Open-Meteo Live API' ? 'text-sky-400' : 'text-amber-400'}`} />
                            <span>{wInfo.source !== 'Open-Meteo Live API' && 'Est. • '}{wInfo.temp}°C • {wInfo.description}</span>
                          </span>
                        )}

                        {fixture.source && (
                          fixture.hasVerifiedData ? (
                            <span className="text-[10px] text-emerald-300 font-bold flex items-center gap-1 bg-emerald-950/70 px-2 py-0.5 rounded-md border border-emerald-500/30" title="Donnée issue d'une source bookmaker réelle">
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              <span>{fixture.source}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-500/30" title="Estimation calculée localement">
                              <AlertTriangle className="h-3 w-3 text-amber-400" />
                              <span>Estimation • {fixture.source}</span>
                            </span>
                          )
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

                    {/* Action buttons: H2H Comparator + Deep-dive API-Football */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setH2hInitialMatchA(`${fixture.club}_${fixture.opponent}_${fixture.isHome ? 'h' : 'a'}`);
                          setIsH2HModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-teal-300 font-bold text-xs border border-teal-500/40 hover:border-teal-400 transition cursor-pointer shadow-sm"
                        title="Comparer ce match en Face-à-Face avec une autre rencontre pour arbitrer vos compositions"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 text-teal-400" />
                        <span>⚖️ Arbitrer H2H</span>
                      </button>

                      <button
                        onClick={() => setSelectedMatchForModal({
                          homeTeam: homeClubName,
                          awayTeam: awayClubName,
                          competition: fixture.competition,
                          kickoffDate: fixture.kickoffDate,
                          players: fixture.players,
                        })}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer border border-indigo-400/30"
                        title="Ouvrir le centre d'analyse complet API-Football (Cotes bookmakers détaillées, H2H, Compos probables/officielles, Blessures)"
                      >
                        <Search className="h-3.5 w-3.5 text-indigo-200" />
                        <span>🔍 Analyse API-Football & Compos</span>
                      </button>
                    </div>

                  </div>

                  {/* Conflict Alert Banner if detected */}
                  {matchConflict && (
                    <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-600/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs animate-fadeIn">
                      <div className="flex items-start sm:items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                        <div>
                          <span className="font-bold text-rose-300">Conflit Intra-Galerie Détecté : </span>
                          <span className="text-slate-300">
                            {matchConflict.homePlayers.map(p => p.displayName).join(', ')} ({matchConflict.homeTeam}) affronte {matchConflict.awayPlayers.map(p => p.displayName).join(', ')} ({matchConflict.awayTeam})
                          </span>
                        </div>
                      </div>
                      {matchConflict.hasGkConflict ? (
                        <span className="text-[10px] font-black text-rose-200 bg-rose-900/90 px-2.5 py-1 rounded-lg border border-rose-500/60 shrink-0">
                          ⚠️ Risque Annulation Clean Sheet
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-600/60 shrink-0">
                          Duel de possession
                        </span>
                      )}
                    </div>
                  )}

                  {/* Tactical Weather Impact Alert if notable */}
                  {weatherTacticalNote && (
                    <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs ${weatherTacticalNote.color}`}>
                      <CloudSun className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-semibold">{weatherTacticalNote.label}</span>
                    </div>
                  )}

                  {/* Direct Unified Bookmaker & Match Analysis Matrix (Zero Redundancy) */}
                  <div className="space-y-3 bg-slate-950/90 rounded-2xl border border-slate-800/80 p-3.5 sm:p-4 shadow-inner">
                    
                    {/* 1N2 Odds & Probability Integrated Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                        <span className="uppercase tracking-wider flex items-center gap-1.5 text-indigo-300">
                          <Zap className="h-3 w-3 text-indigo-400" />
                          Cotes Bookmaker 1N2 & Probabilités Match
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">API-Football Bet365/Pinnacle</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {/* 1 - Domicile */}
                        <div className={`p-2.5 rounded-xl border text-center transition ${
                          fixture.isHome ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}>
                          <span className="text-[10px] font-bold block truncate">
                            1 • {homeClubName} {fixture.isHome && '(Galerie)'}
                          </span>
                          <div className="flex items-baseline justify-center gap-1.5 my-0.5">
                            <span className="text-sm sm:text-base font-black text-white font-mono">
                              @{homeOdds}
                            </span>
                            <span className="text-xs font-bold text-emerald-400">
                              {homeWinProb}%
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400">Victoire Dom.</span>
                        </div>

                        {/* N - Nul */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-center">
                          <span className="text-[10px] font-bold text-slate-400 block">
                            N • Match Nul
                          </span>
                          <div className="flex items-baseline justify-center gap-1.5 my-0.5">
                            <span className="text-sm sm:text-base font-black text-white font-mono">
                              @{drawOdds}
                            </span>
                            <span className="text-xs font-bold text-slate-400">
                              {drawProb}%
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400">Nul</span>
                        </div>

                        {/* 2 - Extérieur */}
                        <div className={`p-2.5 rounded-xl border text-center transition ${
                          !fixture.isHome ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}>
                          <span className="text-[10px] font-bold block truncate">
                            2 • {awayClubName} {!fixture.isHome && '(Galerie)'}
                          </span>
                          <div className="flex items-baseline justify-center gap-1.5 my-0.5">
                            <span className="text-sm sm:text-base font-black text-white font-mono">
                              @{awayOdds}
                            </span>
                            <span className="text-xs font-bold text-emerald-400">
                              {awayWinProb}%
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400">Victoire Ext.</span>
                        </div>
                      </div>

                      {/* Tri-color Win Probability Gauge */}
                      <div className="h-1.5 w-full bg-slate-900 rounded-full flex overflow-hidden border border-slate-800">
                        <div style={{ width: `${homeWinProb}%` }} className="bg-emerald-500 transition-all" title={`Domicile: ${homeWinProb}%`} />
                        <div style={{ width: `${drawProb}%` }} className="bg-slate-600 transition-all" title={`Nul: ${drawProb}%`} />
                        <div style={{ width: `${awayWinProb}%` }} className="bg-indigo-500 transition-all" title={`Extérieur: ${awayWinProb}%`} />
                      </div>
                    </div>

                    {/* Advanced Betting Markets: Clean Sheet, xG, BTTS & Over/Under 2.5 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/70 text-xs">
                      
                      {/* Clean Sheet Domicile & Extérieur */}
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Shield className="h-3 w-3 text-blue-400" />
                            <span>CS {homeClubName}</span>
                          </span>
                          <span className="text-[10px] font-mono text-blue-400 font-bold">@{csHomeOdds}</span>
                        </div>
                        <span className="text-xs sm:text-sm font-black text-blue-300 font-mono block">
                          {homeCS}% probabilité
                        </span>
                        <span className="text-[9px] text-slate-500 block">{fixture.isHome ? 'Impact direct GK/DEF' : 'Risque offensif'}</span>
                      </div>

                      {/* Clean Sheet Extérieur */}
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Shield className="h-3 w-3 text-blue-400" />
                            <span>CS {awayClubName}</span>
                          </span>
                          <span className="text-[10px] font-mono text-blue-400 font-bold">@{csAwayOdds}</span>
                        </div>
                        <span className="text-xs sm:text-sm font-black text-blue-300 font-mono block">
                          {awayCS}% probabilité
                        </span>
                        <span className="text-[9px] text-slate-500 block">{!fixture.isHome ? 'Impact direct GK/DEF' : 'Risque offensif'}</span>
                      </div>

                      {/* Over / Under 2.5 Buts */}
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Flame className="h-3 w-3 text-purple-400" />
                            <span>Over / Under 2.5</span>
                          </span>
                          <span className="text-[10px] font-mono text-purple-300 font-bold">{totalXgMatch} xG</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-300">+2.5: <strong className="text-emerald-400 font-bold">@{over25Odds}</strong></span>
                          <span className="text-slate-300">-2.5: <strong className="text-slate-400 font-bold">@{under25Odds}</strong></span>
                        </div>
                        <span className="text-[9px] text-slate-500 block">{isOverFavorable ? 'Match prolifique attendu' : 'Match fermé'}</span>
                      </div>

                      {/* Les deux équipes marquent (BTTS) */}
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                            <Target className="h-3 w-3 text-amber-400" />
                            <span>Les 2 marquent (BTTS)</span>
                          </span>
                          <span className="text-[10px] font-mono text-amber-400 font-bold">{bttsProb}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-300">Oui: <strong className="text-emerald-400 font-bold">@{bttsYesOdds}</strong></span>
                          <span className="text-slate-300">Non: <strong className="text-rose-400 font-bold">@{bttsNoOdds}</strong></span>
                        </div>
                        <span className="text-[9px] text-slate-500 block">{bttsProb > 50 ? 'Idéal pour Stacks Offensifs' : 'Avantage Défenses'}</span>
                      </div>

                    </div>

                    {/* Double Chance Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70 text-xs text-slate-400">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Double Chance :</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                          1X ({homeClubName}/Nul) : <strong className="font-mono text-emerald-400 font-bold">@{dc1X}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                          12 (Pas de Nul) : <strong className="font-mono text-emerald-400 font-bold">@{dc12}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                          X2 (Nul/{awayClubName}) : <strong className="font-mono text-emerald-400 font-bold">@{dcX2}</strong>
                        </span>
                      </div>

                      {/* Simulator Toggle Button */}
                      <button
                        onClick={() => setExpandedSimulatorMatchKey(isSimulatorExpanded ? null : matchKey)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                          isSimulatorExpanded
                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                        <span>{isSimulatorExpanded ? 'Masquer Impact Sorare' : 'Simuler Impact Sorare'}</span>
                      </button>
                    </div>

                    {/* Sorare Impact Simulator Drawer */}
                    {isSimulatorExpanded && (
                      <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 space-y-2.5 animate-fadeIn text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Simulateur d'Impact sur les Scores Sorare ({fixture.club})</span>
                          </span>
                          <span className="text-[10px] text-slate-400">Matrice de scoring SO5 officielle</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          {/* Scenario 1: Clean Sheet */}
                          <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-800/40 space-y-1">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                              Scénario 1 • Clean Sheet
                            </span>
                            <p className="text-slate-200 text-[11px] leading-snug">
                              Gardien : <strong className="text-emerald-400 font-bold">+25 pts</strong> (Score 60+ garanti si victoire).<br />
                              Défenseurs : <strong className="text-emerald-400 font-bold">+10 pts</strong> sur le All-Around Score (AA).
                            </p>
                          </div>

                          {/* Scenario 2: Victoire & Contrôle */}
                          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 space-y-1">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                              Scénario 2 • Victoire Match
                            </span>
                            <p className="text-slate-200 text-[11px] leading-snug">
                              Score collectif : <strong className="text-emerald-400 font-bold">+5 à +8 pts</strong> en moyenne par joueur grâce à la possession et la dynamique positive.
                            </p>
                          </div>

                          {/* Scenario 3: Offensive Boom */}
                          <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/40 space-y-1">
                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                              Scénario 3 • Boom Offensif
                            </span>
                            <p className="text-slate-200 text-[11px] leading-snug">
                              Attaquants / Milieux : Décisive Score Niveau 1 (<strong className="text-purple-300 font-bold">60 pts min</strong>) + AA = <strong className="text-emerald-400 font-bold">75-85 pts projetés</strong>.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Gallery Player Count Header & Pills */}
                  <div className="mt-4 border-t border-slate-800/60 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400">
                        {fixture.players.length} joueur{fixture.players.length > 1 ? 's' : ''} dans votre galerie :
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
                        const l5 = p.scores?.l5 || 0;
                        const diffVsL5 = projected - l5;

                        return (
                          <button
                            key={p.id}
                            onClick={() => onOpenScout(p)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl bg-slate-950 p-3 text-xs text-slate-200 hover:bg-emerald-500/15 hover:border-emerald-500/50 border border-slate-800 transition shadow-sm group text-left cursor-pointer w-full"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-black border shrink-0 ${pStyle}`}>
                                {p.positionCode}
                              </span>
                              
                              <span className="font-bold text-white group-hover:text-emerald-300 transition truncate max-w-[130px] sm:max-w-[150px]">
                                {p.displayName}
                              </span>

                              {bonusPct > 0 && (
                                <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 rounded shrink-0 shadow-sm" title={`Bonus de carte : +${bonusPct}%`}>
                                  +{bonusPct}% bonus
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0 justify-between sm:justify-end w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/60">
                              {/* Score Projeté Badge avec détail Base + Bonus */}
                              <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-bold px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] shadow-sm">
                                <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                                <span className="text-slate-300 font-semibold" title="Score de base">{breakdown.baseProjectedScore} pts</span>
                                <span className="text-amber-300 font-bold" title={`Bonus de carte de +${breakdown.cardBonusPercentage}%`}>+{breakdown.cardBonusPercentage}%</span>
                                <span className="font-black text-emerald-300 bg-emerald-500/20 px-1 rounded" title="Total projeté (Base + Bonus)">= {projected} pts</span>
                              </div>

                              {/* Diff vs L5 */}
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${diffVsL5 >= 0 ? 'text-emerald-400 bg-emerald-950/50' : 'text-slate-400 bg-slate-900'}`} title="Différence par rapport à la moyenne L5">
                                {diffVsL5 >= 0 ? `+${diffVsL5.toFixed(1)}` : diffVsL5.toFixed(1)} vs L5
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
      )}

      {/* Deep-dive API-Football Match Analysis Modal */}
      {selectedMatchForModal && (
        <ApiFootballMatchModal
          homeTeam={selectedMatchForModal.homeTeam}
          awayTeam={selectedMatchForModal.awayTeam}
          competition={selectedMatchForModal.competition}
          kickoffDate={selectedMatchForModal.kickoffDate}
          galleryPlayers={selectedMatchForModal.players}
          onClose={() => setSelectedMatchForModal(null)}
          onOpenScout={onOpenScout}
        />
      )}

      {/* Match Head-to-Head Comparator Modal */}
      {isH2HModalOpen && (
        <MatchH2HComparatorModal
          fixtures={allFixtures.map(f => ({
            key: `${f.club}_${f.opponent}_${f.isHome ? 'h' : 'a'}`,
            club: f.club,
            opponent: f.opponent,
            isHome: f.isHome,
            competition: f.competition,
            kickoffDate: f.kickoffDate,
            kickoffFormatted: f.kickoffFormatted || formatKickoffDate(f.kickoffDate),
            homeWinOdds: f.homeWinOdds || (f.isHome ? f.winOdds : f.lossOdds),
            drawOdds: f.drawOdds || 3.40,
            awayWinOdds: f.awayWinOdds || (f.isHome ? f.lossOdds : f.winOdds),
            homeWinProb: f.isHome ? f.winProb : f.lossProb,
            drawProb: f.drawProb || 28,
            awayWinProb: f.isHome ? f.lossProb : f.winProb,
            winOdds: f.winOdds || 2.00,
            winProb: f.winProb || 50,
            cleanSheetProb: f.cleanSheetProb || 30,
            goalExpectancy: typeof f.goalExpectancy === 'number' ? f.goalExpectancy : 1.4,
            players: f.players || [],
            weather: weatherMap[f.club] ? {
              temp: weatherMap[f.club].temp,
              description: weatherMap[f.club].description,
              wind: weatherMap[f.club].wind,
              city: weatherMap[f.club].city || f.club,
            } : undefined,
          }))}
          allCards={cards}
          initialMatchA={h2hInitialMatchA || undefined}
          initialMatchB={h2hInitialMatchB || undefined}
          strategy={strategy}
          onClose={() => {
            setIsH2HModalOpen(false);
            setH2hInitialMatchA(null);
            setH2hInitialMatchB(null);
          }}
          onOpenScout={onOpenScout}
        />
      )}

    </div>
  );
};
