const q = `query GetSo5Score($id: ID!) {
  node(id: $id) {
    ... on So5Score {
      score
      decisiveScore { totalScore stat points }
      detailedScore { category stat statValue points totalScore }
      allAroundStats { category stat statValue points totalScore }
    }
  }
}`;
const res = await fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q, variables: { id: 'So5Score:410a3184-1c74-4ee2-9acb-845a92145f84' } })
});
console.log(JSON.stringify(await res.json(), null, 2));
