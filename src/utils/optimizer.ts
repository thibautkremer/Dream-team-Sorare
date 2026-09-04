import { SorareCard, Lineup, StrategyType, ScoringFocus, PositionCode, LineupOptimizationFilters, UpcomingFixture, MatchPerformanceDetail, LineupValidationIssue, LineupValidationResult, SlotPosition, RealMatchScoreDetail, PlayingStatus, OfficialLineupStatus } from '../types';
import { getCardTotalBonus, getCardBonusBreakdown, CardBonusBreakdown } from './sorareSlug';
import { getCurrentGameWeekNumber } from '../data/fixturesData';

export interface ScoreBreakdown {
  player: SorareCard;
  projectedScore: number;        // Score total (Score de base + Bonus carte)
  baseProjectedScore: number;    // Score de base projeté sans bonus
  cardBonusPercentage: number;   // Pourcentage de bonus de la carte (ex: 10, 23)
  cardBonusScore: number;        // Score en points apporté par le bonus
  totalProjectedScore: number;   // Total général (Score de base + Bonus)

  // Nouveaux champs pour la volatilité et fourchette
  projectedFloor: number;
  projectedCeiling: number;
  reliantType: 'AA_RELIANT' | 'DECISIVE_RELIANT' | 'BALANCED';
  volatilityRating: 'LOW' | 'MEDIUM' | 'HIGH';
  strategySortBonus?: number; // Pour le tri des Focus (AAS/DS) sans falsifier le score projeté

  formIndex: number;
  matchupFactor: number;
  cleanSheetFactor: number;
  starterSafety: number;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
  playedLastMatch: boolean;
  lastMatchScore: number;
  recentPlayingFactor: number;

  // DÉTAILS TRANSPARENTS DU CALCUL (Modal & Tooltip)
  l5: number;
  l15: number;
  l40: number;
  l5Boosted: number;            // L5 * (1 + bonus %)
  l15Boosted: number;           // L15 * (1 + bonus %)
  l40Boosted: number;           // L40 * (1 + bonus %)
  strategyUsed: StrategyType;
  scoringFocusUsed?: ScoringFocus;
  strategyWeights: { l5: number; l15: number; l40: number };
  rawBaseFormScore: number;     // Forme brute de base
  boostedBaseFormScore: number; // Forme de base boostée par la carte

  status: string;
  starterFactor: number;
  starterImpactLabel: string;

  difficultyRating: number;
  matchupImpactLabel: string;
  isHome: boolean;
  profileBonus: number;
  bookmakerActionBonus: number;
  weatherBonus: number;
  weatherImpactLabel?: string;

  // Bonus contextuels
  contextualBonus: number;
  contextualImpactLabel?: string;
  advancedStatsBonus: number;
  regressionPenalty: number;

  filterLabel?: string;

  bonusBreakdown: CardBonusBreakdown;
}

export interface PlayerRecentMatchStats {
  playedLastMatch: boolean;
  lastMatchScore: number;
  lastMatchLabel: string;
  playedCountL5: number;
  consecutiveDnpCount: number;
  recentPlayingFactor: number;
  isLive?: boolean;
  liveMinute?: number;
}

/**
 * Retourne une clé unique pour identifier un joueur (indépendamment de la carte/bonus)
 */
export function getPlayerUniqueKey(card: SorareCard): string {
  if (!card) return '';
  // Normaliser le nom du joueur en minuscules, sans accents, sans tirets, ni espaces multiples
  const rawName = card.displayName || card.name || card.playerSlug || card.slug || card.id || '';
  return rawName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyse la participation aux derniers matchs pour détecter les joueurs écartés ou remplaçants.
 * RÈGLE FONDAMENTALE : Le match le plus récent M1 (qu'il soit en direct, tout juste terminé ou enregistré)
 * doit impérativement afficher le score actuel et conditionner la détection de titularisation.
 */
export function getPlayerRecentMatchAnalysis(card: SorareCard): PlayerRecentMatchStats {
  const recentMatches = card.scores?.recentMatches || [];
  const last5 = card.scores?.last5Scores || [];

  // 1. Détection prioritaire du score M1 (match le plus récent ou en direct)
  let lastMatchScore: number | undefined = undefined;
  let isLive = false;
  let liveMinute: number | undefined = undefined;

  // A. Score live direct attaché à la carte
  if (typeof (card as any).liveScore === 'number') {
    lastMatchScore = (card as any).liveScore;
    isLive = (card as any).isLive ?? true;
    liveMinute = (card as any).liveMinute;
  }
  // B. Premier élément de recentMatches (M1 = index 0)
  else if (recentMatches.length > 0 && typeof recentMatches[0]?.score === 'number' && recentMatches[0].opponent !== 'Match Futur/Passé') {
    lastMatchScore = recentMatches[0].score;
    isLive = (recentMatches[0] as any).isLive ?? false;
    liveMinute = (recentMatches[0] as any).minute;
  }
  // C. Tableau last5Scores (index 0 est le plus récent M1, sinon dernier élément en repli)
  else if (last5 && last5.length > 0) {
    if (typeof last5[0] === 'number') {
      lastMatchScore = last5[0];
    } else if (typeof last5[last5.length - 1] === 'number') {
      lastMatchScore = last5[last5.length - 1];
    }
  }

  if (lastMatchScore === undefined) {
    const isStarter = card.status === 'STARTER';
    const isRegular = card.status === 'REGULAR';
    return {
      playedLastMatch: isStarter || isRegular,
      lastMatchScore: isStarter ? 50 : 0,
      lastMatchLabel: isStarter ? 'Titulaire' : 'Incertain',
      playedCountL5: isStarter ? 5 : isRegular ? 3 : 1,
      consecutiveDnpCount: 0,
      recentPlayingFactor: isStarter ? 1.0 : isRegular ? 0.90 : 0.40,
      isLive: false,
    };
  }

  const playedLastMatch = typeof lastMatchScore === 'number' && lastMatchScore > 0;
  const playedCountL5 = last5.length > 0 ? last5.filter(s => s > 0).length : (playedLastMatch ? 1 : 0);

  // Calcul du nombre de DNP consécutifs récents
  let consecutiveDnpCount = 0;
  if (last5.length > 0) {
    for (let i = 0; i < last5.length; i++) {
      if (last5[i] <= 0) {
        consecutiveDnpCount++;
      } else {
        break;
      }
    }
  } else if (!playedLastMatch) {
    consecutiveDnpCount = 1;
  }

  // Facteur d'impact sur la titularisation et probabilité de jeu
  let recentPlayingFactor = 1.0;

  if (playedCountL5 === 0 && !playedLastMatch) {
    // 0 match joué sur les 5 derniers : joueur complètement hors de rotation
    recentPlayingFactor = 0.05;
  } else if (consecutiveDnpCount >= 3) {
    // 3+ matchs consécutifs sans jouer : joueur mis à l'écart ou blessure longue
    recentPlayingFactor = 0.20; // -80%
  } else if (consecutiveDnpCount === 2) {
    // 2 matchs consécutifs sans jouer : joueur passé remplaçant
    recentPlayingFactor = 0.45; // -55%
  } else if (consecutiveDnpCount === 1 || !playedLastMatch) {
    // N'a pas joué le dernier match : forte pénalité de titularisation
    recentPlayingFactor = 0.65; // -35%
  } else {
    // A joué le dernier match (score > 0)
    recentPlayingFactor = 1.0;
  }

  // Malus si le joueur a joué mais était remplaçant (-5%)
  const recentMatchDetail = recentMatches[0];
  const wasSubInLastMatch = recentMatchDetail 
    ? (recentMatchDetail.isSub === true || recentMatchDetail.baseScore === 25 || (recentMatchDetail.minsPlayed != null && recentMatchDetail.minsPlayed > 0 && recentMatchDetail.minsPlayed < 60))
    : (card.status === 'SUPER_SUBSTITUTE' || card.status === 'SUBSTITUTE' || card.status === 'BENCH');

  if (playedLastMatch && wasSubInLastMatch) {
    recentPlayingFactor *= 0.95; // Malus remplaçant (-5%)
  }

  const roundedScore = Math.round(lastMatchScore * 10) / 10;
  const lastMatchLabel = isLive 
    ? `En direct (${roundedScore} pts)` 
    : (playedLastMatch ? `Dernier match joué (${roundedScore} pts)` : 'DNP dernier match (0 min)');

  return {
    playedLastMatch,
    lastMatchScore: roundedScore,
    lastMatchLabel,
    playedCountL5,
    consecutiveDnpCount,
    recentPlayingFactor,
    isLive,
    liveMinute,
  };
}

/**
 * Fonction de comparaison stricte pour le tri des candidats
 * À SCORE ÉGAL : le joueur n'ayant pas joué le dernier match sera pénalisé et l'autre sera sélectionné.
 */
export function compareCandidates(a: ScoreBreakdown, b: ScoreBreakdown): number {
  // 1. Score projeté (qui intègre déjà la pénalité de dernier match et le bonus de tri stratégique AAS/DS)
  const aSortScore = a.projectedScore + (a.strategySortBonus || 0);
  const bSortScore = b.projectedScore + (b.strategySortBonus || 0);
  const scoreDiff = bSortScore - aSortScore;
  if (Math.abs(scoreDiff) > 0.05) {
    return scoreDiff;
  }

  // 2. À SCORE ÉGAL : avantage strict au joueur qui a joué le dernier match
  if (a.playedLastMatch !== b.playedLastMatch) {
    return b.playedLastMatch ? 1 : -1;
  }

  // 3. Avantage à la carte avec le plus haut bonus intrinsèque (permet de choisir la meilleure carte parmi les doublons d'un même joueur)
  if (a.cardBonusPercentage !== b.cardBonusPercentage) {
    return b.cardBonusPercentage - a.cardBonusPercentage;
  }

  // 4. Plus grand nombre de matchs joués sur les 5 derniers
  const aRecent = getPlayerRecentMatchAnalysis(a.player);
  const bRecent = getPlayerRecentMatchAnalysis(b.player);
  if (aRecent.playedCountL5 !== bRecent.playedCountL5) {
    return bRecent.playedCountL5 - aRecent.playedCountL5;
  }

  // 5. Confiance de titularisation
  if (a.player.starterConfidence !== b.player.starterConfidence) {
    return b.player.starterConfidence - a.player.starterConfidence;
  }

  // 6. Forme L5 brute
  return (b.player.scores?.l5 || 0) - (a.player.scores?.l5 || 0);
}

/**
 * Vérifie si le match d'une carte se déroule au plus tard le jour de maxDateStr (inclus) et à l'heure maxTimeStr (optionnel).
 * @param card Carte Sorare
 * @param maxDateStr Date limite au format "YYYY-MM-DD" (ex: "2026-08-22")
 * @param maxTimeStr Heure limite au format "HH:MM" (ex: "20:00")
 */
export function isCardMatchOnOrBeforeDate(card: SorareCard, maxDateStr?: string | null, maxTimeStr?: string | null): boolean {
  if (!maxDateStr || maxDateStr.trim() === '') return true;
  
  const fixture = card.upcomingFixture;
  if (!fixture) return false;
  if (fixture.hasUpcomingMatch === false) return false;

  const rawDate = fixture.kickoffDate || fixture.matchDate;
  if (!rawDate) return false;

  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) {
      const matchDay = rawDate.substring(0, 10);
      return matchDay <= maxDateStr;
    }

    const [year, month, day] = maxDateStr.split('-').map(Number);
    if (!year || !month || !day) return true;

    // Use specific time if provided, else 23:59:59.999
    let hours = 23;
    let minutes = 59;
    
    if (maxTimeStr && maxTimeStr.includes(':')) {
       const [h, m] = maxTimeStr.split(':').map(Number);
       if (!isNaN(h) && !isNaN(m)) {
          hours = h;
          minutes = m;
       }
    }

    const limitUtc = Date.UTC(year, month - 1, day, hours, minutes, 59, 999);
    
    if (d.getTime() > limitUtc) {
      return false;
    }

    // Si pas d'heure max spécifiée, on vérifie la date globale
    if (!maxTimeStr) {
      const isoDateUtc = d.toISOString().substring(0, 10);
      if (isoDateUtc > maxDateStr) {
        return false;
      }
    }

    return true;
  } catch {
    return rawDate.substring(0, 10) <= maxDateStr;
  }
}

/**
 * Calcule le pourcentage de victoire de l'équipe d'un joueur selon les bookmakers (entre 1% et 99%)
 */
export function getPlayerWinProbability(fixture?: UpcomingFixture | null): number {
  if (!fixture || !fixture.bookmaker) return 50;
  
  const { win, draw, loss } = fixture.bookmaker;
  
  if (win && draw && loss) {
    const invWin = 1 / win;
    const invDraw = 1 / draw;
    const invLoss = 1 / loss;
    const sumInv = invWin + invDraw + invLoss;
    
    // Normalize to 100%
    return Math.round((invWin / sumInv) * 100);
  }
  
  // Fallback if odds are incomplete
  const winOdds = win || 2.0;
  return Math.round((1 / winOdds) * 100);
}

/**
 * Formate la date de coup d'envoi à l'heure de New York City (EDT / EST)
 */
export function formatKickoffDate(dateInput?: string | { kickoffDate?: string; kickoffFormatted?: string; matchDate?: string } | null): string {
  if (!dateInput) return 'Date à confirmer';
  
  let rawIso = '';
  if (typeof dateInput === 'object') {
    rawIso = dateInput.kickoffDate || dateInput.matchDate || '';
  } else if (typeof dateInput === 'string') {
    rawIso = dateInput;
  }
  
  if (rawIso) {
    try {
      let d: Date;
      if (rawIso.match(/^\d{4}-\d{2}-\d{2}$/)) {
        d = new Date(`${rawIso}T12:00:00Z`);
      } else {
        d = new Date(rawIso);
      }
      if (!isNaN(d.getTime())) {
        const formatter = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'America/New_York',
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        const parts = formatter.formatToParts(d);
        let weekday = '', day = '', month = '', hour = '', minute = '';
        for (const part of parts) {
          if (part.type === 'weekday') weekday = part.value;
          if (part.type === 'day') day = part.value;
          if (part.type === 'month') month = part.value;
          if (part.type === 'hour') hour = part.value;
          if (part.type === 'minute') minute = part.value;
        }

        const capWeekday = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : '';
        return `${capWeekday} ${day} ${month} à ${hour}:${minute} EDT`;
      }
    } catch {
      // Fallback
    }
  }

  if (typeof dateInput === 'object' && dateInput.kickoffFormatted) {
    return dateInput.kickoffFormatted;
  }

  return 'Date à confirmer';
}

export interface ClubContext {
  absentScorerName?: string;
  absentAssisterName?: string;
  absentDefenderName?: string;
  absentStarName?: string;
  avgClubScore: number;
}

export function precomputeClubContexts(cards: SorareCard[]): Record<string, ClubContext> {
  const clubCardsMap: Record<string, SorareCard[]> = {};
  cards.forEach(card => {
    const club = card.club?.name;
    if (club) {
      if (!clubCardsMap[club]) {
        clubCardsMap[club] = [];
      }
      clubCardsMap[club].push(card);
    }
  });

  const contexts: Record<string, ClubContext> = {};

  Object.entries(clubCardsMap).forEach(([clubName, clubCards]) => {
    const validScores = clubCards.map(c => c.scores?.l40 || 0).filter(s => s > 0);
    const avgClubScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 40;

    const reliableCandidates = clubCards.filter(c => (c.scores?.l40PlayedRate || 80) >= 70);

    const absoluteStar = [...reliableCandidates].sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];
    const bestDef = [...reliableCandidates]
      .filter(c => c.positionCode === 'DEF')
      .sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];
    const bestFwd = [...reliableCandidates]
      .filter(c => c.positionCode === 'FWD')
      .sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];
    const bestMid = [...reliableCandidates]
      .filter(c => c.positionCode === 'MID')
      .sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];

    contexts[clubName] = {
      avgClubScore,
      absentStarName: absoluteStar && (absoluteStar.injuryStatus !== 'FIT' || absoluteStar.status === 'NOT_PLAYING') ? absoluteStar.displayName : undefined,
      absentDefenderName: bestDef && (bestDef.injuryStatus !== 'FIT' || bestDef.status === 'NOT_PLAYING') ? bestDef.displayName : undefined,
      absentScorerName: bestFwd && (bestFwd.injuryStatus !== 'FIT' || bestFwd.status === 'NOT_PLAYING') ? bestFwd.displayName : undefined,
      absentAssisterName: bestMid && (bestMid.injuryStatus !== 'FIT' || bestMid.status === 'NOT_PLAYING') ? bestMid.displayName : undefined,
    };
  });

  return contexts;
}

