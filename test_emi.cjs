const slugs = ['emiliano-martinez', 'emiliano-martinez-romero'];
const query = `
  query GetPlayersLiveScores($slugs: [String!]!) {
    players(slugs: $slugs) {
      ... on Player {
        id
        slug
        displayName
      }
    }
  }
`;
fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { slugs } })
}).then(res => res.json()).then(console.log);
