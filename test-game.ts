import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('src/data/mockPlayers.json', 'utf8') || '[]');
const p = data.find((p: any) => p.scores?.recentMatches?.length > 0);
if (p) {
  console.log(JSON.stringify(p.scores.recentMatches[0].game, null, 2));
}
