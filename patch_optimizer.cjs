const fs = require('fs');
let code = fs.readFileSync('src/utils/optimizer.ts', 'utf8');

const regexAverage = /const calcAverage = \(scores: number\[\], count: number\) => \{[\s\S]*?return slice\.length > 0 \? slice\.reduce\(\(a, b\) => a \+ b, 0\) \/ slice\.length : 40;\n      \};/;
const newAverage = `const calcAverage = (scores: number[], count: number) => {
        // Only count games where player actually played (score > 0)
        // Wait, the input \`scores\` here is from filteredMatches. We should just filter > 0
        const slice = scores.slice(0, count).filter(s => s != null && s > 0);
        return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
      };`;

code = code.replace(regexAverage, newAverage);

const xgRegex = /if \(xG < 1\.1\) \{/g;
code = code.replace(xgRegex, 'if (xG < 1.1 && fixture?.bookmaker?.homeXG === undefined) {'); // Wait, we added totalMatchXG into bookmaker in server? No, we didn't send it.

fs.writeFileSync('src/utils/optimizer.ts', code);
console.log('Patched optimizer average');
