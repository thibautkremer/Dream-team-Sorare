const fs = require('fs');
let code = fs.readFileSync('src/utils/sorareSlug.ts', 'utf8');

const oldFunc = `export function getCardTotalBonus(card: SorareCard): number {
  if (!card) return 0;
  const rarity = (card.rarity || '').toUpperCase();
  let rarityBonus = 0;
  if (rarity === 'RARE') rarityBonus = 10;
  else if (rarity === 'SUPER_RARE') rarityBonus = 20;
  else if (rarity === 'UNIQUE') rarityBonus = 40;

  // 1. Exact power breakdown from Sorare API (Source de vérité)
  let apiBonusFromBreakdown = -1;
  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    const sumBps = (pb.collectionBasisPoints || 0) +
                   (pb.seasonBasisPoints || 0) +
                   (pb.specialEditionCardsBasisPoints || 0) +
                   (pb.xpBasisPoints || 0) +
                   (pb.otherBonusBasisPoints || 0);
    apiBonusFromBreakdown = sumBps / 100;
  }

  // 2. Exact power string from Sorare API e.g. "1.040" -> 4.0%, "1.050" -> 5.0%, "1.000" -> 0.0%
  let apiBonusFromPower = -1;
  if (card.power) {
    const p = parseFloat(card.power);
    if (!isNaN(p) && p >= 1.0) {
      apiBonusFromPower = (p - 1.0) * 100;
    }
  }

  // 3. Fallback only if no API power data is available
  let fallback = 0;
  if (typeof card.grade === 'number' && card.grade > 0) {
    fallback += card.grade * 0.5;
  } else if (typeof card.xp === 'number' && card.xp > 0) {
    fallback += Math.min(card.xp / 100, 5);
  }

  if (card.specialEdition) {
    const se = card.specialEdition.toLowerCase();
    if (se.includes('chroma')) fallback += 20;
    else if (se.includes('flame')) fallback += 15;
    else if (se.includes('holo')) fallback += 10;
    else if (se.includes('shiny')) fallback += 5;
  }

  // Extract the maximum possible bonus out of the parsed values
  const maxApiBonus = Math.max(
    apiBonusFromBreakdown,
    apiBonusFromPower,
    fallback,
    0
  );
  
  let calculatedBonus = Math.round((rarityBonus + maxApiBonus) * 10) / 10;

  // Compare with the explicitly passed bonusPercentage to ensure we don't lose pre-calculated values
  if (typeof card.bonusPercentage === 'number' && card.bonusPercentage > 0) {
    calculatedBonus = Math.max(calculatedBonus, Math.round(card.bonusPercentage * 10) / 10);
  }
  return calculatedBonus;
}`;

const newFunc = `export function getCardTotalBonus(card: SorareCard): number {
  if (!card) return 0;
  const rarity = (card.rarity || '').toUpperCase();
  let rarityBonus = 0;
  if (rarity === 'RARE') rarityBonus = 10;
  else if (rarity === 'SUPER_RARE') rarityBonus = 20;
  else if (rarity === 'UNIQUE') rarityBonus = 40;

  const isCurrentSeason = typeof card.seasonYear === 'number' && card.seasonYear >= 2026;
  const manualInSeasonBonus = isCurrentSeason ? 5 : 0;

  // 1. Exact power breakdown from Sorare API (Source de vérité)
  let apiBonusFromBreakdown = -1;
  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    const seasonBps = (pb.seasonBasisPoints && pb.seasonBasisPoints > 0) 
      ? pb.seasonBasisPoints 
      : (manualInSeasonBonus * 100);

    const sumBps = (pb.collectionBasisPoints || 0) +
                   seasonBps +
                   (pb.specialEditionCardsBasisPoints || 0) +
                   (pb.xpBasisPoints || 0) +
                   (pb.otherBonusBasisPoints || 0);
    apiBonusFromBreakdown = sumBps / 100;
  }

  // 2. Exact power string from Sorare API e.g. "1.040" -> 4.0%, "1.050" -> 5.0%, "1.000" -> 0.0%
  let apiBonusFromPower = -1;
  if (card.power) {
    const p = parseFloat(card.power);
    if (!isNaN(p) && p >= 1.0) {
      let pBonus = (p - 1.0) * 100;
      if (isCurrentSeason && rarity === 'COMMON') {
        pBonus += manualInSeasonBonus;
      }
      apiBonusFromPower = pBonus;
    }
  }

  // 3. Fallback only if no API power data is available
  let fallback = manualInSeasonBonus;
  if (typeof card.grade === 'number' && card.grade > 0) {
    fallback += card.grade * 0.5;
  } else if (typeof card.xp === 'number' && card.xp > 0) {
    fallback += Math.min(card.xp / 100, 5);
  }

  if (card.specialEdition) {
    const se = card.specialEdition.toLowerCase();
    if (se.includes('chroma')) fallback += 20;
    else if (se.includes('flame')) fallback += 15;
    else if (se.includes('holo')) fallback += 10;
    else if (se.includes('shiny')) fallback += 5;
  }

  // Extract the maximum possible bonus out of the parsed values
  const maxApiBonus = Math.max(
    apiBonusFromBreakdown,
    apiBonusFromPower,
    fallback,
    0
  );
  
  let calculatedBonus = Math.round((rarityBonus + maxApiBonus) * 10) / 10;

  // Compare with the explicitly passed bonusPercentage to ensure we don't lose pre-calculated values
  if (typeof card.bonusPercentage === 'number' && card.bonusPercentage > 0) {
    // Keep it if it's magically higher, but usually calculatedBonus should be correct now
    calculatedBonus = Math.max(calculatedBonus, Math.round(card.bonusPercentage * 10) / 10);
  }
  return calculatedBonus;
}`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('src/utils/sorareSlug.ts', code);
console.log('slug file updated');
