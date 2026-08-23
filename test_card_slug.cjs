async function test() {
  const slugs = ["olivier-giroud-2023-rare-1"]; // Fake card slug
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
  const res = await fetch('https://api.sorare.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { slugs } })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
