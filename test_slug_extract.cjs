const fs = require('fs');
const data = JSON.parse(fs.readFileSync('thib8_real_cards.json', 'utf8'));
const cards = data.cards || data;
const slugs = cards.slice(0, 10).map(c => {
  const match = c.slug.match(/^(.*?)-\d{4}-/);
  return match ? match[1] : c.slug;
});
console.log(slugs);
