const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /const leagues = \[[\s\S]*?\];/;
const newLeagues = `const leagues = [
      'soccer_france_ligue_one', 
      'soccer_epl', 
      'soccer_spain_la_liga', 
      'soccer_italy_serie_a', 
      'soccer_germany_bundesliga',
      'soccer_uefa_champs_league',
      'soccer_uefa_europa_league',
      'soccer_netherlands_eredivisie',
      'soccer_portugal_primeira_liga',
      'soccer_belgium_first_div',
      'soccer_usa_mls',
      'soccer_brazil_campeonato',
      'soccer_mexico_ligamx',
      'soccer_turkey_super_league'
    ];`;

code = code.replace(regex, newLeagues);
fs.writeFileSync('server.ts', code);
console.log('Patched leagues');
