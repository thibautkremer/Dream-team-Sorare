const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

// I inserted the PRO rules *before* the declarations of fixture, matchupFactor, etc.
// I need to extract the PRO rules and put them AFTER line 1445.
const proRulesStart = "  // --- NOUVELLE MODÉLISATION AVANCÉE (PRO LEVEL) ---";
const proRulesEnd = "  // 4. Match-up and Position Specific Modifications (Home/Away, XG, FDR)";

const startIndex = content.indexOf(proRulesStart);
const endIndex = content.indexOf(proRulesEnd);

if (startIndex !== -1 && endIndex !== -1) {
  const extractedRules = content.substring(startIndex, endIndex);
  
  // Remove the block from its current incorrect position
  let newContent = content.substring(0, startIndex) + content.substring(endIndex);
  
  // Find where to insert it safely (after all setup in section 4)
  const safeInsertPoint = "  const winProb = fixture ? getPlayerWinProbability(fixture) : 50;";
  
  if (newContent.includes(safeInsertPoint)) {
     // I also need to change fixture.homeTeam to something that exists.
     // Let's use card.club?.name and fixture.opponent
     let fixedRules = extractedRules.replace("fixture.homeTeam?.name || fixture.opponent", "fixture?.isHome ? card.club?.name || '' : fixture?.opponent || ''")
                                    .replace("fixture.awayTeam?.name || card.club?.name || ''", "!fixture?.isHome ? card.club?.name || '' : fixture?.opponent || ''");
                                    
     // I also need to declare contextualBonus early if it's used here, or move this block further down.
     // Moving it after contextualBonus declaration is best.
     const contextualDecl = "let contextualBonus = 0;\n  let contextualImpactLabel = '';";
     const idxContextual = newContent.indexOf(contextualDecl);
     
     if (idxContextual !== -1) {
        newContent = newContent.substring(0, idxContextual + contextualDecl.length) + "\\n" + fixedRules + newContent.substring(idxContextual + contextualDecl.length);
        fs.writeFileSync('src/utils/optimizer.ts', newContent.replace(/\\n/g, '\n'));
        console.log("Successfully moved PRO rules to the correct scope.");
     } else {
        console.log("Failed to find contextualBonus declaration");
     }
  } else {
     console.log("Failed to find safe insert point");
  }
} else {
  console.log("Could not find PRO rules boundaries");
}
