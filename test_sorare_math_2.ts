const positions = ['GK', 'DEF', 'MID', 'FWD'];
const playerStatuses = ['STARTER', 'SUPER_SUBSTITUTE'];

const baseForm = 50; 
const matchupFactor = 1.0; 
const allAroundFactor = 1.0;
const teamXG = 1.4;

for (const status of playerStatuses) {
  let pStarter = 0;
  let pSub = 0;
  let pDnp = 0;

  if (status === 'STARTER') {
    pStarter = 0.95;
    pSub = 0.05;
    pDnp = 0;
  } else {
    pStarter = 0.15;
    pSub = 0.75;
    pDnp = 0.10;
  }

  const evBaseScore = (pStarter * 35) + (pSub * 25) + (pDnp * 0);
  
  const assumedHistoricalBase = 33; 
  let historicalExtra = Math.max(-15, baseForm - assumedHistoricalBase); // 17

  const volumeMultiplier = (pStarter * 1.0) + (pSub * 0.35);

  const aaRatio = 0.5; // balanced
  const decRatio = 0.5;

  const historicalAA = historicalExtra * aaRatio;
  const historicalDec = historicalExtra * decRatio;

  const projectedAAS = historicalAA * volumeMultiplier * allAroundFactor * matchupFactor;
  const projectedDec = historicalDec * volumeMultiplier * matchupFactor * (teamXG / 1.4);

  let projected = evBaseScore + projectedAAS + projectedDec;

  console.log(`Status: ${status} | BaseForm: ${baseForm} | EV Base: ${evBaseScore.toFixed(1)} | Vol Mult: ${volumeMultiplier.toFixed(2)} | EV Extra: ${(projectedAAS + projectedDec).toFixed(1)} | Total: ${projected.toFixed(1)}`);
}
