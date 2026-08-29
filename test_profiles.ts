import { calculatePlayerProjectedScore } from './src/utils/optimizer';
import { SorareCard } from './src/types';

// LEGACY ALGORITHM REPLICA
function calculateLegacyProjectedScore(card: SorareCard): number {
  let l5 = card.scores?.l5 || 40;
  let l15 = card.scores?.l15 || l5;
  let l40 = card.scores?.l40 || l15;

  let baseForm = (l5 * 0.50) + (l15 * 0.35) + (l40 * 0.15);

  let starterFactor = 1.0;
  if (card.status === 'STARTER') starterFactor = 1.0;
  else if (card.status === 'REGULAR') starterFactor = 0.90;
  else if (card.status === 'SUPER_SUBSTITUTE') starterFactor = 0.50; 
  else if (card.status === 'SUBSTITUTE') starterFactor = 0.20;       
  
  if (card.injuryStatus === 'DOUBTFUL') starterFactor *= 0.60;
  
  let matchupFactor = 1.0;
  let cleanSheetFactor = 0;
  let diff = card.upcomingFixture?.difficultyRating || 3;

  switch (diff) {
    case 1: matchupFactor = 1.12; break;
    case 2: matchupFactor = 1.05; break;
    case 3: matchupFactor = 1.00; break;
    case 4: matchupFactor = 0.92; break;
    case 5: matchupFactor = 0.85; break;
  }

  if (card.positionCode === 'GK') cleanSheetFactor = (3 - diff) * 2;
  else if (card.positionCode === 'DEF') cleanSheetFactor = (3 - diff) * 1.5;

  return Math.max(0, Math.min(100, (baseForm * starterFactor * matchupFactor) + cleanSheetFactor));
}

const profiles: any[] = [
  {
    name: "Milieu Titulaire (FDR 1, Domicile)",
    card: {
      positionCode: 'MID', status: 'STARTER', starterConfidence: 100, injuryStatus: 'FIT',
      scores: { l5: 55, l15: 52, l40: 50, allAroundContributionPct: 65, decisiveContributionPct: 35, last5Scores: [55,55,55,55,55], recentMatches: [{score: 55, minsPlayed: 90, isStarter: true}] },
      upcomingFixture: { difficultyRating: 1, isHome: true, bookmaker: { goalExpectancy: 2.5, opponentGoalExpectancy: 0.8, anytimeScorerOdds: 6.0 } }
    },
    actualExpected: 62 // Dominant home win, good AA
  },
  {
    name: "Attaquant Super Sub (FDR 3, Extérieur)",
    card: {
      positionCode: 'FWD', status: 'SUPER_SUBSTITUTE', starterConfidence: 20, injuryStatus: 'FIT',
      scores: { l5: 45, l15: 48, l40: 45, allAroundContributionPct: 30, decisiveContributionPct: 70, last5Scores: [45,45,45,45,45], recentMatches: [{score: 45, minsPlayed: 25, isStarter: false, isSub: true}] },
      upcomingFixture: { difficultyRating: 3, isHome: false, bookmaker: { goalExpectancy: 1.2, opponentGoalExpectancy: 1.5, anytimeScorerOdds: 3.5 } }
    },
    actualExpected: 31 // Sub performance, might score but usually ~25-30
  },
  {
    name: "Gardien Difficile (FDR 5, Extérieur)",
    card: {
      positionCode: 'GK', status: 'STARTER', starterConfidence: 100, injuryStatus: 'FIT',
      scores: { l5: 40, l15: 42, l40: 45, allAroundContributionPct: 15, decisiveContributionPct: 85, last5Scores: [40,40,40,40,40], recentMatches: [{score: 40, minsPlayed: 90, isStarter: true}] },
      upcomingFixture: { difficultyRating: 5, isHome: false, bookmaker: { goalExpectancy: 0.5, opponentGoalExpectancy: 2.2 } }
    },
    actualExpected: 35 // High probability of conceding, negative CS, some saves
  },
  {
    name: "Défenseur (FDR 2, Domicile, Tireur Corners)",
    card: {
      positionCode: 'DEF', status: 'REGULAR', starterConfidence: 80, injuryStatus: 'FIT',
      scores: { l5: 48, l15: 45, l40: 44, allAroundContributionPct: 70, decisiveContributionPct: 30, last5Scores: [48,48,48,48,48], recentMatches: [{score: 48, minsPlayed: 90, isStarter: true}] },
      upcomingFixture: { difficultyRating: 2, isHome: true, bookmaker: { goalExpectancy: 1.8, opponentGoalExpectancy: 0.9 } },
      playerDetail: { cornerTaker: true }
    },
    actualExpected: 54 // Good CS chance, corners boost AA
  }
];

let legacyErr = 0;
let newErr = 0;

console.log("--- SIMULATION DE PROFILS (GW 48) ---");
for (const p of profiles) {
  const oldProj = calculateLegacyProjectedScore(p.card);
  const newBreakdown = calculatePlayerProjectedScore(p.card, 'BALANCED');
  const newProj = newBreakdown.baseProjectedScore;
  
  console.log(`\nProfil : ${p.name}`);
  console.log(`Score Réel (Référence attendue) : ~${p.actualExpected}`);
  console.log(`> Ancien Modèle : ${oldProj.toFixed(1)} pts (Erreur: ${Math.abs(p.actualExpected - oldProj).toFixed(1)})`);
  console.log(`> Nouveau Modèle (EV) : ${newProj.toFixed(1)} pts (Erreur: ${Math.abs(p.actualExpected - newProj).toFixed(1)})`);
  
  legacyErr += Math.abs(p.actualExpected - oldProj);
  newErr += Math.abs(p.actualExpected - newProj);
}

console.log(`\n--- SYNTHÈSE GLOBALE ---`);
console.log(`MAE (Ancien Modèle) : ${(legacyErr / profiles.length).toFixed(2)} pts`);
console.log(`MAE (Nouveau Modèle) : ${(newErr / profiles.length).toFixed(2)} pts`);
const diff = ((legacyErr - newErr) / legacyErr) * 100;
console.log(`Amélioration de la marge d'erreur : +${diff.toFixed(2)}%`);