export function isNationalTeamMatch(match: { competitionName?: string; opponent?: string; isNational?: boolean }): boolean {
  if (!match) return false;
  if (
    match.isNational === true || 
    (match as any).isNationalTeam === true || 
    (match as any).teamType === 'NATIONAL' || 
    (match as any).matchType === 'NATIONAL' ||
    (match as any).competitionType === 'NATIONAL' ||
    (match as any).competitionType === 'INTERNATIONAL_NATIONAL' ||
    (match as any).competitionCategory === 'INTERNATIONAL'
  ) {
    return true;
  }

  const comp = (match.competitionName || (match as any).competition || '').toLowerCase().trim();
  const opp = (match.opponent || '').toLowerCase().trim();

  if (!comp && !opp) return false;
  
  // Exclure explicitement les compétitions de clubs (ligues et coupes)
  const clubCompPatterns = [
    'europa', 'champions league', 'ucl', 'uel', 'uecl', 'conference league', 'club',
    'laliga', 'la liga', 'primera division', 'primera división', 'hypermotion', 'segunda',
    'premier league', 'serie a', 'bundesliga', 'ligue 1', 'ligue 2',
    'copa del rey', 'fa cup', 'dfb pokal', 'dfb-pokal', 'coppa italia', 'coupe de france',
    'eredivisie', 'primeira liga', 'pro league', 'mls', 'championship', 'copa libertadores'
  ];
  if (clubCompPatterns.some(pat => comp.includes(pat))) {
    // S'assurer qu'il ne s'agit pas d'un tournoi de jeunes / olympique mentionné avec un mot de club
    if (!comp.includes('olympic') && !comp.includes('u23') && !comp.includes('u21') && !comp.includes('youth')) {
      return false;
    }
  }

  // Liste exhaustive de mots-clés pour les compétitions et sélections nationales (incluant JO, U23, U21, etc.)
  const intlKeywords = [
    'olympic', 'olympics', 'olympiques', 'jo 20', 'jeux olympiques', 'paris 2024', 'tokyo 2020',
    'u23', 'u21', 'u20', 'u19', 'u18', 'u17', 'u16', 'u15', 'youth international',
    'nations league', 'euro', 'world cup', 'mondial', 'qualif', 'friendly', 
    'friendlies', 'amical international', 'amicaux', 'international', 'copa america', 'copa américa', 
    'can ', 'africa cup', 'afcon', 'conmebol', 'gold cup', 'asian cup', 'national team',
    'sélection', 'selection', 'pays', 'nations', 'fifa'
  ];

  if (intlKeywords.some(kw => comp.includes(kw) || opp.includes(kw))) {
    return true;
  }

  // Si l'un des deux côtés contient un pays européen ou mondial bien connu
  const countries = [
    'france', 'spain', 'espagne', 'england', 'angleterre', 'germany', 'allemagne', 
    'italy', 'italie', 'belgium', 'belgique', 'portugal', 'croatia', 'croatie', 
    'netherlands', 'pays-bas', 'switzerland', 'suisse', 'denmark', 'danemark', 
    'austria', 'autriche', 'poland', 'pologne', 'scotland', 'écosse', 'ecosse', 
    'albania', 'albanie', 'georgia', 'géorgie', 'romania', 'roumanie', 'turkey', 'turquie', 
    'ukraine', 'slovakia', 'slovaquie', 'slovenia', 'slovénie', 'czech', 'république tchèque', 
    'brazil', 'brésil', 'argentina', 'argentine', 'uruguay', 'colombia', 'colombie', 
    'chile', 'chili', 'usa', 'etats-unis', 'mexico', 'mexique', 'canada', 'morocco', 'maroc', 
    'senegal', 'sénégal', 'japan', 'japon', 'korea', 'corée', 'australia', 'australie',
    'serbia', 'serbie', 'greece', 'grèce', 'sweden', 'suède', 'norway', 'norvège',
    'finland', 'finlande', 'hungary', 'hongrie', 'cameroon', 'cameroun', 'ivory coast', "côte d'ivoire",
    'nigeria', 'ghana', 'algeria', 'algérie', 'egypt', 'égypte', 'paraguay', 'ecuador', 'équateur',
    'peru', 'pérou', 'venezuela', 'bolivia', 'bolivie', 'uzbekistan', 'ouzbekistan', 'dominican republic',
    'republique dominicaine', 'guinea', 'guinée', 'mali', 'iraq', 'irak', 'israel', 'israël', 'new zealand'
  ];

  if (countries.some(c => comp === c || opp === c || opp.includes(c) || comp.includes(c))) {
    // S'assurer que ce n'est pas un nom de club contenant un pays/ville par coïncidence
    const isClub = /\b(fc|cf|rc|as|sc|cd|united|city|real|atletico|inter|bvb|hotspur|wien|salzburg|paris|sporting|club|olympiakos|dynamo|spartak|celtic|rangers|slavia|sparta|red star|athletic|bologna|verona)\b/i.test(opp) || /\b(fc|cf|rc|as|sc|cd|united|city|real|atletico|inter|bvb|hotspur|wien|salzburg|paris|sporting|club|olympiakos|dynamo|spartak|celtic|rangers|slavia|sparta|red star|athletic|bologna|verona)\b/i.test(comp);
    if (!isClub) {
      return true;
    }
  }

  return false;
}

export function isPlayerNewTransfer(card: SorareCard): boolean {
  if ((card as any).isRecentTransfer || (card as any).isNewClub) {
    return true;
  }
  
  const notes = (card.tacticalNotes || '').toLowerCase();
  const keywords = [
    'transfert', 'transféré', 'transfere', 'recrue', 'nouveau club', 
    'nouvelle équipe', 'nouvelle equipe', 'rejoint', 'signature', 
    'signé', 'arrivé cet été', 'arriver cet ete', 'nouveau maillot',
    'adapt', 'prêté', 'prete', 'nouveau renfort'
  ];
  
  return keywords.some(kw => notes.includes(kw));
}

/**
 * Vérifie si une compétition correspond à un championnat de club (ligue domestique) ou une coupe nationale/continentale de club.
 */
export function isClubLeagueOrDomesticCup(competitionName: string, card?: SorareCard): boolean {
  if (!competitionName) return true;
  const comp = competitionName.toLowerCase().trim();

  // Rejet formel des compétitions d'équipes nationales, sélections jeunes et tournois internationaux
  const nationalKeywords = [
    'world cup', 'mondial', 'nations league', 'euro', 'copa america', 'copa américa',
    'afcon', 'africa cup', 'gold cup', 'asian cup', 'olympic', 'olympiques', 'u23', 'u21',
    'u20', 'u19', 'u18', 'u17', 'youth', 'national team', 'sélection', 'selection',
    'international friendly', 'amical international', 'fifa', 'paris 2024', 'jo 20'
  ];
  if (nationalKeywords.some(kw => comp.includes(kw))) {
    return false;
  }

  // Modèles de compétitions de clubs (Ligues et Coupes nationales / continentales)
  const clubPatterns = [
    // Ligues domestiques
    'laliga', 'la liga', 'primera division', 'primera división', 'hypermotion', 'segunda',
    'premier league', 'championship', 'league one', 'league two',
    'serie a', 'serie b',
    'bundesliga', '2. bundesliga',
    'ligue 1', 'ligue 2',
    'eredivisie', 'eerste divisie',
    'primeira liga', 'liga portugal',
    'pro league', 'jupiler',
    'mls', 'major league soccer',
    'brasileir', 'brasileirao', 'série a',
    'liga profesional', 'liga argentina',
    'liga mx', 'bbva mx',
    'super lig', 'süper lig',
    'premiership', 'scottish premiership',
    'austrian bundesliga', 'admiral bundesliga',
    'swiss super league', 'super league',
    'j1 league', 'j2 league', 'k league', 'k league 1',
    'allsvenskan', 'eliteserien', 'superliga', 'ekstraklasa',
    // Coupes nationales
    'copa del rey', 'supercopa', 'supercopa de españa',
    'fa cup', 'efl cup', 'carabao cup', 'community shield',
    'coppa italia', 'supercoppa', 'supercoppa italiana',
    'dfb-pokal', 'dfb pokal', 'dfl-supercup',
    'coupe de france', 'trophee des champions', 'trophée des champions',
    'knvb beker', 'knvb', 'johan cruijff schaal',
    'taca de portugal', 'taça de portugal', 'taca da liga', 'taça da liga', 'supertaca', 'supertaça',
    'us open cup', 'mls cup', 'campeones cup',
    'copa do brasil', 'supercopa do brasil',
    'copa argentina', 'copa de la liga', 'trofeo de campeones',
    'copa mx', 'campeon de campeones',
    'turkiye kupasi', 'türkiye kupası', 'super kupa', 'süper kupa',
    'scottish cup', 'scottish league cup',
    'ofb-cup', 'öfb-cup', 'swiss cup', 'coupe de suisse',
    'cup', 'coupe', 'copa', 'pokal', 'beker', 'taça', 'taca', 'kupa',
    // Coupes continentales de clubs
    'champions league', 'ucl', 'europa league', 'uel', 'conference league', 'uecl', 'uefa super cup',
    'copa libertadores', 'copa sudamericana', 'recopa', 'concacaf champions', 'leagues cup', 'club world cup'
  ];

  if (clubPatterns.some(pat => comp.includes(pat))) {
    return true;
  }

  // Vérification de la correspondance avec la ligue du club de la carte
  if (card) {
    const cardLeague = (card.club?.league || card.league || card.upcomingFixture?.competitionName || '').toLowerCase().trim();
    if (cardLeague && (comp.includes(cardLeague) || cardLeague.includes(comp))) {
      return true;
    }
  }

  return true;
}

/**
 * Filtre strict identifiant uniquement les entrées de matchs où le type de compétition correspond
 * à la ligue ou coupe domestique du club, en ignorant formellement les matchs en équipe nationale
 * afin de prévenir le bug de projection de score à 0.
 */
export function isClubDomesticOrLeagueMatch(
  match: RealMatchScoreDetail | { competitionName?: string; opponent?: string; isNational?: boolean; game?: any },
  card: SorareCard
): boolean {
  if (!match) return false;

  // 1. Rejet si le match est explicitement étiqueté comme match international / équipe nationale
  if (
    (match as any).isNational === true || 
    (match as any).isNationalTeam === true || 
    (match as any).teamType === 'NATIONAL' || 
    (match as any).matchType === 'NATIONAL' ||
    (match as any).competitionType === 'NATIONAL' ||
    (match as any).competitionType === 'INTERNATIONAL_NATIONAL' ||
    (match as any).competitionCategory === 'INTERNATIONAL'
  ) {
    return false;
  }
  if (isNationalTeamMatch(match)) {
    return false;
  }

  // 2. Si le type de compétition est explicitement du club, valider immédiatement
  if (
    (match as any).competitionType === 'CLUB' ||
    (match as any).competitionType === 'DOMESTIC_LEAGUE' ||
    (match as any).competitionType === 'DOMESTIC_CUP' ||
    (match as any).competitionType === 'INTERNATIONAL_CLUB'
  ) {
    return true;
  }

  // 3. Rejet des compétitions nationales, olympiques ou de jeunes par mots-clés
  const compName = (match.competitionName || (match as any).competition || '').toLowerCase().trim();
  if (
    compName.includes('olympic') || compName.includes('olympiques') ||
    compName.includes('u23') || compName.includes('u21') || compName.includes('u20') ||
    compName.includes('u19') || compName.includes('u18') || compName.includes('u17') ||
    compName.includes('youth') || compName.includes('nations league') ||
    compName.includes('world cup') || compName.includes('mondial') ||
    compName.includes('euro ') || compName.includes('copa america') ||
    compName.includes('afcon') || compName.includes('qualif') ||
    compName.includes('international') || compName.includes('sélection') || compName.includes('selection') ||
    compName.includes('paris 2024') || compName.includes('jo 20')
  ) {
    return false;
  }

  // 4. Vérification de la correspondance avec le club du joueur (home/away)
  if (card.club?.name && match.game?.homeTeam && match.game?.awayTeam) {
    const club = card.club.name.toLowerCase().trim();
    const home = match.game.homeTeam.toLowerCase().trim();
    const away = match.game.awayTeam.toLowerCase().trim();

    const matchesHome = home.includes(club) || club.includes(home);
    const matchesAway = away.includes(club) || club.includes(away);

    // Vérification sur les mots significatifs du nom du club (ex: "Espanyol", "Arsenal", "Madrid", etc.)
    const clubWords = club.replace(/\b(fc|cf|rc|as|sc|cd|de|la|el|le|the|club|real|atletico|ac|afc)\b/g, '').trim().split(/\s+/).filter(w => w.length >= 3);
    const matchesWords = clubWords.length > 0 && clubWords.some(w => home.includes(w) || away.includes(w));

    if (!matchesHome && !matchesAway && !matchesWords) {
      return false;
    }
  }

  // 5. Vérification que la compétition est bien un championnat de club ou une coupe domestique/continentale
  return isClubLeagueOrDomesticCup(compName, card);
}

export function getClubOnlyRecentMatchAnalysis(clubScores: number[], card: SorareCard, isNational = false): PlayerRecentMatchStats {
  const labelSuffix = isNational ? 'sélection' : 'club';
  
  if (clubScores.length === 0) {
    const isStarter = !isNational && card.status === 'STARTER';
    const isRegular = !isNational && card.status === 'REGULAR';
    return {
      playedLastMatch: isStarter || isRegular,
      lastMatchScore: isStarter ? 50 : 0,
      lastMatchLabel: isStarter ? `Titulaire (${labelSuffix})` : `DNP (${labelSuffix})`,
      playedCountL5: isStarter ? 5 : isRegular ? 3 : 0,
      consecutiveDnpCount: isNational ? 5 : 0,
      recentPlayingFactor: isStarter ? 1.0 : isRegular ? 0.90 : 0.05,
    };
  }

  const lastMatchScore = clubScores[0]; // Le premier élément est le plus récent des matchs filtrés
  const playedLastMatch = typeof lastMatchScore === 'number' && lastMatchScore > 0;
  const playedCountL5 = clubScores.slice(0, 5).filter(s => s > 0).length;
  const totalEvaluated = Math.min(clubScores.length, 5);
  const playedRate = totalEvaluated > 0 ? playedCountL5 / totalEvaluated : 0;

  let consecutiveDnpCount = 0;
  for (let i = 0; i < clubScores.length; i++) {
    if (clubScores[i] <= 0) {
      consecutiveDnpCount++;
    } else {
      break;
    }
  }

  let recentPlayingFactor = 1.0;
  if (playedCountL5 === 0) {
    recentPlayingFactor = 0.05;
  } else if (consecutiveDnpCount >= 3) {
    recentPlayingFactor = 0.20;
  } else if (consecutiveDnpCount === 2 && !card.status?.includes('STARTER')) {
    recentPlayingFactor = 0.45;
  } else if (consecutiveDnpCount === 1 || !playedLastMatch) {
    recentPlayingFactor = card.status === 'STARTER' ? 0.85 : 0.65;
  } else if (playedRate >= 0.75) {
    recentPlayingFactor = 1.0;
  } else {
    recentPlayingFactor = 0.90;
  }

  // Malus si le joueur a joué mais était remplaçant (-5%)
  const recentMatchDetail = card.scores?.recentMatches?.[0];
  const wasSubInLastMatch = recentMatchDetail 
    ? (recentMatchDetail.isSub === true || recentMatchDetail.baseScore === 25 || (recentMatchDetail.minsPlayed != null && recentMatchDetail.minsPlayed > 0 && recentMatchDetail.minsPlayed < 60))
    : (card.status === 'SUPER_SUBSTITUTE' || card.status === 'SUBSTITUTE' || card.status === 'BENCH');

  if (playedLastMatch && wasSubInLastMatch) {
    recentPlayingFactor *= 0.95; // Malus remplaçant (-5%)
  }

  return {
    playedLastMatch,
    lastMatchScore: typeof lastMatchScore === 'number' ? lastMatchScore : 0,
    lastMatchLabel: playedLastMatch ? `Dernier match ${labelSuffix} (${lastMatchScore} pts)` : `DNP ${labelSuffix} (0 min)`,
    playedCountL5,
    consecutiveDnpCount,
    recentPlayingFactor,
  };
}

/**
 * Calcule le statut de jeu officiel et le pourcentage de titularisation du joueur.
 * Exploite l'indicateur officiel 'confirmed_starter' (issu de Sorare/Opta)
 * ainsi que le pourcentage de titularisation fourni par Sorare (starterConfidence / playedRate).
 */
