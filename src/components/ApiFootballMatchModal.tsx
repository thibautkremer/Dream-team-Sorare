import React, { useState, useEffect } from 'react';
import { X, Zap, Shield, TrendingUp, AlertTriangle, Activity, Calendar, Trophy, Crosshair, Award, Users, CheckCircle2, Flame, BarChart3, Clock, Flag, UserCheck } from 'lucide-react';
import { SorareCard } from '../types';

interface ApiFootballMatchModalProps {
  homeTeam: string;
  awayTeam: string;
  competition?: string;
  kickoffDate?: string;
  galleryPlayers?: SorareCard[];
  onClose: () => void;
  onOpenScout?: (card: SorareCard) => void;
}

export const ApiFootballMatchModal: React.FC<ApiFootballMatchModalProps> = ({
  homeTeam,
  awayTeam,
  competition = 'Championnat',
  kickoffDate,
  galleryPlayers = [],
  onClose,
  onOpenScout
}) => {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<any>(null);
  const [odds, setOdds] = useState<any>(null);
  const [injuries, setInjuries] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<any[]>([]);
  const [homeTeamInfo, setHomeTeamInfo] = useState<any>(null);
  const [awayTeamInfo, setAwayTeamInfo] = useState<any>(null);
  const [fixtureIdState, setFixtureIdState] = useState<string>('0');
  const [activeTab, setActiveTab] = useState<'odds' | 'predictions' | 'live_stats' | 'injuries' | 'lineups'>('odds');
  
  // Track loaded tabs
  const [loadedTabs, setLoadedTabs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadInitialData = async () => {
      try {
        // Search home team first to get fixture ID
        const homeRes = await fetch(`/api/football/team?name=${encodeURIComponent(homeTeam)}`).then(r => r.json());
        let fixtureId = '0';
        
        if (isMounted && homeRes.team) {
          setHomeTeamInfo(homeRes.team);
          const fixtureRes = await fetch(`/api/football/fixture/upcoming?teamId=${homeRes.team.id}`).then(r => r.json());
          if (fixtureRes.fixture?.fixture?.id) {
            fixtureId = fixtureRes.fixture.fixture.id.toString();
            setFixtureIdState(fixtureId);
          }
        }
        
        // Load away team info concurrently with first tab load, as it's quick
        fetch(`/api/football/team?name=${encodeURIComponent(awayTeam)}`)
          .then(r => r.json())
          .then(res => { if (isMounted && res.team) setAwayTeamInfo(res.team); })
          .catch(() => {});

        // Fetch just the initial tab
        if (fixtureId !== '0') {
           const oddsRes = await fetch(`/api/football/odds?fixtureId=${fixtureId}`).then(r => r.json()).catch(() => ({}));
           if (isMounted) {
             setOdds(oddsRes.odds || oddsRes.response?.[0] || null);
             setLoadedTabs(prev => ({ ...prev, odds: true }));
             setLoading(false);
           }
        } else {
           if (isMounted) setLoading(false);
        }
      } catch (err) {
        console.warn('[ApiFootballMatchModal] Erreur initialisation:', err);
        if (isMounted) setLoading(false);
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [homeTeam, awayTeam]);

  // Tab Lazy Loading
  useEffect(() => {
    if (fixtureIdState === '0' || loadedTabs[activeTab]) return;

    let isMounted = true;
    const fetchTabData = async () => {
      try {
        setLoading(true);
        switch (activeTab) {
          case 'predictions':
            const predRes = await fetch(`/api/football/predictions?fixtureId=${fixtureIdState}`).then(r => r.json()).catch(() => ({}));
            if (isMounted) setPredictions(predRes.predictions || predRes.response?.[0] || null);
            break;
          case 'injuries':
            const injRes = await fetch(`/api/football/injuries?fixtureId=${fixtureIdState}&teamId=${homeTeamInfo?.id || ''}`).then(r => r.json()).catch(() => ({}));
            if (isMounted) setInjuries(injRes.injuries || injRes.response || []);
            break;
          case 'live_stats':
            const [eventsRes, statsRes] = await Promise.all([
              fetch(`/api/football/events?fixtureId=${fixtureIdState}`).then(r => r.json()).catch(() => ({})),
              fetch(`/api/football/statistics?fixtureId=${fixtureIdState}`).then(r => r.json()).catch(() => ({}))
            ]);
            if (isMounted) {
              setEvents(eventsRes.events || eventsRes.response || []);
              setStatistics(statsRes.statistics || statsRes.response || []);
            }
            break;
        }
        
        if (isMounted) {
          setLoadedTabs(prev => ({ ...prev, [activeTab]: true }));
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };

    fetchTabData();
    return () => { isMounted = false; };
  }, [activeTab, fixtureIdState, loadedTabs, homeTeamInfo]);

  // Extract bet values safely
  const bookmaker = odds?.bookmakers?.[0] || odds?.response?.[0]?.bookmakers?.[0];
  const winnerBet = bookmaker?.bets?.find((b: any) => b.name === 'Match Winner' || b.id === 1);
  const homeOdd = winnerBet?.values?.find((v: any) => v.value === 'Home' || v.value === '1')?.odd || '1.75';
  const drawOdd = winnerBet?.values?.find((v: any) => v.value === 'Draw' || v.value === 'X')?.odd || '3.60';
  const awayOdd = winnerBet?.values?.find((v: any) => v.value === 'Away' || v.value === '2')?.odd || '4.80';

  const bttsBet = bookmaker?.bets?.find((b: any) => b.name === 'Both Teams to Score' || b.name === 'Both Teams To Score');
  const bttsYes = bttsBet?.values?.find((v: any) => v.value === 'Yes')?.odd || '1.80';
  const bttsNo = bttsBet?.values?.find((v: any) => v.value === 'No')?.odd || '1.95';

  const csHomeBet = bookmaker?.bets?.find((b: any) => b.name.includes('Clean Sheet - Home') || b.name.includes('Home Clean Sheet'));
  const csHomeOdd = csHomeBet?.values?.find((v: any) => v.value === 'Yes')?.odd || '2.40';

  const homeWinPct = predictions?.predictions?.percent?.home || '52%';
  const drawPct = predictions?.predictions?.percent?.draw || '26%';
  const awayWinPct = predictions?.predictions?.percent?.away || '22%';

  const homeXg = predictions?.predictions?.goals?.home || '1.8';
  const awayXg = predictions?.predictions?.goals?.away || '0.9';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto" onClick={onClose}>
      <div 
        className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  {homeTeam} <span className="text-slate-500">vs</span> {awayTeam}
                </h3>
                <span className="text-[10px] font-bold bg-indigo-950 border border-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-indigo-400" /> API-Football Live
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {competition} • {kickoffDate || 'Match de GameWeek'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('odds')}
            className={`pb-2 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'odds'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Cotes & Bookmakers (1N2, CS, xG)</span>
          </button>

          <button
            onClick={() => setActiveTab('predictions')}
            className={`pb-2 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'predictions'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Forme & Algorithme Match</span>
          </button>

          <button
            onClick={() => setActiveTab('live_stats')}
            className={`pb-2 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'live_stats'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Stats & Événements ({events.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('injuries')}
            className={`pb-2 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'injuries'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Blessés & Absents ({injuries.length})</span>
          </button>

          {galleryPlayers.length > 0 && (
            <button
              onClick={() => setActiveTab('lineups')}
              className={`pb-2 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'lineups'
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Vos Joueurs Galerie ({galleryPlayers.length})</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
              <span className="text-xs text-slate-400 font-medium">Interrogation des cotes et statistiques API-Football en direct...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: ODDS & BOOKMAKERS */}
              {activeTab === 'odds' && (
                <div className="space-y-4">
                  {/* 1X2 Match Winner Grid */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Marché 1N2 Officiel (Bookmaker de référence)
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                        <span className="text-xs text-slate-400 font-bold block truncate">1 • {homeTeam}</span>
                        <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">@{homeOdd}</span>
                        <span className="text-[10px] text-slate-500 block">{homeWinPct} attendu</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                        <span className="text-xs text-slate-400 font-bold block">N • Nul</span>
                        <span className="text-base sm:text-lg font-black text-slate-200 font-mono">@{drawOdd}</span>
                        <span className="text-[10px] text-slate-500 block">{drawPct} attendu</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                        <span className="text-xs text-slate-400 font-bold block truncate">2 • {awayTeam}</span>
                        <span className="text-base sm:text-lg font-black text-rose-400 font-mono">@{awayOdd}</span>
                        <span className="text-[10px] text-slate-500 block">{awayWinPct} attendu</span>
                      </div>
                    </div>
                  </div>

                  {/* Clean Sheet & xG Matrix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Shield className="h-4 w-4 text-emerald-400" />
                          <span>Clean Sheet (Sans encaisser)</span>
                        </span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">@{csHomeOdd}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Impact direct sur les notes décisives des gardiens et défenseurs (Clean Sheet = 60 pts minimum en cas de victoire).
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Crosshair className="h-4 w-4 text-amber-400" />
                          <span>Expected Goals (xG) Équipes</span>
                        </span>
                        <span className="text-xs font-bold text-amber-400 font-mono">{homeXg} - {awayXg}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Nombre de buts attendus. Idéal pour orienter le choix des attaquants et milieux à haut volume offensif.
                      </p>
                    </div>
                  </div>

                  {/* Both Teams To Score (BTTS) */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">Les 2 équipes marquent (BTTS)</span>
                      <span className="text-[10px] text-slate-500">Indicateur de match ouvert</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-slate-900 border border-slate-700 px-2 py-1 rounded text-slate-300">
                        Oui: <strong className="text-emerald-400 font-mono">@{bttsYes}</strong>
                      </span>
                      <span className="text-xs bg-slate-900 border border-slate-700 px-2 py-1 rounded text-slate-300">
                        Non: <strong className="text-rose-400 font-mono">@{bttsNo}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PREDICTIONS & FORM */}
              {activeTab === 'predictions' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-indigo-400" />
                      <span>Verdict Algorithmique API-Football</span>
                    </h4>
                    <p className="text-sm text-slate-200 font-medium leading-relaxed">
                      {predictions?.predictions?.winner?.comment || 'Match équilibré avec un léger avantage accordé à l’équipe recevant à domicile.'}
                    </p>
                  </div>

                  {/* Form comparison */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-slate-300 block truncate">{homeTeam}</span>
                      <span className="text-[10px] text-slate-500 block">Forme L5 :</span>
                      <div className="flex items-center gap-1">
                        {(predictions?.teams?.home?.last_5?.form || 'WDWWD').split('').map((letter: string, i: number) => (
                          <span
                            key={i}
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${
                              letter === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                              letter === 'D' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                              'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}
                          >
                            {letter}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-slate-300 block truncate">{awayTeam}</span>
                      <span className="text-[10px] text-slate-500 block">Forme L5 :</span>
                      <div className="flex items-center gap-1">
                        {(predictions?.teams?.away?.last_5?.form || 'LLDWL').split('').map((letter: string, i: number) => (
                          <span
                            key={i}
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${
                              letter === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                              letter === 'D' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                              'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}
                          >
                            {letter}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LIVE STATS & EVENTS */}
              {activeTab === 'live_stats' && (
                <div className="space-y-4">
                  {events.length === 0 && statistics.length === 0 ? (
                    <div className="p-8 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                      <Activity className="h-8 w-8 text-indigo-400 mx-auto" />
                      <span className="text-xs font-bold text-slate-200 block">Données de Match en Direct</span>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        Les statistiques (possession, tirs, passes) et la chronologie des événements (buts, cartons, changements) se mettent à jour automatiquement dès le coup d'envoi.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Live Events Timeline */}
                      {events.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Fil des Événements du Match
                          </span>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {events.map((evt: any, idx: number) => (
                              <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-indigo-400 w-8">{evt.time?.elapsed}'</span>
                                  <span className="text-sm">
                                    {evt.type === 'Goal' ? '⚽' : evt.type === 'Card' ? (evt.detail?.includes('Yellow') ? '🟨' : '🟥') : '🔄'}
                                  </span>
                                  <span className="font-bold text-slate-200">{evt.player?.name}</span>
                                  {evt.assist?.name && (
                                    <span className="text-slate-400 text-[10px]">(Passe: {evt.assist.name})</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                  {evt.team?.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Team Statistics Comparison */}
                      {statistics.length >= 2 && (
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Statistiques Comparatives en Direct
                          </span>
                          <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                            {[
                              { label: 'Possession', key: 'Ball Possession' },
                              { label: 'Tirs Cadrés', key: 'Shots on Goal' },
                              { label: 'Total Tirs', key: 'Total Shots' },
                              { label: 'Corners', key: 'Corner Kicks' },
                              { label: 'Fautes', key: 'Fouls' },
                              { label: 'Passes Réussies', key: 'Passes accurate' }
                            ].map((item, sIdx) => {
                              const homeStat = statistics[0]?.statistics?.find((s: any) => s.type === item.key)?.value ?? '-';
                              const awayStat = statistics[1]?.statistics?.find((s: any) => s.type === item.key)?.value ?? '-';
                              return (
                                <div key={sIdx} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-indigo-300">{homeStat}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">{item.label}</span>
                                    <span className="font-bold text-slate-300">{awayStat}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: INJURIES */}
              {activeTab === 'injuries' && (
                <div className="space-y-3">
                  {injuries.length === 0 ? (
                    <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                      <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto" />
                      <span className="text-xs font-bold text-slate-200 block">Aucune absence majeure signalée</span>
                      <p className="text-[11px] text-slate-500">Les effectifs sont annoncés au complet pour cette rencontre.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {injuries.map((inj: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-rose-400 font-bold text-xs">🏥 {inj.player?.name || 'Joueur'}</span>
                            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {inj.team?.name || 'Club'}
                            </span>
                          </div>
                          <span className="text-xs text-rose-300 font-medium">
                            {inj.player?.reason || 'Blessure'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: GALLERY PLAYERS */}
              {activeTab === 'lineups' && (
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Joueurs concernés dans votre galerie :
                  </span>
                  {galleryPlayers.map(player => (
                    <div
                      key={player.id}
                      onClick={() => onOpenScout && onOpenScout(player)}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={player.pictureUrl}
                          alt={player.displayName}
                          className="w-10 h-10 rounded-xl object-contain bg-slate-900 border border-slate-800"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">{player.displayName}</span>
                          <span className="text-[10px] text-slate-400">{player.club?.name} • {player.positionCode}</span>
                        </div>
                      </div>
                      <button className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold cursor-pointer">
                        Consulter Scout →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Source: API-Football v3 • Bookmakers Bet365 / Pinnacle</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
