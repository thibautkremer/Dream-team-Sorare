import { SorareCard, Lineup, StrategyType, ScoringFocus, PositionCode, LineupOptimizationFilters, UpcomingFixture, MatchPerformanceDetail } from '../types';
import { getCardTotalBonus, getCardBonusBreakdown, CardBonusBreakdown } from './sorareSlug';

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
  return (card.slug || card.displayName || card.id).toLowerCase().trim();
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
  // 1. Score projeté (qui intègre déjà la pénalité de dernier match)
  const scoreDiff = b.projectedScore - a.projectedScore;
  if (Math.abs(scoreDiff) > 0.05) {
    return scoreDiff;
  }

  // 2. À SCORE ÉGAL : avantage strict au joueur qui a joué le dernier match
  if (a.playedLastMatch !== b.playedLastMatch) {
    return b.playedLastMatch ? 1 : -1;
  }

  // 3. Plus grand nombre de matchs joués sur les 5 derniers
  const aRecent = getPlayerRecentMatchAnalysis(a.player);
  const bRecent = getPlayerRecentMatchAnalysis(b.player);
  if (aRecent.playedCountL5 !== bRecent.playedCountL5) {
    return bRecent.playedCountL5 - aRecent.playedCountL5;
  }

  // 4. Confiance de titularisation
  if (a.player.starterConfidence !== b.player.starterConfidence) {
    return b.player.starterConfidence - a.player.starterConfidence;
  }

  // 5. Forme L5 brute
  return (b.player.scores?.l5 || 0) - (a.player.scores?.l5 || 0);
}

/**
 * Vérifie si le match d'une carte se déroule au plus tard le jour de maxDateStr (inclus).
 * @param card Carte Sorare
 * @param maxDateStr Date limite au format "YYYY-MM-DD" (ex: "2026-08-22")
 */
