const fs = require('fs');
const data = JSON.parse(fs.readFileSync('thib8_real_cards.json', 'utf8'));
const cards = data.cards || data;
const emis = cards.filter(c => c.displayName.toLowerCase().includes('martinez'));
emis.forEach(c => {
  const match = c.slug.match(/^(.*?)-\d{4}-/);
  console.log('Card slug:', c.slug, '->', match ? match[1] : c.slug);
});
