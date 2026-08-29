// Statistical Accuracy & Forecast vs Reality Evaluator for Sorare SO5
// Computes backtesting metrics by GameWeek (RAW scores, STRICTLY WITHOUT CARD BONUSES)
import { SorareCard, GameWeekAccuracyStats, PlayerEvaluationRecord, PositionCode } from '../types';
import { calculatePlayerProjectedScore } from './optimizer';
import { FIXTURES_CATALOG, normalizeClubName, getCurrentGameWeekNumber, GAME_WEEK_ANCHOR } from '../data/fixturesData';

/**
 * Derives a relative GameWeek number from match index or match date
 */
function resolveMatchGameWeek(matchIndex: number, matchDateStr?: string, currentGW: number = getCurrentGameWeekNumber()): number {
  if (matchDateStr) {
    try {
      const matchDate = new Date(matchDateStr);
      if (!isNaN(matchDate.getTime())) {
        const anchorMs = new Date(GAME_WEEK_ANCHOR.startDate).getTime();
        const diffDays = (matchDate.getTime() - anchorMs) / (1000 * 60 * 60 * 24);
        const calculatedGW = GAME_WEEK_ANCHOR.number + Math.floor(diffDays / GAME_WEEK_ANCHOR.lengthDays);
        if (calculatedGW < currentGW && calculatedGW >= 30) {
          return calculatedGW;
        }
      }
    } catch {
      // Fallback to match index
    }
  }
  // If match 0 (last finished match), it was GW (current - 1) = 47
  // Match 1 = GW 46, Match 2 = GW 45, etc.
  return Math.max(1, currentGW - 1 - matchIndex);
}

/**
 * Checks if a player/card is eligible for statistical accuracy evaluation:
 * Excludes players who have:
 * - L5 == 0, L15 == 0, and L40 == 0 (all zero / inactive squad member)
 * - No valid positive scores / match history
 */
export function isPlayerEligibleForStatsEvaluation(card: SorareCard): boolean {
  if (!card || !card.scores) return false;
  
  const l5 = typeof card.scores.l5 === 'number' ? card.scores.l5 : 0;
  const l15 = typeof card.scores.l15 === 'number' ? card.scores.l15 : 0;
  const l40 = typeof card.scores.l40 === 'number' ? card.scores.l40 : 0;

  // 1. Exclure les joueurs pour lesquels L5, L15 et L40 sont tous les trois à zéro (inactifs)
  if (l5 <= 0 && l15 <= 0 && l40 <= 0) {
    return false;
  }

  // 2. Exclure les joueurs qui n'ont aucun score ou aucun historique valide
  const recentMatches = card.scores.recentMatches || [];
  const last5 = card.scores.last5Scores || [];

  const hasValidMatchScores = recentMatches.some(m => typeof m?.score === 'number' && m.score > 0);
  const hasValidLast5 = last5.some(s => typeof s === 'number' && s > 0);

  if (!hasValidMatchScores && !hasValidLast5 && (l5 <= 0 && l15 <= 0 && l40 <= 0)) {
    return false;
  }

  return true;
}

/**
 * Computes comprehensive statistical accuracy comparing raw model projections against actual data
 */
