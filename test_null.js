const detailedStats = { detailedScore: null, allAroundStats: [ { category: "GENERAL" } ] };
const allDetailedScores = detailedStats?.detailedScore || detailedStats?.allAroundStats || [];
console.log(allDetailedScores);
