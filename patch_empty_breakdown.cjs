const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

const searchStr = "    advancedStatsBonus: 0,\n    regressionPenalty: 0,\n    filterLabel: 'Pas assez de données pour projeter',";
// Let's just do a regex replace
content = content.replace(/filterLabel: 'Pas assez de données pour projeter',/g, "filterLabel: 'Pas assez de données pour projeter',\n    advancedStatsBonus: 0,");
content = content.replace(/    bonusBreakdown: \{\n      matchupFactor: 0,\n      contextualBonus: 0,\n      setPieceBonus: 0,\n      weatherBonus: 0,\n      bookmakerActionBonus: 0,\n      advancedStatsBonus: 0\n    \}/g, "    bonusBreakdown: {\n      matchupFactor: 0,\n      contextualBonus: 0,\n      setPieceBonus: 0,\n      weatherBonus: 0,\n      bookmakerActionBonus: 0,\n      advancedStatsBonus: 0\n    },\n    advancedStatsBonus: 0");

fs.writeFileSync('src/utils/optimizer.ts', content);