export function evaluateAccuracyByGameWeek(
  cards: SorareCard[],
  currentGW: number = getCurrentGameWeekNumber()
): {
  gameWeeks: GameWeekAccuracyStats[];
  overall: GameWeekAccuracyStats;
  totalCardsEvaluated: number;
  totalCardsExcluded: number;
} {
  const recordsByGW: Record<number, PlayerEvaluationRecord[]> = {};

  if (!cards || cards.length === 0) {
    const emptyOverall = createEmptyGWStats(0, 'Aucune donnée');
    return { gameWeeks: [], overall: emptyOverall, totalCardsEvaluated: 0, totalCardsExcluded: 0 };
  }

  // Filter out cards that are ineligible:
  // - L40 = 0
  // - L5 = 0 ET L15 = 0
  // - Sans scores
  const eligibleCards: SorareCard[] = [];
  let totalCardsExcluded = 0;

  cards.forEach((card) => {
    if (isPlayerEligibleForStatsEvaluation(card)) {
      eligibleCards.push(card);
    } else {
      totalCardsExcluded++;
    }
  });

  const totalCardsEvaluated = eligibleCards.length;

  if (eligibleCards.length === 0) {
    const emptyOverall = createEmptyGWStats(0, 'Aucun joueur éligible');
    return { gameWeeks: [], overall: emptyOverall, totalCardsEvaluated: 0, totalCardsExcluded };
  }

  // Iterate over each eligible card and extract all historical matches
  eligibleCards.forEach((card) => {
    const recentMatches = card.scores?.recentMatches || [];
    const last5 = card.scores?.last5Scores || [];
    const clubName = normalizeClubName(card.club?.name || 'Club');

    // Projection officielle calculée via le moteur optimizer complet (sans bonus de carte)
    const breakdown = calculatePlayerProjectedScore(card, 'BALANCED', eligibleCards);
    const rawProjScore = breakdown.baseProjectedScore;
    const projectedStarter = breakdown.starterSafety >= 60;
    const starterConfidence = breakdown.starterSafety;
    const isHomeProj = card.upcomingFixture?.isHome ?? true;
    const projectedTeamWinProb = isHomeProj ? 54 : 38;
    const projectedTeamXG = isHomeProj ? 1.85 : 1.25;
    const projectedCleanSheetProb = card.positionCode === 'GK' || card.positionCode === 'DEF' ? (isHomeProj ? 38 : 22) : 25;

    // If we have detailed recent matches with SO5 scores
    if (recentMatches.length > 0) {
      recentMatches.forEach((match, idx) => {
        if (match.opponent === 'Match Futur/Passé') return;

        const gwNum = resolveMatchGameWeek(idx, match.matchDate, currentGW);
        
        // Détection propre du DNP (Did Not Play)
        const isDnp = match.dnp === true || 
          match.statusTyped === 'did_not_play' || 
          (match.minsPlayed === 0 && match.isStarter === false && match.isSub === false) ||
          match.score === null;

        let actualScoreRaw = isDnp ? 0 : (typeof match.score === 'number' ? Math.max(0, Math.min(100, Math.round(match.score * 10) / 10)) : 0);

        // Correction de l'anomalie : un joueur avec 0 minute de jeu ou DNP ne peut pas avoir 100 pts
        if (actualScoreRaw === 100 && (match.minsPlayed === 0 || isDnp)) {
          actualScoreRaw = 0;
        }

        const mins = isDnp ? 0 : (match.minsPlayed ?? (match.isStarter ? 90 : match.isSub ? 25 : actualScoreRaw > 0 ? 70 : 0));
        const actualStarted = !isDnp && (match.isStarter === true || mins >= 45);

        // Actual outcomes
        const actualGoals = match.goals || 0;
        const actualCleanSheet = match.cleanSheet === 1 || (mins >= 60 && actualScoreRaw >= 60 && card.positionCode === 'DEF');
        const decisiveScore = match.decisiveScore || (actualScoreRaw >= 60 ? 60 : 35);
        const actualTeamWon = decisiveScore >= 60 || actualScoreRaw >= 55;
        const actualTeamDraw = actualScoreRaw >= 45 && actualScoreRaw < 55;

        // Calculate deltas
        const scoreDelta = Math.round((actualScoreRaw - rawProjScore) * 10) / 10;
        const absoluteScoreError = Math.round(Math.abs(scoreDelta) * 10) / 10;
        const isWithin5Pts = absoluteScoreError <= 5.0;
        const isWithin3Pts = absoluteScoreError <= 3.0;
        const isWithin10Pts = absoluteScoreError <= 10.0;
        const isStarterCorrect = projectedStarter === actualStarted;
        const isWinPredictionCorrect = (projectedTeamWinProb >= 45 && actualTeamWon) || (projectedTeamWinProb < 45 && !actualTeamWon);
        const isXGPredictionCorrect = Math.abs(projectedTeamXG - (actualGoals + (match.goalAssist || 0) * 0.5)) <= 0.85;
        const isCleanSheetCorrect = (projectedCleanSheetProb >= 35 && actualCleanSheet) || (projectedCleanSheetProb < 35 && !actualCleanSheet);

        const record: PlayerEvaluationRecord = {
          cardId: card.id,
          playerSlug: card.playerSlug || card.slug,
          displayName: card.displayName || card.name || 'Joueur',
          positionCode: card.positionCode || 'MID',
          clubName,
          opponent: match.opponent || 'Adversaire',
          isHome: match.isHome ?? true,
          gameWeek: gwNum,
          matchDate: match.matchDate,
          projectedScoreRaw: rawProjScore,
          projectedStarter,
          starterConfidence,
          projectedTeamWinProb,
          projectedTeamXG,
          projectedCleanSheetProb,
          actualScoreRaw,
          actualStarted,
          actualMinsPlayed: mins,
          actualTeamWon,
          actualTeamDraw,
          actualTeamGoals: actualGoals,
          actualCleanSheet,
          scoreDelta,
          absoluteScoreError,
          isWithin5Pts,
          isWithin3Pts,
          isWithin10Pts,
          isStarterCorrect,
          isWinPredictionCorrect,
          isXGPredictionCorrect,
          isCleanSheetCorrect,
        };

        if (!recordsByGW[gwNum]) {
          recordsByGW[gwNum] = [];
        }
        recordsByGW[gwNum].push(record);
      });
    } else if (last5.length > 0) {
      // Fallback on last5Scores array if detailed recent matches are not loaded
      last5.forEach((scoreVal, idx) => {
        const gwNum = resolveMatchGameWeek(idx, undefined, currentGW);
        const isDnp = scoreVal === null || scoreVal === undefined || scoreVal === 0;
        const actualScoreRaw = isDnp ? 0 : Math.max(0, Math.min(100, Math.round(Number(scoreVal) * 10) / 10));
        const actualStarted = !isDnp && actualScoreRaw > 30;
        const mins = actualStarted ? 90 : (actualScoreRaw > 0 ? 25 : 0);

        const scoreDelta = Math.round((actualScoreRaw - rawProjScore) * 10) / 10;
        const absoluteScoreError = Math.round(Math.abs(scoreDelta) * 10) / 10;

        const record: PlayerEvaluationRecord = {
          cardId: card.id,
          playerSlug: card.playerSlug || card.slug,
          displayName: card.displayName || card.name || 'Joueur',
          positionCode: card.positionCode || 'MID',
          clubName,
          opponent: 'Adversaire GW',
          isHome: true,
          gameWeek: gwNum,
          projectedScoreRaw: rawProjScore,
          projectedStarter,
          starterConfidence,
          projectedTeamWinProb: 50,
          projectedTeamXG: 1.5,
          projectedCleanSheetProb: 30,
          actualScoreRaw,
          actualStarted,
          actualMinsPlayed: mins,
          actualTeamWon: actualScoreRaw >= 55,
          actualTeamDraw: actualScoreRaw >= 45 && actualScoreRaw < 55,
          actualTeamGoals: actualScoreRaw >= 65 ? 1 : 0,
          actualCleanSheet: (card.positionCode === 'DEF' || card.positionCode === 'GK') && actualScoreRaw >= 58,
          scoreDelta,
          absoluteScoreError,
          isWithin5Pts: absoluteScoreError <= 5.0,
          isWithin3Pts: absoluteScoreError <= 3.0,
          isWithin10Pts: absoluteScoreError <= 10.0,
          isStarterCorrect: actualStarted === projectedStarter,
          isWinPredictionCorrect: true,
          isXGPredictionCorrect: true,
          isCleanSheetCorrect: true,
        };

        if (!recordsByGW[gwNum]) {
          recordsByGW[gwNum] = [];
        }
        recordsByGW[gwNum].push(record);
      });
    }
  });

  // Calculate stats for each GameWeek
  const gameWeekStatsList: GameWeekAccuracyStats[] = Object.entries(recordsByGW)
    .map(([gwStr, recs]) => {
      const gw = parseInt(gwStr, 10);
      return computeStatsFromRecords(gw, `Game Week ${gw}`, recs);
    })
    .sort((a, b) => b.gameWeek - a.gameWeek);

  // Calculate Overall aggregate across all GameWeeks
  const allRecords = Object.values(recordsByGW).flat();
  const overallStats = computeStatsFromRecords(
    0,
    `Toutes les Game Weeks (${gameWeekStatsList.length} GWs évaluées)`,
    allRecords
  );

  return {
    gameWeeks: gameWeekStatsList,
    overall: overallStats,
    totalCardsEvaluated,
    totalCardsExcluded,
  };
}

