const slugs = ['olivier-giroud', 'nabil-bentaleb'];
const query = `
  query GetPlayersLiveScores($slugs: [String!]!) {
    players(slugs: $slugs) {
      ... on Player {
        id
        slug
        displayName
        so5Scores(last: 3) {
          score
          game {
            id
            date
            statusTyped
          }
        }
      }
    }
  }
`;
fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { slugs } })
}).then(res => res.json()).then(console.log);
