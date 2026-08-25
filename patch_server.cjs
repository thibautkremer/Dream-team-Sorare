const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// We have inline bonus computation in two places in server.ts:
// 1. In GetUserFootballCards response mapping (around line 4447)
const oldBonusUserCards = `          bonusPercentage: (() => {
            const rarity = (c.rarityTyped || c.rarity || '').toUpperCase();
            let rarityBonus = 0;
            if (rarity === 'RARE') rarityBonus = 10;
            else if (rarity === 'SUPER_RARE') rarityBonus = 20;
            else if (rarity === 'UNIQUE') rarityBonus = 40;

            let b1 = -1, b2 = -1, b3 = 0;
            
            // 1. Direct powerBreakdown
            if (c.powerBreakdown) {
              const pb = c.powerBreakdown;
              const sumBps = (pb.collectionBasisPoints || 0) +
                             (pb.seasonBasisPoints || 0) +
                             (pb.specialEditionCardsBasisPoints || 0) +
                             (pb.xpBasisPoints || 0) +
                             (pb.otherBonusBasisPoints || 0);
              b1 = sumBps / 100;
            }
            // 2. Direct power string
            if (c.power) {
              const p = parseFloat(c.power);
              if (!isNaN(p) && p >= 1.0) {
                b2 = (p - 1.0) * 100;
              }
            }
            // 3. Fallback
            if (typeof c.grade === 'number' && c.grade > 0) b3 += c.grade * 0.5;
            else if (typeof c.xp === 'number' && c.xp > 0) b3 += Math.min(c.xp / 100, 5);

            if (c.specialEdition) {
              const se = c.specialEdition.toLowerCase();
              if (se.includes('chroma')) b3 += 20;
              else if (se.includes('flame')) b3 += 15;
              else if (se.includes('holo')) b3 += 10;
              else if (se.includes('shiny')) b3 += 5;
            }

            const maxBonus = Math.max(b1, b2, b3, 0);
            return Math.round((rarityBonus + maxBonus) * 10) / 10;
          })(),`;

const newBonusUserCards = `          bonusPercentage: (() => {
            const rarity = (c.rarityTyped || c.rarity || '').toUpperCase();
            let rarityBonus = 0;
            if (rarity === 'RARE') rarityBonus = 10;
            else if (rarity === 'SUPER_RARE') rarityBonus = 20;
            else if (rarity === 'UNIQUE') rarityBonus = 40;

            const isCurrentSeason = typeof c.seasonYear === 'number' && c.seasonYear >= 2026;
            const manualInSeasonBonus = isCurrentSeason ? 5 : 0;

            let b1 = -1, b2 = -1, b3 = manualInSeasonBonus;
            
            if (c.powerBreakdown) {
              const pb = c.powerBreakdown;
              const seasonBps = (pb.seasonBasisPoints && pb.seasonBasisPoints > 0) ? pb.seasonBasisPoints : (manualInSeasonBonus * 100);
              const sumBps = (pb.collectionBasisPoints || 0) +
                             seasonBps +
                             (pb.specialEditionCardsBasisPoints || 0) +
                             (pb.xpBasisPoints || 0) +
                             (pb.otherBonusBasisPoints || 0);
              b1 = sumBps / 100;
            }
            if (c.power) {
              const p = parseFloat(c.power);
              if (!isNaN(p) && p >= 1.0) {
                let pBonus = (p - 1.0) * 100;
                if (rarity === 'COMMON' && isCurrentSeason) pBonus += manualInSeasonBonus;
                b2 = pBonus;
              }
            }
            if (typeof c.grade === 'number' && c.grade > 0) b3 += c.grade * 0.5;
            else if (typeof c.xp === 'number' && c.xp > 0) b3 += Math.min(c.xp / 100, 5);

            if (c.specialEdition) {
              const se = c.specialEdition.toLowerCase();
              if (se.includes('chroma')) b3 += 20;
              else if (se.includes('flame')) b3 += 15;
              else if (se.includes('holo')) b3 += 10;
              else if (se.includes('shiny')) b3 += 5;
            }

            const maxBonus = Math.max(b1, b2, b3, 0);
            return Math.round((rarityBonus + maxBonus) * 10) / 10;
          })(),`;

