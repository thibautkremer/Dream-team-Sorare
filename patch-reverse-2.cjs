const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/realMatchOddsStore\.set\(m\.matchKey, entry\);\n\s*results\.push\(entry\);/g, 
"realMatchOddsStore.set(m.matchKey, entry);\n        realMatchOddsStore.set(makeMatchKey(m.awayTeam, m.homeTeam), entry);\n        results.push(entry);");

fs.writeFileSync('server.ts', code);
console.log('Patched reverse keys properly in server.ts');
