const fs = require('fs');
let code = fs.readFileSync('src/components/SlotSwapModal.tsx', 'utf8');

const regex = /\}\)\.sort\(\(a, b\) => \{[\s\S]*?switch \(sortBy\) \{/;

const replacement = `}).sort((a, b) => {
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

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/SlotSwapModal.tsx', code);
