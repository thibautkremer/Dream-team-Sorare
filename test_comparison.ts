import { calculatePlayerProjectedScore } from './src/utils/optimizer';

// Simulation cards before vs after GW 48
const testCards = [
  {
    id: "fwd_123456",
    displayName: "Phil Foden",
    positionCode: "FWD",
    status: "STARTER",
    starterConfidence: 85,
    club: { name: "Manchester City", code: "MCI" },
    scores: { l5: 68, l15: 55, l40: 52, aasPercentage: 30, decisivePercentage: 70, xG: 0.6, xA: 0.3 },
    upcomingFixture: { opponent: "Arsenal", isHome: true, difficultyRating: 4, weather: { description: "Nuageux", wind: 10 } }
  },
  {
    id: "def_abcdef",
    displayName: "Jose Gimenez",
    positionCode: "DEF",
    status: "STARTER",
    starterConfidence: 100,
    club: { name: "Atletico Madrid", code: "ATM" },
    scores: { l5: 55, l15: 52, l40: 50, aasPercentage: 80, decisivePercentage: 20 },
    upcomingFixture: { opponent: "Real Madrid", isHome: true, difficultyRating: 5, weather: { description: "Clair", wind: 5 } }
  }
];

console.log("=== COMPARAISON DES PROJECTIONS : AVANT VS APRÈS ===\n");
testCards.forEach(card => {
  const proj = calculatePlayerProjectedScore(card as any);
  console.log(`${card.displayName} (${card.positionCode} - ${card.club.name})`);
  console.log(`- Score Projeté Total : ${proj.projectedScore} pts (Plancher: ${proj.projectedFloor}, Plafond: ${proj.projectedCeiling})`);
  console.log(`- Bonus Modèles Avancés : +${proj.advancedStatsBonus} pts`);
  console.log(`- Contexte tactique : +${proj.contextualBonus} pts (${proj.contextualImpactLabel || 'Aucun'})`);
  console.log(`- Matchup Label : ${proj.matchupImpactLabel}`);
  console.log(`- Statut/Sécurité : ${proj.starterSafety}% (${proj.starterImpactLabel})`);
  console.log("--------------------------------------------------");
});

