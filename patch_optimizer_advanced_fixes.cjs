const fs = require('fs');
let code = fs.readFileSync('src/utils/optimizer.ts', 'utf8');

// 1. Remove "Nouvelle Modélisation Avancée (Pro Level)" random hashes and arbitrary coach logic
const proLevelRegex = /\/\/\s*---\s*NOUVELLE MODÉLISATION AVANCÉE \(PRO LEVEL\)\s*---[\s\S]*?(?=\s*\/\/ 5\. Recombinaison Globale \(Sorare Math Model\))/;
code = code.replace(proLevelRegex, '');

// 2. Remove AAS / DS focus math inflation
// Look for "6. Orientation Stratégique AAS vs DS vs Équilibré"
const focusRegex = /\/\/\s*6\.\s*Orientation Stratégique AAS vs DS vs Équilibré[\s\S]*?(?=\s*if\s*\(strategy\s*===\s*'HIGH_CEILING'\s*&&\s*card\.positionCode\s*===\s*'FWD'\))/;
code = code.replace(focusRegex, '// 6. Orientation Stratégique (Le focus AAS/DS doit uniquement impacter le tri, pas gonfler le score brut artificiellement)\n  ');

fs.writeFileSync('src/utils/optimizer.ts', code);
console.log('Patched advanced algorithm flaws in optimizer.ts');
