const fs = require('fs');
let code = fs.readFileSync('src/components/MatchupCenter.tsx', 'utf8');

code = code.replace(
  "const canonical = syncData.find(m =>",
  "const canonical = syncData.find(m => (m.homeTeam.toLowerCase() === card.club?.name?.toLowerCase() || m.awayTeam.toLowerCase() === card.club?.name?.toLowerCase()) ||"
);

fs.writeFileSync('src/components/MatchupCenter.tsx', code);
console.log('Patched UI matching');