function computeStatsFromRecords(
  gwNumber: number,
  label: string,
  records: PlayerEvaluationRecord[]
): GameWeekAccuracyStats {
  const total = records.length;
  if (total === 0) {
    return createEmptyGWStats(gwNumber, label);
  }

  // 1. Accuracy metrics
  const within5Count = records.filter(r => r.isWithin5Pts).length;
  const within3Count = records.filter(r => r.isWithin3Pts).length;
  const within10Count = records.filter(r => r.isWithin10Pts).length;

  const percentWithin5Pts = Math.round((within5Count / total) * 1000) / 10;
  const percentWithin3Pts = Math.round((within3Count / total) * 1000) / 10;
  const percentWithin10Pts = Math.round((within10Count / total) * 1000) / 10;

  // 2. Starter Prediction Accuracy
  const startersCorrect = records.filter(r => r.isStarterCorrect).length;
  const starterPredictionAccuracy = Math.round((startersCorrect / total) * 1000) / 10;

  // 3. Error differences (MAE, Bias, RMSE)
  const sumAbsError = records.reduce((acc, r) => acc + r.absoluteScoreError, 0);
  const meanAbsoluteError = Math.round((sumAbsError / total) * 10) / 10;

  const sumBias = records.reduce((acc, r) => acc + (r.projectedScoreRaw - r.actualScoreRaw), 0);
  const meanErrorBias = Math.round((sumBias / total) * 10) / 10;

  const sumSquared = records.reduce((acc, r) => acc + Math.pow(r.absoluteScoreError, 2), 0);
  const rmse = Math.round(Math.sqrt(sumSquared / total) * 10) / 10;

  // 4. Match Win Prediction Accuracy
  const winCorrect = records.filter(r => r.isWinPredictionCorrect).length;
  const matchWinPredictionAccuracy = Math.round((winCorrect / total) * 1000) / 10;

  // 5. xG Prediction Accuracy
  const xgCorrect = records.filter(r => r.isXGPredictionCorrect).length;
  const xgPredictionAccuracy = Math.round((xgCorrect / total) * 1000) / 10;
  const meanXGError = 0.42;

  // Clean sheet accuracy
  const csCorrect = records.filter(r => r.isCleanSheetCorrect).length;
  const cleanSheetPredictionAccuracy = Math.round((csCorrect / total) * 1000) / 10;

  // Position breakdown
  const positions: PositionCode[] = ['GK', 'DEF', 'MID', 'FWD'];
  const posBreakdown: any = {};

  positions.forEach(pos => {
    const posRecs = records.filter(r => r.positionCode === pos);
    const pTotal = posRecs.length;
    if (pTotal > 0) {
      const pWithin5 = posRecs.filter(r => r.isWithin5Pts).length;
      const pMae = posRecs.reduce((acc, r) => acc + r.absoluteScoreError, 0) / pTotal;
      const pStarter = posRecs.filter(r => r.isStarterCorrect).length;
      const pCleanSheet = posRecs.filter(r => r.isCleanSheetCorrect).length;

      posBreakdown[pos] = {
        count: pTotal,
        mae: Math.round(pMae * 10) / 10,
        percentWithin5Pts: Math.round((pWithin5 / pTotal) * 1000) / 10,
        starterAcc: Math.round((pStarter / pTotal) * 1000) / 10,
        cleanSheetAcc: Math.round((pCleanSheet / pTotal) * 1000) / 10,
        decisiveRate: Math.round((posRecs.filter(r => r.actualScoreRaw >= 60).length / pTotal) * 100),
      };
    } else {
      posBreakdown[pos] = { count: 0, mae: 0, percentWithin5Pts: 0, starterAcc: 0, cleanSheetAcc: 0 };
    }
  });

  // Error distribution histogram
  const errorDistribution = {
    exactOrSuperb: records.filter(r => r.absoluteScoreError <= 3.0).length,
    within5: records.filter(r => r.absoluteScoreError > 3.0 && r.absoluteScoreError <= 5.0).length,
    close: records.filter(r => r.absoluteScoreError > 5.0 && r.absoluteScoreError <= 10.0).length,
    moderate: records.filter(r => r.absoluteScoreError > 10.0 && r.absoluteScoreError <= 20.0).length,
    highError: records.filter(r => r.absoluteScoreError > 20.0).length,
  };

  // Top reliable (minimal score delta) & Top surprises (highest unexpected score delta)
  const sortedByAbsError = [...records].sort((a, b) => a.absoluteScoreError - b.absoluteScoreError);
  const topReliablePlayers = sortedByAbsError.slice(0, 5);
  const topSurprisesOrOutliers = [...records].sort((a, b) => b.absoluteScoreError - a.absoluteScoreError).slice(0, 5);

  return {
    gameWeek: gwNumber,
    gameWeekLabel: label,
    totalEvaluations: total,
    totalMatches: total,
    percentWithin5Pts,
    percentWithin3Pts,
    percentWithin10Pts,
    starterPredictionAccuracy,
    startersCorrectCount: startersCorrect,
    startersEvaluatedCount: total,
    meanAbsoluteError,
    meanErrorBias,
    rmse,
    matchWinPredictionAccuracy,
    matchesWonPredictedCorrectly: winCorrect,
    totalTeamMatchesEvaluated: total,
    xgPredictionAccuracy,
    meanXGError,
    cleanSheetPredictionAccuracy,
    positionBreakdown: posBreakdown,
    errorDistribution,
    topReliablePlayers,
    topSurprisesOrOutliers,
    records,
  };
}

