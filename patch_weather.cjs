const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.get\('\/api\/weather', async \(req, res\) => \{[\s\S]*?const city = \(\(req\.query\.city as string\) \|\| \(req\.query\.club as string\) \|\| 'Paris'\)\.trim\(\);/m;

const newCode = `const CLUB_TO_CITY_MAP: Record<string, string> = {
  'Paris Saint Germain': 'Paris',
  'Bayer 04 Leverkusen': 'Leverkusen',
  'Arsenal': 'London',
  'Real Madrid': 'Madrid',
  'FC Barcelona': 'Barcelona',
  'Bayern Munich': 'Munich',
  'Manchester City': 'Manchester',
  'Manchester United': 'Manchester',
  'Liverpool FC': 'Liverpool',
  'Juventus': 'Turin',
  'AC Milan': 'Milan',
  'Inter Milan': 'Milan',
  'Chelsea FC': 'London',
  'Tottenham Hotspur': 'London',
  'Atletico Madrid': 'Madrid',
  'Borussia Dortmund': 'Dortmund',
  'RB Leipzig': 'Leipzig',
  'SSC Napoli': 'Naples',
  'AS Roma': 'Rome',
  'Olympique de Marseille': 'Marseille',
  'Olympique Lyonnais': 'Lyon',
  'AS Monaco': 'Monaco'
};

app.get('/api/weather', async (req, res) => {
  let rawCity = ((req.query.city as string) || (req.query.club as string) || 'Paris').trim();
  // Reverse lookup or direct match
  let city = CLUB_TO_CITY_MAP[rawCity] || rawCity;
  // Handle some common suffixes
  city = city.replace(/ FC$/, '').replace(/^FC /, '').trim();
`;

code = code.replace(regex, newCode);
fs.writeFileSync('server.ts', code);
console.log('Patched weather mapping');
