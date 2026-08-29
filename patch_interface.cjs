const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

// I need to find the emptyBreakdown object and add advancedStatsBonus: 0
const match = content.match(/const emptyBreakdown: ScoreBreakdown = \{[\s\S]*?bonusBreakdown: \{[\s\S]*?\}\n  \};/);
if (match) {
   let emptyObj = match[0];
   if (!emptyObj.includes('advancedStatsBonus: 0,')) {
      emptyObj = emptyObj.replace(/bonusBreakdown: \{/, 'advancedStatsBonus: 0,\n    bonusBreakdown: {');
      content = content.replace(match[0], emptyObj);
      fs.writeFileSync('src/utils/optimizer.ts', content);
      console.log('Fixed emptyBreakdown missing property');
   }
} else {
   console.log('Could not match emptyBreakdown');
}