// 2. In player-live-detail
const oldBonusLiveDetail = `          const r = (foundCard.rarityTyped || foundCard.rarity || '').toUpperCase();
          let rBonus = 0;
          if (r === 'RARE') rBonus = 10;
          else if (r === 'SUPER_RARE') rBonus = 20;
          else if (r === 'UNIQUE') rBonus = 40;

          let b1 = -1, b2 = -1, b3 = 0;
          if (foundCard.powerBreakdown) {
            const pb = foundCard.powerBreakdown;
            b1 = ((pb.collectionBasisPoints || 0) + (pb.seasonBasisPoints || 0) + (pb.specialEditionCardsBasisPoints || 0) + (pb.xpBasisPoints || 0) + (pb.otherBonusBasisPoints || 0)) / 100;
          }
          if (foundCard.power) {
            const p = parseFloat(foundCard.power);
            if (!isNaN(p) && p >= 1.0) b2 = (p - 1.0) * 100;
          }
          if (typeof foundCard.grade === 'number' && foundCard.grade > 0) b3 += foundCard.grade * 0.5;
          else if (typeof foundCard.xp === 'number' && foundCard.xp > 0) b3 += Math.min(foundCard.xp / 100, 5);
          
          if (foundCard.specialEdition) {
            const se = foundCard.specialEdition.toLowerCase();
            if (se.includes('chroma')) b3 += 20;
            else if (se.includes('flame')) b3 += 15;
            else if (se.includes('holo')) b3 += 10;
            else if (se.includes('shiny')) b3 += 5;
          }

          const maxB = Math.max(b1, b2, b3, 0);
          foundCard.bonusPercentage = Math.round((rBonus + maxB) * 10) / 10;`;

const newBonusLiveDetail = `          const r = (foundCard.rarityTyped || foundCard.rarity || '').toUpperCase();
          let rBonus = 0;
          if (r === 'RARE') rBonus = 10;
          else if (r === 'SUPER_RARE') rBonus = 20;
          else if (r === 'UNIQUE') rBonus = 40;

          const isCurrentSeason = typeof foundCard.seasonYear === 'number' && foundCard.seasonYear >= 2026;
          const manualInSeasonBonus = isCurrentSeason ? 5 : 0;

          let b1 = -1, b2 = -1, b3 = manualInSeasonBonus;
          if (foundCard.powerBreakdown) {
            const pb = foundCard.powerBreakdown;
            const seasonBps = (pb.seasonBasisPoints && pb.seasonBasisPoints > 0) ? pb.seasonBasisPoints : (manualInSeasonBonus * 100);
            b1 = ((pb.collectionBasisPoints || 0) + seasonBps + (pb.specialEditionCardsBasisPoints || 0) + (pb.xpBasisPoints || 0) + (pb.otherBonusBasisPoints || 0)) / 100;
          }
          if (foundCard.power) {
            const p = parseFloat(foundCard.power);
            if (!isNaN(p) && p >= 1.0) {
               let pBonus = (p - 1.0) * 100;
               if (r === 'COMMON' && isCurrentSeason) pBonus += manualInSeasonBonus;
               b2 = pBonus;
            }
          }
          if (typeof foundCard.grade === 'number' && foundCard.grade > 0) b3 += foundCard.grade * 0.5;
          else if (typeof foundCard.xp === 'number' && foundCard.xp > 0) b3 += Math.min(foundCard.xp / 100, 5);
          
          if (foundCard.specialEdition) {
            const se = foundCard.specialEdition.toLowerCase();
            if (se.includes('chroma')) b3 += 20;
            else if (se.includes('flame')) b3 += 15;
            else if (se.includes('holo')) b3 += 10;
            else if (se.includes('shiny')) b3 += 5;
          }

          const maxB = Math.max(b1, b2, b3, 0);
          foundCard.bonusPercentage = Math.round((rBonus + maxB) * 10) / 10;`;

if (code.includes(oldBonusUserCards)) {
  code = code.replace(oldBonusUserCards, newBonusUserCards);
  console.log('patched bonus 1');
} else {
  console.log('could not find bonus 1');
}

if (code.includes(oldBonusLiveDetail)) {
  code = code.replace(oldBonusLiveDetail, newBonusLiveDetail);
  console.log('patched bonus 2');
} else {
  console.log('could not find bonus 2');
}

fs.writeFileSync('server.ts', code);