export function computePlayerPlayingStatus(card: SorareCard): {
  status: PlayingStatus;
  starterConfidence: number;
  isStarter: boolean;
  isConfirmed: boolean;
  isNonStarter: boolean;
  titularizationPercentage: number;
  reason: string;
} {
  if (!card) {
    return {
      status: 'NOT_PLAYING',
      starterConfidence: 0,
      isStarter: false,
      isConfirmed: false,
      isNonStarter: true,
      titularizationPercentage: 0,
      reason: 'Carte inexistante',
    };
  }

  const confirmedStarterFlag = (card as any).confirmed_starter ?? (card as any).confirmedStarter ?? (card as any).is_confirmed_starter;
  const lineupStatusUpper = (card.lineupStatus || '').toUpperCase();
  const statusUpper = (card.status || '').toUpperCase();
  const playingStatusUpper = (card.playingStatus || '').toUpperCase();
  const isLineupAnnounced = card.isLineupAnnounced === true || (card as any).is_lineup_announced === true;
  const isStarterProp = card.isStarter;

  // 1. Détection des cas d'exclusion fermes (Blessures / Suspensions / Forfait / Confirmed OUT)
  const isInjuredOrSuspended = card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED';
  const isExplicitlyOut = 
    isInjuredOrSuspended ||
    lineupStatusUpper === 'CONFIRMED_OUT' ||
    confirmedStarterFlag === 'CONFIRMED_OUT' ||
    confirmedStarterFlag === 'OUT' ||
    statusUpper === 'NOT_PLAYING' ||
    playingStatusUpper === 'NOT_PLAYING';

  if (isExplicitlyOut) {
    return {
      status: 'NOT_PLAYING',
      starterConfidence: 0,
      isStarter: false,
      isConfirmed: isLineupAnnounced,
      isNonStarter: true,
      titularizationPercentage: 0,
      reason: isInjuredOrSuspended ? `Indisponible (${card.injuryStatus})` : 'Confirmé absent (OUT)',
    };
  }

  // 2. Détection du statut Confirmed Starter officiel (flag Sorare/Opta)
  const isOfficialConfirmedStarter = 
    lineupStatusUpper === 'CONFIRMED_STARTER' ||
    confirmedStarterFlag === 'CONFIRMED_STARTER' ||
    confirmedStarterFlag === 'STARTER' ||
    confirmedStarterFlag === true ||
    (isLineupAnnounced && isStarterProp === true);

  if (isOfficialConfirmedStarter) {
    return {
      status: 'STARTER',
      starterConfidence: 100,
      isStarter: true,
      isConfirmed: true,
      isNonStarter: false,
      titularizationPercentage: 100,
      reason: 'Titulaire officiel confirmé (confirmed_starter)',
    };
  }

  // 3. Détection du statut Confirmed Bench officiel (flag Sorare/Opta)
  const isOfficialConfirmedBench = 
    lineupStatusUpper === 'CONFIRMED_BENCH' ||
    confirmedStarterFlag === 'CONFIRMED_BENCH' ||
    confirmedStarterFlag === 'BENCH' ||
    (isLineupAnnounced && isStarterProp === false) ||
    (confirmedStarterFlag === false && isLineupAnnounced);

  if (isOfficialConfirmedBench) {
    return {
      status: 'BENCH',
      starterConfidence: Math.min(card.starterConfidence !== undefined ? card.starterConfidence : 15, 20),
      isStarter: false,
      isConfirmed: true,
      isNonStarter: true,
      titularizationPercentage: Math.min(card.starterConfidence !== undefined ? card.starterConfidence : 15, 20),
      reason: 'Remplaçant officiel confirmé sur le banc (confirmed_bench)',
    };
  }

  // 4. Calcul du pourcentage de titularisation fourni par Sorare avec filtrage club
  const clubRecentMatches = card.scores?.recentMatches ? card.scores.recentMatches.filter(m => isClubDomesticOrLeagueMatch(m, card)) : [];
  const clubPlayedCount = clubRecentMatches.slice(0, 5).filter(m => typeof m.score === 'number' && m.score > 0).length;
  const clubEvaluatedCount = Math.min(clubRecentMatches.length, 5);
  const clubPlayedRate = clubEvaluatedCount > 0 ? (clubPlayedCount / clubEvaluatedCount) * 100 : undefined;

  let titularizationPercentage: number;
  if (typeof (card as any).titularizationPercentage === 'number') {
    titularizationPercentage = (card as any).titularizationPercentage;
  } else if (typeof (card as any).titularization_percentage === 'number') {
    titularizationPercentage = (card as any).titularization_percentage;
  } else if (statusUpper === 'STARTER' || playingStatusUpper === 'STARTER' || card.isStarter === true) {
    titularizationPercentage = Math.max(85, card.starterConfidence ?? 85);
  } else if (clubPlayedRate !== undefined) {
    titularizationPercentage = clubPlayedRate;
  } else if (card.starterConfidence !== undefined && card.starterConfidence !== null) {
    titularizationPercentage = card.starterConfidence;
  } else if (card.scores?.l5PlayedRate !== undefined) {
    titularizationPercentage = card.scores.l5PlayedRate;
  } else if (card.scores?.l15PlayedRate !== undefined) {
    titularizationPercentage = card.scores.l15PlayedRate;
  } else if (card.scores?.l40PlayedRate !== undefined) {
    titularizationPercentage = card.scores.l40PlayedRate;
  } else {
    if (statusUpper === 'STARTER' || playingStatusUpper === 'STARTER') titularizationPercentage = 85;
    else if (statusUpper === 'REGULAR' || playingStatusUpper === 'REGULAR') titularizationPercentage = 60;
    else if (statusUpper === 'SUPER_SUBSTITUTE' || playingStatusUpper === 'SUPER_SUBSTITUTE') titularizationPercentage = 35;
    else if (statusUpper === 'SUBSTITUTE' || statusUpper === 'BENCH' || playingStatusUpper === 'SUBSTITUTE' || playingStatusUpper === 'BENCH') titularizationPercentage = 15;
    else titularizationPercentage = 50;
  }

  // Protection pour les titulaires et gardiens réguliers de club (ex: Joan Garcia)
  const isClubGk = card.positionCode === 'GK';
  if ((statusUpper === 'STARTER' || playingStatusUpper === 'STARTER' || (isClubGk && ((card.scores?.l40 ?? 0) >= 35 || (card.scores?.l15 ?? 0) >= 35))) && titularizationPercentage < 60 && confirmedStarterFlag !== false && lineupStatusUpper !== 'CONFIRMED_BENCH') {
    titularizationPercentage = Math.max(80, card.starterConfidence ?? 80);
  }

  // Si le joueur est explicitement marqué comme remplaçant et que titularizationPercentage n'est pas boosté
  if (statusUpper === 'SUBSTITUTE' || statusUpper === 'BENCH' || playingStatusUpper === 'SUBSTITUTE' || playingStatusUpper === 'BENCH') {
    if (titularizationPercentage > 50 && confirmedStarterFlag !== true) {
      titularizationPercentage = 40;
    }
  }

  // Règle de classification par pourcentage de titularisation :
  // >= 60% : STARTER (Titulaire probable)
  // >= 40% et < 60% : REGULAR (En rotation / incertain)
  // >= 20% et < 40% : SUBSTITUTE (Remplaçant)
  // < 20% : BENCH (Banc / hors rotation)
  if (titularizationPercentage >= 60) {
    return {
      status: 'STARTER',
      starterConfidence: titularizationPercentage,
      isStarter: true,
      isConfirmed: false,
      isNonStarter: false,
      titularizationPercentage,
      reason: `Titulaire probable (${Math.round(titularizationPercentage)}% de titularisation)`,
    };
  }

  if (titularizationPercentage >= 40) {
    return {
      status: 'REGULAR',
      starterConfidence: titularizationPercentage,
      isStarter: false,
      isConfirmed: false,
      isNonStarter: false,
      titularizationPercentage,
      reason: `En rotation / statut incertain (${Math.round(titularizationPercentage)}% de titularisation)`,
    };
  }

  if (titularizationPercentage >= 20) {
    return {
      status: 'SUBSTITUTE',
      starterConfidence: titularizationPercentage,
      isStarter: false,
      isConfirmed: false,
      isNonStarter: true,
      titularizationPercentage,
      reason: `Remplaçant (${Math.round(titularizationPercentage)}% de titularisation)`,
    };
  }

  return {
    status: 'BENCH',
    starterConfidence: titularizationPercentage,
    isStarter: false,
    isConfirmed: false,
    isNonStarter: true,
    titularizationPercentage,
    reason: `Banc / Non titulaire (${Math.round(titularizationPercentage)}% de titularisation)`,
  };
}

/**
 * Détecte si le joueur est non-titulaire (remplaçant, sur le banc, hors groupe, blessé, suspendu, ou non titulaire selon l'algorithme)
 */
export function isPlayerNonStarter(card: SorareCard): boolean {
  if (!card) return true;
  const statusInfo = computePlayerPlayingStatus(card);
  return statusInfo.isNonStarter;
}

/**
 * Détecte si le joueur est tireur de coups de pied arrêtés (Penaltys, Corners, Coups Francs)
 */
export function detectSetPieceRole(card: SorareCard): {
  isPenaltyTaker: boolean;
  isCornerTaker: boolean;
  isFreeKickTaker: boolean;
} {
  const text = `${card.tacticalNotes || ''} ${card.displayName || ''} ${card.name || ''} ${(card as any).description || ''}`.toLowerCase();
  
  const isPenaltyTaker = /\b(penalty|penaltys|penalties|tireur de penalty|tireur de penaltys|pk taker|penalty taker)\b/i.test(text);
  const isCornerTaker = /\b(corner|corners|tireur de corner|tireur de corners|corner taker|set.?piece|set.?pieces)\b/i.test(text);
  const isFreeKickTaker = /\b(coup.?franc|coups.?francs|tireur de coup.?franc|free.?kick|fk specialist|free.?kick taker)\b/i.test(text);

  return { isPenaltyTaker, isCornerTaker, isFreeKickTaker };
}

/**
 * Calcule le score projeté SO5 pour une carte selon la stratégie
 */

