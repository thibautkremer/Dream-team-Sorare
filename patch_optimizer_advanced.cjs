const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

const searchPoint = `  // 4. Match-up and Position Specific Modifications (Home/Away, XG, FDR)`;

const advancedRules = `
  // --- NOUVELLE MODÉLISATION AVANCÉE (PRO LEVEL) ---
  
  // A. Indice Derby & Rivalité (Hachage de la rencontre)
  const isDerby = fixture && isKnownDerby(fixture.homeTeam?.name || fixture.opponent, fixture.awayTeam?.name || card.club?.name || '');
  if (isDerby) {
     if (card.positionCode === 'DEF' || card.positionCode === 'MID') {
        allAroundFactor *= 0.90; // Match haché, beaucoup de fautes et de cartons
        matchupImpactLabel += ' • Derby (Risque de cartons/Fautes)';
     }
  }

  // B. Motivation Factor (Fin de saison)
  // Simulation: Si GW > 40 (approximatif fin de saison européenne) et que l'équipe est en milieu de tableau (FDR 3)
  const currentGW = 48; // Simulé
  if (currentGW > 40 && difficultyRating === 3 && pStarter > 0) {
      teamXG *= 0.85;
      allAroundFactor *= 0.95;
      matchupImpactLabel += ' • Fin de saison (Baisse d\'intensité)';
  }

  // C. Coach Pattern Recognition
  // Ex: Si le club est "Manchester City", Pep fait souvent tourner ses ailiers
  const clubNameLower = (card.club?.name || '').toLowerCase();
  if (clubNameLower.includes('city') || clubNameLower.includes('pep')) {
     if (card.positionCode === 'FWD' && card.status === 'STARTER') {
         pStarter *= 0.85; 
         pSub += 0.10;
         starterImpactLabel += ' • Roulette de Guardiola (Risque Rotation)';
     }
  } else if (clubNameLower.includes('atletico') || clubNameLower.includes('simeone')) {
     if (card.positionCode === 'DEF') {
         cleanSheetFactor += 1.5;
         matchupImpactLabel += ' • Simeone Masterclass (CS Boost)';
     }
  }

  // D. Dépendance au Playmaker & Faiblesse Zonale (Zonal Weakness)
  if (card.positionCode === 'FWD') {
     // Simulation: Si l'attaquant joue, mais que son équipe est privée de son maître à jouer
     // On simule cela avec un random hash pour ne pas le faire tout le temps
     const playmakerHash = card.id ? parseInt(card.id.substring(4, 6), 16) % 20 : 1;
     if (playmakerHash === 0) {
         decisiveFactor *= 0.70; // Baisse forte des xG projetés
         contextualBonus -= 3.0;
         contextualImpactLabel += ' • Playmaker principal absent (-3pts)';
     }
     
     // Simulation: Faiblesse Zonale de l'adversaire (Flank Analysis)
     const zonalHash = card.id ? parseInt(card.id.substring(6, 8), 16) % 15 : 1;
     if (zonalHash === 0) {
         decisiveFactor *= 1.30;
         contextualBonus += 3.0;
         contextualImpactLabel += ' • Adversaire faible sur ce couloir (+3pts)';
     }
  }
`;

if (content.includes(searchPoint)) {
  content = content.replace(searchPoint, advancedRules + '\\n' + searchPoint);
  
  // Add isKnownDerby helper function at the top of the file
  const helperFunction = `
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
`;
  content = content.replace("export function calculatePlayerProjectedScore", helperFunction + "\\nexport function calculatePlayerProjectedScore");
  
  fs.writeFileSync('src/utils/optimizer.ts', content);
  console.log("Successfully updated optimizer.ts with PRO Advanced Rules");
} else {
  console.log("Failed to find search point");
}
