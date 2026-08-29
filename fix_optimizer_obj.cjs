const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');
content = content.replace(/regressionPenalty: 0,\n    filterLabel,/g, 'advancedStatsBonus: 0,\n    regressionPenalty: 0,\n    filterLabel,');
fs.writeFileSync('src/utils/optimizer.ts', content);
