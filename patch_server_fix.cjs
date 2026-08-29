const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const importStatement = "import { getMatchPredictions, getMatchOdds } from './src/services/apiFootball';\n";
if (!content.includes("src/services/apiFootball")) {
  content = content.replace("import dotenv from 'dotenv';", "import dotenv from 'dotenv';\n" + importStatement);
}

fs.writeFileSync('server.ts', content);
