const fetch = require('node-fetch');
async function test() {
  const slugs = ['olivier-giroud', 'nabil-bentaleb', 'emiliano-martinez'];
  const res = await fetch('http://localhost:3000/api/sorare/live-scoring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'thib-8', slugs })
  });
  console.log(res.status);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
