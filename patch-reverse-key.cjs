const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target1 = "realMatchOddsStore.set(m.matchKey, entry);\\n        results.push(entry);";
const repl1 = "realMatchOddsStore.set(m.matchKey, entry);\\n        realMatchOddsStore.set(makeMatchKey(m.awayTeam, m.homeTeam), entry);\\n        results.push(entry);";
code = code.replace(new RegExp(target1, 'g'), repl1);

fs.writeFileSync('server.ts', code);
console.log('Patched reverse keys in server.ts');