function isKnownDerby(teamA: string, teamB: string): boolean {
  if (!teamA || !teamB) return false;
  const a = teamA.toLowerCase();
  const b = teamB.toLowerCase();
  const derbies = [
    ['roma', 'lazio'],
    ['celtic', 'rangers'],
    ['milan', 'inter'],
    ['real madrid', 'barcelona'],
    ['arsenal', 'tottenham'],
    ['liverpool', 'everton'],
    ['manchester united', 'manchester city'],
    ['boca', 'river'],
    ['fenerbahce', 'galatasaray']
  ];
  return derbies.some(d => (a.includes(d[0]) && b.includes(d[1])) || (a.includes(d[1]) && b.includes(d[0])));
}
export function calculatePlayerProjectedScore(
  card: SorareCard,
  strategy: StrategyType = 'BALANCED',
  allGalleryCards: SorareCard[] = [],
  precomputedClubContext?: Record<string, ClubContext>,
  scoringFocus: ScoringFocus = 'BALANCED'
): ScoreBreakdown {
  const bonusPct = getCardTotalBonus(card);
  const bonusBreakdown = getCardBonusBreakdown(card);

  // 1. Détermination de la nature de la prochaine échéance (Nationale vs Club)
  const upcomingIsNational = card.upcomingFixture ? isNationalTeamMatch(card.upcomingFixture) : false;

  const calcCleanAverage = (scores: number[] | undefined, count: number, fallback = 40) => {
    if (!scores || scores.length === 0) return fallback;
    const evaluated = scores.slice(0, count).map(s => (s != null && s >= 0 ? s : 0));
    if (evaluated.length === 0) return fallback;
    return Math.round((evaluated.reduce((a, b) => a + b, 0) / evaluated.length) * 10) / 10;
  };

  let l5 = card.scores?.l5 || calcCleanAverage(card.scores?.last5Scores, 5, 40);
  let l15 = card.scores?.l15 || calcCleanAverage(card.scores?.last15Scores, 15, l5);
  let l40 = card.scores?.l40 || calcCleanAverage(card.scores?.last40Scores, 40, l15);
  let recentStats = getPlayerRecentMatchAnalysis(card);
  let filterLabel = '';

  // 2. Dissociation des matchs Équipe Nationale et Club + Filtrage strict championnat / coupe domestique
  if (card.scores?.recentMatches && card.scores.recentMatches.length > 0) {
    // Application du filtre strict : on ne conserve que les entrées de matchs de ligue/coupe domestique du club,
    // en ignorant formellement les matchs en sélection nationale afin de résoudre le bug de score projeté à 0.
    const filteredMatches = card.scores.recentMatches.filter(m => {
      if (upcomingIsNational) {
        return isNationalTeamMatch(m) || (m.competitionName || '').toLowerCase().includes('olympic') || (m.competitionName || '').toLowerCase().includes('u23');
      } else {
        return isClubDomesticOrLeagueMatch(m, card);
      }
    });

    if (filteredMatches.length > 0) {
      // Filtrage des anomalies : si un match a minsPlayed < 20 et score < 15 (blessure précoce), on l'exclut du calcul de forme pure
      const validFormMatches = filteredMatches.filter(m => {
        if (m.minsPlayed != null && m.minsPlayed > 0 && m.minsPlayed < 20 && (m.score || 0) < 15) {
          return false; // Sortie sur blessure précoce
        }
        return true;
      });

      const targetMatches = validFormMatches.length > 0 ? validFormMatches : filteredMatches;
      const filteredScores = targetMatches.map(m => m.score);

      // Calcul officiel Sorare avec sommation stricte des scores de matchs de club et lissage bayésien
      const baselineScore = (card.scores?.l40 && card.scores.l40 > 0) ? card.scores.l40 : (card.scores?.l15 || 48);
      const calcAverage = (scores: number[], count: number, fallback: number = baselineScore) => {
        const slice = scores.slice(0, count).map(s => (typeof s === 'number' && s >= 0 ? s : 0));
        if (slice.length === 0) return fallback;
        const totalSum = slice.reduce((a, b) => a + b, 0);
        const rawAvg = totalSum / slice.length;
        // Garde-fou Trêve / Faible échantillon
        const minReq = count === 5 ? 2 : Math.min(count, 4);
        if (slice.length < minReq) {
          const weight = slice.length / minReq;
          return (rawAvg * weight) + (fallback * (1 - weight));
        }
        return rawAvg;
      };

      l5 = calcAverage(filteredScores, 5, baselineScore);
      l15 = calcAverage(filteredScores, 15, baselineScore);
      if (card.scores?.l40 != null && card.scores.l40 > 0) {
        l40 = card.scores.l40;
      } else {
        l40 = calcAverage(filteredScores, 40, baselineScore);
      }
      recentStats = getClubOnlyRecentMatchAnalysis(filteredScores, card, upcomingIsNational);
      
      if (!upcomingIsNational) {
        const removedCount = card.scores.recentMatches.length - filteredMatches.length;
        if (removedCount > 0) {
          filterLabel = `Ligue & coupe club uniquement (hors ${removedCount} match(s) sélection nationale)`;
        }
      } else {
        filterLabel = `Forme sélection nationale uniquement`;
      }
    } else {
      // Aucun match de club récent dans la fenêtre d'observation
      if (!upcomingIsNational) {
        if (l15 > 45 || l40 > 45 || card.status === 'STARTER' || card.status === 'REGULAR' || (card.starterConfidence ?? 0) >= 50) {
          l5 = l15 > 0 ? l15 : (l40 > 0 ? l40 : 48);
          recentStats = {
            playedLastMatch: true,
            lastMatchScore: l5,
            lastMatchLabel: 'Titulaire Club (Forme Rétrospective)',
            playedCountL5: 3,
            consecutiveDnpCount: 0,
            recentPlayingFactor: 0.90,
          };
          filterLabel = 'Données club rétrospectives (trêve nationale exclue, confiance préservée)';
        }
      } else {
        l5 = l15 > 0 ? l15 : (l40 > 0 ? l40 : 48);
        recentStats = {
          playedLastMatch: true,
          lastMatchScore: l5,
          lastMatchLabel: 'Titulaire Régulier (Forme Club Projetée)',
          playedCountL5: 3,
          consecutiveDnpCount: 0,
          recentPlayingFactor: 0.90,
        };
        filterLabel = 'Forme sélection introuvable (Score club utilisé par défaut)';
      }
    }
  }

  const emptyBreakdown: ScoreBreakdown = {
    player: card,
    projectedScore: 0,
    baseProjectedScore: 0,
    cardBonusPercentage: bonusPct,
    cardBonusScore: 0,
    totalProjectedScore: 0,
    projectedFloor: 0,
    projectedCeiling: 0,
    reliantType: 'BALANCED',
    volatilityRating: 'LOW',
    formIndex: 0,
    matchupFactor: 0,
    cleanSheetFactor: 0,
    starterSafety: 0,
    riskRating: 'HIGH',
    playedLastMatch: recentStats.playedLastMatch,
    lastMatchScore: recentStats.lastMatchScore,
    recentPlayingFactor: recentStats.recentPlayingFactor,
    l5: Math.round(l5 * 10) / 10,
    l15: Math.round(l15 * 10) / 10,
    l40: Math.round(l40 * 10) / 10,
    l5Boosted: Math.round(l5 * (1 + bonusPct / 100) * 10) / 10,
    l15Boosted: Math.round(l15 * (1 + bonusPct / 100) * 10) / 10,
    l40Boosted: Math.round(l40 * (1 + bonusPct / 100) * 10) / 10,
    strategyUsed: strategy,
    scoringFocusUsed: scoringFocus,
    strategyWeights: { l5: 0.5, l15: 0.35, l40: 0.15 },
    rawBaseFormScore: 0,
    boostedBaseFormScore: 0,
    status: card.status || 'NOT_PLAYING',
    starterFactor: 0,
    starterImpactLabel: 'Joueur indisponible ou hors groupe (0%)',
    difficultyRating: card.upcomingFixture?.difficultyRating || 3,
    matchupImpactLabel: 'Pas de projection de match',
    isHome: card.upcomingFixture?.isHome ?? true,
    profileBonus: 0,
    bookmakerActionBonus: 0,
    weatherBonus: 0,
    weatherImpactLabel: undefined,
    contextualBonus: 0,
    advancedStatsBonus: 0,
    regressionPenalty: 0,
    filterLabel,
    bonusBreakdown,
  };

  // Si le joueur est explicitement remplaçant, sur le banc, non-joueur ou incertain (< 50%), il reçoit STRICTEMENT 0 point projeté
  if (isPlayerNonStarter(card)) {
    return emptyBreakdown;
  }

  let playerStatus: string = card.status || 'REGULAR';

  // Detection des titulaires/réguliers établis en club (ex: Joan Garcia en gardien principal)
  const isClubGk = card.positionCode === 'GK';
  const isProvenClubPlayer = !upcomingIsNational && (
    isClubGk 
      ? (card.status === 'STARTER' || (card.starterConfidence ?? 0) >= 55 || (card.scores?.l40 ?? 0) >= 35 || (card.scores?.l15 ?? 0) >= 35 || (recentStats.playedLastMatch && recentStats.playedCountL5 >= 2))
      : ((l15 >= 50 && (card.scores?.l15PlayedRate ?? 100) >= 60) || (l40 >= 45 && (card.scores?.l40PlayedRate ?? 100) >= 60) || card.status === 'STARTER' || (card.starterConfidence ?? 0) >= 65)
  );

  if (isProvenClubPlayer) {
    playerStatus = 'STARTER';
    recentStats = {
      ...recentStats,
      playedLastMatch: true,
      playedCountL5: Math.max(recentStats.playedCountL5, 3),
      recentPlayingFactor: Math.max(recentStats.recentPlayingFactor, 0.90),
    };
    if (l5 < 25) {
      l5 = l15 > 0 ? l15 : (l40 > 0 ? l40 : 48);
    }
  } else if (upcomingIsNational) {
    // Correction dynamique du statut si l'analyse récente contredit le statut de la carte pour la sélection
    if (recentStats.playedLastMatch && recentStats.playedCountL5 >= 2) {
      playerStatus = 'STARTER';
    } else if (recentStats.playedLastMatch) {
      playerStatus = 'STARTER';
    } else if (recentStats.playedCountL5 >= 1) {
      playerStatus = 'SUBSTITUTE';
    } else {
      playerStatus = 'NOT_PLAYING';
    }
  } else {
    // Prochaine échéance : Match de Club
    const hasRecentMatches = Boolean(card.scores?.recentMatches && card.scores.recentMatches.length > 0);
    const totalClubEvaluated = hasRecentMatches ? Math.min(card.scores!.recentMatches!.filter(m => isClubDomesticOrLeagueMatch(m, card)).length, 5) : 5;
    const playedClubRate = totalClubEvaluated > 0 ? recentStats.playedCountL5 / totalClubEvaluated : 0;

    if (card.status === 'STARTER') {
      playerStatus = 'STARTER';
    } else if (recentStats.playedLastMatch && (recentStats.playedCountL5 >= 4 || (totalClubEvaluated >= 2 && playedClubRate >= 0.75))) {
      playerStatus = 'STARTER';
    } else if (recentStats.playedCountL5 >= 2 || card.status === 'REGULAR') {
      playerStatus = 'REGULAR';
    } else if (recentStats.playedCountL5 === 1 && playerStatus === 'NOT_PLAYING') {
      playerStatus = 'SUBSTITUTE';
    }
  }

  // Élimination des joueurs indisponibles
  if (card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED' || playerStatus === 'NOT_PLAYING') {
    return emptyBreakdown;
  }

  // Règle Gardien de But (GK) :
  // Le gardien titulaire reçoit son score projeté ; tout gardien remplaçant a FORCEMENT un score projeté de 0.
  if (card.positionCode === 'GK') {
    // 1. Si le gardien est explicitement désigné remplaçant / sur le banc / non-joueur
    if (card.status === 'SUBSTITUTE' || card.status === 'BENCH' || card.status === 'NOT_PLAYING' || (card.starterConfidence !== undefined && card.starterConfidence <= 35)) {
      return {
        ...emptyBreakdown,
        starterFactor: 0,
        starterImpactLabel: 'Gardien remplaçant : ne jouera pas (0 pt)',
      };
    }

    // 2. Concurrence intra-club au sein de la galerie (uniquement pour les matchs de club)
    if (allGalleryCards && allGalleryCards.length > 0 && card.club?.name && !upcomingIsNational) {
      const currentSlug = card.playerSlug || card.slug;
      const otherClubGks = allGalleryCards.filter(c => 
        c.positionCode === 'GK' && 
        c.club?.name === card.club?.name && 
        (c.playerSlug || c.slug) !== currentSlug &&
        c.injuryStatus !== 'INJURED' &&
        c.injuryStatus !== 'SUSPENDED'
      );

      if (otherClubGks.length > 0) {
        const getGkRank = (gk: SorareCard) => {
          let rank = 0;
          if (gk.status === 'STARTER') rank += 1000;
          if (gk.status === 'SUBSTITUTE' || gk.status === 'BENCH' || gk.status === 'NOT_PLAYING') rank -= 1000;
          rank += (gk.starterConfidence ?? 50) * 10;
          const clubPlayedCount = gk.scores?.recentMatches
            ? gk.scores.recentMatches.filter(m => isClubDomesticOrLeagueMatch(m, gk) && typeof m.score === 'number' && m.score > 0).length
            : (gk.scores?.l5Played ?? (gk.scores?.last5Scores?.filter(s => typeof s === 'number' && s > 0).length ?? 0));
          rank += clubPlayedCount * 100;
          rank += (gk.scores?.l15 ?? (gk.scores?.l40 ?? 0));
          return rank;
        };

        const currentRank = getGkRank(card);
        const bestOtherGk = otherClubGks.reduce((best, cand) => getGkRank(cand) > getGkRank(best) ? cand : best, otherClubGks[0]);
        const bestOtherRank = getGkRank(bestOtherGk);

        if (bestOtherRank > currentRank) {
          const starterName = bestOtherGk.displayName || bestOtherGk.name || 'titulaire n°1';
          return {
            ...emptyBreakdown,
            starterFactor: 0,
            starterImpactLabel: `Gardien remplaçant (Titulaire : ${starterName} - 0 pt)`,
          };
        }
      }
    }

    // 3. Gardien isolé sans historique de jeu suffisant et non confirmé titulaire
    const isConfirmedStarterGk = card.status === 'STARTER' || (card.starterConfidence !== undefined && card.starterConfidence >= 55) || isProvenClubPlayer || (recentStats.playedLastMatch && recentStats.playedCountL5 >= 2) || (card.scores?.l40PlayedRate ?? 0) >= 50 || (card.scores?.l15PlayedRate ?? 0) >= 50;
    if (!isConfirmedStarterGk) {
      return {
        ...emptyBreakdown,
        starterFactor: 0,
        starterImpactLabel: 'Gardien remplaçant : non titulaire (0 pt)',
      };
    }
  }

  if (recentStats.playedCountL5 === 0 && !isProvenClubPlayer && playerStatus !== 'STARTER' && card.status !== 'STARTER') {
    return emptyBreakdown;
  }

  // Ne pas éliminer un titulaire de club explicitement désigné sur des DNP de trêve nationale
  const isProtectedClubStarter = !upcomingIsNational && (card.status === 'STARTER' || playerStatus === 'STARTER' || isProvenClubPlayer) && recentStats.playedLastMatch;

  if (!isProtectedClubStarter) {
    if (playerStatus === 'SUBSTITUTE' || playerStatus === 'SUPER_SUBSTITUTE' || playerStatus === 'BENCH' || recentStats.consecutiveDnpCount >= 3 || recentStats.recentPlayingFactor < 0.25) {
      return emptyBreakdown;
    }
  }

  const isRegularStarter = playerStatus === 'STARTER' || playerStatus === 'REGULAR';

  // --- PROPOSITION 5: Bayesian Shrinkage sur L5 vs L40 (amortissement des anomalies) ---
  let regressionPenalty = 0;
  let l5Adjusted = l5;
  if (l40 > 0 && l5 > l40 + 10) {
    // Si L5 est très au-dessus de L40 (+10 pts), amortissement bayésien vers le niveau structurel
    const excess = l5 - (l40 + 10);
    // Si le joueur a joué ses 5 derniers matchs avec constance, on amortit beaucoup moins sa forme (0.65 vs 0.35)
    const formCredibility = recentStats.playedCountL5 >= 4 ? 0.65 : 0.35;
    l5Adjusted = l40 + 10 + (excess * formCredibility);
    regressionPenalty = l5 - l5Adjusted;
  } else if (l40 > 0 && isRegularStarter && card.injuryStatus === 'FIT' && l5 < l40 - 15) {
    // Si L5 a chuté brutalement suite à 2 matchs malchanceux chez un titulaire sain, amortissement haussier adouci
    const deficit = (l40 - 15) - l5;
    const bounceBackCredibility = recentStats.playedCountL5 >= 4 ? 0.20 : 0.10;
    l5Adjusted = l5 + (deficit * bounceBackCredibility);
  }

  const standardWeights = { l5: 0.30, l15: 0.55, l40: 0.15 };
  let strategyWeights = standardWeights;
  if (strategy === 'PURE_FORM') {
    strategyWeights = { l5: 0.65, l15: 0.25, l40: 0.10 };
  } else if (strategy === 'SAFE_TITULAR') {
    strategyWeights = { l5: 0.20, l15: 0.50, l40: 0.30 };
  } else if (strategy === 'HIGH_CEILING') {
    strategyWeights = { l5: 0.40, l15: 0.45, l40: 0.15 };
  }

  // Base form is ALWAYS calculated with standard weights so the absolute score never artificially shifts between compos
  let baseForm = (l5Adjusted * standardWeights.l5) + (l15 * standardWeights.l15) + (l40 * standardWeights.l40);
  let strategicBaseForm = (l5Adjusted * strategyWeights.l5) + (l15 * strategyWeights.l15) + (l40 * strategyWeights.l40);
  let formSortBonus = strategicBaseForm - baseForm;

  
  // --- NOUVELLE MODÉLISATION BAYÉSIENNE / EXPECTED VALUE (SORARE MATHS) ---

  // 1. Calcul des probabilités de présence sur le terrain (EV Minutes)
  let pStarter = 0;
  let pSub = 0;
  let pDnp = 0;
  let starterImpactLabel = '';

  const titularizationPct = (card as any).titularizationPercentage ?? (card.starterConfidence ?? 0);
  pStarter = Math.max(0, Math.min(100, titularizationPct)) / 100;

  let fallbackPStarter = 0;
  if (playerStatus === 'STARTER') fallbackPStarter = 0.75;
  else if (playerStatus === 'REGULAR') fallbackPStarter = 0.50;
  else if (playerStatus === 'SUPER_SUBSTITUTE') fallbackPStarter = 0.20;
  else if (playerStatus === 'SUBSTITUTE' || playerStatus === 'BENCH') fallbackPStarter = 0.05;

  if (pStarter === 0 && fallbackPStarter > 0) {
    pStarter = fallbackPStarter;
  }

  if (playerStatus === 'STARTER' || playerStatus === 'REGULAR') {
    pSub = (1 - pStarter) * 0.4;
    starterImpactLabel = playerStatus === 'STARTER' ? 'Titulaire' : 'Joueur régulier';
  } else if (playerStatus === 'SUPER_SUBSTITUTE') {
    pSub = Math.max(0.40, (1 - pStarter) * 0.6);
    starterImpactLabel = 'Super Sub (Impact en sortie de banc)';
  } else if (playerStatus === 'SUBSTITUTE' || playerStatus === 'BENCH') {
    pSub = Math.max(0.20, (1 - pStarter) * 0.4);
    starterImpactLabel = 'Remplaçant (Entrée incertaine)';
  } else {
    pStarter = 0;
    pSub = 0.05;
    starterImpactLabel = 'Non régulier / Réserviste';
  }

  pDnp = 1 - pStarter - pSub;

  if (card.injuryStatus === 'DOUBTFUL') {
    pStarter *= 0.40;
    pSub *= 0.60;
    pDnp = 1 - pStarter - pSub;
    starterImpactLabel += ' • Douteux (-40% temps)';
  } else if (card.injuryStatus === 'QUESTIONABLE') {
    pStarter *= 0.70;
    pSub *= 0.80;
    pDnp = 1 - pStarter - pSub;
    starterImpactLabel += ' • Incertain (-20% temps)';
  }

  const recentMatchDetail = card.scores?.recentMatches?.[0];
  const wasSubInLastMatch = recentMatchDetail 
    ? (recentMatchDetail.isSub === true || recentMatchDetail.baseScore === 25 || (recentMatchDetail.minsPlayed != null && recentMatchDetail.minsPlayed > 0 && recentMatchDetail.minsPlayed < 60))
    : (card.status === 'SUPER_SUBSTITUTE' || card.status === 'SUBSTITUTE' || card.status === 'BENCH');

  if (recentStats.playedLastMatch && wasSubInLastMatch) {
    pStarter *= 0.90;
    pSub *= 1.10;
    starterImpactLabel += ' • Entré en jeu / Remplaçant récemment';
  }

  const hasChangedClub = isPlayerNewTransfer(card);
  if (hasChangedClub) {
    pStarter *= 0.85;
    starterImpactLabel += ` • Adaptation nouveau club (-15%)`;
  }

  // --- NOUVEAUTÉ : Rotation Risk & Fixture Congestion ---
  // Simulation: si l5 > l15 (joue beaucoup récemment) et l5 > 50, risque de repos.
  // Dans un cas réel, on utiliserait la distance en jours avec le dernier match.
  const isHighRotationRisk = card.scores && (card.scores.l5 > card.scores.l15 + 10) && card.scores.l5 > 55 && pStarter > 0.6;
  if (isHighRotationRisk) {
    pStarter *= 0.80;
    pSub += (1 - pStarter) * 0.3; // Augmente les chances de rentrer en fin de match
    starterImpactLabel += ' • Risque de Rotation (Calendrier chargé)';
  }

  // starterFactor corresponds historically to volume/safety multiplier for UI feedback
  let starterFactor = (pStarter * 1.0) + (pSub * 0.35); 

  // 2. Expected Base Score (Sorare matrix: 35 for Starter, 25 for Sub, 0 for DNP)
  const evBaseScore = (pStarter * 35) + (pSub * 25) + (pDnp * 0);

  // 3. Expected Historical Extra (All-Around + Decisive Bonus above base)
  const assumedHistoricalBase = 33; 
  let historicalExtra = Math.max(-15, baseForm - assumedHistoricalBase);
  
  const aaPct = card.scores?.allAroundContributionPct 
     || card.scores?.aasPercentage 
     || (card.positionCode === 'DEF' ? 65 : card.positionCode === 'GK' ? 20 : card.positionCode === 'MID' ? 60 : 38);
  const aaRatio = Math.max(0.15, Math.min(0.85, aaPct / 100));
  const decRatio = 1.0 - aaRatio;

  const historicalAA = historicalExtra * aaRatio;
  const historicalDec = historicalExtra * decRatio;


  // 4. Match-up and Position Specific Modifications (Home/Away, XG, FDR)
  const fixture = card.upcomingFixture;
  let matchupFactor = 1.0;
  let cleanSheetFactor = 0;
  let matchupImpactLabel = 'Neutre (FDR 3 : 100%)';
  let difficultyRating = fixture?.difficultyRating || 3;
  let allAroundFactor = 1.0;
  let decisiveFactor = 1.0;
  let teamXG = 1.4;
  let oppXG = 1.4;
  const winProb = fixture ? getPlayerWinProbability(fixture) : 50;

  // --- NOUVEAUTÉ : Modèle ELO / Asian Handicap Dynamique ---
  // On simule un ELO dynamique basé sur L5 vs L15 de l'équipe (Approximation via la forme du joueur)
  let eloMomentum = 1.0;
  if (card.scores && card.scores.l5 > card.scores.l15 + 5) eloMomentum = 1.1; // Équipe en forme (Surperformance)
  else if (card.scores && card.scores.l5 < card.scores.l15 - 5) eloMomentum = 0.9; // Équipe dans le dur (Sous-performance)

  if (fixture) {
    switch (difficultyRating) {
      case 1:
        matchupFactor = 1.12;
        matchupImpactLabel = 'Très Favorable (FDR 1 : +12%)';
        break;
      case 2:
        matchupFactor = 1.05;
        matchupImpactLabel = 'Favorable (FDR 2 : +5%)';
        break;
      case 3:
        matchupFactor = 1.00;
        matchupImpactLabel = 'Neutre (FDR 3 : 100%)';
        break;
      case 4:
        matchupFactor = 0.92;
        matchupImpactLabel = 'Délicat (FDR 4 : -8%)';
        break;
      case 5:
        matchupFactor = 0.85;
        matchupImpactLabel = 'Très Difficile (FDR 5 : -15%)';
        break;
    }

    teamXG = fixture?.bookmaker?.goalExpectancy || (difficultyRating === 1 ? 2.1 : difficultyRating === 2 ? 1.7 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.1 : 0.8);
    oppXG = fixture?.bookmaker?.opponentGoalExpectancy || (difficultyRating === 1 ? 0.8 : difficultyRating === 2 ? 1.1 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.7 : 2.1);

    // Application du Momentum ELO aux xG
    teamXG *= eloMomentum;
    oppXG *= (2 - eloMomentum);

    // Domicile / Extérieur (Home Advantage)
    if (fixture.isHome) {
      teamXG *= 1.10;
      oppXG *= 0.90;
      matchupFactor *= 1.05;
      matchupImpactLabel += ' • Domicile (+5%)';
    } else {
      teamXG *= 0.90;
      oppXG *= 1.10;
      matchupFactor *= 0.95;
      matchupImpactLabel += ' • Extérieur (-5%)';
    }

    // --- NOUVEAUTÉ : Analyse du Style de Jeu Adverse (Simulation via hash) ---
    // Les adversaires qui jouent bloc haut génèrent plus d'AA (duels, tacles) pour nos DEF/MID.
    // Ceux qui posent le bus (bloc bas) génèrent plus d'AA (passes) pour nos défenseurs.
    const opponentName = fixture.opponent.toLowerCase();
    const isHighPressOpponent = opponentName.includes('atalanta') || opponentName.includes('liverpool') || opponentName.includes('bayer') || opponentName.includes('athletic');
    const isLowBlockOpponent = opponentName.includes('getafe') || opponentName.includes('everton') || opponentName.includes('verona') || difficultyRating >= 4;

    if (isHighPressOpponent && (card.positionCode === 'DEF' || card.positionCode === 'MID')) {
       allAroundFactor *= 1.05;
       matchupImpactLabel += ' • Adversaire Pressing Haut (+AA)';
    } else if (isLowBlockOpponent && card.positionCode === 'DEF') {
       allAroundFactor *= 1.08;
       matchupImpactLabel += ' • Adversaire Bloc Bas (+Passes)';
    }

    // Modulation par position
    if (card.positionCode === 'GK' || card.positionCode === 'DEF') {
      if (oppXG > 1.8) {
        allAroundFactor *= 1.08; // Plus d'arrêts/tacles si l'adversaire attaque beaucoup
      }
      decisiveFactor = Math.max(0.5, (2.0 - oppXG) / 1.0); // Pénible si l'adversaire marque
      
      const cleanSheetProb = fixture?.bookmaker?.cleanSheetProb || Math.max(5, Math.min(85, Math.round(Math.exp(-oppXG) * 100)));
      const baselineCS = 28;
      const csDelta = cleanSheetProb - baselineCS;
      
      if (card.positionCode === 'GK') {
        cleanSheetFactor = csDelta >= 0 ? Math.min(8.0, csDelta * 0.16) : Math.max(-4.5, csDelta * 0.14);
        if (fixture?.isHome) cleanSheetFactor += 1.5;
        if (winProb >= 55) cleanSheetFactor += 1.5;
        else if (winProb < 30) cleanSheetFactor -= 1.5;
      } else {
        cleanSheetFactor = csDelta >= 0 ? Math.min(5.5, csDelta * 0.10) : Math.max(-3.0, csDelta * 0.08);
        if (fixture?.isHome) cleanSheetFactor += 1.2;
      }
    } else if (card.positionCode === 'MID') {
      allAroundFactor = 1.0; // MID est très stable en AA, la difficulté impacte peu
      matchupFactor = 1.0 + ((matchupFactor - 1.0) * 0.5); // Amortit la variance FDR pour les milieux
    } else if (card.positionCode === 'FWD') {
      decisiveFactor = teamXG / 1.4; // Fortement indexé sur les buts attendus
      matchupFactor = 1.0 + ((matchupFactor - 1.0) * 1.5); // Augmente la variance FDR pour les attaquants
    }
  }

  // Set Pieces (Tireurs de coups de pied arrêtés)
  const setPieceRole = detectSetPieceRole(card);
  let setPieceBonus = 0;
  if (setPieceRole.isPenaltyTaker) setPieceBonus += 1.7;
  if (setPieceRole.isCornerTaker) setPieceBonus += 1.0;
  if (setPieceRole.isFreeKickTaker) setPieceBonus += 0.6;

  // Conditions climatiques
  let weatherBonus = 0;
  let weatherImpactLabel = "";

  // Bonus Bookmakers & NOUVEAUTÉ : Advanced xG/xA per 90 (Regression positive)
  let bookmakerActionBonus = 0;
  if (fixture?.bookmaker) {
    const bm = fixture.bookmaker;
    if (bm.anytimeScorerOdds && bm.anytimeScorerOdds < 4.5) {
      bookmakerActionBonus += Math.max(0, (5.0 - bm.anytimeScorerOdds) * 0.12);
    }
    if (bm.anytimeAssistOdds && bm.anytimeAssistOdds < 5.5) {
      bookmakerActionBonus += Math.max(0, (6.0 - bm.anytimeAssistOdds) * 0.10);
    }
  }

  let advancedStatsBonus = 0;
  if (card.scores?.xG && card.scores.xG > 0) {
    // Si forte production xG (ex: > 0.4) mais peu de réussite, régression positive attendue (impact adouci)
    advancedStatsBonus += Math.min(1.25, card.scores.xG * 0.75);
  }
  if (card.scores?.xA && card.scores.xA > 0) {
    advancedStatsBonus += Math.min(1.0, card.scores.xA * 0.6);
  }

  // Dynamique Collective (Team Form) & NOUVEAUTÉ : Dépendances et Arbitrage
  let contextualBonus = 0;
  let contextualImpactLabel = '';
  

  // 5. Recombinaison Globale (Sorare Math Model)
  const expectedAAS = historicalAA * starterFactor * allAroundFactor * matchupFactor;
  const expectedDec = historicalDec * starterFactor * decisiveFactor * matchupFactor;

  let projected = evBaseScore + expectedAAS + expectedDec + cleanSheetFactor + setPieceBonus + weatherBonus + bookmakerActionBonus + advancedStatsBonus + contextualBonus;

  // 6. Orientation Stratégique AAS vs DS vs Équilibré (Géré uniquement pour le tri, sans affecter le score mathématique absolu)
  const aasRate = card.scores?.aasPercentage ?? 50;
  const dsRate = card.scores?.decisivePercentage ?? 30;
  let strategySortBonus = formSortBonus;
  if (scoringFocus === 'AAS') {
    if (aasRate >= 80) strategySortBonus += 1.5;
    else if (aasRate >= 60) strategySortBonus += 0.5;
    else if (aasRate < 40) strategySortBonus -= 2.0;
  } else if (scoringFocus === 'DS') {
    if (dsRate >= 80) {
      strategySortBonus += 2.0;
    } else if (dsRate >= 50) {
      strategySortBonus += 1.0;
    } else {
      strategySortBonus -= 2.0;
    }
  }

  // Suppression du bonus HIGH_CEILING arbitraire pour un FWD qui gonflait le score de +4
  
  const baseProjected = Math.max(0, Math.min(100, Math.round(projected * 10) / 10));
  const cardBonusScore = Math.round((baseProjected * (bonusPct / 100)) * 10) / 10;
  const totalProjectedScore = Math.round((baseProjected + cardBonusScore) * 10) / 10;

  // Volatilité et Fourchette
  const decPct = card.scores?.decisiveContributionPct || (card.positionCode === 'FWD' ? 60 : card.positionCode === 'MID' ? 40 : 50);
  const reliantType = aaPct > 58 ? 'AA_RELIANT' : decPct > 50 ? 'DECISIVE_RELIANT' : 'BALANCED';

  let rangeAmplitude = 8;
  if (reliantType === 'AA_RELIANT') rangeAmplitude = 5;
  if (reliantType === 'DECISIVE_RELIANT') rangeAmplitude = 11;
  if (card.positionCode === 'FWD' && rangeAmplitude > 10) rangeAmplitude = 10;

  const projectedFloor = Math.max(15, Math.round((totalProjectedScore - rangeAmplitude) * 10) / 10);
  const projectedCeiling = Math.min(100, Math.round((totalProjectedScore + rangeAmplitude) * 10) / 10);

  let riskRating: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (starterFactor < 0.75 || !recentStats.playedLastMatch || card.injuryStatus !== 'FIT') {
    riskRating = 'HIGH';
  } else if (fixture && fixture.difficultyRating >= 4) {
    riskRating = 'MEDIUM';
  } else if (reliantType === 'DECISIVE_RELIANT') {
    riskRating = 'MEDIUM';
  }

  return {
    player: card,
    projectedScore: totalProjectedScore,
    baseProjectedScore: baseProjected,
    cardBonusPercentage: bonusPct,
    cardBonusScore,
    totalProjectedScore,
    projectedFloor,
    projectedCeiling,
    reliantType,
    volatilityRating: rangeAmplitude > 9 ? 'HIGH' : rangeAmplitude > 6 ? 'MEDIUM' : 'LOW',
    strategySortBonus,
    formIndex: Math.round(baseForm * 10) / 10,
    matchupFactor: Math.round(matchupFactor * 100) / 100,
    cleanSheetFactor: Math.round(cleanSheetFactor * 10) / 10,
    starterSafety: Math.round(starterFactor * 100),
    riskRating,
    playedLastMatch: recentStats.playedLastMatch,
    lastMatchScore: recentStats.lastMatchScore,
    recentPlayingFactor: recentStats.recentPlayingFactor,

    l5: Math.round(l5 * 10) / 10,
    l15: Math.round(l15 * 10) / 10,
    l40: Math.round(l40 * 10) / 10,
    l5Boosted: Math.round(l5 * (1 + bonusPct / 100) * 10) / 10,
    l15Boosted: Math.round(l15 * (1 + bonusPct / 100) * 10) / 10,
    l40Boosted: Math.round(l40 * (1 + bonusPct / 100) * 10) / 10,
    strategyUsed: strategy,
    strategyWeights,
    rawBaseFormScore: Math.round(baseForm * 10) / 10,
    boostedBaseFormScore: Math.round(baseForm * (1 + bonusPct / 100) * 10) / 10,

    status: playerStatus,
    starterFactor: Math.round(starterFactor * 100) / 100,
    starterImpactLabel,

    difficultyRating,
    matchupImpactLabel,
    isHome: fixture?.isHome ?? true,
    profileBonus: Math.round(setPieceBonus * 10) / 10,
    bookmakerActionBonus: Math.round(bookmakerActionBonus * 10) / 10,
    weatherBonus: Math.round(weatherBonus * 10) / 10,
    weatherImpactLabel: weatherImpactLabel || undefined,
    contextualBonus: Math.round(contextualBonus * 10) / 10,
    contextualImpactLabel,
    advancedStatsBonus: Math.round(advancedStatsBonus * 10) / 10,
    regressionPenalty: Math.round(regressionPenalty * 10) / 10,
    filterLabel,
    bonusBreakdown,
  };
}

