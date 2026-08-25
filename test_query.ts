import fetch from 'node-fetch';
const query = `
query {
  anyPlayer(slug: "joaquin-pereyra") {
    ... on Player {
      so5Scores(last: 1) {
        id
        score
      }
      allSo5Scores(first: 1) {
        nodes {
          id
          score
        }
      }
    }
  }
}`;
fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'APIKEY': '0bc44e5ccdbf7e34cd3eb32095cc1787c807b1981ccdc274ce1c4943f66cc99a' },
  body: JSON.stringify({ query })
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