export function isCardMatchOnOrBeforeDate(card: SorareCard, maxDateStr?: string | null): boolean {
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

    // Calcul de la fin de journée de la date sélectionnée (23:59:59.999 UTC)
    const [year, month, day] = maxDateStr.split('-').map(Number);
    if (!year || !month || !day) return true;

    const limitEndOfDayUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
    
    // Si le timestamp du match dépasse la fin de journée UTC de la date sélectionnée
    if (d.getTime() > limitEndOfDayUtc) {
      return false;
    }

    // Vérification de la date UTC (YYYY-MM-DD)
    const isoDateUtc = d.toISOString().substring(0, 10);
    if (isoDateUtc > maxDateStr) {
      return false;
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

export function isNationalTeamMatch(match: { competitionName?: string; opponent?: string }): boolean {
  const comp = (match.competitionName || '').toLowerCase().trim();
  const opp = (match.opponent || '').toLowerCase().trim();
  
  // Exclure explicitement les compétitions européennes de clubs
  if (
    comp.includes('europa') || 
    comp.includes('champions league') || 
    comp.includes('ucl') || 
    comp.includes('uel') || 
    comp.includes('uecl') || 
    comp.includes('conference league') ||
    comp.includes('club')
  ) {
    return false;
  }

  // Liste de mots-clés robustes pour les compétitions et équipes nationales
  const intlKeywords = [
    'nations league', 'euro', 'world cup', 'mondial', 'qualif', 'friendly', 
    'friendlies', 'amical', 'amicaux', 'international', 'copa america', 'copa américa', 
    'can ', 'africa cup', 'conmebol', 'gold cup', 'asian cup', 'national team',
    'championship', 'sélection', 'selection', 'pays'
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
    'senegal', 'sénégal', 'japan', 'japon', 'korea', 'corée', 'australia', 'australie'
  ];

  if (countries.some(c => comp === c || opp === c || opp.includes(c) || comp.includes(c))) {
    // S'assurer que ce n'est pas un nom de club contenant un pays/ville par coïncidence (ex: Austria Wien, Paris FC)
    const isClub = /\b(fc|cf|rc|as|sc|cd|united|city|real|atletico|inter|bvb|hotspur|wien|salzburg|paris|sporting|club|olympiakos|dynamo|spartak|celtic|rangers)\b/i.test(opp) || /\b(fc|cf|rc|as|sc|cd|united|city|real|atletico|inter|bvb|hotspur|wien|salzburg|paris|sporting|club|olympiakos|dynamo|spartak|celtic|rangers)\b/i.test(comp);
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

  const lastMatchScore = clubScores[0]; // Le premier élément est le plus récent (historique inversé)
  const playedLastMatch = typeof lastMatchScore === 'number' && lastMatchScore > 0;
  const playedCountL5 = clubScores.slice(0, 5).filter(s => s > 0).length;

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
  } else if (consecutiveDnpCount === 2) {
    recentPlayingFactor = 0.45;
  } else if (consecutiveDnpCount === 1 || !playedLastMatch) {
    recentPlayingFactor = 0.65;
  } else {
    // Facteur neutre sans sur-bonification de rythme
    recentPlayingFactor = 1.0;
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
 * Calcule le score projeté SO5 pour une carte selon la stratégie
 */
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
  const upcomingIsNational = card.upcomingFixture?.competitionName && isNationalTeamMatch({ competitionName: card.upcomingFixture.competitionName });

  const calcCleanAverage = (scores: number[] | undefined, count: number, fallback = 40) => {
    if (!scores || scores.length === 0) return fallback;
    const played = scores.filter(s => s != null && s > 0).slice(0, count);
    if (played.length === 0) return fallback;
    return Math.round((played.reduce((a, b) => a + b, 0) / played.length) * 10) / 10;
  };

  let l5 = card.scores?.l5 || calcCleanAverage(card.scores?.last5Scores, 5, 40);
  let l15 = card.scores?.l15 || calcCleanAverage(card.scores?.last15Scores, 15, l5);
  let l40 = card.scores?.l40 || calcCleanAverage(card.scores?.last40Scores, 40, l15);
  let recentStats = getPlayerRecentMatchAnalysis(card);
  let filterLabel = '';

  // 2. Dissociation des matchs Équipe Nationale et Club
  if (card.scores?.recentMatches && card.scores.recentMatches.length > 0) {
    // On ne conserve que les matchs cohérents avec le type d'échéance à venir
    const filteredMatches = card.scores.recentMatches.filter(m => {
      const matchIsNational = isNationalTeamMatch(m);
      if (upcomingIsNational) {
        return matchIsNational;
      } else {
        return !matchIsNational;
      }
    });

    if (filteredMatches.length > 0) {
      const filteredScores = filteredMatches.map(m => m.score);
      // Calcul officiel Sorare (uniquement matchs joués > 0) avec lissage Bayesien si échantillon réduit
      const baselineScore = (card.scores?.l40 && card.scores.l40 > 0) ? card.scores.l40 : (card.scores?.l15 || 48);
      const calcAverage = (scores: number[], count: number, fallback: number = baselineScore) => {
        const playedScores = scores.filter(s => s != null && s > 0);
        const slice = playedScores.slice(0, count);
        if (slice.length === 0) return fallback;
        const rawAvg = slice.reduce((a, b) => a + b, 0) / slice.length;
        // Garde-fou Trêve Internationale / Faible échantillon : si < 2 matchs joués pour L5 ou < 4 pour L15
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
          filterLabel = `Forme club uniquement (hors ${removedCount} match(s) sélection nationale)`;
        }
      } else {
        filterLabel = `Forme sélection nationale uniquement`;
      }
    } else {
      // Aucun match de ce type trouvé (ex: trêve nationale ayant effacé l'historique club de l'API)
      if (!upcomingIsNational) {
        // Échéance CLUB mais pas de match club trouvé dans l'historique récent
        if (l15 > 45 || l40 > 45 || card.status === 'STARTER' || card.status === 'REGULAR') {
          // On restaure ses moyennes historiques réelles de club en ignorant l'absence récente en sélection
          l5 = l15 > 0 ? l15 : l40;
          // COHERENCE FIX (audit): this used to fabricate `playedCountL5: 5` and
          // `recentPlayingFactor: 1.0` — i.e. full certainty, as if the player had actually
          // started all 5 recent club matches — even though there is ZERO real recent club match
          // data here (we're falling back to L15/L40 historical averages precisely because none
          // exists). That overstated confidence flatters the projection. Softened to reflect
          // genuine uncertainty while still trusting the card's own STARTER/REGULAR status.
          recentStats = {
            playedLastMatch: true,
            lastMatchScore: l5,
            lastMatchLabel: 'Titulaire Club (Forme Rétrospective)',
            playedCountL5: 3,
            consecutiveDnpCount: 0,
            recentPlayingFactor: 0.90,
          };
          filterLabel = 'Données club rétrospectives (trêve nationale exclue, confiance réduite)';
        }
      } else {
        // Échéance NATIONALE mais pas de match de sélection dans l'historique récent
        l5 = 0;
        recentStats = {
          playedLastMatch: false,
          lastMatchScore: 0,
          lastMatchLabel: 'DNP Sélection (Aucune sélection récente)',
          playedCountL5: 0,
          consecutiveDnpCount: 5,
          recentPlayingFactor: 0.05,
        };
        filterLabel = 'Forme sélection (Aucun match trouvé)';
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
    regressionPenalty: 0,
    filterLabel,
    bonusBreakdown,
  };

  let playerStatus: string = card.status || 'REGULAR';

  // Correction dynamique du statut si l'analyse récente contredit le statut de la carte
  if (upcomingIsNational) {
    if (recentStats.playedLastMatch && recentStats.playedCountL5 >= 2) {
      playerStatus = 'STARTER';
    } else if (recentStats.playedLastMatch) {
      playerStatus = 'STARTER'; // Titulaire au dernier match de sélection = probable titulaire
    } else if (recentStats.playedCountL5 >= 1) {
      playerStatus = 'SUBSTITUTE';
    } else {
      playerStatus = 'NOT_PLAYING';
    }
  } else {
    if (recentStats.playedCountL5 >= 4 && recentStats.playedLastMatch) {
      playerStatus = 'STARTER';
    } else if (recentStats.playedCountL5 >= 2 && (playerStatus === 'NOT_PLAYING' || playerStatus === 'SUBSTITUTE' || playerStatus === 'BENCH')) {
      playerStatus = 'REGULAR';
    } else if (recentStats.playedCountL5 === 1 && playerStatus === 'NOT_PLAYING') {
      playerStatus = 'SUBSTITUTE';
    }
  }

  // 1. Élimination d'office des joueurs blessés, suspendus ou hors groupe
  if (card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED' || playerStatus === 'NOT_PLAYING') {
    return emptyBreakdown;
  }

  // Si le joueur n'a disputé aucun match sur les 5 derniers, le risque DNP est maximal (score 0)
  if (recentStats.playedCountL5 === 0 && playerStatus !== 'STARTER') {
    return emptyBreakdown;
  }

  // Exclure les remplaçants confirmés (SUBSTITUTE / BENCH) ou joueurs écartés selon les dernières compos
  if (playerStatus === 'SUBSTITUTE' || playerStatus === 'SUPER_SUBSTITUTE' || playerStatus === 'BENCH' || recentStats.consecutiveDnpCount >= 2 || recentStats.recentPlayingFactor < 0.30) {
    return emptyBreakdown;
  }

  let baseForm = 0;
  let strategyWeights = { l5: 0.50, l15: 0.35, l40: 0.15 };

  if (strategy === 'PURE_FORM') {
    strategyWeights = { l5: 0.75, l15: 0.20, l40: 0.05 };
  } else if (strategy === 'SAFE_TITULAR') {
    strategyWeights = { l5: 0.35, l15: 0.40, l40: 0.25 };
  } else if (strategy === 'HIGH_CEILING') {
    strategyWeights = { l5: 0.60, l15: 0.30, l40: 0.10 };
  }

  baseForm = (l5 * strategyWeights.l5) + (l15 * strategyWeights.l15) + (l40 * strategyWeights.l40);

  // --- NEW: Regression to the Mean & Ponderation DS ---
  let regressionPenalty = 0;
  if (l40 > 0 && l5 > l40 + 5) {
     regressionPenalty = (l5 - l40) / 5.0; // "multiplicateur ajusté à 5.0"
     baseForm -= regressionPenalty;
  }

  // 3. Facteur statut titulaire & pénalité derniers matchs
  let starterFactor = 1.0;
  let starterImpactLabel = 'Titulaire indiscutable (100%)';

  if (playerStatus === 'STARTER') {
    starterFactor = 1.0;
    starterImpactLabel = 'Titulaire garanti (100%)';
  } else if (playerStatus === 'REGULAR') {
    starterFactor = 0.90;
    starterImpactLabel = 'Joueur régulier (-10%)';
  } else if (playerStatus === 'SUPER_SUBSTITUTE') {
    starterFactor = 0.50;
    starterImpactLabel = 'Super Sub (-50%)';
  } else if (playerStatus === 'SUBSTITUTE') {
    starterFactor = 0.20;
    starterImpactLabel = 'Remplaçant (-80%)';
  }

  if (card.injuryStatus === 'DOUBTFUL') {
    starterFactor *= 0.60;
    starterImpactLabel += ' • Douteux (-40%)';
  } else if (card.injuryStatus === 'QUESTIONABLE') {
    starterFactor *= 0.80;
    starterImpactLabel += ' • Incertain (-20%)';
  }

  // Application de la pénalité liée au dernier match et aux DNP récents
  starterFactor *= recentStats.recentPlayingFactor;

  const recentMatchDetail = card.scores?.recentMatches?.[0];
  const wasSubInLastMatch = recentMatchDetail 
    ? (recentMatchDetail.isSub === true || recentMatchDetail.baseScore === 25 || (recentMatchDetail.minsPlayed != null && recentMatchDetail.minsPlayed > 0 && recentMatchDetail.minsPlayed < 60))
    : (card.status === 'SUPER_SUBSTITUTE' || card.status === 'SUBSTITUTE' || card.status === 'BENCH');

  if (recentStats.playedLastMatch && wasSubInLastMatch) {
    // BUGFIX (coherence audit): this label used to claim a -5% penalty but starterFactor was
    // never actually multiplied by 0.95 — the score was flattered relative to what the system's
    // own explanation told the user. Now genuinely applied.
    starterFactor *= 0.95;
    starterImpactLabel += ' • Entré en jeu / Remplaçant (-5%)';
  }

  // Pénalité d'adaptation pour transfert / nouveau club
  const hasChangedClub = isPlayerNewTransfer(card);
  if (hasChangedClub) {
    const adaptationPenaltyPct = 15; // -15% sur la probabilité de titularisation de base
    starterFactor *= (1 - (adaptationPenaltyPct / 100));
    starterImpactLabel += ` • Adaptation nouveau club (-${adaptationPenaltyPct}%)`;
  }

  // 4. Facteur adversaire et cotes bookmakers
  const fixture = card.upcomingFixture;
  let matchupFactor = 1.0;
  let cleanSheetFactor = 0;
  let matchupImpactLabel = 'Neutre (FDR 3 : 100%)';
  let difficultyRating = fixture?.difficultyRating || 3;
  let allAroundFactor = 1.0;
  let teamXG = 1.4;
  let oppXG = 1.4;

  if (fixture) {
    const winProb = getPlayerWinProbability(fixture);
    if (winProb >= 60) {
      difficultyRating = 1;
    } else if (winProb >= 48) {
      difficultyRating = 2;
    } else if (winProb >= 35) {
      difficultyRating = 3;
    } else if (winProb >= 22) {
      difficultyRating = 4;
    } else {
      difficultyRating = 5;
    }

    switch (difficultyRating) {
      case 1:
        matchupFactor = 1.12;
        matchupImpactLabel = 'Très Favorable (FDR 1 : +12%)';
        // Halved vs the original +5%/+3%: matchupFactor already captures this same
        // difficultyRating-derived favorability, so applying the full boost again here would
        // double-count the same signal for MID (same fix pattern already applied to
        // cleanSheetFactor below, for consistency).
        allAroundFactor = (card.positionCode === 'MID') ? 1.025 : 1.0; // Boost possession pour MID
        break;
      case 2:
        matchupFactor = 1.05;
        matchupImpactLabel = 'Favorable (FDR 2 : +5%)';
        allAroundFactor = (card.positionCode === 'MID') ? 1.015 : 1.0;
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

    // --- HOME / AWAY FACTOR & EXPECTED GOALS (xG) POSITION-BASED SCALING ---
    teamXG = fixture?.bookmaker?.goalExpectancy || (difficultyRating === 1 ? 2.1 : difficultyRating === 2 ? 1.7 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.1 : 0.8);
    oppXG = fixture?.bookmaker?.opponentGoalExpectancy || (difficultyRating === 1 ? 0.8 : difficultyRating === 2 ? 1.1 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.7 : 2.1);

    if (fixture.isHome) {
      teamXG *= 1.10;
      oppXG *= 0.90;
      matchupImpactLabel += ' • Domicile (xG ajusté)';
    } else {
      teamXG *= 0.90;
      oppXG *= 1.10;
      matchupImpactLabel += ' • Extérieur (xG ajusté)';
    }

    // --- NEW: Opponent Style Proxies ---
    if ((card.positionCode === 'GK' || card.positionCode === 'DEF') && oppXG > 1.8) {
      // Si l'adversaire a un volume offensif important, opportunités accrues de duels, sauvetages et tacles (+5% AAS)
      allAroundFactor *= 1.05;
    }

    // Calculate clean sheet factor based on cleanSheetProb if available, or dynamically derived from oppXG
    if (card.positionCode === 'GK' || card.positionCode === 'DEF') {
      const derivedCSProb = fixture?.bookmaker?.cleanSheetProb || Math.max(5, Math.min(85, Math.exp(-oppXG) * 100));
      cleanSheetFactor = (derivedCSProb / 100) * 8;
    }
  }

  let profileBonus = 0;
  // --- Game State (O/U Proxy) ---
  // COHERENCE FIX (audit): both the threshold bonus below and the xG-delta adjustment are
  // derived from teamXG/oppXG, which are themselves either taken directly from bookmaker data
  // OR (when unavailable) derived FROM the very same difficultyRating that already drives
  // matchupFactor a few lines above. That means a big favorite could get rewarded for the same
  // underlying "easy/high-scoring fixture" fact three times over: once multiplicatively via
  // matchupFactor (+12% for FDR1), once via this threshold bonus, and once via the xG-delta term
  // — compounding into unrealistically inflated projections for star players in good fixtures
  // (traced example: a 66.8-pt weighted form could reach ~82.7 projected, +24%, largely from this
  // redundancy). Halved here, consistent with the same "avoid double-counting" correction already
  // applied to cleanSheetFactor and allAroundFactor elsewhere in this function.
  let gameStateBonus = 0;
  if (fixture) {
    const totalMatchXG = teamXG + oppXG;
    let thresholdLow = 2.3;
    let thresholdHigh = 2.8;

    if (totalMatchXG < thresholdLow) {
      if (card.positionCode === 'GK' || card.positionCode === 'DEF') gameStateBonus += 0.5;
      if (card.positionCode === 'FWD') gameStateBonus -= 0.5;
    } else if (totalMatchXG > thresholdHigh) {
      if (card.positionCode === 'GK' || card.positionCode === 'DEF') gameStateBonus -= 0.25;
      if (card.positionCode === 'FWD') gameStateBonus += 0.75;
    }

    if (card.positionCode === 'FWD' || card.positionCode === 'MID') {
      const xGAdjustment = (teamXG - 1.4) * 0.5;
      gameStateBonus += xGAdjustment;
    }
  }

  // --- Contextual Absents ---
  // BUGFIX: the previous condition `card.status === 'STARTER' && !isRegularStarter` could never
  // be true, since isRegularStarter is defined as (status === 'REGULAR' || status === 'STARTER'),
  // so status === 'STARTER' already guarantees isRegularStarter === true. This branch was dead
  // code and the "Remplace un titulaire absent" bonus never fired.
  // Fix: use `starterConfidence` (derived from actual recent playing time, see server.ts) as the
  // real signal for "listed as a starter for this fixture, but hasn't consistently started
  // recently" — i.e. likely stepping in for an injured/rotated regular.
  const isRegularStarter = card.status === 'REGULAR' || card.status === 'STARTER';
  let contextualBonus = 0;
  let contextualImpactLabel = '';
  if (card.status === 'STARTER' && (card.starterConfidence ?? 100) < 60) {
    contextualBonus += 2.0;
    contextualImpactLabel = 'Remplace un titulaire absent (+2pts)';
  } else if (isRegularStarter && card.scores && card.scores.l5 < 35 && card.scores.l15 > 50) {
    contextualBonus += 3.0;
    contextualImpactLabel = 'Retour en forme attendu (+3pts)';
  }

  // Weather check
  let weatherBonus = 0;
  let weatherImpactLabel = '';
  if (fixture?.weather) {
    const w = fixture.weather;
    if (w.description?.includes('Pluie') || w.description?.includes('Neige')) {
      if (card.positionCode === 'GK') {
        weatherBonus -= 1.5;
        weatherImpactLabel = 'Conditions humides (Erreurs GK -1.5pt)';
      } else if (card.positionCode === 'DEF' && (card.scores?.l5 ?? 0) > 40) {
        weatherBonus += 1.0;
        weatherImpactLabel = 'Conditions humides (Tacles/Duels DEF +1.0pt)';
      }
    }
    if (w.wind > 35) {
      if (card.positionCode === 'MID' || card.positionCode === 'FWD') {
        weatherBonus -= 1.0;
        weatherImpactLabel = 'Vent fort (Jeu long perturbé -1.0pt)';
      }
    }
  }

  // Adjust cleanSheetFactor down since matchupFactor already boosts good matchups
  if (cleanSheetFactor > 0) {
    cleanSheetFactor = cleanSheetFactor * 0.5; 
  }

  let projected = (baseForm * starterFactor * matchupFactor * allAroundFactor) + cleanSheetFactor + profileBonus + gameStateBonus + contextualBonus + weatherBonus;

  // 5. Bonus additionnels Buteur/Passeur (Bookmakers & xG/xA avancés)
  let bookmakerActionBonus = 0;
  if (fixture?.bookmaker) {
    const bm = fixture.bookmaker;
    if (bm.anytimeScorerOdds && bm.anytimeScorerOdds < 4.5) {
      bookmakerActionBonus += Math.max(0, (5.0 - bm.anytimeScorerOdds) * 0.2); // Reduced impact
    }
    if (bm.anytimeAssistOdds && bm.anytimeAssistOdds < 5.5) {
      bookmakerActionBonus += Math.max(0, (6.0 - bm.anytimeAssistOdds) * 0.15); // Reduced impact
    }
  }

  let advancedStatsBonus = 0;
  if (card.scores?.xG && card.scores.xG > 0) {
    advancedStatsBonus += Math.min(1.5, card.scores.xG * 1.0);
  }
  if (card.scores?.xA && card.scores.xA > 0) {
    advancedStatsBonus += Math.min(1.5, card.scores.xA * 1.0);
  }

  projected += (bookmakerActionBonus + advancedStatsBonus);

  // 6. Orientation Stratégique AAS vs DS vs Équilibré
  const aasRate = card.scores?.aasPercentage ?? 50;
  const dsRate = card.scores?.decisivePercentage ?? 30;
  let scoringFocusBonus = 0;
  if (scoringFocus === 'AAS') {
    if (aasRate >= 80) scoringFocusBonus += 1.5;
    else if (aasRate >= 60) scoringFocusBonus += 0.5;
    else if (aasRate < 40) scoringFocusBonus -= 2.0;
  } else if (scoringFocus === 'DS') {
    if (dsRate >= 80) {
      scoringFocusBonus += 2.0;
    } else if (dsRate >= 50) {
      scoringFocusBonus += 1.0;
    } else {
      scoringFocusBonus -= 2.0;
    }
  }
  projected += scoringFocusBonus;


  if (strategy === 'HIGH_CEILING' && card.positionCode === 'FWD' && fixture?.bookmaker?.anytimeScorerOdds && fixture.bookmaker.anytimeScorerOdds < 2.2) {
    projected += 4;
  }

  const baseProjected = Math.max(0, Math.min(100, Math.round(projected * 10) / 10));
  const cardBonusScore = Math.round((baseProjected * (bonusPct / 100)) * 10) / 10;
  const totalProjectedScore = Math.round((baseProjected + cardBonusScore) * 10) / 10;

  // --- NEW: Volatility & Range Logic ---
  const aaPct = card.scores?.allAroundContributionPct || (card.positionCode === 'DEF' ? 65 : card.positionCode === 'GK' ? 30 : 50);
  const decPct = card.scores?.decisiveContributionPct || (card.positionCode === 'FWD' ? 60 : card.positionCode === 'MID' ? 40 : 50);
  const reliantType = aaPct > 58 ? 'AA_RELIANT' : decPct > 50 ? 'DECISIVE_RELIANT' : 'BALANCED';

  // Amplitude de la fourchette (Range)
  let rangeAmplitude = 8; // +/- 8 pts par défaut
  if (reliantType === 'AA_RELIANT') rangeAmplitude = 5; // Stable
  if (reliantType === 'DECISIVE_RELIANT') rangeAmplitude = 12; // Volatil

  // Pour les attaquants, on réduit un peu comme demandé si c'est trop large
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
    profileBonus: Math.round(profileBonus * 10) / 10,
    bookmakerActionBonus: Math.round(bookmakerActionBonus * 10) / 10,
    weatherBonus: Math.round(weatherBonus * 10) / 10,
    weatherImpactLabel: weatherImpactLabel || undefined,
    contextualBonus: Math.round(contextualBonus * 10) / 10,
    contextualImpactLabel,
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

  // 1. RÈGLE 1 : Éliminer les candidats qui affrontent un joueur déjà présent dans l'équipe
  let filtered = candidates;
  if (!ignoreOpponentsConstraint && selectedPlayers.length > 0) {
    const nonOpponents = candidates.filter(cand => {
      return !selectedPlayers.some(sel => areOpponents(cand.player, sel));
    });
    // Si au moins une option n'est pas un adversaire, on applique strictement la règle
    if (nonOpponents.length > 0) {
      filtered = nonOpponents;
    }
  }

  if (filtered.length === 0) return null;

  // 2. RÈGLE 2 : Si des joueurs sont proches en terme de score projeté, PRIVILÉGIER les joueurs d'une même équipe
  const topCandidate = filtered[0];
  const topScore = topCandidate.projectedScore;

  // Trouver tous les candidats dont le score est proche du top (écart <= 4 pts)
  const closeCandidates = filtered.filter(cand => (topScore - cand.projectedScore) <= proximityThreshold);

  if (closeCandidates.length > 1 && selectedPlayers.length > 0) {
    // Calculer le nombre de coéquipiers déjà dans l'équipe pour chaque candidat
    const candidateClubScores = closeCandidates.map(cand => {
      const candClub = cand.player.club?.name;
      const teammates = selectedPlayers.filter(sel => isSameClub(sel.club?.name, candClub));
      const teammateCount = teammates.length;
      return {
        cand,
        teammateCount,
        // Score effectif bonifié pour prioriser le stacking même club
        effectiveScore: cand.projectedScore + (teammateCount * 2.0)
      };
    });

    const withTeammates = candidateClubScores.filter(item => item.teammateCount > 0);
    if (withTeammates.length > 0) {
      // Trier par nombre de coéquipiers puis score effectif
      withTeammates.sort((a, b) => b.teammateCount - a.teammateCount || b.effectiveScore - a.effectiveScore);
      return withTeammates[0].cand.player;
    }
  }

  return topCandidate.player;
}

/**
 * Optimise une composition SO5 (1 GK, 1 DEF, 1 MID, 1 FWD, 1 EXTRA [DEF/MID/FWD])
 */
export function optimizeLineup(
  cards: SorareCard[],
  strategy: StrategyType = 'BALANCED',
  gameWeek: number = 48,
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
    if (sc.projectedScore <= 0 || c.injuryStatus === 'INJURED' || c.injuryStatus === 'SUSPENDED' || c.status === 'NOT_PLAYING') {
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
      if (sc.projectedScore <= 0 || c.injuryStatus === 'INJURED' || c.injuryStatus === 'SUSPENDED' || c.status === 'NOT_PLAYING') {
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

    // DEF
    const defCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'DEF' && !isPlayerAlreadyUsed(sc.player))
      .sort(compareCandidates);
    const selectedDef = selectPlayerForPosition(defCandidates, currentList, false, 4.0);
    if (selectedDef) currentList.push(selectedDef);

    // MID
    const midCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'MID' && !isPlayerAlreadyUsed(sc.player))
      .sort(compareCandidates);
    const selectedMid = selectPlayerForPosition(midCandidates, currentList, false, 4.0);
    if (selectedMid) currentList.push(selectedMid);

    // FWD
    const fwdCandidates = finalEligible
      .filter(sc => sc.player.positionCode === 'FWD' && !isPlayerAlreadyUsed(sc.player))
      .sort(compareCandidates);
    const selectedFwd = selectPlayerForPosition(fwdCandidates, currentList, false, 4.0);
    if (selectedFwd) currentList.push(selectedFwd);

    // EXTRA : le meilleur joueur restant parmi DEF, MID, FWD (ou respectant preferredExtraPosition)
    let outfieldCandidates = finalEligible
      .filter(sc => sc.player.positionCode !== 'GK' && !isPlayerAlreadyUsed(sc.player));

    if (filters.preferredExtraPosition && filters.preferredExtraPosition !== 'AUTO') {
      outfieldCandidates = outfieldCandidates.filter(sc => sc.player.positionCode === filters.preferredExtraPosition);
    }
    outfieldCandidates.sort(compareCandidates);
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
 * Génère 4 compositions distinctes sans doublon de cartes (sauf doublons réels possédés dans la galerie)
 */
export function generateFourDistinctLineups(
  cards: SorareCard[],
  strategy: StrategyType = 'BALANCED',
  gameWeek: number = 48,
  filters: LineupOptimizationFilters = {}
): Lineup[] {
  const lineups: Lineup[] = [];
  const usedCardIds = new Set<string>();
  const usedPlayerKeys = new Set<string>();

  const strategies: { name: string; type: StrategyType }[] = [
    { name: 'Compo 1', type: 'BALANCED' },
    { name: 'Compo 2', type: 'SAFE_TITULAR' },
    { name: 'Compo 3', type: 'HIGH_CEILING' },
    { name: 'Compo 4', type: 'PURE_FORM' },
  ];

  for (let i = 0; i < 4; i++) {
    const s = strategies[i];
    const lineup = optimizeLineup(cards, s.type, gameWeek, filters, usedCardIds, usedPlayerKeys);
    lineup.name = s.name;
    
    // Enregistrer les cartes et joueurs utilisés pour les compos suivantes
    ['gk', 'def', 'mid', 'fwd', 'extra'].forEach((slotKey) => {
      const cardInSlot = lineup.slots[slotKey as keyof typeof lineup.slots];
      if (cardInSlot) {
        usedCardIds.add(cardInSlot.id);
        usedPlayerKeys.add(getPlayerUniqueKey(cardInSlot));
      }
    });

    lineups.push(lineup);
  }

  return lineups;
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
      const matchIsNational = isNationalTeamMatch(m);
      if (upcomingIsNational) {
        return matchIsNational;
      } else {
        return !matchIsNational;
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
  const seed = (card.id || 'card').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pos = card.positionCode || 'MID';
  
  const totalMatches = 40;
  const rawScores = generate40RawScoresForCard(card);
  const recentMatches = card.scores?.recentMatches;

  // Realistic league-aware opponents list
  const opponentPool = getOpponentPoolForCard(card);
  const myClubName = (card.club?.name || '').toLowerCase();
  const validOpponents = opponentPool.filter(o => {
    const oLower = o.toLowerCase();
    return !oLower.includes(myClubName) && !myClubName.includes(oLower);
  });
  const finalOpponents = validOpponents.length > 0 ? validOpponents : opponentPool;

  rawScores.forEach((score, idx) => {
    const matchIndex = idx + 1; // 1 to 40 (1 is most recent match)
    const apiIdx = idx; // idx=0 is newest in recentMatches
    const realMatch = recentMatches && recentMatches[apiIdx];

    const hasValidRealOpponent = realMatch && realMatch.opponent && realMatch.opponent !== 'Match Futur/Passé' && realMatch.opponent !== 'Match Réel';
    const opp = hasValidRealOpponent ? realMatch.opponent : finalOpponents[(seed + idx) % finalOpponents.length];
    const isHome = realMatch !== undefined && realMatch.isHome !== undefined ? realMatch.isHome : (seed + idx) % 2 === 0;
    
    if (score === 0 || score < 1) {
      // 1. NON JOUÉ (NOIR / BLACK)
      const dnpReasons = [
        '0 minute disputée (Joueur sur le banc des remplaçants)',
        '0 minute disputée (Repos tactique / Rotation d\'effectif)',
        '0 minute disputée (Légère gêne musculaire / Préservé)',
        '0 minute disputée (Non retenu dans le groupe du match)'
      ];
      const dnpReason = dnpReasons[(seed + idx) % dnpReasons.length];

      result.push({
        matchIndex,
        matchLabel: idx === 0 ? 'Dernier match (M1)' : `Match M${matchIndex}`,
        totalScore: 0,
        isDNP: true,
        isStarter: false,
        isSub: false,
        baseScore: 0,
        minutesPlayed: 0,
        opponent: opp,
        isHome,
        result: isHome ? 'V 1-0' : 'N 0-0',
        decisiveScore: 0,
        decisiveBonus: 0,
        decisiveActions: [],
        allAroundScore: 0,
        allAroundDetails: [dnpReason],
        negativeMalus: 0,
        negativeActions: [],
        goals: 0,
        goalAssists: 0,
        penaltyAssists: 0,
        lastManTackles: 0,
        yellowCards: 0,
        redCards: 0,
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
      return;
    }

    // 2. JOUEUR AYANT PARTICIPÉ AU MATCH
    const totalScore = Math.round(score * 10) / 10;
    
    // Check if we have real match stats from Sorare API
    if (realMatch && (realMatch.minsPlayed !== undefined || realMatch.goals !== undefined || realMatch.decisiveActions !== undefined)) {
      const minutesPlayed = realMatch.minsPlayed ?? 90;
      const goals = realMatch.goals ?? 0;
      const goalAssist = realMatch.goalAssist ?? 0;
      const yellowCards = realMatch.yellowCards ?? 0;
      const redCards = realMatch.redCards ?? 0;
      const cleanSheet = realMatch.cleanSheet ?? 0;
      const accuratePass = realMatch.accuratePass ?? (totalScore > 50 ? 45 : 30);
      const totalPass = realMatch.totalPass ?? Math.round(accuratePass * 1.18);
      const wonContest = realMatch.wonContest ?? (totalScore > 50 ? 5 : 2);
      const bigChanceCreated = realMatch.bigChanceCreated ?? 0;
      const errorLeadToGoal = realMatch.errorLeadToGoal ?? 0;
      const ownGoals = realMatch.ownGoals ?? 0;
      const penaltyKickMissed = realMatch.penaltyKickMissed ?? 0;
      const penaltySave = realMatch.penaltySave ?? 0;
      const wasFouled = realMatch.wasFouled ?? 0;

      // Determine Starter vs Sub
      const isStarter = realMatch.isStarter !== undefined 
        ? realMatch.isStarter 
        : (minutesPlayed >= 45 || totalScore >= 35);
      const isSub = realMatch.isSub !== undefined 
        ? realMatch.isSub 
        : (!isStarter && minutesPlayed > 0);
      const baseScore = realMatch.baseScore !== undefined
        ? realMatch.baseScore
        : (isStarter ? 35 : isSub ? 25 : 0);

      // Decisive actions
      let decisiveActions = realMatch.decisiveActions && realMatch.decisiveActions.length > 0 
        ? [...realMatch.decisiveActions] 
        : [];
      if (decisiveActions.length === 0) {
        if (goals > 1) decisiveActions.push(`⚽ Doublé (${goals} buts)`);
        else if (goals === 1) decisiveActions.push('⚽ But marqué');
        if (goalAssist > 1) decisiveActions.push(`🅰️ ${goalAssist} Passes décisives`);
        else if (goalAssist === 1) decisiveActions.push('🅰️ Passe décisive');
        if (penaltySave > 0) decisiveActions.push(`🧤 Penalty arrêté (${penaltySave})`);
        if (cleanSheet > 0 && pos === 'GK' && minutesPlayed >= 60) decisiveActions.push('🛡️ Clean Sheet (0 but concédé)');
        else if (cleanSheet > 0 && pos === 'DEF' && minutesPlayed >= 60) decisiveActions.push('🛡️ Clean Sheet défensif');
      }

      // Determine if there is a positive decisive action
      const hasPositiveDecisive = (realMatch.decisiveScore !== undefined && realMatch.decisiveScore >= 60) || (decisiveActions.length > 0) || (goals > 0) || (goalAssist > 0) || (penaltySave > 0);
      const decisiveScore = hasPositiveDecisive 
        ? (realMatch.decisiveScore && realMatch.decisiveScore >= 60 ? realMatch.decisiveScore : 60)
        : 0;
      const decisiveBonus = hasPositiveDecisive ? Math.max(0, decisiveScore - baseScore) : 0;

      const allAroundScore = realMatch.allAroundScore !== undefined 
        ? realMatch.allAroundScore 
        : Math.max(0, Math.round((totalScore - (hasPositiveDecisive ? decisiveScore : baseScore)) * 10) / 10);

      // Negative actions
      let negativeActions = realMatch.negativeActions && realMatch.negativeActions.length > 0
        ? [...realMatch.negativeActions]
        : [];
      if (negativeActions.length === 0) {
        if (redCards > 0) negativeActions.push(`🟥 Carton rouge (${redCards})`);
        if (yellowCards > 0) negativeActions.push(`🟨 Carton jaune (${yellowCards})`);
        if (ownGoals > 0) negativeActions.push(`❌ But contre son camp (${ownGoals})`);
        if (errorLeadToGoal > 0) negativeActions.push(`❌ Erreur menant au but (${errorLeadToGoal})`);
        if (penaltyKickMissed > 0) negativeActions.push(`⚠️ Penalty manqué (${penaltyKickMissed})`);
      }
      const negativeMalus = (redCards * 20) + (ownGoals * 15) + (errorLeadToGoal * 15) + (penaltyKickMissed * 15) + (yellowCards * 5);

      // All around details
      let allAroundDetails = realMatch.allAroundDetails && realMatch.allAroundDetails.length > 0
        ? [...realMatch.allAroundDetails]
        : [];
      if (allAroundDetails.length === 0) {
        allAroundDetails.push(`⏱️ ${minutesPlayed} mins disputées`);
        if (totalPass > 0) {
          const passPct = Math.round((accuratePass / totalPass) * 100);
          allAroundDetails.push(`🎯 ${accuratePass}/${totalPass} passes réussies (${passPct}%)`);
        }
        if (wonContest > 0) allAroundDetails.push(`⚔️ ${wonContest} duels remportés`);
        if (bigChanceCreated > 0) allAroundDetails.push(`⚡ ${bigChanceCreated} occasion(s) créée(s)`);
      }

      const isMatchLive = idx === 0 && Boolean((realMatch as any)?.isLive || (card as any).isLive);
      const matchLiveMin = idx === 0 ? ((realMatch as any)?.minute || (card as any).liveMinute) : undefined;
      const computedMatchLabel = idx === 0
        ? (isMatchLive ? (matchLiveMin ? `🔴 En direct (${matchLiveMin}')` : '🔴 En direct (M1)') : 'Dernier match (M1)')
        : `Match M${matchIndex}`;

      result.push({
        matchIndex,
        matchLabel: computedMatchLabel,
        totalScore,
        isDNP: false,
        isStarter,
        isSub,
        baseScore,
        minutesPlayed,
        opponent: opp,
        isHome,
        result: totalScore >= 60 ? 'V 2-0' : totalScore < 35 ? 'D 1-2' : 'N 1-1',
        decisiveScore,
        decisiveBonus,
        decisiveActions,
        allAroundScore,
        allAroundDetails,
        negativeMalus,
        negativeActions,
        goals,
        goalAssists: goalAssist,
        penaltyAssists: 0,
        lastManTackles: pos === 'DEF' && totalScore > 65 ? 1 : 0,
        yellowCards,
        redCards,
        cleanSheet,
        accuratePasses: accuratePass,
        totalPasses: totalPass,
        wonTackles: Math.round(wonContest * 0.6),
        wonContests: wonContest,
        interceptionsWon: pos === 'DEF' || pos === 'MID' ? Math.round((seed + idx) % 4) : 0,
        setPiecesTaken: pos === 'MID' ? Math.round((seed + idx) % 5) : 0,
        bigChancesCreated: bigChanceCreated,
        errorsLeadToGoal: errorLeadToGoal,
        penaltiesConceded: 0,
        ownGoals,
        penaltiesMissed: penaltyKickMissed,
        penaltiesSaved: penaltySave,
        wasFouled,
        isLive: isMatchLive,
        minute: matchLiveMin,
      });
      return;
    }

    // Fallback if real stats object not populated
    const isStarter = (seed + idx) % 7 !== 0;
    const isSub = !isStarter;
    const baseScore = isStarter ? 35 : 25;

    const isDecisivePositive = totalScore >= 60;
    const isNegativeEvent = totalScore < 35;
    
    let decisiveScore = 0;
    let decisiveBonus = 0;
    const decisiveActions: string[] = [];
    let negativeMalus = 0;
    const negativeActions: string[] = [];
    let allAroundScore = 0;
    const allAroundDetails: string[] = [];
    let minutesPlayed = isStarter ? 90 : 25;

    let goals = 0;
    let goalAssists = 0;
    let yellowCards = 0;
    let redCards = 0;
    let cleanSheet = 0;
    let accuratePasses = Math.round(35 + ((seed + idx) % 25));
    let totalPasses = Math.round(accuratePasses * 1.15);
    let wonTackles = Math.round(2 + ((seed + idx) % 4));
    let wonContests = Math.round(wonTackles * 1.5);
    let interceptionsWon = Math.round(1 + ((seed + idx) % 3));
    let setPiecesTaken = pos === 'MID' ? Math.round((seed + idx) % 4) : 0;
    let errorsLeadToGoal = 0;
    let penaltiesConceded = 0;
    let ownGoals = 0;

    if (isDecisivePositive) {
      // VERT : Action Décisive Positive
      decisiveScore = totalScore >= 75 ? 70 : 60;
      decisiveBonus = Math.max(0, decisiveScore - baseScore);

      if (pos === 'GK') {
        cleanSheet = 1;
        if (totalScore >= 75) {
          decisiveActions.push('🧤 Penalty arrêté décisif', '🛡️ Clean Sheet');
        } else {
          decisiveActions.push('🛡️ Clean Sheet gardien (0 but concédé)');
        }
      } else if (pos === 'DEF') {
        if (totalScore >= 75) {
          goals = 1;
          cleanSheet = 1;
          decisiveActions.push('⚽ But marqué de la tête', '🛡️ Clean Sheet');
        } else {
          const isAssist = (seed + idx) % 2 === 0;
          if (isAssist) {
            goalAssists = 1;
            decisiveActions.push('🅰️ Passe décisive');
          } else {
            cleanSheet = 1;
            decisiveActions.push('🛡️ Clean Sheet défensif');
          }
        }
      } else if (pos === 'MID') {
        if (totalScore >= 75) {
          goals = 2;
          decisiveActions.push('⚽⚽ Doublé de buts');
        } else {
          const isGoal = (seed + idx) % 2 === 0;
          if (isGoal) {
            goals = 1;
            decisiveActions.push('⚽ But marqué');
          } else {
            goalAssists = 1;
            decisiveActions.push('🅰️ Passe décisive');
          }
        }
      } else {
        // FWD
        if (totalScore >= 75) {
          goals = 2;
          decisiveActions.push('⚽⚽ Doublé');
        } else {
          const isGoal = (seed + idx) % 3 !== 0;
          if (isGoal) {
            goals = 1;
            decisiveActions.push('⚽ But d\'attaquant');
          } else {
            goalAssists = 1;
            decisiveActions.push('🅰️ Passe décisive');
          }
        }
      }

      // All-Around Score (Blanc) = Total - Decisive Level
      allAroundScore = Math.max(0, Math.round((totalScore - decisiveScore) * 10) / 10);
      
      // All Around Details
      if (pos === 'GK') {
        allAroundDetails.push('5 arrêts dans la surface', '90% relances réussies', '3 sorties aériennes captées');
      } else if (pos === 'DEF') {
        allAroundDetails.push('6 duels aériens gagnés', '4 tacles réussis', `${accuratePasses} passes réussies`);
      } else if (pos === 'MID') {
        allAroundDetails.push('3 passes clés', '7 duels au sol gagnés', `${accuratePasses} passes complétées`);
      } else {
        allAroundDetails.push('4 tirs cadrés', '3 dribbles réussis', '3 fautes subies');
      }

    } else if (isNegativeEvent) {
      // ROUGE : Action Négative / Malus
      decisiveScore = 0;
      decisiveBonus = 0;
      if (pos === 'GK') {
        negativeMalus = 15;
        penaltiesConceded = 1;
        negativeActions.push('💥 3 buts encaissés', '⚠️ Penalty concédé');
      } else if (pos === 'DEF') {
        negativeMalus = 15;
        const negType = (seed + idx) % 4;
        if (negType === 0) {
          penaltiesConceded = 1;
          negativeActions.push('⚠️ Penalty concédé');
        } else if (negType === 1) {
          errorsLeadToGoal = 1;
          negativeActions.push('❌ Erreur menant au but');
        } else if (negType === 2) {
          redCards = 1;
          yellowCards = 2;
          negativeActions.push('🟥 Carton rouge');
        } else {
          ownGoals = 1;
          negativeActions.push('❌ But contre son camp');
        }
      } else {
        // MID / FWD
        negativeMalus = 15;
        const negType = (seed + idx) % 3;
        if (negType === 0) {
          yellowCards = 1;
          negativeActions.push('🟨 Carton jaune & 5 fautes concédées');
        } else if (negType === 1) {
          redCards = 1;
          negativeActions.push('🟥 Carton rouge direct');
        } else {
          penaltiesConceded = 1;
          negativeActions.push('⚠️ Penalty concédé sur repli');
        }
      }

      // AAS résiduel (Blanc)
      allAroundScore = Math.max(0, Math.round((totalScore - baseScore) * 10) / 10);
      allAroundDetails.push('Participation active mitigée', 'Pertes de possession');

    } else {
      // 35 <= score < 60 : BLANC : All-Around Score prédominant (Match complet classique)
      decisiveScore = 0;
      decisiveBonus = 0;
      allAroundScore = Math.max(0, Math.round((totalScore - baseScore) * 10) / 10);
      
      if ((seed + idx) % 5 === 0) {
        yellowCards = 1;
        negativeActions.push('🟨 Carton jaune');
      }

      if (pos === 'GK') {
        allAroundDetails.push('3 arrêts au sol', '12 relances réussies', '1 but concédé');
      } else if (pos === 'DEF') {
        allAroundDetails.push(`${accuratePasses} passes réussies`, '4 dégagements', `${wonTackles} tacles réussis`);
      } else if (pos === 'MID') {
        allAroundDetails.push(`${accuratePasses} passes réussies`, '5 ballons récupérés', '1 passe clé');
      } else {
        allAroundDetails.push('2 tirs cadrés', '2 dribbles réussis', '2 fautes obtenues');
      }
    }

    result.push({
      matchIndex,
      matchLabel: idx === 0 ? 'Dernier match (M1)' : `Match M${matchIndex}`,
      totalScore,
      isDNP: false,
      isStarter,
      isSub,
      baseScore,
      minutesPlayed,
      opponent: opp,
      isHome,
      result: isDecisivePositive ? 'V 2-0' : isNegativeEvent ? 'D 1-3' : 'N 1-1',
      decisiveScore,
      decisiveBonus,
      decisiveActions,
      allAroundScore,
      allAroundDetails,
      negativeMalus,
      negativeActions,
      goals,
      goalAssists,
      penaltyAssists: 0,
      lastManTackles: 0,
      yellowCards,
      redCards,
      cleanSheet,
      accuratePasses,
      totalPasses,
      wonTackles,
      wonContests,
      interceptionsWon,
      setPiecesTaken,
      bigChancesCreated: 0,
      errorsLeadToGoal,
      penaltiesConceded,
      ownGoals,
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