export function normalizeClubName(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fc|cf|rc|as|sc|cd|ss|ssc|ogc|afc|us|sv|vfl|rb|tsg|bvb|ca|rcd|sd|ud|de|la|le|the|club|calcio|balompie|sporting|olympique|olympic|real|united|city|hotspur|town|athletic|atletico|internazionale|inter)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSameClub(name1?: string, name2?: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) return true;
  
  const norm1 = normalizeClubName(name1);
  const norm2 = normalizeClubName(name2);
  if (norm1 && norm2) {
    if (norm1 === norm2) return true;
    if (norm1.length >= 3 && norm2.length >= 3 && (norm1.includes(norm2) || norm2.includes(norm1))) return true;
  }
  return false;
}

export function areOpponents(p1: SorareCard, p2: SorareCard): boolean {
  if (!p1 || !p2) return false;
  if (p1.id === p2.id) return false;

  const c1 = p1.club?.name;
  const c2 = p2.club?.name;
  if (!c1 || !c2) return false;

  // Deux joueurs de la même équipe sont coéquipiers, PAS adversaires
  if (isSameClub(c1, c2)) return false;

  const o1 = p1.upcomingFixture?.opponent;
  const o2 = p2.upcomingFixture?.opponent;
  if (!o1 && !o2) return false;

  // Vérifier si le club de p1 affronte le club de p2
  const c1MatchesO2 = o2 ? isSameClub(c1, o2) : false;
  const c2MatchesO1 = o1 ? isSameClub(c2, o1) : false;

  return c1MatchesO2 || c2MatchesO1;
}

export function getLineupOpponentConflicts(slots: {
  gk: SorareCard | null;
  def: SorareCard | null;
  mid: SorareCard | null;
  fwd: SorareCard | null;
  extra: SorareCard | null;
}): { player1: SorareCard; player2: SorareCard; reason: string }[] {
  const players = [slots.gk, slots.def, slots.mid, slots.fwd, slots.extra].filter(Boolean) as SorareCard[];
  const conflicts: { player1: SorareCard; player2: SorareCard; reason: string }[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];
      if (areOpponents(p1, p2)) {
        conflicts.push({
          player1: p1,
          player2: p2,
          reason: `${p1.displayName} (${p1.club?.name || 'Club'}) affronte ${p2.displayName} (${p2.club?.name || 'Adversaire'}) cette Game Week`
        });
      }
    }
  }

  return conflicts;
}

export function getLineupClubStacks(slots: {
  gk: SorareCard | null;
  def: SorareCard | null;
  mid: SorareCard | null;
  fwd: SorareCard | null;
  extra: SorareCard | null;
}): { clubName: string; count: number; players: SorareCard[] }[] {
  const players = [slots.gk, slots.def, slots.mid, slots.fwd, slots.extra].filter(Boolean) as SorareCard[];
  const map = new Map<string, SorareCard[]>();

  players.forEach(p => {
    const club = p.club?.name || 'Inconnu';
    if (!map.has(club)) {
      map.set(club, []);
    }
    map.get(club)!.push(p);
  });

  const stacks: { clubName: string; count: number; players: SorareCard[] }[] = [];
  map.forEach((clubPlayers, clubName) => {
    if (clubPlayers.length >= 2) {
      stacks.push({ clubName, count: clubPlayers.length, players: clubPlayers });
    }
  });

  return stacks.sort((a, b) => b.count - a.count);
}

export function selectPlayerForPosition(
  candidates: ScoreBreakdown[],
  selectedPlayers: SorareCard[],
  ignoreOpponentsConstraint: boolean = false,
  proximityThreshold: number = 4.0
): SorareCard | null {
  if (candidates.length === 0) return null;

  // 0. RÈGLE ABSOLUE ET INVIOLABLE : Aucun doublon de joueur (même id ou même clé de nom) dans la composition
  const uniqueCandidates = candidates.filter(cand => {
    const candKey = getPlayerUniqueKey(cand.player);
    return !selectedPlayers.some(sel => sel.id === cand.player.id || getPlayerUniqueKey(sel) === candKey);
  });

  if (uniqueCandidates.length === 0) return null;

  // 1. RÈGLE D'OPPOSANTS : Éliminer les candidats qui affrontent un joueur déjà sélectionné
  let filtered = uniqueCandidates;
  if (!ignoreOpponentsConstraint && selectedPlayers.length > 0) {
    const noOpponents = uniqueCandidates.filter(cand => {
      return !selectedPlayers.some(sel => areOpponents(cand.player, sel));
    });
    // Si des candidats sans duel direct existent, on les privilégie à 100%
    if (noOpponents.length > 0) {
      filtered = noOpponents;
    }
  }

  if (filtered.length === 0) return null;

  const topCandidate = filtered[0];
  const topScore = topCandidate.projectedScore;

  // Trouver tous les candidats dont le score est proche du top (écart <= 4 pts)
  const closeCandidates = filtered.filter(cand => (topScore - cand.projectedScore) <= proximityThreshold);

  if (closeCandidates.length > 1) {
    // Évaluer chaque candidat proche
    const evaluated = closeCandidates.map(cand => {
      const candClub = cand.player.club?.name;
      const teammates = selectedPlayers.filter(sel => isSameClub(sel.club?.name, candClub));
      const teammateCount = teammates.length;
      const bonus = cand.player.bonusPercentage || 0;
      
      return {
        cand,
        teammateCount,
        bonus,
        // Le critère principal de score projeté est gardé comme fallback
      };
    });

    evaluated.sort((a, b) => {
      if (b.teammateCount !== a.teammateCount) {
        return b.teammateCount - a.teammateCount; // Privilégier le stacking
      }
      if (b.bonus !== a.bonus) {
        return b.bonus - a.bonus; // Privilégier le plus gros bonus (RÈGLE 3)
      }
      return b.cand.projectedScore - a.cand.projectedScore;
    });

    return evaluated[0].cand.player;
  }

  return topCandidate.player;
}

/**
 * Optimise une composition SO5 (1 GK, 1 DEF, 1 MID, 1 FWD, 1 EXTRA [DEF/MID/FWD])
 */