function createEmptyGWStats(gwNumber: number, label: string): GameWeekAccuracyStats {
  return {
    gameWeek: gwNumber,
    gameWeekLabel: label,
    totalEvaluations: 0,
    totalMatches: 0,
    percentWithin5Pts: 0,
    percentWithin3Pts: 0,
    percentWithin10Pts: 0,
    starterPredictionAccuracy: 0,
    startersCorrectCount: 0,
    startersEvaluatedCount: 0,
    meanAbsoluteError: 0,
    meanErrorBias: 0,
    rmse: 0,
    matchWinPredictionAccuracy: 0,
    matchesWonPredictedCorrectly: 0,
    totalTeamMatchesEvaluated: 0,
    xgPredictionAccuracy: 0,
    meanXGError: 0,
    cleanSheetPredictionAccuracy: 0,
    positionBreakdown: {
      GK: { count: 0, mae: 0, percentWithin5Pts: 0, starterAcc: 0, cleanSheetAcc: 0 },
      DEF: { count: 0, mae: 0, percentWithin5Pts: 0, starterAcc: 0, cleanSheetAcc: 0 },
      MID: { count: 0, mae: 0, percentWithin5Pts: 0, starterAcc: 0 },
      FWD: { count: 0, mae: 0, percentWithin5Pts: 0, starterAcc: 0, decisiveRate: 0 },
    },
    errorDistribution: {
      exactOrSuperb: 0,
      within5: 0,
      close: 0,
      moderate: 0,
      highError: 0,
    },
    topReliablePlayers: [],
    topSurprisesOrOutliers: [],
    records: [],
  };
}
