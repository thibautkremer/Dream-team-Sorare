const baseForm = 55;
const historicalBase = 35; // assuming mostly starter
const historicalExtra = baseForm - historicalBase; // 20 pts of AA + Dec

// For a Super Sub (expected 25 mins)
const pStarter = 0.1;
const pSub = 0.8;
const pDnp = 0.1;

const evBase = (pStarter * 35) + (pSub * 25);
const expectedMins = (pStarter * 80) + (pSub * 25);
const minsRatio = expectedMins / 80; // (8 + 20) / 80 = 28/80 = 0.35
const evExtra = historicalExtra * minsRatio; 

const evScore = evBase + evExtra;
console.log("Super Sub EV:", evScore); // 26 + 20*0.35 = 33

