const query = `
  query {
    players(slugs: ["emiliano-martinez", "emiliano-martinez-1", "damian-emiliano-martinez-romero"]) {
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
  body: JSON.stringify({ query })
}).then(res => res.json()).then(console.log);
