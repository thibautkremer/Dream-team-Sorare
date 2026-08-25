import fetch from 'node-fetch';
const query = `
query {
  user(slug: "thib-8") {
    cards(first: 5, sport: FOOTBALL) {
      nodes {
        id
        slug
        name
        grade
        xp
        seasonYear
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
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
