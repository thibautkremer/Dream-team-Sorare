import { MOCK_GALLERY } from './src/data/mockGallery';
import { isPlayerEligibleForStatsEvaluation } from './src/utils/accuracyEvaluator';
import { calculatePlayerProjectedScore, getPlayerRecentMatchAnalysis, isNationalTeamMatch } from './src/utils/optimizer';
import { SorareCard } from './src/types';

// LEGACY ALGORITHM (Before Expected Value & Position Matrix Updates)
function calculateLegacyProjectedScore(card: SorareCard): number {
  const upcomingIsNational = card.upcomingFixture ? isNationalTeamMatch(card.upcomingFixture) : false;
  
  const calcCleanAverage = (scores: number[] | undefined, count: number, fallback = 40) => {
    if (!scores || scores.length === 0) return fallback;
    const played = scores.filter(s => s != null && s > 0).slice(0, count);
    if (played.length === 0) return fallback;
    return played.reduce((a, b) => a + b, 0) / played.length;
  };

  let l5 = card.scores?.l5 || calcCleanAverage(card.scores?.last5Scores, 5, 40);
  let l15 = card.scores?.l15 || calcCleanAverage(card.scores?.last15Scores, 15, l5);
  let l40 = card.scores?.l40 || calcCleanAverage(card.scores?.last40Scores, 40, l15);

  let recentStats = getPlayerRecentMatchAnalysis(card);
  let playerStatus = card.status || 'SUBSTITUTE';

  let l5Adjusted = l5;
  if (l40 > 0 && l5 > l40 + 10) {
    const excess = l5 - (l40 + 10);
    const formCredibility = recentStats.playedCountL5 >= 4 ? 0.65 : 0.35;
    l5Adjusted = l40 + 10 + (excess * formCredibility);
  } else if (l40 > 0 && (playerStatus === 'STARTER' || playerStatus === 'REGULAR') && card.injuryStatus === 'FIT' && l5 < l40 - 15) {
    const deficit = (l40 - 15) - l5;
    const bounceBackCredibility = recentStats.playedCountL5 >= 4 ? 0.45 : 0.25;
    l5Adjusted = l5 + (deficit * bounceBackCredibility);
  }

  // Old weights
  let strategyWeights = { l5: 0.50, l15: 0.35, l40: 0.15 };
  let baseForm = (l5Adjusted * strategyWeights.l5) + (l15 * strategyWeights.l15) + (l40 * strategyWeights.l40);

  // Old Starter Factor
  let starterFactor = 1.0;
  if (playerStatus === 'STARTER') starterFactor = 1.0;
  else if (playerStatus === 'REGULAR') starterFactor = 0.90;
  else if (playerStatus === 'SUPER_SUBSTITUTE') starterFactor = 0.50; 
  else if (playerStatus === 'SUBSTITUTE') starterFactor = 0.20;       
  
  if (card.injuryStatus === 'DOUBTFUL') starterFactor *= 0.60;
  else if (card.injuryStatus === 'QUESTIONABLE') starterFactor *= 0.80;
  
  starterFactor *= recentStats.recentPlayingFactor;

  const fixture = card.upcomingFixture;
  let matchupFactor = 1.0;
  let cleanSheetFactor = 0;
  let difficultyRating = fixture?.difficultyRating || 3;

  if (fixture) {
    switch (difficultyRating) {
      case 1: matchupFactor = 1.12; break;
      case 2: matchupFactor = 1.05; break;
      case 3: matchupFactor = 1.00; break;
      case 4: matchupFactor = 0.92; break;
      case 5: matchupFactor = 0.85; break;
    }
  }

  // Old basic Clean Sheet
  if (card.positionCode === 'GK') cleanSheetFactor = (3 - difficultyRating) * 2;
  else if (card.positionCode === 'DEF') cleanSheetFactor = (3 - difficultyRating) * 1.5;

  let projected = (baseForm * starterFactor * matchupFactor) + cleanSheetFactor;
  return Math.max(0, Math.min(100, projected));
}


async function compare() {
  const cards = MOCK_GALLERY;
  const eligibleCards = cards.filter(isPlayerEligibleForStatsEvaluation);

  let legacyTotalError = 0;
  let newTotalError = 0;
  let evaluatedCount = 0;
  
  for (const card of eligibleCards) {
    // 1. Get Old Projection
    const oldProj = calculateLegacyProjectedScore(card);
    
    // 2. Get New Projection
    const newBreakdown = calculatePlayerProjectedScore(card, 'BALANCED');
    const newProj = newBreakdown.baseProjectedScore;

    // Simulate an "Actual Score" based on recent real match data if available
    const recentScores = card.scores?.recentMatches?.filter(m => m.score != null && m.score > 0).map(m => m.score) || [];
    const trueActual = recentScores.length > 0 ? recentScores[0] : (card.scores?.l15 || 40);

    legacyTotalError += Math.abs(trueActual - oldProj);
    newTotalError += Math.abs(trueActual - newProj);
    evaluatedCount++;
  }

  console.log(`Analyzing ${evaluatedCount} eligible players out of ${cards.length} for GW 48 mock comparison...`);
  console.log('--- STATISTIQUES COMPARATIVES (Projection VS Réalité) ---');
  console.log(`MAE (Marge d'Erreur Moyenne) ANCIEN Modèle : ${(legacyTotalError / evaluatedCount).toFixed(2)} pts`);
  console.log(`MAE (Marge d'Erreur Moyenne) NOUVEAU Modèle : ${(newTotalError / evaluatedCount).toFixed(2)} pts`);
  
  const diff = ((legacyTotalError - newTotalError) / legacyTotalError) * 100;
  console.log(`Amélioration de la précision : +${diff.toFixed(2)}%`);
}

compare();
