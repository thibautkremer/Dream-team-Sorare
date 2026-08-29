const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const apiFootballEndpoints = `
app.get('/api/football/team', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name requis' });
  try {
    const { searchTeam } = require('./src/services/apiFootball');
    const team = await searchTeam(name.toString());
    return res.json({ success: true, team });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/football/fixture/upcoming', async (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId requis' });
  try {
    const { searchUpcomingFixture } = require('./src/services/apiFootball');
    const fixture = await searchUpcomingFixture(teamId.toString());
    return res.json({ success: true, fixture });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/football/injuries', async (req, res) => {
  const { fixtureId, teamId } = req.query;
  if (!fixtureId || !teamId) return res.status(400).json({ error: 'fixtureId et teamId requis' });
  try {
    const { getInjuries } = require('./src/services/apiFootball');
    const injuries = await getInjuries(fixtureId.toString(), teamId.toString());
    return res.json({ success: true, injuries });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
`;

if (!content.includes('/api/football/team')) {
  // Find where to append. We can append after `/api/football/predictions`
  content = content.replace("app.get('/api/football/predictions', async (req, res) => {", apiFootballEndpoints + "\napp.get('/api/football/predictions', async (req, res) => {");
  fs.writeFileSync('server.ts', content);
  console.log("Successfully added API Football proxy routes to server.ts");
}
