const q = `query GetSinglePlayerDetails($slugs: [String!]!) {
  players(slugs: $slugs) {
    ... on Player {
      slug
      displayName
      so5Scores(last: 1) {
        id
        score
        decisiveScore { totalScore }
        detailedScore { category stat statValue points totalScore }
        allAroundStats { category stat statValue points totalScore }
        game {
          id
          date
          statusTyped
          homeGoals
          awayGoals
          homeTeam { name pictureUrl }
          awayTeam { name pictureUrl }
          competition { name }
        }
      }
    }
  }
}`;
const res = await fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q, variables: { slugs: ['nabil-bentaleb'] } })
});
console.log(JSON.stringify(await res.json(), null, 2));
