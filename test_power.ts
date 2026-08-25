import fetch from 'node-fetch';
const query = `
query GetUserFootballCards($slug: String!) {
  user(slug: $slug) {
    cards(first: 5, sport: FOOTBALL) {
      nodes {
        id
        slug
        name
        power
        powerBreakdown {
          collectionBasisPoints
          seasonBasisPoints
          specialEditionCardsBasisPoints
          xpBasisPoints
          otherBonusBasisPoints
        }
      }
    }
  }
}`;
fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'APIKEY': '0bc44e5ccdbf7e34cd3eb32095cc1787c807b1981ccdc274ce1c4943f66cc99a' },
  body: JSON.stringify({ query, variables: { slug: "tkrems" } })
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
