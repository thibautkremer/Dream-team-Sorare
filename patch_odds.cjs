const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');

const targetBlock = `          if (clubCatalog) {
            diffRating = clubCatalog.difficultyRating;
            bookmakerData.win = clubCatalog.winOdds;
            bookmakerData.draw = clubCatalog.drawOdds;
            bookmakerData.loss = clubCatalog.lossOdds;
            bookmakerData.cleanSheetProb = posCode === 'GK' || posCode === 'DEF' ? clubCatalog.cleanSheetProb : Math.min(45, clubCatalog.cleanSheetProb);
            bookmakerData.goalExpectancy = posCode === 'FWD' || posCode === 'MID' ? clubCatalog.goalExpectancy : Math.min(1.5, clubCatalog.goalExpectancy);
          } else {`;

const newBlock = `          // L'objectif est d'avoir des cotes en miroir parfait pour les deux équipes du même match
          const homeTeamName = isHome ? normClub : normOpponent;
          const awayTeamName = isHome ? normOpponent : normClub;
          
          let sourceCatalog = FIXTURES_CATALOG[homeTeamName];
          let inverted = false;
          
          if (!sourceCatalog) {
            sourceCatalog = FIXTURES_CATALOG[awayTeamName];
            inverted = true;
          }
          
          if (sourceCatalog) {
            // Si on utilise le catalogue de l'équipe adverse, on doit inverser les stats
            const shouldInvert = (isHome && inverted) || (!isHome && !inverted);
            
            if (shouldInvert) {
               diffRating = 6 - sourceCatalog.difficultyRating;
               bookmakerData.win = sourceCatalog.lossOdds;
               bookmakerData.draw = sourceCatalog.drawOdds;
               bookmakerData.loss = sourceCatalog.winOdds;
               // On fait une approximation pour le clean sheet et l'expectancy adverses
               bookmakerData.cleanSheetProb = posCode === 'GK' || posCode === 'DEF' ? Math.max(5, 60 - sourceCatalog.cleanSheetProb) : 30;
               bookmakerData.goalExpectancy = posCode === 'FWD' || posCode === 'MID' ? Math.max(0.5, 3.0 - sourceCatalog.goalExpectancy) : 1.2;
            } else {
               diffRating = sourceCatalog.difficultyRating;
               bookmakerData.win = sourceCatalog.winOdds;
               bookmakerData.draw = sourceCatalog.drawOdds;
               bookmakerData.loss = sourceCatalog.lossOdds;
               bookmakerData.cleanSheetProb = posCode === 'GK' || posCode === 'DEF' ? sourceCatalog.cleanSheetProb : Math.min(45, sourceCatalog.cleanSheetProb);
               bookmakerData.goalExpectancy = posCode === 'FWD' || posCode === 'MID' ? sourceCatalog.goalExpectancy : Math.min(1.5, sourceCatalog.goalExpectancy);
            }
          } else {`;

if (content.includes(targetBlock)) {
  fs.writeFileSync('server.ts', content.replace(targetBlock, newBlock));
  console.log('Patched server.ts successfully');
} else {
  console.log('Target block not found');
}
