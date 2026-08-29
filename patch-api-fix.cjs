const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "sourceType: 'odds_api',\n          source: `API-Football (${bookmakerName})`",
  "sourceType: homeWinOdd === resolvedFbk.bookmakerData.win ? 'estimated_mirror' : 'odds_api',\n          source: homeWinOdd === resolvedFbk.bookmakerData.win ? 'Estimation interne (aucune cote trouvée sur API-Football)' : `API-Football (${bookmakerName})`"
);

fs.writeFileSync('server.ts', code);
console.log('Patched fallback source label');
