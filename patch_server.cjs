const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const importStatement = "import { getMatchPredictions, getMatchOdds } from './src/services/apiFootball';\n";
if (!content.includes(importStatement)) {
  content = content.replace("import dotenv from 'dotenv';", "import dotenv from 'dotenv';\n" + importStatement);
}

const apiFootballEndpoints = `
// =========================================================================
// API FOOTBALL ROUTES (PROXY)
// =========================================================================

app.get('/api/football/predictions', requireAppToken, async (req, res) => {
  const fixtureId = req.query.fixtureId;
  if (!fixtureId) return res.status(400).json({ error: 'fixtureId requis' });
  
  try {
    const predictions = await getMatchPredictions(fixtureId.toString());
    if (predictions) {
      return res.json({ success: true, predictions });
    }
    return res.status(404).json({ success: false, error: 'Données non trouvées (clé API manquante ?)' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
`;

if (!content.includes('/api/football/predictions')) {
  content = content.replace("// =========================================================================", apiFootballEndpoints + "\n// =========================================================================");
  fs.writeFileSync('server.ts', content);
  console.log("Successfully added API Football proxy routes to server.ts");
} else {
  console.log("API Football proxy routes already exist");
}
