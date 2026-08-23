async function test() {
  const slugs = ["zane-monlouis-2026-common-6d10a047-e1e1-425e-b08c-2778ff6e3f6b"];
  const query = `
    query GetCardScores($slugs: [String!]!) {
      cards(slugs: $slugs) {
        id
        slug
        player {
          ... on Player {
            id
            slug
            displayName
            playingStatus
            so5Scores(last: 3) {
              score
              game {
                id
                date
                statusTyped
                minute
              }
            }
          }
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
