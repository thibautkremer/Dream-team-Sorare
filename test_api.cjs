async function test() {
  const slugs = ['nabil-bentaleb', 'olivier-giroud', 'emiliano-martinez-romero'];
  const res = await fetch('http://127.0.0.1:3000/api/sorare/live-scoring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'thib-8', slugs })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
