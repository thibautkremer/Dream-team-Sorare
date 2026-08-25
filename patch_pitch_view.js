const fs = require('fs');
let file = fs.readFileSync('src/components/PitchView.tsx', 'utf8');

file = file.replace(/const bonusIfCaptain = isCaptain \? Math.round\(\(projected \* 0.20\) \* 10\) \/ 10 : 0;/,
`const bonusIfCaptain = isCaptain ? Math.round((projected * 0.20) * 10) / 10 : 0;
    const totalBonusPct = Math.round((cardBreakdown.cardBonusPercentage + (isCaptain ? 20 : 0)) * 10) / 10;
    const totalBonusScore = Math.round((cardBreakdown.cardBonusScore + bonusIfCaptain) * 10) / 10;`);

file = file.replace(/<span>Bonus \(\+\{cardBreakdown\.cardBonusPercentage\}%\):<\/span>\s*<span className="font-bold text-amber-300">\+\{cardBreakdown\.cardBonusScore\} pts<\/span>/g,
`<span>Bonus (+{totalBonusPct}%):</span>
                <span className="font-bold text-amber-300">+{totalBonusScore} pts</span>`);

fs.writeFileSync('src/components/PitchView.tsx', file);
