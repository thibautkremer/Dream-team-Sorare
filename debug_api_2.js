const res = await fetch('http://127.0.0.1:3000/api/sorare/live-scoring', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'thib-8', slugs: ['nabil-bentaleb'] })
});
const text = await res.text();
console.log(text);
