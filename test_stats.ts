import fetch from 'node-fetch';
const query = `
query GetSo5Score($id: ID!) {
  node(id: $id) {
    ... on So5Score {
      id
      score
      detailedScore { category stat statValue points totalScore }
      allAroundStats { category stat statValue points totalScore }
    }
  }
}`;
fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'APIKEY': '0bc44e5ccdbf7e34cd3eb32095cc1787c807b1981ccdc274ce1c4943f66cc99a' },
  body: JSON.stringify({ query, variables: { id: "So5Score:d8c30238-1cf9-4420-be8a-51c40504e8e2" } })
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
