const fs = require('fs');
let content = fs.readFileSync('src/components/ProjectionBreakdownModal.tsx', 'utf-8');

// The place where contextual bonuses are shown is around line 215-241
// Let's add advancedStatsBonus display in the Contextual Bonuses section,
// and also add badges at the top next to the total score.

const bonusSectionSearch = `{breakdown.weatherBonus !== 0 && (`;
if (content.includes(bonusSectionSearch)) {
  const insertAdvancedStats = `
                  {breakdown.advancedStatsBonus && breakdown.advancedStatsBonus > 0 ? (
                    <span className="font-bold text-emerald-400 text-[11px] block">
                      +{breakdown.advancedStatsBonus} pts (Régression xG/xA)
                      <span className="text-[9px] font-normal ml-1 block text-slate-400 italic">🎯 Forte production attendue</span>
                    </span>
                  ) : null}
                  `;
  content = content.replace(bonusSectionSearch, insertAdvancedStats + bonusSectionSearch);
  
  // Also add some visual badges in the top part
  const topSectionSearch = `<div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white tracking-tight">{card.player.displayName}</h3>`;
  
  if (content.includes(topSectionSearch)) {
    const badges = `
            {breakdown.starterImpactLabel?.includes('Risque de Rotation') && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">⚠️ Risque de Repos</span>
            )}
            {breakdown.advancedStatsBonus > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🎯 Buteur/Passeur Attendu</span>
            )}
            {breakdown.matchupImpactLabel?.includes('Bloc Bas') && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">🧱 Passeur Bloc Bas</span>
            )}
            {breakdown.matchupImpactLabel?.includes('Pressing Haut') && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">⚔️ Volume de Duels</span>
            )}
    `;
    
    content = content.replace(topSectionSearch, `<div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-white tracking-tight">{card.player.displayName}</h3>` + badges);
  }
  
  fs.writeFileSync('src/components/ProjectionBreakdownModal.tsx', content);
  console.log("Successfully updated ProjectionBreakdownModal.tsx");
} else {
  console.log("Failed to find bonusSectionSearch");
}
