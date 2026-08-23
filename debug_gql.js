const q = `query GetPlayersLiveScores($slugs: [String!]!) {
  players(slugs: $slugs) {
    ... on Player {
      id
      slug
      displayName
    }
  }
}`;
const res = await fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q, variables: { slugs: ['nabil-bentaleb'] } })
});
console.log(await res.json());
