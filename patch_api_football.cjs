const fs = require('fs');
let content = fs.readFileSync('src/services/apiFootball.ts', 'utf-8');

const newFunctions = `
/**
 * Recherche une équipe par nom pour obtenir son ID API-Football
 */
export async function searchTeam(teamName: string) {
  const res = await fetchApiFootball('/teams', { search: teamName });
  if (res && res.response && res.response.length > 0) {
    return res.response[0].team;
  }
  return null;
}

/**
 * Recherche le fixtureId d'un match à venir entre deux équipes
 */
export async function searchUpcomingFixture(teamId: string, next: string = '1') {
  const res = await fetchApiFootball('/fixtures', { team: teamId, next });
  if (res && res.response && res.response.length > 0) {
    return res.response[0];
  }
  return null;
}

/**
 * Récupère les blessés et suspendus d'une équipe pour un match
 */
export async function getInjuries(fixtureId: string, teamId: string) {
  const res = await fetchApiFootball('/injuries', { fixture: fixtureId, team: teamId });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les compositions probables ou officielles
 */
export async function getLineups(fixtureId: string) {
  const res = await fetchApiFootball('/fixtures/lineups', { fixture: fixtureId });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les matchs en direct (Live Scoring)
 */
export async function getLiveFixtures() {
  const res = await fetchApiFootball('/fixtures', { live: 'all' });
  if (res && res.response) {
    return res.response;
  }
  return [];
}
`;

content += '\n' + newFunctions;
fs.writeFileSync('src/services/apiFootball.ts', content);
console.log("Patched apiFootball.ts");
