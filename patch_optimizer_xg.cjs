const fs = require('fs');
let code = fs.readFileSync('src/utils/optimizer.ts', 'utf8');

const regex = /const xG = fixture\.bookmaker\.goalExpectancy;[\s\S]*?\} else if \(xG > 2\.2\) \{/m;
const newCode = `const teamXG = fixture.bookmaker.goalExpectancy;
    const oppXG = fixture.bookmaker.opponentGoalExpectancy || 1.0;
    const totalMatchXG = teamXG + oppXG;
    if (totalMatchXG < 2.3) {
      // Match fermé (total < 2.3 xG)
      if (card.positionCode === 'GK' || card.positionCode === 'DEF') gameStateBonus += 2;
      if (card.positionCode === 'FWD') gameStateBonus -= 2;
    } else if (totalMatchXG > 3.2) {`;

code = code.replace(regex, newCode);
fs.writeFileSync('src/utils/optimizer.ts', code);
console.log('Patched optimizer xG');
