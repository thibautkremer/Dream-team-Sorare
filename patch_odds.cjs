const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /await Promise\.allSettled\(\s*leagues\.map\(async \(league\) => \{[\s\S]*?\}\)\s*\);/m;

const newCode = `for (const league of leagues) {
      try {
        const url = \`https://api.the-odds-api.com/v4/sports/\${league}/odds/?apiKey=\${apiKey}&regions=eu&markets=h2h,totals,btts\`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          data.forEach((match: any) => {
            const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
            const totalsMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'totals');
            const bttsMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'btts');
            
            if (h2hMarket) {
              const homeOdds = h2hMarket.outcomes.find((o: any) => o.name === match.home_team)?.price || 2.5;
              const awayOdds = h2hMarket.outcomes.find((o: any) => o.name === match.away_team)?.price || 2.5;
              const drawOdds = h2hMarket.outcomes.find((o: any) => o.name === 'Draw')?.price || 3.0;
              
              let over25Odds = 1.85;
              if (totalsMarket) {
                over25Odds = totalsMarket.outcomes.find((o: any) => o.name === 'Over' && o.point === 2.5)?.price || 1.85;
              }
              let bttsProb = 52;
              if (bttsMarket) {
                const bttsYesOdds = bttsMarket.outcomes.find((o: any) => o.name === 'Yes')?.price;
                const bttsNoOdds = bttsMarket.outcomes.find((o: any) => o.name === 'No')?.price;
                if (bttsYesOdds && bttsNoOdds) {
                  const invYes = 1 / bttsYesOdds;
                  const invNo = 1 / bttsNoOdds;
                  bttsProb = Math.round((invYes / (invYes + invNo)) * 100);
                }
              }
              
              const totalMatchXG = Math.max(1.5, Math.min(4.5, (1.9 / over25Odds) * 1.5 + 1.25));
              const homeWinProb = 1 / homeOdds;
              const awayWinProb = 1 / awayOdds;
              const totalProb = homeWinProb + awayWinProb;
              
              const homeXG = Math.round((totalMatchXG * (homeWinProb / totalProb) * 1.05) * 100) / 100;
              const awayXG = Math.round((totalMatchXG * (awayWinProb / totalProb) * 0.95) * 100) / 100;
              
              const homeCSPoisson = Math.exp(-awayXG) * 100;
              const awayCSPoisson = Math.exp(-homeXG) * 100;
              
              const homeCS = Math.max(5, Math.min(85, Math.round(homeCSPoisson * 0.7 + (100 - bttsProb) * 0.6)));
              const awayCS = Math.max(5, Math.min(85, Math.round(awayCSPoisson * 0.7 + (100 - bttsProb) * 0.4)));
              
              realOddsCache.set(normalizeClubName(match.home_team), { 
                win: homeOdds, 
                draw: drawOdds, 
                loss: awayOdds, 
                cleanSheetProb: homeCS, 
                goalExpectancy: homeXG, 
                opponentGoalExpectancy: awayXG,
                bttsProb
              });
              realOddsCache.set(normalizeClubName(match.away_team), { 
                win: awayOdds, 
                draw: drawOdds, 
                loss: homeOdds, 
                cleanSheetProb: awayCS, 
                goalExpectancy: awayXG, 
                opponentGoalExpectancy: homeXG,
                bttsProb
              });
            }
          });
        }
      } catch (err) {
        console.warn(\`[Odds API] Error fetching \${league}:\`, err);
      }
      // Sleep to avoid rate limiting
      await new Promise(r => setTimeout(r, 400));
    }`;

code = code.replace(regex, newCode);
fs.writeFileSync('server.ts', code);
console.log('Patched odds');
