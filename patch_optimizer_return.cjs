const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

// I need to add advancedStatsBonus: 0 to the return object in calculatePlayerProjectedScore
// Search for the return object
const searchStr = "    bonusBreakdown\n  };\n}";
if (content.includes(searchStr)) {
  content = content.replace(searchStr, "    bonusBreakdown,\n    advancedStatsBonus: contextualBonus\n  };\n}");
  fs.writeFileSync('src/utils/optimizer.ts', content);
  console.log("Fixed return object in optimizer.ts");
} else {
  // Let's look for a generic return
  console.log("Could not find the exact return structure. Try to find 'return {' inside calculatePlayerProjectedScore");
}
