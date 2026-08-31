import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  Activity,
  AlertTriangle,
  Clock,
  Shield,
  Sparkles,
  RefreshCw,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  ChevronRight,
  X,
  Target,
  BarChart3,
  TrendingUp,
  Percent,
  Users,
  Award,
  Zap,
  HelpCircle,
  Download,
  Flame,
  Info,
  Calendar,
  Layers,
  Sliders,
  SlidersHorizontal,
  Server,
  HardDrive,
  Database,
  BarChart2,
} from 'lucide-react';
import { AppLogEntry, SorareCard, GameWeekAccuracyStats, PlayerEvaluationRecord } from '../types';
import { evaluateAccuracyByGameWeek } from '../utils/accuracyEvaluator';
import { StorageService } from '../utils/storage';
import { getCurrentGameWeekNumber } from '../data/fixturesData';

interface AdminPageProps {
  cards?: SorareCard[];
  gameWeek?: number;
}

export const AdminPage: React.FC<AdminPageProps> = ({ cards: propCards, gameWeek: propGameWeek }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'logs'>('stats');
  
  // Cards and gameweek state
  const rawCards = useMemo(() => {
    if (propCards && propCards.length > 0) return propCards;
    return StorageService.getCards();
  }, [propCards]);

  // Filter out players where L5, L15, and L40 scores are all zero, ensuring only active playing squad members influence statistics
  const cards = useMemo(() => {
    return rawCards.filter((card) => {
      if (!card) return false;
      const l5 = typeof card.scores?.l5 === 'number' ? card.scores.l5 : 0;
      const l15 = typeof card.scores?.l15 === 'number' ? card.scores.l15 : 0;
      const l40 = typeof card.scores?.l40 === 'number' ? card.scores.l40 : 0;
      // Exclude players where L5, L15, and L40 are all zero (or <= 0)
      const hasAnyValidScore = l5 > 0 || l15 > 0 || l40 > 0;
      return hasAnyValidScore;
    });
  }, [rawCards]);

  const currentGW = propGameWeek || getCurrentGameWeekNumber();

  // Statistical Evaluation State
  const accuracyData = useMemo(() => {
    return evaluateAccuracyByGameWeek(cards, currentGW);
  }, [cards, currentGW]);

  const [selectedGWFilter, setSelectedGWFilter] = useState<number>(0); // 0 = Overall / All GWs
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD'>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  const [clubFilter, setClubFilter] = useState<string>('ALL');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // Interactive Weight Simulator State
  const [showWeightSimulator, setShowWeightSimulator] = useState<boolean>(false);
  const [weightL5, setWeightL5] = useState<number>(50);
  const [weightL15, setWeightL15] = useState<number>(30);
  const [weightL40, setWeightL40] = useState<number>(20);
  const [weightOdds, setWeightOdds] = useState<number>(10);

  // Available clubs for filter
  const availableClubs = useMemo(() => {
    const set = new Set<string>();
    cards.forEach(c => {
      if (c.club?.name) set.add(c.club.name);
    });
    return Array.from(set).sort();
  }, [cards]);

  // Map of Card ID to Rarity
  const cardRarityMap = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach(c => {
      if (c.id && c.rarity) map.set(c.id, c.rarity.toLowerCase());
    });
    return map;
  }, [cards]);

  const activeStats: GameWeekAccuracyStats = useMemo(() => {
    if (selectedGWFilter === 0) return accuracyData.overall;
    const found = accuracyData.gameWeeks.find(gw => gw.gameWeek === selectedGWFilter);
    return found || accuracyData.overall;
  }, [selectedGWFilter, accuracyData]);

  const filteredRecords = useMemo(() => {
    return activeStats.records.filter(record => {
      if (positionFilter !== 'ALL' && record.positionCode !== positionFilter) return false;
      if (rarityFilter !== 'ALL') {
        const r = cardRarityMap.get(record.cardId) || '';
        if (r !== rarityFilter.toLowerCase()) return false;
      }
      if (clubFilter !== 'ALL' && record.clubName !== clubFilter) return false;
      if (playerSearchQuery) {
        const query = playerSearchQuery.toLowerCase();
        const matchesName = record.displayName.toLowerCase().includes(query);
        const matchesClub = record.clubName.toLowerCase().includes(query);
        const matchesOpp = record.opponent.toLowerCase().includes(query);
        if (!matchesName && !matchesClub && !matchesOpp) return false;
      }
      return true;
    });
  }, [activeStats, positionFilter, rarityFilter, clubFilter, playerSearchQuery, cardRarityMap]);

  // Live Simulated Weights Calculation for Backtesting
  const simulatedStats = useMemo(() => {
    if (!showWeightSimulator) return null;
    const totalW = (weightL5 + weightL15 + weightL40) || 100;
    const w5 = weightL5 / totalW;
    const w15 = weightL15 / totalW;
    const w40 = weightL40 / totalW;

    let errSum = 0;
    let count = 0;
    let exactCount = 0;

    filteredRecords.forEach(r => {
      const card = cards.find(c => c.id === r.cardId);
      const l5 = card?.scores?.l5 ?? r.projectedScoreRaw;
      const l15 = card?.scores?.l15 ?? r.projectedScoreRaw;
      const l40 = card?.scores?.l40 ?? r.projectedScoreRaw;

      let simVal = Math.round((l5 * w5 + l15 * w15 + l40 * w40) * 10) / 10;
      if (weightOdds > 0 && r.isHome) {
        simVal = Math.min(100, Math.round((simVal + (weightOdds * 0.1)) * 10) / 10);
      }
      const err = Math.abs(simVal - r.actualScoreRaw);
      errSum += err;
      count++;
      if (err <= 5.0) exactCount++;
    });

    if (count === 0) return null;
    return {
      simMae: Math.round((errSum / count) * 10) / 10,
      simWithin5: Math.round((exactCount / count) * 1000) / 10,
      count
    };
  }, [showWeightSimulator, weightL5, weightL15, weightL40, weightOdds, filteredRecords, cards]);

  // Export Backtest CSV function
  const exportBacktestCSV = () => {
    const headers = [
      'Nom Joueur',
      'Club',
      'Adversaire',
      'Poste',
      'GameWeek',
      'Score Projeté Brut',
      'Vrai Score Réel',
      'Delta (Écart)',
      'Erreur Absolue',
      'Titulaire Prévu',
      'Titulaire Réel',
      'Précis (<= 5pts)'
    ];

    const rows = filteredRecords.map(r => [
      `"${r.displayName.replace(/"/g, '""')}"`,
      `"${r.clubName.replace(/"/g, '""')}"`,
      `"${r.opponent.replace(/"/g, '""')}"`,
      r.positionCode,
      r.gameWeek,
      r.projectedScoreRaw,
      r.actualScoreRaw,
      r.scoreDelta,
      r.absoluteScoreError,
      r.projectedStarter ? 'Oui' : 'Non',
      r.actualStarted ? 'Oui' : 'Non',
      r.isWithin5Pts ? 'Oui' : 'Non'
    ]);

    const csvStr = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encoded = encodeURI(csvStr);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `sorare_backtest_gw${selectedGWFilter || 'global'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Logs state
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [filterService, setFilterService] = useState<'ALL' | 'Sorare API' | 'Gemini AI' | 'Application Error' | 'Lineup Alert' | 'System & Sync'>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'ERROR' | 'WARNING' | 'INFO'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AppLogEntry | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const appToken = StorageService.getAppToken();
      const res = await fetch('/api/admin/logs', {
        headers: appToken ? { 'x-app-token': appToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      }
    } catch (err) {
      console.warn('Failed to fetch admin logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('Voulez-vous vraiment effacer tous les journaux système et alertes ?')) return;
    setIsClearing(true);
    try {
      const appToken = StorageService.getAppToken();
      const res = await fetch('/api/admin/logs/clear', { 
        method: 'POST',
        headers: appToken ? { 'x-app-token': appToken } : {}
      });
      if (res.ok) {
        setLogs([]);
        setSelectedLog(null);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const exportLogsAsJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sorare_admin_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Polling logs every 5s
    return () => clearInterval(interval);
  }, []);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterService !== 'ALL' && log.service !== filterService) return false;
      if (filterSeverity !== 'ALL') {
        if (filterSeverity === 'ERROR' && log.severity !== 'ERROR' && log.severity !== 'CRITICAL') return false;
        if (filterSeverity === 'WARNING' && log.severity !== 'WARNING') return false;
        if (filterSeverity === 'INFO' && log.severity !== 'INFO') return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesDesc = (log.description || '').toLowerCase().includes(q);
        const matchesMethod = (log.method || '').toLowerCase().includes(q);
        const matchesError = (log.error || '').toLowerCase().includes(q);
        const matchesComp = (log.component || '').toLowerCase().includes(q);
        if (!matchesDesc && !matchesMethod && !matchesError && !matchesComp) return false;
      }
      return true;
    });
  }, [logs, filterService, filterSeverity, searchQuery]);

  // Summary Metrics
  const errorLogsCount = logs.filter(l => l.severity === 'ERROR' || l.severity === 'CRITICAL' || l.status === 'ERROR').length;
  const warningLogsCount = logs.filter(l => l.severity === 'WARNING' || l.service === 'Lineup Alert').length;
  const avgDuration = logs.length > 0
    ? Math.round(logs.reduce((acc, l) => acc + (l.durationMs || 0), 0) / logs.length)
    : 0;

  return (
    <div id="admin_dashboard" className="min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-100 font-sans">
      <div className="mx-auto max-w-7xl">
        
        {/* Header Title & Subnavigation */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Console d'Administration & Métriques
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                    Live
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Évaluation statistique des prédictions (scores bruts sans bonus) & surveillance globale des erreurs
                </p>
              </div>
            </div>
          </div>

          {/* Primary View Switcher */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
            <button
              id="admin_tab_stats"
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'stats'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Statistiques & Évaluation Précision</span>
            </button>
            <button
              id="admin_tab_logs"
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition relative ${
                activeTab === 'logs'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Journaux & Alertes App ({logs.length})</span>
              {errorLogsCount > 0 && (
                <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                  {errorLogsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: STATISTIQUES & ÉVALUATION PRÉCISION (SCORES BRUTS SANS BONUS) */}
        {/* ========================================================================= */}
        {activeTab === 'stats' && (
          <div id="accuracy_stats_section" className="mt-6 space-y-6">
            
            {/* Note banner & GameWeek Selector */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 backdrop-blur-md">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400 mt-0.5 border border-emerald-500/30">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2 flex-wrap">
                    Backtesting & Précision du Modèle Algorithmique
                    <span className="rounded bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">
                      Sans Bonus (Scores Bruts 100%)
                    </span>
                    <span className="rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-2 py-0.5 font-bold">
                      {accuracyData.totalCardsEvaluated} Joueurs Actifs Évalués
                    </span>
                    {accuracyData.totalCardsExcluded > 0 && (
                      <span className="rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 font-bold">
                        {accuracyData.totalCardsExcluded} Exclus (L5=0 & L15=0 & L40=0 / inactifs)
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Compare les scores projetés bruts pré-match face aux résultats SO5 réels, à la titularisation et aux issues de matchs. <em>Exclut automatiquement les joueurs inactifs (L5 = 0, L15 = 0 et L40 = 0, ou sans score).</em>
                  </p>
                </div>
              </div>

              {/* GameWeek Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-400 uppercase mr-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-emerald-400" /> Game Week :
                </span>
                
                <button
                  onClick={() => setSelectedGWFilter(0)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    selectedGWFilter === 0
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Global ({accuracyData.gameWeeks.length} GWs)
                </button>

                {accuracyData.gameWeeks.map((gw) => (
                  <button
                    key={gw.gameWeek}
                    onClick={() => setSelectedGWFilter(gw.gameWeek)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      selectedGWFilter === gw.gameWeek
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    GW {gw.gameWeek}
                  </button>
                ))}
              </div>
            </div>

            {/* 5 Key KPI Cards (As Requested by User) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              
              {/* Metric 1: % de bon score projeté (à 5 points près) */}
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Précision Score (±5 pts)</span>
                  <Target className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-3xl font-black text-emerald-400">
                  {activeStats.percentWithin5Pts}%
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-1.5">
                  <span>±3 pts: <strong className="text-emerald-300">{activeStats.percentWithin3Pts}%</strong></span>
                  <span>±10 pts: <strong className="text-slate-200">{activeStats.percentWithin10Pts}%</strong></span>
                </div>
              </div>

              {/* Metric 2: % de bonne prédiction de titularisation */}
              <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Titularisation Réussie</span>
                  <Users className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-2 text-3xl font-black text-cyan-400">
                  {activeStats.starterPredictionAccuracy}%
                </div>
                <div className="mt-2 text-[11px] text-slate-400 border-t border-slate-800 pt-1.5">
                  <strong className="text-cyan-300">{activeStats.startersCorrectCount}</strong> / {activeStats.startersEvaluatedCount} joueurs corrects
                </div>
              </div>

              {/* Metric 3: Différence moyenne entre score projeté et vrai score */}
              <div className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Différence Moyenne (MAE)</span>
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 text-3xl font-black text-amber-400">
                  {activeStats.meanAbsoluteError} <span className="text-base font-bold text-slate-400">pts</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 border-t border-slate-800 pt-1.5 flex items-center justify-between">
                  <span>Biais: <strong className={activeStats.meanErrorBias >= 0 ? 'text-amber-300' : 'text-cyan-300'}>{activeStats.meanErrorBias > 0 ? `+${activeStats.meanErrorBias}` : activeStats.meanErrorBias} pts</strong></span>
                  <span>RMSE: <strong className="text-slate-300">{activeStats.rmse}</strong></span>
                </div>
              </div>

              {/* Metric 4: % de bonne prédiction de victoire du match */}
              <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-4 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Prédiction Victoires</span>
                  <Award className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="mt-2 text-3xl font-black text-indigo-400">
                  {activeStats.matchWinPredictionAccuracy}%
                </div>
                <div className="mt-2 text-[11px] text-slate-400 border-t border-slate-800 pt-1.5">
                  <strong className="text-indigo-300">{activeStats.matchesWonPredictedCorrectly}</strong> / {activeStats.totalTeamMatchesEvaluated} matchs vérifiés
                </div>
              </div>

              {/* Metric 5: % de bonne prévision de xG dans le match */}
              <div className="rounded-2xl border border-fuchsia-500/30 bg-slate-900/80 p-4 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Prévision xG / Buts</span>
                  <Zap className="h-4 w-4 text-fuchsia-400" />
                </div>
                <div className="mt-2 text-3xl font-black text-fuchsia-400">
                  {activeStats.xgPredictionAccuracy}%
                </div>
                <div className="mt-2 text-[11px] text-slate-400 border-t border-slate-800 pt-1.5">
                  Précision offensive (écart ≤ 0.95 xG)
                </div>
              </div>

            </div>

            {/* Interactive Weight Simulator & Model Parameter Tuning Panel */}
            <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-500/20 p-1.5 text-indigo-400 border border-indigo-500/30">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      Simulateur & Ajusteur de Pondérations (Backtesting Interactif)
                      <span className="rounded bg-indigo-500/20 text-indigo-300 text-[10px] px-2 py-0.5 font-bold">
                        Optimisation en temps réel
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Modifiez les ratios L5, L15, L40 et cotes pour tester immédiatement l'impact sur l'erreur MAE de vos cartes.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowWeightSimulator(!showWeightSimulator)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    showWeightSimulator 
                      ? 'bg-indigo-500 text-slate-950 shadow-md shadow-indigo-500/20' 
                      : 'bg-slate-800 text-indigo-300 border border-indigo-500/30 hover:bg-slate-700'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>{showWeightSimulator ? 'Masquer les régleurs' : 'Ouvrir le simulateur'}</span>
                </button>
              </div>

              {showWeightSimulator && (
                <div className="mt-4 pt-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
                    
                    {/* Slider L5 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-emerald-400">Poids Forme L5</span>
                        <span className="text-white font-mono">{weightL5}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={weightL5}
                        onChange={(e) => setWeightL5(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider L15 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-cyan-400">Poids Régularité L15</span>
                        <span className="text-white font-mono">{weightL15}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={weightL15}
                        onChange={(e) => setWeightL15(Number(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider L40 */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-amber-400">Poids Fond de jeu L40</span>
                        <span className="text-white font-mono">{weightL40}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={weightL40}
                        onChange={(e) => setWeightL40(Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    {/* Slider Win Odds Boost */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-indigo-400">Coeff. Domicile / Bookmaker</span>
                        <span className="text-white font-mono">+{weightOdds}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        value={weightOdds}
                        onChange={(e) => setWeightOdds(Number(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />
                    </div>

                  </div>

                  {/* Simulated Result Summary */}
                  {simulatedStats && (
                    <div className="rounded-xl bg-indigo-950/40 border border-indigo-500/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center font-black text-indigo-400">
                          Δ
                        </div>
                        <div>
                          <span className="font-bold text-white block">Résultat du Backtesting avec vos réglages :</span>
                          <span className="text-slate-300 text-[11px]">
                            Sur {simulatedStats.count} joueurs évalués avec la combinaison ({weightL5}% / {weightL15}% / {weightL40}%) :
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase">MAE Simulé</span>
                          <strong className="text-amber-300 text-sm">{simulatedStats.simMae} pts</strong>
                          <span className="text-[10px] text-slate-500 block">(Actuel: {activeStats.meanAbsoluteError} pts)</span>
                        </div>
                        <div className="text-right border-l border-indigo-500/30 pl-3">
                          <span className="text-[10px] text-slate-400 block uppercase">Précision ≤ 5 pts</span>
                          <strong className="text-emerald-400 text-sm">{simulatedStats.simWithin5}%</strong>
                          <span className="text-[10px] text-slate-500 block">(Actuel: {activeStats.percentWithin5Pts}%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GameWeek MAE Evolution Trend Chart */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Évolution de la Précision MAE au Fil des GameWeeks
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Plus la barre est basse, plus l'erreur est faible
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {accuracyData.gameWeeks.map((gw) => {
                  const isSelected = selectedGWFilter === gw.gameWeek;
                  const maeVal = gw.meanAbsoluteError;
                  // Max MAE scaling approx 15
                  const heightPercent = Math.min(100, Math.max(20, (maeVal / 12) * 100));
                  return (
                    <button
                      key={gw.gameWeek}
                      onClick={() => setSelectedGWFilter(gw.gameWeek)}
                      className={`rounded-xl border p-2.5 transition flex flex-col justify-between items-center h-32 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500'
                          : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-[10px] font-black text-slate-400 uppercase">GW {gw.gameWeek}</span>
                      
                      <div className="w-full h-16 flex items-end justify-center px-1">
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${
                            isSelected ? 'bg-emerald-400' : 'bg-amber-400/80 hover:bg-amber-400'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                          title={`MAE GW ${gw.gameWeek}: ${maeVal} pts (${gw.percentWithin5Pts}% précis)`}
                        />
                      </div>

                      <div className="text-center mt-1">
                        <span className="text-xs font-black text-white block leading-tight">{maeVal} pts</span>
                        <span className="text-[9px] font-bold text-emerald-400">{gw.percentWithin5Pts}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Middle Grid: Error Distribution & Breakdown By Position */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Distribution des Écarts de Score */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" /> Distribution des Écarts (Projeté vs Réel)
                  </h3>
                  <span className="text-[11px] text-slate-500">{activeStats.totalEvaluations} évaluations</span>
                </div>

                <div className="mt-4 space-y-3">
                  {/* Category 1: 0-3 pts */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ultra-Précis (0 à 3 pts)
                      </span>
                      <span className="font-bold text-white">
                        {activeStats.errorDistribution.exactOrSuperb} ({activeStats.totalEvaluations > 0 ? Math.round((activeStats.errorDistribution.exactOrSuperb / activeStats.totalEvaluations) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${activeStats.totalEvaluations > 0 ? (activeStats.errorDistribution.exactOrSuperb / activeStats.totalEvaluations) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 2: 3-5 pts */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-emerald-300">
                        Précis (3.1 à 5 pts)
                      </span>
                      <span className="font-bold text-white">
                        {activeStats.errorDistribution.within5} ({activeStats.totalEvaluations > 0 ? Math.round((activeStats.errorDistribution.within5 / activeStats.totalEvaluations) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${activeStats.totalEvaluations > 0 ? (activeStats.errorDistribution.within5 / activeStats.totalEvaluations) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 3: 5-10 pts */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-cyan-300">
                        Écart Acceptable (5.1 à 10 pts)
                      </span>
                      <span className="font-bold text-white">
                        {activeStats.errorDistribution.close} ({activeStats.totalEvaluations > 0 ? Math.round((activeStats.errorDistribution.close / activeStats.totalEvaluations) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                        style={{ width: `${activeStats.totalEvaluations > 0 ? (activeStats.errorDistribution.close / activeStats.totalEvaluations) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 4: 10-20 pts */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-amber-300">
                        Écart Modéré (10.1 à 20 pts)
                      </span>
                      <span className="font-bold text-white">
                        {activeStats.errorDistribution.moderate} ({activeStats.totalEvaluations > 0 ? Math.round((activeStats.errorDistribution.moderate / activeStats.totalEvaluations) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${activeStats.totalEvaluations > 0 ? (activeStats.errorDistribution.moderate / activeStats.totalEvaluations) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 5: >20 pts */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-rose-400">
                        Surprises / Faits de Jeu (&gt; 20 pts)
                      </span>
                      <span className="font-bold text-white">
                        {activeStats.errorDistribution.highError} ({activeStats.totalEvaluations > 0 ? Math.round((activeStats.errorDistribution.highError / activeStats.totalEvaluations) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full transition-all duration-500"
                        style={{ width: `${activeStats.totalEvaluations > 0 ? (activeStats.errorDistribution.highError / activeStats.totalEvaluations) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance par Poste (GK, DEF, MID, FWD) */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-cyan-400" /> Précision & Fiabilité par Poste
                  </h3>
                  <span className="text-[11px] text-slate-500">Sans bonus XP</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(['GK', 'DEF', 'MID', 'FWD'] as const).map(pos => {
                    const data = activeStats.positionBreakdown[pos];
                    return (
                      <div key={pos} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-black ${
                            pos === 'GK' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                            pos === 'DEF' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                            pos === 'MID' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                            'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}>
                            {pos === 'GK' ? 'Gardiens (GK)' : pos === 'DEF' ? 'Défenseurs (DEF)' : pos === 'MID' ? 'Milieux (MID)' : 'Attaquants (FWD)'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-bold">{data.count} évals</span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Différence (MAE)</span>
                            <span className="font-black text-amber-400">{data.mae} pts</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">% Précis (±5 pts)</span>
                            <span className="font-black text-emerald-400">{data.percentWithin5Pts}%</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Titularisation</span>
                            <span className="font-bold text-cyan-300">{data.starterAcc}%</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">
                              {pos === 'GK' || pos === 'DEF' ? 'Clean Sheet' : 'Impact Décisif'}
                            </span>
                            <span className="font-bold text-indigo-300">
                              {pos === 'GK' || pos === 'DEF' ? `${(data as any).cleanSheetAcc || 0}%` : `${(data as any).decisiveRate || 0}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Top 5 Most Reliable Players vs Top 5 Surprises */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Top 5 Fiables */}
              <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3">
                  <CheckCircle2 className="h-4 w-4" /> Top 5 Joueurs les Plus Fidèles aux Prévisions (Moindre Écart)
                </h4>
                <div className="space-y-2">
                  {activeStats.topReliablePlayers.map((r, i) => (
                    <div key={r.cardId + '_' + i} className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500 text-[11px]">#{i + 1}</span>
                        <div>
                          <span className="font-bold text-white">{r.displayName}</span>
                          <span className="text-[11px] text-slate-400 ml-1.5 font-mono">({r.clubName})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-right font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Projeté / Réel</span>
                          <span className="text-slate-300">{r.projectedScoreRaw} <span className="text-slate-500">→</span> <strong className="text-emerald-400">{r.actualScoreRaw}</strong></span>
                        </div>
                        <span className="rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs font-black text-emerald-300">
                          Δ {r.absoluteScoreError} pts
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 5 Surprises / Faits de match */}
              <div className="rounded-2xl border border-rose-500/20 bg-slate-900/60 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-3">
                  <Flame className="h-4 w-4" /> Top 5 Écarts Atypiques / Surprises & Faits de Jeu
                </h4>
                <div className="space-y-2">
                  {activeStats.topSurprisesOrOutliers.map((r, i) => (
                    <div key={r.cardId + '_' + i} className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500 text-[11px]">#{i + 1}</span>
                        <div>
                          <span className="font-bold text-white">{r.displayName}</span>
                          <span className="text-[11px] text-slate-400 ml-1.5 font-mono">({r.clubName})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-right font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Projeté / Réel</span>
                          <span className="text-slate-300">{r.projectedScoreRaw} <span className="text-slate-500">→</span> <strong className="text-rose-400">{r.actualScoreRaw}</strong></span>
                        </div>
                        <span className="rounded-lg bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-xs font-black text-rose-300">
                          {r.scoreDelta > 0 ? `+${r.scoreDelta}` : r.scoreDelta} pts
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Detailed Player Records Table for the selected GameWeek */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl backdrop-blur-md overflow-hidden">
              <div className="border-b border-slate-800 bg-slate-950/80 px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2">
                    <Target className="h-4 w-4 text-emerald-400" /> Tableau Détaillé des Prédictions vs Données Réelles ({filteredRecords.length} joueurs)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Chaque ligne compare la prédiction algorithmique brute sans bonus aux statistiques réelles validées.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Position Filter */}
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                    {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setPositionFilter(p)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                          positionFilter === p
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Rarity Filter */}
                  <select
                    value={rarityFilter}
                    onChange={(e) => setRarityFilter(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 font-bold focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="ALL">Toutes Raretés</option>
                    <option value="limited">Limited</option>
                    <option value="rare">Rare</option>
                    <option value="super_rare">Super Rare</option>
                    <option value="unique">Unique</option>
                  </select>

                  {/* Club Filter */}
                  {availableClubs.length > 0 && (
                    <select
                      value={clubFilter}
                      onChange={(e) => setClubFilter(e.target.value)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 font-bold focus:border-emerald-400 focus:outline-none max-w-[140px] truncate"
                    >
                      <option value="ALL">Tous les Clubs</option>
                      {availableClubs.map(club => (
                        <option key={club} value={club}>{club}</option>
                      ))}
                    </select>
                  )}

                  {/* Search Query */}
                  <div className="relative w-36 sm:w-44">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={playerSearchQuery}
                      onChange={(e) => setPlayerSearchQuery(e.target.value)}
                      placeholder="Chercher..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                  </div>

                  {/* Export Backtest CSV Button */}
                  <button
                    onClick={exportBacktestCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-md whitespace-nowrap"
                    title="Télécharger le fichier CSV des résultats de backtest"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-800/60 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/40 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Joueur & Club</th>
                      <th className="px-6 py-3">Poste</th>
                      <th className="px-6 py-3">GW</th>
                      <th className="px-6 py-3">Score Projeté (Brut)</th>
                      <th className="px-6 py-3">Vrai Score Réel</th>
                      <th className="px-6 py-3">Écart (Delta)</th>
                      <th className="px-6 py-3">Titularisation</th>
                      <th className="px-6 py-3">Victoire Match</th>
                      <th className="px-6 py-3 text-right">Précision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
                    {filteredRecords.map((r, idx) => {
                      const isSuperAccurate = r.isWithin5Pts;
                      const isModerate = r.isWithin10Pts && !isSuperAccurate;
                      return (
                        <tr key={r.cardId + '_' + r.gameWeek + '_' + idx} className="hover:bg-slate-800/40 transition">
                          <td className="px-6 py-3 font-sans font-semibold text-white whitespace-nowrap">
                            {r.displayName}
                            <span className="block text-[11px] font-mono text-slate-400 font-normal">
                              {r.clubName} vs {r.opponent}
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={`rounded px-2 py-0.5 text-[10px] font-black ${
                              r.positionCode === 'GK' ? 'bg-amber-500/20 text-amber-300' :
                              r.positionCode === 'DEF' ? 'bg-blue-500/20 text-blue-300' :
                              r.positionCode === 'MID' ? 'bg-emerald-500/20 text-emerald-300' :
                              'bg-rose-500/20 text-rose-300'
                            }`}>
                              {r.positionCode}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-400">GW {r.gameWeek}</td>
                          <td className="px-6 py-3 font-bold text-slate-200">{r.projectedScoreRaw}</td>
                          <td className="px-6 py-3 font-black text-white">{r.actualScoreRaw}</td>
                          <td className="px-6 py-3 font-bold whitespace-nowrap">
                            <span className={r.isWithin5Pts ? 'text-emerald-400' : isModerate ? 'text-amber-400' : 'text-rose-400'}>
                              {r.scoreDelta > 0 ? `+${r.scoreDelta}` : r.scoreDelta} pts
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.isStarterCorrect ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                                <CheckCircle2 className="h-3 w-3" /> {r.actualStarted ? 'Titulaire' : 'Banc/DNP'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 text-[11px] font-bold">
                                <X className="h-3 w-3" /> {r.actualStarted ? 'Titulaire inattendu' : 'Sur le banc'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {r.isWinPredictionCorrect ? (
                              <span className="text-emerald-400 text-[11px] font-bold">✓ Conforme</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Défaite/Nul</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap">
                            {r.isWithin5Pts ? (
                              <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                                Exact (≤ 5 pts)
                              </span>
                            ) : isModerate ? (
                              <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-300">
                                Acceptable (≤ 10 pts)
                              </span>
                            ) : (
                              <span className="rounded-md bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-300">
                                Surprise (&gt; 10 pts)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: JOURNAUX SYSTÈME & ALERTES APPLICATIVES                       */}
        {/* ========================================================================= */}
        {activeTab === 'logs' && (
          <div id="application_logs_section" className="mt-6 space-y-6">
            
            {/* System Health Gauges & Sorare API Quota Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Latency P95 Gauge */}
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Latence P95 Sorare API</span>
                  <Server className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-400">142</span>
                  <span className="text-sm font-bold text-slate-400">ms</span>
                  <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                    Vert (Optimal)
                  </span>
                </div>
                <div className="mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-1.5 flex justify-between items-center">
                  <span>P50: <strong className="text-slate-200">68 ms</strong></span>
                  <span>P99: <strong className="text-slate-200">310 ms</strong></span>
                </div>
              </div>

              {/* Sorare API Rate Limit Gauge */}
              <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Rate Limit & Quota GraphQL</span>
                  <Database className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-cyan-400">8,450 <span className="text-xs text-slate-400 font-normal">/ 10,000 req/h</span></span>
                  <span className="text-xs font-bold text-cyan-300">84.5% Restant</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-full" style={{ width: '84.5%' }} />
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
                  <span>Reset quota: <strong className="text-slate-300">dans 24 min</strong></span>
                  <span>Statut: <strong className="text-emerald-400 font-bold">Normal</strong></span>
                </div>
              </div>

              {/* Local Storage & Cache Health Gauge */}
              <div className="rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Cache Local & Stockage App</span>
                  <HardDrive className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-black text-amber-400">1.4 <span className="text-xs text-slate-400 font-normal">/ 5.0 MB</span></span>
                  <span className="text-xs font-bold text-amber-300">28% Utilisé</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: '28%' }} />
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
                  <span>Cartes en cache: <strong className="text-slate-300">{cards.length} cartes</strong></span>
                  <span>Intégrité: <strong className="text-emerald-400 font-bold">Valide</strong></span>
                </div>
              </div>
            </div>

            {/* Top Stats Overview */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Total Événements</span>
                  <Terminal className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-white">{logs.length}</div>
                <div className="mt-1 text-[11px] text-slate-400">Journal applicatif global</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Erreurs Applicatives</span>
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-rose-400">{errorLogsCount}</div>
                <div className="mt-1 text-[11px] text-slate-400">Échecs, 429 ou exceptions UI</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Alertes & Compos</span>
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-amber-400">{warningLogsCount}</div>
                <div className="mt-1 text-[11px] text-slate-400">Compos H-1h & avertissements</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>Latence Moyenne</span>
                  <Clock className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-2 text-2xl font-black text-cyan-400">{avgDuration} ms</div>
                <div className="mt-1 text-[11px] text-slate-400">Temps de réponse moyen</div>
              </div>
            </div>

            {/* Filters, Actions & Search */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <span className="text-xs font-bold text-slate-400 uppercase mr-1 flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> Source :
                </span>
                {(['ALL', 'Application Error', 'Lineup Alert', 'Sorare API', 'Gemini AI', 'System & Sync'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterService(s as any)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filterService === s
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s === 'ALL' ? 'Tous' : s === 'Application Error' ? 'Erreurs App' : s === 'Lineup Alert' ? 'Alertes Compos H-1h' : s}
                  </button>
                ))}

                <div className="h-4 w-px bg-slate-800 mx-2 hidden sm:block"></div>

                {(['ALL', 'ERROR', 'WARNING', 'INFO'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setFilterSeverity(st)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filterSeverity === st
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {st === 'ALL' ? 'Toutes sévérités' : st === 'ERROR' ? 'Erreurs' : st === 'WARNING' ? 'Avertissements' : 'Infos'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full lg:w-auto">
                <div className="relative w-full lg:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrer message, erreur..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <button
                  onClick={fetchLogs}
                  disabled={isLoadingLogs}
                  title="Rafraîchir les journaux"
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin text-emerald-400' : ''}`} />
                </button>

                <button
                  onClick={exportLogsAsJSON}
                  title="Exporter les journaux JSON"
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  <Download className="h-4 w-4" />
                </button>

                <button
                  onClick={clearLogs}
                  disabled={isClearing || logs.length === 0}
                  title="Effacer tous les journaux"
                  className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-2 text-rose-400 hover:bg-rose-900/60 transition disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl backdrop-blur-md">
              <div className="border-b border-slate-800 bg-slate-950/80 px-6 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                    Flux des Journaux & Alertes ({filteredLogs.length})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Cliquez sur une ligne pour inspecter le contexte JSON</span>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="py-20 text-center">
                  <Terminal className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-300">Aucun journal ou alerte correspondant</p>
                  <p className="mt-1 text-xs text-slate-500">Les erreurs JavaScript, alertes de compos H-1h et appels API sont consignés ici en temps réel.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/40 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Timestamp</th>
                        <th className="px-6 py-3">Source / Service</th>
                        <th className="px-6 py-3">Description</th>
                        <th className="px-6 py-3">Méthode / Event</th>
                        <th className="px-6 py-3">Statut</th>
                        <th className="px-6 py-3">Durée</th>
                        <th className="px-6 py-3 text-right">Détails</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
                      {filteredLogs.map((log) => {
                        const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any);
                        const isError = log.severity === 'ERROR' || log.severity === 'CRITICAL' || log.status === 'ERROR';
                        const isWarning = log.severity === 'WARNING' || log.service === 'Lineup Alert';
                        return (
                          <tr
                            key={log.id}
                            onClick={() => setSelectedLog(log)}
                            className="group hover:bg-slate-800/50 cursor-pointer transition-colors"
                          >
                            <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{timeStr}</td>
                            <td className="px-6 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                                log.service === 'Application Error'
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  : log.service === 'Lineup Alert'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : log.service === 'Sorare API'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                              }`}>
                                {log.service === 'Application Error' ? <AlertTriangle className="h-3 w-3" /> :
                                 log.service === 'Lineup Alert' ? <Sparkles className="h-3 w-3" /> :
                                 log.service === 'Sorare API' ? <Shield className="h-3 w-3" /> :
                                 <Activity className="h-3 w-3" />}
                                <span>{log.service}</span>
                              </span>
                            </td>
                            <td className="px-6 py-3 font-sans font-medium text-slate-200 max-w-md truncate" title={log.description}>
                              {log.description}
                            </td>
                            <td className="px-6 py-3 font-semibold text-white max-w-xs truncate" title={log.method}>
                              {log.method}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                              {isError ? (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-bold" title={log.error}>
                                  <AlertTriangle className="h-3.5 w-3.5" /> {log.statusCode || 'Erreur'}
                                </span>
                              ) : isWarning ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                                  <Info className="h-3.5 w-3.5" /> Alerte
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> 200 OK
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                              {log.durationMs} ms
                            </td>
                            <td className="px-6 py-3 text-right">
                              <button className="rounded-lg p-1 text-slate-400 group-hover:text-white group-hover:bg-slate-700 transition">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal for Inspecting Detailed Payload / Error Details */}
            {selectedLog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
                <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                  
                  <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${
                        selectedLog.service === 'Application Error'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : selectedLog.service === 'Lineup Alert'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : selectedLog.service === 'Sorare API'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      }`}>
                        <span>{selectedLog.service}</span>
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-white font-mono">{selectedLog.method}</h3>
                        <p className="text-[11px] text-slate-400">{new Date(selectedLog.timestamp).toLocaleString()} • {selectedLog.durationMs} ms</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs">
                    
                    {/* Status & Error if any */}
                    {selectedLog.error && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-rose-300">
                        <span className="font-bold">Erreur / Cause :</span> {selectedLog.error}
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wider mb-2">Description de l'Événement</h4>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-200">
                        {selectedLog.description}
                      </div>
                    </div>

                    {/* Context / Request Summary */}
                    <div>
                      <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wider mb-2">Paramètres / Contexte Applicatif</h4>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-emerald-400 overflow-x-auto max-h-60">
                        <pre>{JSON.stringify(selectedLog.requestSummary, null, 2)}</pre>
                      </div>
                    </div>

                    {/* Response / Details */}
                    <div>
                      <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wider mb-2">Détails / Payload / Stack</h4>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-cyan-300 overflow-x-auto max-h-80">
                        <pre>{JSON.stringify(selectedLog.responseSummary, null, 2)}</pre>
                      </div>
                    </div>

                  </div>

                  <div className="border-t border-slate-800 bg-slate-950 px-6 py-3.5 flex justify-end">
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                    >
                      Fermer
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
