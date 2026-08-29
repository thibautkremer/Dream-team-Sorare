const fetch = require('node-fetch');
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/match-odds/sync-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'thib-8', cards: [] })
    });
    const data = await res.json();
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}
run();
