const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 1 * 60 * 1000) {",
  "if (existing && existing.sourceType !== 'estimated_mirror' && Date.now() - new Date(existing.updatedAt).getTime() < 1 * 60 * 1000) {"
);

fs.writeFileSync('server.ts', code);
console.log('Patched cache bypass for estimated_mirror');