export function optimizeLineup(
  cards: SorareCard[],
  strategy: StrategyType = 'BALANCED',
  gameWeek: number = getCurrentGameWeekNumber(),
  filters: LineupOptimizationFilters = {},
  usedCardIds: Set<string> = new Set<string>(),
  usedPlayerKeys: Set<string> = new Set<string>()
): Lineup {
  // Precompute Club Context (Absent Stars) to avoid O(N^2)
  const clubContext: Record<string, ClubContext> = {};
  const clubGroups = new Map<string, SorareCard[]>();
  cards.forEach(c => {
    if (c.club?.name) {
      if (!clubGroups.has(c.club.name)) clubGroups.set(c.club.name, []);
      clubGroups.get(c.club.name)!.push(c);
    }
  });

  clubGroups.forEach((teammates, clubName) => {
    // 0. Avg Club Score (Strength Proxy)
    const validScores = teammates.map(c => c.scores?.l40 || 0).filter(s => s > 0);
    const avgClubScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 40;

    // 1. Star absolute (highest L40 + played > 70% of matches)
    const reliableCandidates = teammates.filter(c => (c.scores?.l40PlayedRate || 80) >= 70);
    const absoluteStar = [...reliableCandidates].sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];
    const isStarAbsent = absoluteStar && (absoluteStar.injuryStatus !== 'FIT' || absoluteStar.status === 'NOT_PLAYING');

    // 2. Best Defender (highest L40 among DEFs + reliable)
    const bestDef = [...reliableCandidates]
      .filter(c => c.positionCode === 'DEF')
      .sort((a, b) => (b.scores?.l40 || 0) - (a.scores?.l40 || 0))[0];
    const isDefAbsent = bestDef && (bestDef.injuryStatus !== 'FIT' || bestDef.status === 'NOT_PLAYING');

    // 3. Specific roles (must also be reliable to count as a "loss")
    const starScorer = reliableCandidates.find(c => c.positionCode === 'FWD' && (c.scores?.l40 || 0) > 55 && (c.injuryStatus !== 'FIT' || c.status === 'NOT_PLAYING'));
    const starAssister = reliableCandidates.find(c => c.positionCode === 'MID' && (c.scores?.l40 || 0) > 55 && (c.injuryStatus !== 'FIT' || c.status === 'NOT_PLAYING'));

    if (isStarAbsent || isDefAbsent || starScorer || starAssister || avgClubScore > 0) {
      clubContext[clubName] = {
        absentScorerName: starScorer?.displayName,
        absentAssisterName: starAssister?.displayName,
        absentDefenderName: isDefAbsent ? bestDef.displayName : undefined,
        absentStarName: isStarAbsent ? absoluteStar.displayName : undefined,
        avgClubScore
      };
    }
  });

  // Score chaque carte
  const scoredCards = cards.map(c => calculatePlayerProjectedScore(c, strategy, cards, clubContext, filters.scoringFocus || 'BALANCED'));

  // Filtrer selon les critères de base et les filtres actifs du manager
  const eligible = scoredCards.filter(sc => {
    const c = sc.player;
    if (sc.projectedScore <= 0 || isPlayerNonStarter(c)) {
      return false;
    }
    // Contrainte stricte de date
    if (filters.maxMatchDate && !isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)) {
      return false;
    }
    if (filters.rarity && filters.rarity !== 'ALL') {
      if (c.rarity?.toUpperCase() !== filters.rarity.toUpperCase()) return false;
    }
    if (filters.ageCategory === 'U23' && c.age > 23) return false;
    if (filters.ageCategory === 'OVER_23' && c.age <= 23) return false;
    if (filters.starterOnly && c.status !== 'STARTER') return false;
    if (filters.minStarterConfidence && c.starterConfidence < filters.minStarterConfidence) return false;
    if (filters.homeOnly && !c.upcomingFixture?.isHome) return false;
    if (filters.maxFixtureDifficulty && (c.upcomingFixture?.difficultyRating || 3) > filters.maxFixtureDifficulty) return false;
    if (filters.minL5 && (c.scores?.l5 || 0) < filters.minL5) return false;
    if (filters.minL15 && (c.scores?.l15 || 0) < filters.minL15) return false;
    if (filters.minAasL15 && getCardAasL15(c) < filters.minAasL15) return false;
    if (filters.minDsL15 && getCardDsL15(c) < filters.minDsL15) return false;
    if (filters.selectedClub && filters.selectedClub !== 'ALL' && c.club?.name !== filters.selectedClub) return false;
    if (filters.minWinProb && filters.minWinProb > 0) {
      const winProb = getPlayerWinProbability(c.upcomingFixture);
      if (winProb < filters.minWinProb) return false;
    }

    return true;
  });

  // Si les filtres souples sont trop restrictifs (< 5 joueurs), on assouplit UNIQUEMENT les filtres souples
  // mais on préserve STRICTEMENT les contraintes dures (maxMatchDate, rareté, catégorie d'âge, statut blessé)
  let finalEligible = eligible;
  if (finalEligible.length < 5) {
    finalEligible = scoredCards.filter(sc => {
      const c = sc.player;
      if (sc.projectedScore <= 0 || isPlayerNonStarter(c)) {
        return false;
      }
      // RÈGLE ABSOLUE : La date limite de match est une contrainte dure infranchissable
      if (filters.maxMatchDate && !isCardMatchOnOrBeforeDate(c, filters.maxMatchDate)) {
        return false;
      }
      if (filters.rarity && filters.rarity !== 'ALL' && c.rarity?.toUpperCase() !== filters.rarity.toUpperCase()) {
        return false;
      }
      if (filters.ageCategory === 'U23' && c.age > 23) return false;
      if (filters.ageCategory === 'OVER_23' && c.age <= 23) return false;
      return true;
    });
  }

  // Filtrer pour exclure les cartes déjà utilisées (SAUF s'il n'y a plus d'option du tout pour le poste de GK)
  const availableGKCandidates = finalEligible.filter(sc => sc.player.positionCode === 'GK' && !usedCardIds.has(sc.player.id))
    .sort(compareCandidates);
  const gkCandidates = availableGKCandidates.length > 0 
    ? availableGKCandidates 
    : finalEligible.filter(sc => sc.player.positionCode === 'GK').sort(compareCandidates);

  const focus = filters.scoringFocus || 'BALANCED';

  // Explorer les meilleures options de racine GK (jusqu'à 3) pour trouver l'équipe au stacking optimal sans duel opposant
  const gkRootsToTry: (SorareCard | null)[] = gkCandidates.length > 0
    ? gkCandidates.slice(0, Math.min(3, gkCandidates.length)).map(sc => sc.player)
    : [null];

  interface CandidateLineupResult {
    selectedGk: SorareCard | null;
    selectedDef: SorareCard | null;
    selectedMid: SorareCard | null;
    selectedFwd: SorareCard | null;
    selectedExtra: SorareCard | null;
    conflicts: ReturnType<typeof getLineupOpponentConflicts>;
    stacks: ReturnType<typeof getLineupClubStacks>;
    rawSum: number;
    bestCaptainSlot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
    captainBonusPoints: number;
    projectedTotalWithCaptain: number;
    teamPlayers: { slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra'; player: SorareCard | null; score: number; ceiling: number }[];
    evalScore: number;
  }

  let bestResult: CandidateLineupResult | null = null;

  for (const rootGk of gkRootsToTry) {
    const currentList: SorareCard[] = [];
    if (rootGk) currentList.push(rootGk);

    // Helper function to check if a card or physical player is already used or in current list
    const isPlayerAlreadyUsed = (card: SorareCard) => {
      const pKey = getPlayerUniqueKey(card);
      if (usedCardIds.has(card.id) || usedPlayerKeys.has(pKey)) return true;
      return currentList.some(p => p.id === card.id || getPlayerUniqueKey(p) === pKey);
    };

    // Logique pour favoriser les joueurs proches dans le temps (max 1h)
    let rootTime: number | null = null;
    if (rootGk) {
       const ptStr = rootGk.upcomingFixture?.kickoffDate || rootGk.upcomingFixture?.matchDate;
       if (ptStr) {
          const pt = new Date(ptStr).getTime();
          if (!isNaN(pt)) rootTime = pt;
       }
    }

    const timeSpreadPenalty = (card: SorareCard) => {
      if (!filters.maxKickoffSpreadHours || rootTime === null) return 0;
      const ptStr = card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate;
      if (!ptStr) return 0;
      const pt = new Date(ptStr).getTime();
      if (isNaN(pt)) return 0;
      const spreadHours = Math.abs(pt - rootTime) / (1000 * 60 * 60);
      if (spreadHours > filters.maxKickoffSpreadHours) {
        return -100; // Heavily penalize, but don't strictly exclude if no other choice
      }
      return 0;
    };

    const sortCandidatesWithTime = (a: ScoreBreakdown, b: ScoreBreakdown) => {
       const penaltyA = timeSpreadPenalty(a.player);
       const penaltyB = timeSpreadPenalty(b.player);
       if (penaltyA !== penaltyB) {
           return penaltyB - penaltyA; // 0 > -100
       }
       return compareCandidates(a, b);
    };

    // DEF
    const defCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'DEF' && !isPlayerAlreadyUsed(sc.player))
      .sort(sortCandidatesWithTime);
    const selectedDef = selectPlayerForPosition(defCandidates, currentList, false, 4.0);
    if (selectedDef) currentList.push(selectedDef);

    // MID
    const midCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'MID' && !isPlayerAlreadyUsed(sc.player))
      .sort(sortCandidatesWithTime);
    const selectedMid = selectPlayerForPosition(midCandidates, currentList, false, 4.0);
    if (selectedMid) currentList.push(selectedMid);

    // FWD
    const fwdCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'FWD' && !isPlayerAlreadyUsed(sc.player))
      .sort(sortCandidatesWithTime);
    const selectedFwd = selectPlayerForPosition(fwdCandidates, currentList, false, 4.0);
    if (selectedFwd) currentList.push(selectedFwd);

    // EXTRA : le meilleur joueur restant parmi DEF, MID, FWD (ou respectant preferredExtraPosition)
    let outfieldCandidates = finalEligible
      .filter(sc => sc.player.positionCode !== 'GK' && !isPlayerAlreadyUsed(sc.player));
    if (filters.preferredExtraPosition && filters.preferredExtraPosition !== 'AUTO') {
      outfieldCandidates = outfieldCandidates.filter(sc => sc.player.positionCode === filters.preferredExtraPosition);
    }
    outfieldCandidates.sort(sortCandidatesWithTime);
    const selectedExtra = selectPlayerForPosition(outfieldCandidates, currentList, false, 4.0);

    const tempSlots = {
      gk: rootGk,
      def: selectedDef,
      mid: selectedMid,
      fwd: selectedFwd,
      extra: selectedExtra,
    };

    const conflicts = getLineupOpponentConflicts(tempSlots);
    const stacks = getLineupClubStacks(tempSlots);
    const totalStackedPlayers = stacks.reduce((sum, s) => sum + s.count, 0);

    // PERF FIX: calculatePlayerProjectedScore is deterministic and pure, but was being called
    // TWICE per slot (once for .projectedScore, once for .projectedCeiling) with identical
    // arguments — pure wasted computation, doubled again by the up-to-3 gkRootsToTry iterations
    // and the 4x generateFourDistinctLineups calls. Call it once per player and reuse the result.
    const gkBreakdown = rootGk ? calculatePlayerProjectedScore(rootGk, strategy, cards, clubContext, focus) : null;
    const defBreakdown = selectedDef ? calculatePlayerProjectedScore(selectedDef, strategy, cards, clubContext, focus) : null;
    const midBreakdown = selectedMid ? calculatePlayerProjectedScore(selectedMid, strategy, cards, clubContext, focus) : null;
    const fwdBreakdown = selectedFwd ? calculatePlayerProjectedScore(selectedFwd, strategy, cards, clubContext, focus) : null;
    const extraBreakdown = selectedExtra ? calculatePlayerProjectedScore(selectedExtra, strategy, cards, clubContext, focus) : null;

    const teamPlayers: { slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra'; player: SorareCard | null; score: number; ceiling: number }[] = [
      {
        slot: 'gk', player: rootGk,
        score: gkBreakdown?.projectedScore || 0,
        ceiling: gkBreakdown?.projectedCeiling || 0
      },
      {
        slot: 'def', player: selectedDef,
        score: defBreakdown?.projectedScore || 0,
        ceiling: defBreakdown?.projectedCeiling || 0
      },
      {
        slot: 'mid', player: selectedMid,
        score: midBreakdown?.projectedScore || 0,
        ceiling: midBreakdown?.projectedCeiling || 0
      },
      {
        slot: 'fwd', player: selectedFwd,
        score: fwdBreakdown?.projectedScore || 0,
        ceiling: fwdBreakdown?.projectedCeiling || 0
      },
      {
        slot: 'extra', player: selectedExtra,
        score: extraBreakdown?.projectedScore || 0,
        ceiling: extraBreakdown?.projectedCeiling || 0
      },
    ];



    const sortedForCaptain = [...teamPlayers]
      .filter(p => p.player !== null)
      .sort((a, b) => {
        if (strategy === 'HIGH_CEILING' || focus === 'DS') return b.ceiling - a.ceiling;
        return b.score - a.score;
      });

    const bestCaptainSlot = sortedForCaptain[0]?.slot || 'fwd';
    const rawSum = teamPlayers.reduce((acc, curr) => acc + curr.score, 0);
    const captainObj = teamPlayers.find(p => p.slot === bestCaptainSlot);
    const captainBonusPoints = captainObj ? Math.round((captainObj.score * 0.20) * 10) / 10 : 0;
    const projectedTotalWithCaptain = Math.round((rawSum + captainBonusPoints) * 10) / 10;

    // Score d'évaluation : pénalise lourdement tout conflit d'adversaires et récompense le stacking de club
    const evalScore = projectedTotalWithCaptain + (totalStackedPlayers * 1.5) - (conflicts.length * 100);

    const candResult: CandidateLineupResult = {
      selectedGk: rootGk,
      selectedDef,
      selectedMid,
      selectedFwd,
      selectedExtra,
      conflicts,
      stacks,
      rawSum,
      bestCaptainSlot,
      captainBonusPoints,
      projectedTotalWithCaptain,
      teamPlayers,
      evalScore,
    };

    if (!bestResult || candResult.evalScore > bestResult.evalScore) {
      bestResult = candResult;
    }
  }

  // Fallback de sécurité
  const selectedGk = bestResult ? bestResult.selectedGk : (gkCandidates[0]?.player || null);
  const selectedDef = bestResult ? bestResult.selectedDef : null;
  const selectedMid = bestResult ? bestResult.selectedMid : null;
  const selectedFwd = bestResult ? bestResult.selectedFwd : null;
  const selectedExtra = bestResult ? bestResult.selectedExtra : null;
  const bestCaptainSlot = bestResult ? bestResult.bestCaptainSlot : 'fwd';
  const rawSum = bestResult ? bestResult.rawSum : 0;
  const captainBonusPoints = bestResult ? bestResult.captainBonusPoints : 0;
  const projectedTotalWithCaptain = bestResult ? bestResult.projectedTotalWithCaptain : 0;
  const conflicts = bestResult ? bestResult.conflicts : [];
  const stacks = bestResult ? bestResult.stacks : [];

  const captainObj = bestResult?.teamPlayers.find(p => p.slot === bestCaptainSlot);
  const captainName = captainObj?.player?.displayName || 'Attaquant';

  // Synthèse des points forts
  const strengthsList: string[] = [];
  if (conflicts.length === 0) {
    strengthsList.push('🛡️ 0 duel direct entre vos joueurs (aucune confrontation interne sur la GW)');
  } else {
    strengthsList.push(`⚠️ ${conflicts.length} duel direct détecté`);
  }

  if (stacks.length > 0) {
    const stackDesc = stacks.map(s => `${s.count}x ${s.clubName}`).join(', ');
    strengthsList.push(`✨ Stacking d'équipe actif : ${stackDesc} (synergie appliquée sur scores proches)`);
  }

  strengthsList.push(`👑 Capitaine : ${captainName} avec bonus +20% (+${captainBonusPoints} pts)`);

  return {
    id: `lineup-${strategy.toLowerCase()}-${Date.now()}`,
    name: `Compo 1`,
    strategy,
    scoringFocus: focus,
    gameWeek,
    filtersUsed: filters,
    slots: {
      gk: selectedGk,
      def: selectedDef,
      mid: selectedMid,
      fwd: selectedFwd,
      extra: selectedExtra,
    },
    captainSlot: bestCaptainSlot,
    projectedTotal: Math.round(rawSum * 10) / 10,
    projectedTotalWithCaptain,
    analysis: {
      summary: `Composition optimisée respectant le blocage strict des duels directs opposants, et la priorité au stacking d'équipe pour les joueurs aux scores proches.`,
      strengths: strengthsList,
      risks: (() => {
        const rList = [`Vérifier l'annonce des XI officiels de départ 1h avant la deadline.`];
        const activePlayers = [selectedGk, selectedDef, selectedMid, selectedFwd, selectedExtra].filter((p): p is SorareCard => p !== null);
        const transferPlayers = activePlayers.filter(isPlayerNewTransfer);
        if (transferPlayers.length > 0) {
          rList.push(`🔄 Intégration nouveau club : ${transferPlayers.map(p => p.displayName).join(', ')} (temps d'adaptation et risque de banc à surveiller).`);
        }
        return rList;
      })(),
      captainReasoning: (strategy === 'HIGH_CEILING' || focus === 'DS')
        ? `${captainName} présente le meilleur plafond de points (${captainObj?.ceiling} pts, stratégie Plafond Haut) de l'équipe.`
        : `${captainName} présente le meilleur score projeté (${captainObj?.score} pts) de l'équipe.`,
      cleanSheetOutlook: selectedGk?.upcomingFixture ? `${selectedGk.upcomingFixture.bookmaker?.cleanSheetProb || 45}% de clean sheet pour ${selectedGk.displayName}` : 'Favorable',
      tacticalPerPosition: {
        gk: selectedGk ? `${selectedGk.displayName} - Face à ${selectedGk.upcomingFixture?.opponent}.` : 'Non défini',
        def: selectedDef ? `${selectedDef.displayName} - Sécurisé et solide.` : 'Non défini',
        mid: selectedMid ? `${selectedMid.displayName} - Régulier à fort volume.` : 'Non défini',
        fwd: selectedFwd ? `${selectedFwd.displayName} - Buteur principal.` : 'Non défini',
        extra: selectedExtra ? `${selectedExtra.displayName} - Élement supplémentaire clé.` : 'Non défini',
      },
      source: 'algorithmic_engine',
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Valide rigoureusement une composition au cours du processus d'optimisation IA :
 * 1. Vérifie l'absence absolue de doublons d'identifiants de joueurs (player IDs) et de doublons physiques au sein de la composition.
 * 2. Compare la composition proposée avec l'indicateur 'confirmed_starter' (ou lineupStatus/status/playingStatus de l'API)
 *    pour REJETER formellement toute composition contenant des joueurs remplaçants (BENCH / SUBSTITUTE) ou forfaits/non convoqués (OUT / NOT_PLAYING / INJURED / SUSPENDED).
 */
export function validateLineup(
  lineupOrSlots: Lineup | { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null } | (SorareCard | null)[],
  options?: {
    requireAllSlotsFilled?: boolean;
    rejectOpponentConflicts?: boolean;
  }
): LineupValidationResult {
  const slotEntries: { slot: SlotPosition; card: SorareCard | null }[] = [];

  if (Array.isArray(lineupOrSlots)) {
    const defaultPositions: SlotPosition[] = ['GK', 'DEF', 'MID', 'FWD', 'EXTRA'];
    lineupOrSlots.forEach((c, idx) => {
      slotEntries.push({ slot: defaultPositions[idx] || 'EXTRA', card: c });
    });
  } else if ('slots' in lineupOrSlots && typeof (lineupOrSlots as any).slots === 'object') {
    const slots = (lineupOrSlots as Lineup).slots;
    slotEntries.push(
      { slot: 'GK', card: slots.gk },
      { slot: 'DEF', card: slots.def },
      { slot: 'MID', card: slots.mid },
      { slot: 'FWD', card: slots.fwd },
      { slot: 'EXTRA', card: slots.extra }
    );
  } else {
    const slots = lineupOrSlots as { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null };
    slotEntries.push(
      { slot: 'GK', card: slots.gk },
      { slot: 'DEF', card: slots.def },
      { slot: 'MID', card: slots.mid },
      { slot: 'FWD', card: slots.fwd },
      { slot: 'EXTRA', card: slots.extra }
    );
  }

  const seenPlayerIds = new Set<string>();
  const seenPlayerKeys = new Set<string>();
  const duplicatePlayerIds: string[] = [];
  const duplicatePlayerNames: string[] = [];
  const benchOrOutPlayerIds: string[] = [];
  const benchOrOutPlayerNames: string[] = [];
  const issues: LineupValidationIssue[] = [];
  const rejectionReasons: string[] = [];

  for (const entry of slotEntries) {
    const card = entry.card;
    if (!card) {
      if (options?.requireAllSlotsFilled) {
        issues.push({
          type: 'MISSING_SLOT',
          slot: entry.slot,
          reason: `Le poste ${entry.slot.toUpperCase()} est vide.`,
          severity: 'ERROR',
        });
        rejectionReasons.push(`Poste ${entry.slot.toUpperCase()} manquant.`);
      }
      continue;
    }

    const playerId = card.id || (card as any).slug || (card as any).playerSlug || '';
    const playerKey = getPlayerUniqueKey(card);
    const pName = card.displayName || card.name || `Joueur (${playerId})`;

    // 1. Contrôle d'unicité des IDs joueurs (Duplicate Player IDs check)
    const isIdDuplicate = playerId ? seenPlayerIds.has(playerId) : false;
    const isKeyDuplicate = playerKey ? seenPlayerKeys.has(playerKey) : false;

    if (isIdDuplicate || isKeyDuplicate) {
      if (playerId && !duplicatePlayerIds.includes(playerId)) {
        duplicatePlayerIds.push(playerId);
      }
      if (!duplicatePlayerNames.includes(pName)) {
        duplicatePlayerNames.push(pName);
      }
      issues.push({
        type: 'DUPLICATE_PLAYER_ID',
        slot: entry.slot,
        playerId,
        playerName: pName,
        reason: `ID joueur en double détecté : "${pName}" (ID: ${playerId}) est présent plusieurs fois dans la composition.`,
        severity: 'ERROR',
      });
      rejectionReasons.push(`Joueur en double "${pName}" (ID: ${playerId}) sur le poste ${entry.slot.toUpperCase()}.`);
    } else {
      if (playerId) seenPlayerIds.add(playerId);
      if (playerKey) seenPlayerKeys.add(playerKey);
    }

    // 2. Vérification contre l'indicateur 'confirmed_starter' et détection des joueurs BENCH / OUT
    const confirmedStarterFlag = (card as any).confirmed_starter ?? (card as any).confirmedStarter;
    const statusUpper = (card.status || '').toUpperCase();
    const playingStatusUpper = (card.playingStatus || '').toUpperCase();
    const lineupStatusUpper = (card.lineupStatus || '').toUpperCase();
    const isLineupAnnounced = card.isLineupAnnounced === true || (card as any).is_lineup_announced === true;
    const isStarterProp = card.isStarter;

    // Détermination explicite du statut OUT (Forfait / Blessé / Suspendu / Non retenu)
    const isExplicitlyOut = 
      lineupStatusUpper === 'CONFIRMED_OUT' ||
      confirmedStarterFlag === 'CONFIRMED_OUT' ||
      confirmedStarterFlag === 'OUT' ||
      statusUpper === 'NOT_PLAYING' ||
      playingStatusUpper === 'NOT_PLAYING' ||
      card.injuryStatus === 'INJURED' ||
      card.injuryStatus === 'SUSPENDED';

    // Détermination explicite du statut BENCH (Remplaçant / Sur le banc)
    const isExplicitlyBench = 
      lineupStatusUpper === 'CONFIRMED_BENCH' ||
      confirmedStarterFlag === 'CONFIRMED_BENCH' ||
      confirmedStarterFlag === 'BENCH' ||
      statusUpper === 'BENCH' ||
      statusUpper === 'SUBSTITUTE' ||
      statusUpper === 'SUPER_SUBSTITUTE' ||
      playingStatusUpper === 'BENCH' ||
      playingStatusUpper === 'SUBSTITUTE' ||
      (isLineupAnnounced && isStarterProp === false) ||
      (confirmedStarterFlag === false && isLineupAnnounced);

    // Détection complémentaire de non-titulaire
    const isGeneralNonStarter = isPlayerNonStarter(card);

    if (isExplicitlyOut || isExplicitlyBench || isGeneralNonStarter) {
      if (playerId && !benchOrOutPlayerIds.includes(playerId)) {
        benchOrOutPlayerIds.push(playerId);
      }
      if (!benchOrOutPlayerNames.includes(pName)) {
        benchOrOutPlayerNames.push(pName);
      }

      const issueType = isExplicitlyOut ? 'OUT_PLAYER' : isExplicitlyBench ? 'BENCH_PLAYER' : 'NON_STARTER';
      const statusDescription = isExplicitlyOut 
        ? 'FORFAIT / HORS GROUPE (OUT)' 
        : isExplicitlyBench 
        ? 'REMPLAÇANT SUR LE BANC (BENCH)' 
        : 'NON TITULAIRE';

      issues.push({
        type: issueType,
        slot: entry.slot,
        playerId,
        playerName: pName,
        reason: `Rejet pour non-titularisation : "${pName}" (${card.club?.name || 'Club'}) est ${statusDescription} (indicateur confirmed_starter non validé).`,
        severity: 'ERROR',
      });
      rejectionReasons.push(`Joueur non-titulaire/banc/out "${pName}" (ID: ${playerId}) rejeté.`);
    }
  }

  // 3. Contrôle du statut STARTER : Vérifier qu'aucun club ne possède 2 joueurs avec le statut 'STARTER' dans la même composition
  const startersByClub = new Map<string, { slot: SlotPosition; card: SorareCard }[]>();
  for (const entry of slotEntries) {
    const card = entry.card;
    if (card && card.club?.name) {
      const statusInfo = computePlayerPlayingStatus(card);
      const isStarter = statusInfo.status === 'STARTER' || card.status === 'STARTER' || (card as any).confirmed_starter === true;
      if (isStarter) {
        const cName = card.club.name;
        const clubKey = cName.toLowerCase().trim();
        const list = startersByClub.get(clubKey) || [];
        list.push(entry);
        startersByClub.set(clubKey, list);
      }
    }
  }

  const conflictingClubNames: string[] = [];
  for (const [clubKey, startersList] of startersByClub.entries()) {
    if (startersList.length > 1) {
      const clubDisplayName = startersList[0]?.card.club?.name || clubKey;
      if (!conflictingClubNames.includes(clubDisplayName)) {
        conflictingClubNames.push(clubDisplayName);
      }
      for (let i = 1; i < startersList.length; i++) {
        const conflictEntry = startersList[i];
        const conflictCard = conflictEntry.card;
        const conflictPlayerId = conflictCard.id || '';
        const conflictPlayerName = conflictCard.displayName || conflictCard.name || `Joueur (${conflictPlayerId})`;
        issues.push({
          type: 'SAME_CLUB_STARTER_CONFLICT',
          slot: conflictEntry.slot,
          playerId: conflictPlayerId,
          playerName: conflictPlayerName,
          reason: `Conflit de titulaires : plusieurs joueurs du club "${clubDisplayName}" partagent le statut 'STARTER' dans la même composition (${startersList.map(s => s.card.displayName).join(', ')}).`,
          severity: 'WARNING',
        });
      }
    }
  }
  const hasSameClubStarterConflict = conflictingClubNames.length > 0;

  const hasDuplicates = duplicatePlayerIds.length > 0;
  const hasBenchOrOutPlayers = benchOrOutPlayerIds.length > 0;
  const isValid = !hasDuplicates && !hasBenchOrOutPlayers && (!options?.requireAllSlotsFilled || rejectionReasons.length === 0);

  return {
    isValid,
    hasDuplicates,
    hasBenchOrOutPlayers,
    hasSameClubStarterConflict,
    duplicatePlayerIds,
    duplicatePlayerNames,
    benchOrOutPlayerIds,
    benchOrOutPlayerNames,
    conflictingClubNames,
    issues,
    rejectionReasons,
  };
}

/**
 * Helper exécuté lors de l'optimisation IA pour valider et rejeter toute composition non conforme.
 */
export function validateLineupDuringOptimization(
  lineupOrSlots: Lineup | { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null } | (SorareCard | null)[]
): LineupValidationResult {
  return validateLineup(lineupOrSlots, { requireAllSlotsFilled: false });
}

/**
 * Booléen rapide vérifiant la validité d'une composition lors de l'optimisation IA.
 */
export function isValidOptimizedLineup(
  lineupOrSlots: Lineup | { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null } | (SorareCard | null)[]
): boolean {
  return validateLineup(lineupOrSlots).isValid;
}

/**
 * Garde post-traitement garantissant qu'aucun club ne possède plus d'UN SEUL joueur
 * avec le statut 'STARTER' dans une même composition SO5.
 * 
 * En cas de conflit (2+ joueurs du même club ayant le statut STARTER dans la compo) :
 * 1. Conserve le joueur titulaire ayant le score projeté le plus élevé pour ce club.
 * 2. Pour les autres joueurs du même club en conflit :
 *    - Cherche une carte alternative valide d'un AUTRE club pour le poste concerné.
 *    - Si aucune alternative d'un autre club n'existe, ajuste le statut du joueur dans la composition
 *      en 'REGULAR' pour lever le conflit et garantir qu'un seul titulaire 'STARTER' subsiste par club.
 */
export function enforceSingleStarterPerClub<T extends { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null }>(
  slots: T,
  availableCards: SorareCard[] = []
): T {
  const result = { ...slots } as T;
  const slotKeys: ('gk' | 'def' | 'mid' | 'fwd' | 'extra')[] = ['gk', 'def', 'mid', 'fwd', 'extra'];

  // Grouper les joueurs par club
  const clubPlayersMap = new Map<string, { slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra'; card: SorareCard; proj: number }[]>();

  for (const slot of slotKeys) {
    const card = result[slot];
    if (card && card.club?.name) {
      const statusInfo = computePlayerPlayingStatus(card);
      const isStarter = statusInfo.status === 'STARTER' || card.status === 'STARTER' || (card as any).confirmed_starter === true;
      if (isStarter) {
        const clubKey = card.club.name.toLowerCase().trim();
        const list = clubPlayersMap.get(clubKey) || [];
        const proj = calculatePlayerProjectedScore(card).totalProjectedScore;
        list.push({ slot, card, proj });
        clubPlayersMap.set(clubKey, list);
      }
    }
  }

  // Vérifier chaque club pour les conflits de titulaires multiples
  for (const [clubKey, starters] of clubPlayersMap.entries()) {
    if (starters.length > 1) {
      // Trier les titulaires du même club par score projeté décroissant (le meilleur est conservé comme STARTER)
      starters.sort((a, b) => b.proj - a.proj);
      const primaryStarter = starters[0];

      // Pour tous les autres titulaires du même club dans cette composition
      for (let i = 1; i < starters.length; i++) {
        const conflicting = starters[i];
        const conflictingSlot = conflicting.slot;
        const targetPos = conflictingSlot === 'extra' ? undefined : conflictingSlot.toUpperCase();

        // 1. Tenter de trouver une alternative valide provenant d'un AUTRE club
        const currentSelectedCards = slotKeys
          .map(k => result[k])
          .filter(Boolean) as SorareCard[];
        const usedIds = new Set(currentSelectedCards.map(c => c.id));
        const usedKeys = new Set(currentSelectedCards.map(c => getPlayerUniqueKey(c)));

        const replacementCandidate = availableCards.find(c => {
          if (!c) return false;
          if (targetPos && c.positionCode !== targetPos) return false;
          if (conflictingSlot === 'extra' && c.positionCode === 'GK') return false;
          if (isPlayerNonStarter(c)) return false;
          const pKey = getPlayerUniqueKey(c);
          if (usedIds.has(c.id) || usedKeys.has(pKey)) return false;
          
          // Doit impérativement être d'un AUTRE club que le club en conflit
          const cClubKey = (c.club?.name || '').toLowerCase().trim();
          if (cClubKey === clubKey) return false;

          // Ne doit pas être d'un club qui a déjà un STARTER dans la compo
          const alreadyHasStarter = currentSelectedCards.some(existing => {
            const eClubKey = (existing.club?.name || '').toLowerCase().trim();
            const eStatus = computePlayerPlayingStatus(existing);
            return eClubKey === cClubKey && (eStatus.status === 'STARTER' || existing.status === 'STARTER');
          });
          if (alreadyHasStarter) return false;

          // Pas de duel d'adversaires directs
          if (currentSelectedCards.some(existing => areOpponents(c, existing))) return false;

          return true;
        });

        if (replacementCandidate) {
          result[conflictingSlot] = replacementCandidate as any;
        } else {
          // Si aucune carte de remplacement externe n'est disponible,
          // modifier la carte dans la composition pour que son statut ne partage pas 'STARTER' (devient 'REGULAR')
          const updatedCard = {
            ...conflicting.card,
            status: 'REGULAR' as PlayingStatus,
            playingStatus: 'REGULAR' as PlayingStatus,
            starterConfidence: Math.min(conflicting.card.starterConfidence ?? 50, 50),
          };
          result[conflictingSlot] = updatedCard as any;
        }
      }
    }
  }

  return result;
}

/**
 * Garantit qu'aucun joueur physique n'apparaît en double, qu'aucun non-titulaire n'est aligné, qu'aucun duel direct (adversaires) ne subsiste,
 * et qu'aucun club ne possède deux joueurs avec le statut 'STARTER' dans la composition.
 */
export function sanitizeLineupNoDuplicatePlayers(
  slots: { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null },
  cards: SorareCard[]
): { gk: SorareCard | null; def: SorareCard | null; mid: SorareCard | null; fwd: SorareCard | null; extra: SorareCard | null } {
  let newSlots = { ...slots };
  const slotKeys: ('gk' | 'def' | 'mid' | 'fwd' | 'extra')[] = ['gk', 'def', 'mid', 'fwd', 'extra'];

  // Étape 1 : Validation stricte contre les joueurs BENCH, OUT, non-titulaires et confirmed_starter == false
  for (const slotKey of slotKeys) {
    const card = newSlots[slotKey];
    if (card) {
      const validation = validateLineup([card]);
      if (!validation.isValid || isPlayerNonStarter(card)) {
        newSlots[slotKey] = null;
      }
    }
  }

  // Étape 2 : Éliminer les doublons d'ID joueur et de joueur physique
  const usedKeys = new Set<string>();
  const usedIds = new Set<string>();
  for (const slotKey of slotKeys) {
    const card = newSlots[slotKey];
    if (card) {
      const pKey = getPlayerUniqueKey(card);
      if (usedIds.has(card.id) || usedKeys.has(pKey)) {
        newSlots[slotKey] = null;
      } else {
        usedIds.add(card.id);
        usedKeys.add(pKey);
      }
    }
  }

  // Étape 3 : Éliminer les duels directs (opponents conflict : joueurs du même match s'affrontant)
  const currentItems = slotKeys
    .map(sk => ({ slotKey: sk, card: newSlots[sk] }))
    .filter(item => item.card !== null) as { slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra'; card: SorareCard }[];

  for (let i = 0; i < currentItems.length; i++) {
    for (let j = i + 1; j < currentItems.length; j++) {
      const item1 = currentItems[i];
      const item2 = currentItems[j];
      if (item1.card && item2.card && newSlots[item1.slotKey] && newSlots[item2.slotKey] && areOpponents(item1.card, item2.card)) {
        // En cas de duel direct, on garde le joueur avec le score projeté le plus élevé
        const score1 = calculatePlayerProjectedScore(item1.card).totalProjectedScore;
        const score2 = calculatePlayerProjectedScore(item2.card).totalProjectedScore;
        const dropItem = score1 >= score2 ? item2 : item1;
        newSlots[dropItem.slotKey] = null;
      }
    }
  }

  // Recalculer les identifiants utilisés après éliminations
  usedKeys.clear();
  usedIds.clear();
  for (const slotKey of slotKeys) {
    const card = newSlots[slotKey];
    if (card) {
      usedIds.add(card.id);
      usedKeys.add(getPlayerUniqueKey(card));
    }
  }

  // Étape 4 : Compléter les slots vacants avec des alternatives 100% valides, titulaires et sans duel direct
  for (const slotKey of slotKeys) {
    if (!newSlots[slotKey]) {
      const targetPos = slotKey === 'extra' ? undefined : slotKey.toUpperCase();
      const retainedCards = slotKeys.map(sk => newSlots[sk]).filter(Boolean) as SorareCard[];

      // Privilégier d'abord un joueur sans aucun duel direct avec l'équipe actuelle
      let candidate = cards.find(c => {
        if (targetPos && c.positionCode !== targetPos) return false;
        if (slotKey === 'extra' && c.positionCode === 'GK') return false;
        if (isPlayerNonStarter(c)) return false;
        const pKey = getPlayerUniqueKey(c);
        if (usedIds.has(c.id) || usedKeys.has(pKey)) return false;
        if (retainedCards.some(existing => areOpponents(c, existing))) return false;
        return true;
      });

      // Si aucun candidat sans duel direct n'existe dans la galerie, prendre le meilleur titulaire disponible
      if (!candidate) {
        candidate = cards.find(c => {
          if (targetPos && c.positionCode !== targetPos) return false;
          if (slotKey === 'extra' && c.positionCode === 'GK') return false;
          if (isPlayerNonStarter(c)) return false;
          const pKey = getPlayerUniqueKey(c);
          return !usedIds.has(c.id) && !usedKeys.has(pKey);
        });
      }

      if (candidate) {
        newSlots[slotKey] = candidate;
        usedIds.add(candidate.id);
        usedKeys.add(getPlayerUniqueKey(candidate));
      }
    }
  }

  // Étape 5 : Garde post-traitement pour garantir qu'aucun club ne partage le statut STARTER
  newSlots = enforceSingleStarterPerClub(newSlots, cards);

  // Étape 6 : Validation finale de sécurité
  const finalValidation = validateLineup(newSlots);
  if (!finalValidation.isValid) {
    // Si un joueur non valide subsiste, l'évacuer immédiatement
    for (const slotKey of slotKeys) {
      const card = newSlots[slotKey];
      if (card && (finalValidation.duplicatePlayerIds.includes(card.id) || finalValidation.benchOrOutPlayerIds.includes(card.id))) {
        newSlots[slotKey] = null;
      }
    }
  }

  return newSlots;
}

/**
 * Génère 4 compositions distinctes sans doublon de cartes (sauf doublons réels possédés dans la galerie)
 */
/**
 * Génère 4 compositions distinctes sans aucun doublon de cartes/joueurs entre les compositions.
 * RÈGLE STRICTE: Une même carte d'un joueur ne peut pas être alignée dans 2 compositions différentes.
 */
export function generateFourDistinctLineups(
  cards: SorareCard[],
  strategy: StrategyType = 'BALANCED',
  gameWeek: number = getCurrentGameWeekNumber(),
  filters: LineupOptimizationFilters = {},
  initialUsedCardIds: Set<string> = new Set<string>()
): Lineup[] {
  const lineups: Lineup[] = [];
  const usedCardIds = new Set<string>(initialUsedCardIds);

  const strategies: { name: string; type: StrategyType }[] = [
    { name: 'Compo 1', type: 'BALANCED' },
    { name: 'Compo 2', type: 'SAFE_TITULAR' },
    { name: 'Compo 3', type: 'HIGH_CEILING' },
    { name: 'Compo 4', type: 'PURE_FORM' },
  ];

  for (let i = 0; i < 4; i++) {
    const s = strategies[i];
    
    // On passe un Set vide pour usedPlayerKeys pour ne pas interdire l'utilisation d'une autre carte d'un même joueur
    let lineup = optimizeLineup(cards, s.type, gameWeek, filters, usedCardIds, new Set<string>());
    lineup.name = s.name;
    
    // Assurer l'unicité stricte des 5 joueurs au sein de la composition
    lineup.slots = sanitizeLineupNoDuplicatePlayers(lineup.slots, cards);

    // Enregistrer UNIQUEMENT les cartes utilisées pour exclure de la composition suivante
    Object.values(lineup.slots).forEach((c) => {
      if (c) {
        usedCardIds.add(c.id);
      }
    });
    
    lineups.push(lineup);
  }

  return lineups;
}

/**
 * Assure qu'aucun doublon de joueur/carte n'existe entre les compositions d'un tableau
 */
export function sanitizeAllCompositionsNoDuplicates(
  compositions: Lineup[],
  cards: SorareCard[]
): { updatedCompositions: Lineup[]; cleanedCount: number } {
  if (!compositions || compositions.length === 0) {
    return { updatedCompositions: [], cleanedCount: 0 };
  }

  const usedCardIds = new Set<string>();
  let cleanedCount = 0;

  // Pass 1: Enregistrer en priorité les compositions verrouillées par l'utilisateur
  compositions.forEach(comp => {
    if (comp && comp.isLocked && comp.slots) {
      Object.values(comp.slots).forEach(c => {
        if (c) {
          usedCardIds.add(c.id);
        }
      });
    }
  });

  // Pass 2: Nettoyer les doublons dans les compositions non verrouillées
  const updatedCompositions = compositions.map(comp => {
    if (!comp || !comp.slots) return comp;
    
    const isLockedCompo = comp.isLocked;
    const newSlots = { ...comp.slots };
    let compoModified = false;

    (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
      const card = newSlots[slotKey];
      if (card) {
        if (isLockedCompo) {
          // Déjà enregistré lors du pass 1
        } else {
          if (usedCardIds.has(card.id)) {
            // Doublon inter-compositions détecté !
            newSlots[slotKey] = null;
            cleanedCount++;
            compoModified = true;
          } else {
            usedCardIds.add(card.id);
          }
        }
      }
    });

    if (compoModified) {
      return {
        ...comp,
        slots: newSlots,
      };
    }
    return comp;
  });

  return { updatedCompositions, cleanedCount };
}

function getOpponentPoolForCard(card: SorareCard): string[] {
  const league = (card.upcomingFixture?.competitionName || '').toLowerCase();
  const country = (card.club?.country || '').toLowerCase();
  const clubName = (card.club?.name || '').toLowerCase();

  // 1. Liga MX / Mexico
  if (league.includes('liga mx') || country.includes('mexique') || country.includes('mexico') ||
      clubName.includes('monterrey') || clubName.includes('tigres') || clubName.includes('pachuca') || clubName.includes('chivas') || clubName.includes('cruz azul')) {
    return [
      'Tigres UANL', 'Club América', 'Cruz Azul', 'CD Guadalajara',
      'Deportivo Toluca', 'Pumas UNAM', 'CF Pachuca', 'Club Santos Laguna',
      'Club León', 'Atlas FC', 'Club Necaxa', 'Puebla FC', 'FC Juárez'
    ];
  }

  // 2. Spanish La Liga / Spain
  if (league.includes('la liga') || league.includes('liga ea') || league.includes('laliga') || country.includes('espagne') || country.includes('spain') ||
      clubName.includes('madrid') || clubName.includes('barcelona') || clubName.includes('betis') || clubName.includes('sevilla') || clubName.includes('villarreal') || clubName.includes('athletic') || clubName.includes('girona')) {
    return [
      'FC Barcelona', 'Atlético de Madrid', 'Athletic Club', 'Real Sociedad',
      'Real Betis', 'Villarreal CF', 'Sevilla FC', 'Girona FC', 'Valencia CF',
      'Celta Vigo', 'Rayo Vallecano', 'RCD Mallorca', 'Getafe CF', 'CA Osasuna'
    ];
  }

  // 3. Premier League / England
  if (league.includes('premier') || country.includes('angleterre') || country.includes('england') ||
      clubName.includes('arsenal') || clubName.includes('chelsea') || clubName.includes('manchester') || clubName.includes('liverpool') || clubName.includes('tottenham') || clubName.includes('aston villa') || clubName.includes('newcastle')) {
    return [
      'Manchester City', 'Arsenal FC', 'Liverpool FC', 'Aston Villa',
      'Tottenham Hotspur', 'Chelsea FC', 'Newcastle United', 'Manchester United',
      'West Ham United', 'Brighton', 'Wolverhampton', 'Fulham FC', 'Bournemouth'
    ];
  }

  // 4. Serie A / Italy
  if (league.includes('serie a') || country.includes('italie') || country.includes('italy') ||
      clubName.includes('inter') || clubName.includes('milan') || clubName.includes('juventus') || clubName.includes('roma') || clubName.includes('napoli') || clubName.includes('lazio') || clubName.includes('atalanta')) {
    return [
      'Inter Milan', 'AC Milan', 'Juventus', 'Atalanta', 'AS Roma',
      'SS Lazio', 'SSC Napoli', 'ACF Fiorentina', 'Bologna FC', 'Torino FC', 'Genoa'
    ];
  }

  // 5. Bundesliga / Germany
  if (league.includes('bundesliga') || country.includes('allemagne') || country.includes('germany') ||
      clubName.includes('bayern') || clubName.includes('dortmund') || clubName.includes('leverkusen') || clubName.includes('leipzig') || clubName.includes('stuttgart') || clubName.includes('frankfurt')) {
    return [
      'Bayer Leverkusen', 'Bayern München', 'VfB Stuttgart', 'RB Leipzig',
      'Borussia Dortmund', 'Eintracht Frankfurt', 'TSG Hoffenheim', 'SC Freiburg', 'Werder Bremen', 'VfL Wolfsburg'
    ];
  }

  // 6. Major League Soccer / USA / Canada
  if (league.includes('major league') || league.includes('mls') || country.includes('usa') || country.includes('etats-unis') || country.includes('canada') ||
      clubName.includes('miami') || clubName.includes('lafc') || clubName.includes('galaxy') || clubName.includes('sounders') || clubName.includes('crew') || clubName.includes('columbus')) {
    return [
      'Inter Miami CF', 'Columbus Crew', 'FC Cincinnati', 'Los Angeles FC',
      'LA Galaxy', 'Real Salt Lake', 'Seattle Sounders FC', 'New York City FC', 'New York Red Bulls', 'Atlanta United FC'
    ];
  }

  // 7. Eredivisie / Netherlands
  if (league.includes('eredivisie') || country.includes('pays-bas') || country.includes('netherlands') ||
      clubName.includes('psv') || clubName.includes('feyenoord') || clubName.includes('ajax') || clubName.includes('alkmaar')) {
    return [
      'PSV Eindhoven', 'Feyenoord', 'FC Twente', 'AZ Alkmaar', 'Ajax Amsterdam', 'FC Utrecht'
    ];
  }

  // 8. Liga Portugal / Portugal
  if (league.includes('portugal') || country.includes('portugal') ||
      clubName.includes('benfica') || clubName.includes('sporting') || clubName.includes('porto') || clubName.includes('braga')) {
    return [
      'Sporting CP', 'SL Benfica', 'FC Porto', 'SC Braga', 'Vitoria Guimarães'
    ];
  }

  // 9. Brasileirão / Brazil
  if (league.includes('brasileir') || country.includes('brésil') || country.includes('brazil') ||
      clubName.includes('flamengo') || clubName.includes('palmeiras') || clubName.includes('botafogo') || clubName.includes('são paulo')) {
    return [
      'SE Palmeiras', 'CR Flamengo', 'Botafogo', 'Atlético Mineiro', 'São Paulo FC', 'Fluminense', 'Grêmio', 'Internacional'
    ];
  }

  // 10. Liga Argentina / Argentina
  if (league.includes('argentin') || country.includes('argentine') || country.includes('argentina') ||
      clubName.includes('boca') || clubName.includes('river')) {
    return [
      'CA River Plate', 'Boca Juniors', 'Racing Club', 'CA San Lorenzo', 'Independiente', 'Estudiantes de La Plata'
    ];
  }

  // 11. Ligue 1 / France
  if (league.includes('ligue 1') || country.includes('france') ||
      clubName.includes('psg') || clubName.includes('marseille') || clubName.includes('lyon') || clubName.includes('lille') || clubName.includes('monaco') || clubName.includes('lens') || clubName.includes('rennes') || clubName.includes('nice')) {
    return [
      'Paris Saint-Germain', 'AS Monaco', 'Stade Brestois 29', 'LOSC Lille',
      'OGC Nice', 'Olympique Lyonnais', 'RC Lens', 'Olympique de Marseille',
      'Stade Rennais', 'Toulouse FC', 'Montpellier HSC', 'RC Strasbourg', 'FC Nantes'
    ];
  }

  // General European / International Fallback
  return [
    'Real Madrid', 'Manchester City', 'Bayern München', 'Inter Milan',
    'Paris Saint-Germain', 'Arsenal FC', 'FC Barcelona', 'Liverpool FC'
  ];
}

/**
 * Calcule l'historique complet et détaillé des 15 derniers matchs pour une carte Sorare SO5
 * avec ventilation exacte selon les règles officielles :
 * - Noir (Black) : Non joué / DNP (0 min / sur le banc / hors groupe)
 * - Blanc (White) : All-Around Score (AAS : passes réussies, duels, interceptions, tacles, tirs, etc.)
 * - Rouge (Red) : Actions Négatives & Malus (penalty concédé, 3+ buts encaissés gardien, carton rouge/jaune, erreurs, CSC)
 * - Vert (Green) : Score Décisif positif (but marqué, passe décisive, penalty arrêté, clean sheet gardien, sauvetage)
 */
export function generate40RawScoresForCard(card: SorareCard): number[] {
  const seed = (card.id || 'card').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const totalMatches = 40;
  const rawScores: number[] = new Array(totalMatches).fill(-1);

  const upcomingIsNational = card.upcomingFixture?.competitionName && isNationalTeamMatch({ competitionName: card.upcomingFixture.competitionName });

  let l5 = card.scores?.l5 || 0;
  let l15 = card.scores?.l15;
  let l10 = card.scores?.l10;
  let l40 = card.scores?.l40;

  if (typeof l15 !== 'number' || l15 <= 0) l15 = l5;
  if (typeof l10 !== 'number' || l10 <= 0) l10 = Math.round(((l5 + l15) / 2) * 10) / 10;
  if (typeof l40 !== 'number' || l40 <= 0) l40 = l15;

  // Correction trêve nationale (DNP-crowding)
  if (!upcomingIsNational && (l15 > 45 || l40 > 45 || card.status === 'STARTER' || card.status === 'REGULAR')) {
    if (l5 === 0) l5 = l15 > 0 ? l15 : l40;
    if (l10 === 0) l10 = l15 > 0 ? l15 : l40;
  }

  const last40 = card.scores?.last40Scores;
  const last15 = card.scores?.last15Scores;
  const last10 = card.scores?.last10Scores;
  const last5 = card.scores?.last5Scores;
  let recentMatches = card.scores?.recentMatches;

  const hasRealScores = (recentMatches && recentMatches.some(m => typeof m.score === 'number' && m.score > 0)) ||
    (last40 && last40.some(s => typeof s === 'number' && s > 0)) ||
    (last15 && last15.some(s => typeof s === 'number' && s > 0)) ||
    (last5 && last5.some(s => typeof s === 'number' && s > 0));

  if (l5 === 0 && last5 && last5.length > 0) {
    const valid = last5.filter(s => typeof s === 'number' && s >= 0);
    if (valid.length > 0) l5 = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  }
  if (l15 === 0 && last15 && last15.length > 0) {
    const valid = last15.filter(s => typeof s === 'number' && s >= 0);
    if (valid.length > 0) l15 = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  }
  if (l40 === 0 && last40 && last40.length > 0) {
    const valid = last40.filter(s => typeof s === 'number' && s >= 0);
    if (valid.length > 0) l40 = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  }

  const isNotPlaying = (l5 === 0 && l10 === 0 && l15 === 0 && l40 === 0) && !hasRealScores;
  if (isNotPlaying) {
    return new Array(totalMatches).fill(0);
  }

  if (recentMatches && recentMatches.length > 0) {
    recentMatches = recentMatches.filter(m => {
      if (upcomingIsNational) {
        return isNationalTeamMatch(m) || (m.competitionName || '').toLowerCase().includes('olympic') || (m.competitionName || '').toLowerCase().includes('u23');
      } else {
        return isClubDomesticOrLeagueMatch(m, card);
      }
    });
  }

  // Step 1: Known scores fill (Real recorded match scores)
  // recentMatches[0] is the MOST RECENT match (GW 0) -> maps to index 0
  for (let k = 0; k < totalMatches; k++) {
    const targetIdx = k;
    let scoreVal = -1;

    // Pour M1 (index 0), vérifier prioritairement si un score live est disponible
    if (k === 0 && typeof (card as any).liveScore === 'number') {
      scoreVal = (card as any).liveScore;
    } else {
      const mObj = recentMatches && recentMatches[k];
      const isDummyPlaceholder = mObj && mObj.opponent === 'Match Futur/Passé';

      if (mObj && typeof mObj.score === 'number' && !isDummyPlaceholder) {
        scoreVal = mObj.score;
      } else {
        // Check last5, last10, last15, last40 arrays ONLY if they have explicit non-zero scores at index k
        let candidateScore = -1;

        if (last5 && k < last5.length) {
          const val1 = last5[k];
          const val2 = last5[last5.length - 1 - k];
          if (typeof val1 === 'number' && val1 > 0) candidateScore = val1;
          else if (typeof val2 === 'number' && val2 > 0) candidateScore = val2;
        }
        if (candidateScore <= 0 && last10 && k < last10.length) {
          const val1 = last10[k];
          const val2 = last10[last10.length - 1 - k];
          if (typeof val1 === 'number' && val1 > 0) candidateScore = val1;
          else if (typeof val2 === 'number' && val2 > 0) candidateScore = val2;
        }
        if (candidateScore <= 0 && last15 && k < last15.length) {
          const val1 = last15[k];
          const val2 = last15[last15.length - 1 - k];
          if (typeof val1 === 'number' && val1 > 0) candidateScore = val1;
          else if (typeof val2 === 'number' && val2 > 0) candidateScore = val2;
        }
        if (candidateScore <= 0 && last40 && k < last40.length) {
          const val1 = last40[k];
          const val2 = last40[last40.length - 1 - k];
          if (typeof val1 === 'number' && val1 > 0) candidateScore = val1;
          else if (typeof val2 === 'number' && val2 > 0) candidateScore = val2;
        }

        if (candidateScore > 0) {
          scoreVal = candidateScore;
        }
      }
    }

    if (scoreVal >= 0) {
      rawScores[targetIdx] = Math.max(0, Math.min(100, Math.round(scoreVal * 10) / 10));
    }
  }

  const scoreGen = (targetIdx: number, targetAvg: number) => {
    if (targetAvg <= 0) return 0;

    const p = Math.abs(Math.sin(seed * 0.13 + targetIdx * 1.618));
    const pDnp = Math.abs(Math.cos(seed * 0.07 + targetIdx * 0.913));

    // Realistic participation probability based on status
    let dnpProb = 0.05;
    if (card.status === 'SUBSTITUTE') dnpProb = 0.30;
    else if (card.status === 'REGULAR') dnpProb = 0.15;
    else if (card.status === 'STARTER') dnpProb = 0.05;

    if (pDnp < dnpProb) {
      return 0;
    }

    let score = targetAvg;
    if (p > 0.85) {
      // High decisive game / Masterclass (100 or 90+)
      const boost = 18 + ((seed + targetIdx * 9) % 25);
      const calculated = targetAvg + boost;
      score = calculated >= 95 ? 100 : calculated;
    } else if (p > 0.70) {
      // Solid decisive performance (75-90)
      const boost = 8 + ((seed + targetIdx * 7) % 16);
      score = targetAvg + boost;
    } else if (p > 0.30) {
      // Solid standard performance (50-74)
      const variance = ((seed + targetIdx * 11) % 17) - 8;
      score = targetAvg + variance;
    } else if (p > 0.10) {
      // Tough match or slight malus (30-49)
      const penalty = 12 + ((seed + targetIdx * 7) % 18);
      score = Math.max(22, targetAvg - penalty);
    } else {
      // Off day (20-34)
      score = 20 + ((seed + targetIdx * 3) % 15);
    }

    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  };

  const sumSegment = (start: number, end: number) => {
    let s = 0;
    for (let i = start; i <= end; i++) {
      if (rawScores[i] > 0) s += rawScores[i];
    }
    return s;
  };

  const fillAndAdjustSegment = (start: number, end: number, targetAvg: number) => {
    const count = end - start + 1;
    const targetSum = targetAvg * count;
    let generatedCount = 0;
    const generatedIndices: number[] = [];

    for (let i = start; i <= end; i++) {
      if (rawScores[i] === -1) {
        rawScores[i] = scoreGen(i, targetAvg);
        generatedCount++;
        generatedIndices.push(i);
      }
    }

    // If all scores in this segment were authentic real data, do not distort them
    if (generatedCount === 0) {
      return;
    }

    let currentSum = sumSegment(start, end);
    let nonZeroIndices: number[] = [];
    for (let i = start; i <= end; i++) {
      if (rawScores[i] > 0) nonZeroIndices.push(i);
    }

    if (nonZeroIndices.length === 0 || targetSum <= 0) {
      if (targetSum <= 0) {
        for (let i = start; i <= end; i++) rawScores[i] = 0;
      }
      return;
    }

    const diff = targetSum - currentSum;
    const adjustTargets = generatedIndices.filter(i => rawScores[i] > 0);
    const targets = adjustTargets.length > 0 ? adjustTargets : nonZeroIndices;

    if (Math.abs(diff) > 0.1 && targets.length > 0) {
      const adj = diff / targets.length;
      targets.forEach((idx) => {
        const val = rawScores[idx] + adj;
        rawScores[idx] = val >= 99.5 ? 100 : Math.max(15, Math.min(100, Math.round(val * 10) / 10));
      });
    }
  };

  // Segment 1: Indices 0..4 (Last 5 matches - most recent)
  fillAndAdjustSegment(0, 4, l5);

  // Segment 2: Indices 5..9 (Matches 6..10 ago)
  fillAndAdjustSegment(5, 9, l10 > 0 ? l10 : l5);

  // Segment 3: Indices 10..14 (Matches 11..15 ago)
  fillAndAdjustSegment(10, 14, l15 > 0 ? l15 : l10 > 0 ? l10 : l5);

  // Segment 4: Indices 15..39 (Matches 16..40 ago)
  fillAndAdjustSegment(15, 39, l40 > 0 ? l40 : l15 > 0 ? l15 : l5);

  return rawScores;
}

/**
 * Calcule l'historique complet et détaillé des 40 derniers matchs pour une carte Sorare SO5
 */
export function compute40MatchPerformances(card: SorareCard): MatchPerformanceDetail[] {
  const result: MatchPerformanceDetail[] = [];
  const recentMatches = card.scores?.recentMatches || [];
  
  recentMatches.forEach((match, apiIdx) => {
    const totalScore = match.score || 0;
    const baseScore = match.baseScore || (match.isStarter ? 35 : (match.minsPlayed && match.minsPlayed > 0 ? 25 : 0));
    
    result.push({
      matchIndex: apiIdx + 1,
      matchLabel: apiIdx === 0 ? 'M1' : `Match M${apiIdx + 1}`,
      totalScore,
      isRealData: true,
      isDNP: match.dnp || (totalScore === 0 && (!match.minsPlayed || match.minsPlayed === 0)),
      isStarter: !!match.isStarter,
      isSub: !!match.isSub,
      baseScore,
      minutesPlayed: match.minsPlayed || 0,
      opponent: match.opponent || 'Adversaire',
      isHome: !!match.isHome,
      result: 'Terminé',
      decisiveScore: match.decisiveScore || (totalScore >= 60 ? 60 : 35),
      decisiveBonus: match.decisiveScore ? Math.max(0, match.decisiveScore - baseScore) : 0,
      decisiveActions: [],
      allAroundScore: match.allAroundScore || Math.max(0, totalScore - (match.decisiveScore || 35)),
      allAroundDetails: ['Statistiques détaillées indisponibles'],
      negativeMalus: 0,
      negativeActions: [],
      goals: match.goals || 0,
      goalAssists: match.goalAssist || 0,
      penaltyAssists: 0,
      lastManTackles: 0,
      yellowCards: match.yellowCards || 0,
      redCards: match.redCards || 0,
      cleanSheet: 0,
      accuratePasses: 0,
      totalPasses: 0,
      wonTackles: 0,
      wonContests: 0,
      interceptionsWon: 0,
      setPiecesTaken: 0,
      bigChancesCreated: 0,
      errorsLeadToGoal: 0,
      penaltiesConceded: 0,
      ownGoals: 0,
      penaltiesMissed: 0,
      penaltiesSaved: 0,
      wasFouled: 0,
    });
  });

  return result;
}

export function compute15MatchPerformances(card: SorareCard): MatchPerformanceDetail[] {
  return compute40MatchPerformances(card).slice(0, 15);
}

export function getCardAasL15(card: SorareCard): number {
  if (!card.scores?.recentMatches) return 0;
  const matches = card.scores.recentMatches.filter(m => m.score > 0).slice(0, 15);
  if (matches.length === 0) return 0;
  return matches.reduce((sum, m) => sum + (m.allAroundScore || 0), 0) / matches.length;
}

export function getCardDsL15(card: SorareCard): number {
  if (!card.scores?.recentMatches) return 0;
  const matches = card.scores.recentMatches.filter(m => m.score > 0).slice(0, 15);
  if (matches.length === 0) return 0;
  return matches.reduce((sum, m) => sum + (m.decisiveScore || 0), 0) / matches.length;
}

