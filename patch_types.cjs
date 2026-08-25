const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace('slug: string;', 'slug: string;\n  playerSlug?: string;');
fs.writeFileSync('src/types.ts', code);
