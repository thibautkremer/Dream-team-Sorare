const fs = require('fs');
let code = fs.readFileSync('src/data/fixturesData.ts', 'utf8');

code = code.replace(
  "bookmaker: {",
  "bookmaker: {\n      homeTeamName: def.isHome ? norm : def.opponent,\n      awayTeamName: def.isHome ? def.opponent : norm,\n      sourceType: 'estimated_mirror',\n      source: 'Estimation interne (aucune source bookmaker réelle)',"
);

fs.writeFileSync('src/data/fixturesData.ts', code);
console.log('Patched fixturesData');
