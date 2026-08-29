import { calculatePlayerProjectedScore } from './src/utils/optimizer';

const card = {
  positionCode: 'FWD', status: 'SUPER_SUBSTITUTE', starterConfidence: 20, injuryStatus: 'FIT',
  scores: { l5: 45, l15: 48, l40: 45, allAroundContributionPct: 30, decisiveContributionPct: 70, recentMatches: [{minsPlayed: 25, isStarter: false, isSub: true}] },
  upcomingFixture: { difficultyRating: 3, isHome: false, bookmaker: { goalExpectancy: 1.2, opponentGoalExpectancy: 1.5, anytimeScorerOdds: 3.5 } }
};

const res = calculatePlayerProjectedScore(card as any, 'BALANCED');
console.log(res);
