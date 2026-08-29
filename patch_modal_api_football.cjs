const fs = require('fs');
let content = fs.readFileSync('src/components/ProjectionBreakdownModal.tsx', 'utf-8');

const hookInject = `  const [apiData, setApiData] = useState<any>(null);
  const [loadingApi, setLoadingApi] = useState(false);

  useEffect(() => {
    if (fixture?.opponent) {
      setLoadingApi(true);
      // Appel vers le proxy backend
      // On cherche l'équipe pour obtenir son ID
      fetch(\`/api/football/team?name=\${encodeURIComponent(card.club?.name || '')}\`)
        .then(r => r.json())
        .then(teamRes => {
          if (teamRes.success && teamRes.team?.id) {
             return fetch(\`/api/football/fixture/upcoming?teamId=\${teamRes.team.id}\`);
          }
          throw new Error('Team not found');
        })
        .then(r => r.json())
        .then(fixtureRes => {
          if (fixtureRes.success && fixtureRes.fixture?.fixture?.id) {
             const fixtureId = fixtureRes.fixture.fixture.id;
             // On fetch les odds et predictions
             Promise.all([
               fetch(\`/api/football/odds?fixtureId=\${fixtureId}\`).then(r=>r.json()),
               fetch(\`/api/football/predictions?fixtureId=\${fixtureId}\`).then(r=>r.json())
             ]).then(([oddsRes, predRes]) => {
                setApiData({
                   odds: oddsRes.odds,
                   predictions: predRes.predictions
                });
                setLoadingApi(false);
             });
          } else {
             setLoadingApi(false);
          }
        })
        .catch(err => {
          console.error("API Football error:", err);
          setLoadingApi(false);
        });
    }
  }, [card.club?.name, fixture?.opponent]);`;

if (!content.includes('const [apiData, setApiData] = useState')) {
  content = content.replace("  const fixture = card.upcomingFixture;", "  const fixture = card.upcomingFixture;\n" + hookInject);
}

// Add the UI
const uiInject = `
        {/* --- API FOOTBALL INTELLIGENCE --- */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-indigo-400" />
            <h4 className="text-sm font-bold text-slate-200">Intelligence API-Football (Live Data)</h4>
          </div>
          
          {loadingApi ? (
            <div className="text-xs text-slate-400 animate-pulse flex items-center gap-2">
               <div className="w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
               Interrogation des bookmakers et des datas en cours...
            </div>
          ) : apiData ? (
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Victoire Attendue</span>
                   <span className="text-sm font-bold text-emerald-400">{apiData.predictions?.predictions?.percent?.home || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Cote Buteur</span>
                   <span className="text-sm font-bold text-indigo-400">{apiData.odds?.bookmakers?.[0]?.bets?.find((b:any) => b.name === 'Anytime Goalscorer')?.values?.[0]?.odd || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Buts Attendus (Equipe)</span>
                   <span className="text-sm font-bold text-amber-400">{apiData.predictions?.predictions?.goals?.home || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Système de jeu</span>
                   <span className="text-sm font-bold text-slate-300">{apiData.predictions?.teams?.home?.last_5?.form || '4-3-3'}</span>
                </div>
             </div>
          ) : (
            <div className="text-xs text-slate-500 italic flex items-center justify-between">
              <span>La clé API n'est pas renseignée ou aucune donnée trouvée.</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">Simulation Active</span>
            </div>
          )}
        </div>
`;

if (!content.includes('Intelligence API-Football (Live Data)')) {
  content = content.replace("        {/* Footer */}", uiInject + "\n        {/* Footer */}");
  fs.writeFileSync('src/components/ProjectionBreakdownModal.tsx', content);
  console.log("Patched UI ProjectionBreakdownModal.tsx");
}
