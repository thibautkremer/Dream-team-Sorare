const query = `
  query {
    football {
      player(slug: "emiliano-martinez") {
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
