const fs = require('fs');
let content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');
const search = "matchupImpactLabel += ' • Fin de saison (Baisse d'intensité)';";
const replacement = "matchupImpactLabel += \" • Fin de saison (Baisse d'intensité)\";";
content = content.replace(search, replacement);
fs.writeFileSync('src/utils/optimizer.ts', content);
