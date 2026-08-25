const fs = require('fs');
let code = fs.readFileSync('src/utils/sorareSlug.ts', 'utf8');

const oldFunc = `export function getCardBonusBreakdown(card: SorareCard): CardBonusBreakdown {
  if (!card) {
    return {
      editionBonus: 0,
      collectionBonus: 0,
      xpGradeBonus: 0,
      rarityBonus: 0,
      totalBonusPercentage: 0,
      powerString: '1.000',
      hasInSeasonBonus: false,
    };
  }

  const rarity = (card.rarity || '').toUpperCase();
  let rarityBonus = 0;
  if (rarity === 'RARE') rarityBonus = 10;
  else if (rarity === 'SUPER_RARE') rarityBonus = 20;
  else if (rarity === 'UNIQUE') rarityBonus = 40;

  const total = getCardTotalBonus(card);
  const powerStr = (1 + total / 100).toFixed(3);

  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    const seasonBonus = Math.round((pb.seasonBasisPoints || 0) / 10) / 10;
    const specialEditionBonus = Math.round((pb.specialEditionCardsBasisPoints || 0) / 10) / 10;
    const editionBonus = Math.round((seasonBonus + specialEditionBonus) * 10) / 10;
    const xpGradeBonus = Math.round((pb.xpBasisPoints || 0) / 10) / 10;
    const rawCollection = Math.round((pb.collectionBasisPoints || 0) / 10) / 10;
    const otherBonus = Math.round((pb.otherBonusBasisPoints || 0) / 10) / 10;
    const collectionBonus = Math.max(0, Math.round((rawCollection + otherBonus) * 10) / 10);

    return {
      editionBonus,
      collectionBonus,
      xpGradeBonus,
      rarityBonus,
      totalBonusPercentage: total,
      powerString: powerStr,
      hasInSeasonBonus: seasonBonus > 0,
    };
  }

  let xpGradeBonus = 0;
  if (typeof card.grade === 'number' && card.grade > 0) {
    xpGradeBonus = Math.round(card.grade * 0.5 * 10) / 10;
  } else if (typeof card.xp === 'number' && card.xp > 0) {
    xpGradeBonus = Math.round(Math.min(card.xp / 100, 5) * 10) / 10;
  }

  let editionBonus = 0;
  if (card.specialEdition) {
    const se = card.specialEdition.toLowerCase();
    if (se.includes('chroma')) editionBonus = 20;
    else if (se.includes('flame')) editionBonus = 15;
    else if (se.includes('holo')) editionBonus = 10;
    else if (se.includes('shiny')) editionBonus = 5;
  }

  const collectionBonus = Math.max(0, Math.round((total - editionBonus - xpGradeBonus - rarityBonus) * 10) / 10);

  return {
    editionBonus,
    collectionBonus,
    xpGradeBonus,
    rarityBonus,
    totalBonusPercentage: total,
    powerString: powerStr,
    hasInSeasonBonus: false,
  };
}`;

const newFunc = `export function getCardBonusBreakdown(card: SorareCard): CardBonusBreakdown {
  if (!card) {
    return {
      editionBonus: 0,
      collectionBonus: 0,
      xpGradeBonus: 0,
      rarityBonus: 0,
      totalBonusPercentage: 0,
      powerString: '1.000',
      hasInSeasonBonus: false,
    };
  }

  const rarity = (card.rarity || '').toUpperCase();
  let rarityBonus = 0;
  if (rarity === 'RARE') rarityBonus = 10;
  else if (rarity === 'SUPER_RARE') rarityBonus = 20;
  else if (rarity === 'UNIQUE') rarityBonus = 40;

  const total = getCardTotalBonus(card);
  const powerStr = (1 + total / 100).toFixed(3);
  
  const isCurrentSeason = typeof card.seasonYear === 'number' && card.seasonYear >= 2026;
  const manualInSeasonBonus = isCurrentSeason ? 5 : 0;

  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    let seasonBonus = Math.round((pb.seasonBasisPoints || 0) / 10) / 10;
    if (seasonBonus === 0 && manualInSeasonBonus > 0) {
       seasonBonus = manualInSeasonBonus;
    }
    
    const specialEditionBonus = Math.round((pb.specialEditionCardsBasisPoints || 0) / 10) / 10;
    const editionBonus = Math.round((seasonBonus + specialEditionBonus) * 10) / 10;
    const xpGradeBonus = Math.round((pb.xpBasisPoints || 0) / 10) / 10;
    const rawCollection = Math.round((pb.collectionBasisPoints || 0) / 10) / 10;
    const otherBonus = Math.round((pb.otherBonusBasisPoints || 0) / 10) / 10;
    const collectionBonus = Math.max(0, Math.round((rawCollection + otherBonus) * 10) / 10);

    return {
      editionBonus,
      collectionBonus,
      xpGradeBonus,
      rarityBonus,
      totalBonusPercentage: total,
      powerString: powerStr,
      hasInSeasonBonus: seasonBonus > 0,
    };
  }

  let xpGradeBonus = 0;
  if (typeof card.grade === 'number' && card.grade > 0) {
    xpGradeBonus = Math.round(card.grade * 0.5 * 10) / 10;
  } else if (typeof card.xp === 'number' && card.xp > 0) {
    xpGradeBonus = Math.round(Math.min(card.xp / 100, 5) * 10) / 10;
  }

  let editionBonus = manualInSeasonBonus;
  if (card.specialEdition) {
    const se = card.specialEdition.toLowerCase();
    if (se.includes('chroma')) editionBonus += 20;
    else if (se.includes('flame')) editionBonus += 15;
    else if (se.includes('holo')) editionBonus += 10;
    else if (se.includes('shiny')) editionBonus += 5;
  }

  const collectionBonus = Math.max(0, Math.round((total - editionBonus - xpGradeBonus - rarityBonus) * 10) / 10);

  return {
    editionBonus,
    collectionBonus,
    xpGradeBonus,
    rarityBonus,
    totalBonusPercentage: total,
    powerString: powerStr,
    hasInSeasonBonus: manualInSeasonBonus > 0,
  };
}`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('src/utils/sorareSlug.ts', code);
console.log('slug breakdown updated');
