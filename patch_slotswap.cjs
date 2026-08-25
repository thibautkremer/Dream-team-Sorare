const fs = require('fs');
let code = fs.readFileSync('src/components/SlotSwapModal.tsx', 'utf8');

const oldSort = `    }).sort((a, b) => {
      // Si le tri est par score projeté et que la priorité coéquipiers est activée
      if (prioritizeTeammates && sortBy === 'PROJ_DESC') {
        const aHasTeammate = a.teammates.length > 0;
        const bHasTeammate = b.teammates.length > 0;
        const scoreDiff = Math.abs(b.proj.projectedScore - a.proj.projectedScore);

        // Si les deux joueurs sont proches (diff <= 4 pts), privilégier celui qui a des coéquipiers
        if (scoreDiff <= 4.0 && (aHasTeammate || bHasTeammate)) {
          if (aHasTeammate && !bHasTeammate) return -1;
          if (!aHasTeammate && bHasTeammate) return 1;
          if (a.teammates.length !== b.teammates.length) return b.teammates.length - a.teammates.length;
        }
      }
      switch (sortBy) {`;

const newSort = `    }).sort((a, b) => {
      // Si le tri est par score projeté
      if (sortBy === 'PROJ_DESC') {
        const scoreDiff = Math.abs(b.proj.projectedScore - a.proj.projectedScore);

        // Si les deux joueurs sont proches (diff <= 4 pts)
        if (scoreDiff <= 4.0) {
          if (prioritizeTeammates) {
            const aHasTeammate = a.teammates.length > 0;
            const bHasTeammate = b.teammates.length > 0;
            
            if (aHasTeammate || bHasTeammate) {
              if (aHasTeammate && !bHasTeammate) return -1;
              if (!aHasTeammate && bHasTeammate) return 1;
              if (a.teammates.length !== b.teammates.length) return b.teammates.length - a.teammates.length;
            }
          }
          
          // Si on n'a pas pu les départager par les coéquipiers (ou option désactivée), on utilise le bonus
          const aBonus = getCardTotalBonus(a.card);
          const bBonus = getCardTotalBonus(b.card);
          if (aBonus !== bBonus) {
             return bBonus - aBonus;
          }
        }
      }
      switch (sortBy) {`;

if (code.includes(oldSort)) {
  code = code.replace(oldSort, newSort);
  console.log('patched slotswap sort');
} else {
  console.log('could not find sort in slotswap');
}

// And let's make hideOpponents default to true
code = code.replace('const [hideOpponents, setHideOpponents] = useState(false);', 'const [hideOpponents, setHideOpponents] = useState(true);');

fs.writeFileSync('src/components/SlotSwapModal.tsx', code);
