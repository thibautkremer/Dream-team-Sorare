const fs = require('fs');
let file = fs.readFileSync('src/components/PitchView.tsx', 'utf8');

// Replace the handleSetCaptain to use baseProjectedScore for captainBonus
file = file.replace(/const captainScore = getProj\(playerObj\);\n\s*const captainBonus = Math.round\(\(captainScore \* 0\.20\) \* 10\) \/ 10;/g, 
`const getBaseProj = (c: SorareCard | null) => c ? calculatePlayerProjectedScore(c, targetLineup.strategy).baseProjectedScore : 0;
    const captainBaseScore = getBaseProj(playerObj);
    const captainBonus = Math.round((captainBaseScore * 0.20) * 10) / 10;`);

// Replace the card level total calculation
file = file.replace(/const bonusIfCaptain = isCaptain \? Math\.round\(\(projected \* 0\.20\) \* 10\) \/ 10 :\s*0;\n\s*const totalBonusPct = [^;]+;\n\s*const totalBonusScore = [^;]+;/g,
`const bonusIfCaptain = isCaptain ? Math.round((cardBreakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
    const totalBonusPct = Math.round((cardBreakdown.cardBonusPercentage + (isCaptain ? 20 : 0)) * 10) / 10;
    const totalBonusScore = Math.round((cardBreakdown.cardBonusScore + bonusIfCaptain) * 10) / 10;`);

// ensure we also replace projected + bonusIfCaptain to baseProjectedScore + totalBonusScore
file = file.replace(/\{isCaptain \? Math\.round\(\(projected \+ bonusIfCaptain\) \* 10\) \/ 10 : projected\}/g,
`{Math.round((cardBreakdown.baseProjectedScore + totalBonusScore) * 10) / 10}`);

fs.writeFileSync('src/components/PitchView.tsx', file);
