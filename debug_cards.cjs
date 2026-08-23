const fs = require('fs');
const data = JSON.parse(fs.readFileSync('thib8_real_cards.json', 'utf8'));
const cards = data.cards || data;
const sample = cards.slice(0, 5).map(c => ({ id: c.id, slug: c.slug, playerSlug: c.playerSlug, name: c.name, displayName: c.displayName }));
console.log(JSON.stringify(sample, null, 2));
