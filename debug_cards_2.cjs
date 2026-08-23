const fs = require('fs');
const data = JSON.parse(fs.readFileSync('thib8_real_cards.json', 'utf8'));
const cards = data.cards || data;
const sample = cards.slice(0, 1);
console.log(JSON.stringify(sample, null, 2));
