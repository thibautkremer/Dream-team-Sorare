import React, { useState, useEffect, useMemo } from 'react';
import { X, Sparkles, Shield, Trophy, Activity, Target, AlertTriangle, CheckCircle2, TrendingUp, Calendar, Zap, ChevronDown, BarChart3, Percent, HelpCircle, ShieldAlert, Award, UserX, CheckCircle, UserCheck, Clock, CornerDownRight, Send, ShieldCheck, Eye, Users } from 'lucide-react';
import { SorareCard, MatchPerformanceDetail } from '../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, compute40MatchPerformances } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge } from '../utils/sorareSlug';

interface PlayerScoutModalProps {
  card: SorareCard | null;
  onClose: () => void;
  onAssignToSlot?: (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
}

export const PlayerScoutModal: React.FC<PlayerScoutModalProps> = ({ card: initialCard, onClose, onAssignToSlot }) => {
  const [aiReport, setAiReport] = useState<any>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [liveCard, setLiveCard] = useState<SorareCard | null>(null);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState<number>(39);
  const [selectedPeriod, setSelectedPeriod] = useState<5 | 10 | 15 | 40>(40);
  const [statMode, setStatMode] = useState<'total' | 'per90'>('total');

  useEffect(() => {
    if (!initialCard) return;
    setAiReport(null);
    setLiveCard(null);
    setSelectedMatchIndex(39); // Default to the most recent match (40th match)
    fetchScoutReport(initialCard);
    fetchLivePlayerDetails(initialCard);
  }, [initialCard]);

  const fetchLivePlayerDetails = async (playerCard: SorareCard) => {
    try {
      const res = await fetch(`/api/sorare/player-live-detail?slug=${encodeURIComponent(playerCard.slug || playerCard.id)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.card) {
          setLiveCard(json.card);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch live player details automatically', e);
    }
  };

  const card = liveCard || initialCard;

  const fetchScoutReport = async (playerCard: SorareCard) => {
    setIsLoadingAI(true);
    try {
      const res = await fetch('/api/ai/scout-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: playerCard, gameWeek: 48 }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setAiReport(json.data);
          return;
        }
      }
    } catch (e) {
      console.warn('Scout API error, using heuristic report', e);
    } finally {
      setIsLoadingAI(false);
    }

    const isStarter = playerCard.status === 'STARTER';
    setAiReport({
      verdict: isStarter ? (playerCard.scores.l5 > 60 ? 'Aligner absolument' : 'Titulaire solide') : 'Risque de banc',
      confidenceRating: playerCard.starterConfidence,
      floorScore: Math.max(35, Math.round(playerCard.scores.l40 * 0.8)),
      expectedScore: Math.round(calculatePlayerProjectedScore(playerCard).projectedScore),
      ceilingScore: Math.min(100, Math.round(playerCard.scores.l5 * 1.35)),
      matchupAnalysis: `Match face à ${playerCard.upcomingFixture?.opponent || 'Adversaire'}. FDR : ${playerCard.upcomingFixture?.difficultyRating || 2}/5.`,
      starterSecurity: isStarter ? 'Titulaire indiscutable dans le XI de départ.' : 'Temps de jeu incertain.',
      captainSuitability: playerCard.scores.l5 > 68 ? 'Excellente option pour le brassard (+20%)' : 'Préférable en joueur titulaire classique.',
      keyAdvice: playerCard.tacticalNotes || 'Conserver dans la rotation.',
    });
  };

  // 40 detailed match performances
  const matchPerformances = useMemo(() => {
    if (!card) return [];
    return compute40MatchPerformances(card);
  }, [card]);

  const selectedMatch: MatchPerformanceDetail | undefined = matchPerformances[selectedMatchIndex] || matchPerformances[matchPerformances.length - 1];

  // Period Detailed Statistics (L5, L10, L40)
  const periodStats = useMemo(() => {
    if (!card) return null;

    let matchesList: Array<MatchPerformanceDetail> = [];

    if (selectedPeriod === 5) {
      matchesList = matchPerformances.slice(-5);
    } else if (selectedPeriod === 10) {
      matchesList = matchPerformances.slice(-10);
    } else if (selectedPeriod === 15) {
      matchesList = matchPerformances.slice(-15);
    } else {
      matchesList = matchPerformances.slice(-40);
    }

    let s100 = 0, s75_99 = 0, s60_74 = 0, s50_59 = 0, s35_49 = 0, s20_34 = 0, s0_19 = 0, dnp = 0;
    let sumScores = 0;
    let sumAAS = 0;
    let sumDecisive = 0;
    let playedMatchesCount = 0;

    let gamesStarted = 0;
    let totalMinsPlayed = 0;

    let setPiecesTaken = 0;
    let accuratePasses = 0;
    let wonTackles = 0;
    let interceptionsWon = 0;

    let goals = 0;
    let goalAssists = 0;
    let penaltyAssists = 0;
    let lastManTackles = 0;
    let yellowCards = 0;
    let redCards = 0;
    let errorsLeadToGoal = 0;
    let penaltiesConceded = 0;
    let ownGoals = 0;

    matchesList.forEach((m) => {
      const s = m.totalScore;
      if (m.isDNP || s <= 0) {
        dnp++;
      } else {
        playedMatchesCount++;
        sumScores += s;
        sumAAS += m.allAroundScore || 0;
        sumDecisive += m.decisiveScore || 0;

        if (s >= 100) s100++;
        else if (s >= 75) s75_99++;
        else if (s >= 60) s60_74++;
        else if (s >= 50) s50_59++;
        else if (s >= 35) s35_49++;
        else if (s >= 20) s20_34++;
        else s0_19++;

        const mins = m.minutesPlayed || (s >= 35 ? 90 : 45);
        totalMinsPlayed += mins;
        if (mins >= 45) gamesStarted++;

        // 1. Direct real numeric stats accumulation
        let hasDirectStats = false;
        if (m.goals !== undefined) { goals += m.goals; hasDirectStats = true; }
        if (m.goalAssists !== undefined) { goalAssists += m.goalAssists; hasDirectStats = true; }
        if (m.penaltyAssists !== undefined) { penaltyAssists += m.penaltyAssists; hasDirectStats = true; }
        if (m.lastManTackles !== undefined) { lastManTackles += m.lastManTackles; hasDirectStats = true; }
        if (m.yellowCards !== undefined) { yellowCards += m.yellowCards; hasDirectStats = true; }
        if (m.redCards !== undefined) { redCards += m.redCards; hasDirectStats = true; }
        if (m.errorsLeadToGoal !== undefined) { errorsLeadToGoal += m.errorsLeadToGoal; hasDirectStats = true; }
        if (m.penaltiesConceded !== undefined) { penaltiesConceded += m.penaltiesConceded; hasDirectStats = true; }
        if (m.ownGoals !== undefined) { ownGoals += m.ownGoals; hasDirectStats = true; }
        if (m.accuratePasses !== undefined) { accuratePasses += m.accuratePasses; hasDirectStats = true; }
        if (m.wonTackles !== undefined) { wonTackles += m.wonTackles; hasDirectStats = true; }
        if (m.interceptionsWon !== undefined) { interceptionsWon += m.interceptionsWon; hasDirectStats = true; }
        if (m.setPiecesTaken !== undefined) { setPiecesTaken += m.setPiecesTaken; hasDirectStats = true; }

        // 2. Fallback parser if direct stats were not present
        if (!hasDirectStats) {
          (m.allAroundDetails || []).forEach((detailStr) => {
            const passMatch = detailStr.match(/(\d+)\s+passes\s+réussies/i);
            if (passMatch) accuratePasses += parseInt(passMatch[1], 10);

            const tackleMatch = detailStr.match(/(\d+)\s+tacles\s+réussis/i);
            if (tackleMatch) wonTackles += parseInt(tackleMatch[1], 10);

            const setPieceMatch = detailStr.match(/(\d+)\s+centres|\b(\d+)\s+corners/i);
            if (setPieceMatch) setPiecesTaken += parseInt(setPieceMatch[1] || setPieceMatch[2] || '0', 10);
          });

          (m.decisiveActions || []).forEach((act) => {
            const lower = act.toLowerCase();
            if (lower.includes('but') || lower.includes('goal')) {
              if (lower.includes('doublé')) goals += 2;
              else if (lower.includes('triplé')) goals += 3;
              else goals += 1;
            }
            if (lower.includes('passe décisive') || lower.includes('assist')) goalAssists++;
            if (lower.includes('pénalty provoqué') || lower.includes('penalty assist')) penaltyAssists++;
            if (lower.includes('sauvetage') || lower.includes('dernier défenseur') || lower.includes('last man')) lastManTackles++;
          });

          (m.negativeActions || []).forEach((act) => {
            const lower = act.toLowerCase();
            if (lower.includes('jaune')) yellowCards++;
            if (lower.includes('rouge')) redCards++;
            if (lower.includes('erreur') || lower.includes('fatale')) errorsLeadToGoal++;
            if (lower.includes('penalty concédé')) penaltiesConceded++;
            if (lower.includes('contre son camp')) ownGoals++;
          });
        }
      }
    });

    const periodCount = matchesList.length || 1;
    let officialAvg = 0;
    if (selectedPeriod === 5 && typeof card.scores?.l5 === 'number' && card.scores.l5 > 0) {
      officialAvg = card.scores.l5;
    } else if (selectedPeriod === 10 && typeof card.scores?.l10 === 'number' && card.scores.l10 > 0) {
      officialAvg = card.scores.l10;
    } else if (selectedPeriod === 15 && typeof card.scores?.l15 === 'number' && card.scores.l15 > 0) {
      officialAvg = card.scores.l15;
    } else if (selectedPeriod === 40 && typeof card.scores?.l40 === 'number' && card.scores.l40 > 0) {
      officialAvg = card.scores.l40;
    }

    const computedAvg = Math.round((sumScores / periodCount) * 10) / 10;
    const avgScore = officialAvg > 0 ? officialAvg : computedAvg;

    const playedPct = Math.round((playedMatchesCount / periodCount) * 100);
    const avgAllAround = playedMatchesCount > 0 ? Math.round((sumAAS / playedMatchesCount) * 10) / 10 : 0;
    const avgDecisive = playedMatchesCount > 0 ? Math.round((sumDecisive / playedMatchesCount) * 10) / 10 : 0;

    return {
      avgScore,
      playedPct,
      avgAllAround,
      avgDecisive,
      s100,
      s75_99,
      s60_74,
      s50_59,
      s35_49,
      s20_34,
      s0_19,
      dnp,
      gamesStarted,
      totalMinsPlayed,
      setPiecesTaken,
      accuratePasses,
      wonTackles,
      interceptionsWon,
      goals,
      goalAssists,
      penaltyAssists,
      lastManTackles,
      yellowCards,
      redCards,
      errorsLeadToGoal,
      penaltiesConceded,
      ownGoals,
    };
  }, [card, selectedPeriod, matchPerformances]);

  const formatStatVal = (val: number, isIntegerOnly: boolean = false) => {
    if (!periodStats) return '0';
    if (statMode === 'total' || isIntegerOnly) return val.toString();
    if (periodStats.totalMinsPlayed <= 0) return '0';
    const per90 = (val / periodStats.totalMinsPlayed) * 90;
    return per90 % 1 === 0 ? per90.toFixed(0) : per90.toFixed(per90 >= 10 ? 1 : 2);
  };

  // Function to calculate playing rate (percentage of matches played/started)
  const getPlayingPercentage = (playerCard: SorareCard, period: 5 | 15 | 40): number => {
    if (playerCard.status === 'NOT_PLAYING') return 0;
    
    if (period === 5) {
      const last5 = playerCard.scores.last5Scores || [];
      if (last5.length === 0) return 100;
      const played = last5.filter(s => s > 0).length;
      return Math.round((played / 5) * 100);
    }
    
    if (period === 15) {
      if (matchPerformances.length > 0) {
        const playedCount = matchPerformances.slice(-15).filter(m => !m.isDNP).length;
        return Math.round((playedCount / 15) * 100);
      }
    }
    
    if (period === 40) {
      if (matchPerformances.length > 0) {
        const playedCount = matchPerformances.filter(m => !m.isDNP).length;
        return Math.round((playedCount / 40) * 100);
      }
    }
    
    const seed = playerCard.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const variance = (seed % 15) - 7;
    
    if (period === 15) {
      let base = 85;
      if (playerCard.status === 'STARTER') base = 90;
      else if (playerCard.status === 'REGULAR') base = 75;
      else if (playerCard.status === 'SUPER_SUBSTITUTE') base = 60;
      else if (playerCard.status === 'SUBSTITUTE') base = 40;
      
      if (playerCard.injuryStatus === 'INJURED') base = Math.max(20, base - 40);
      return Math.min(100, Math.max(0, Math.round((base + variance) / 6.66) * 6.66));
    } else {
      let base = 80;
      if (playerCard.status === 'STARTER') base = 85;
      else if (playerCard.status === 'REGULAR') base = 70;
      else if (playerCard.status === 'SUPER_SUBSTITUTE') base = 55;
      else if (playerCard.status === 'SUBSTITUTE') base = 35;
      
      if (playerCard.injuryStatus === 'INJURED') base = Math.max(30, base - 20);
      return Math.min(100, Math.max(0, Math.round((base + (variance % 5)) / 2.5) * 2.5));
    }
  };

  if (!card) return null;

  const posBadge = formatPositionBadge(card.positionCode);
  const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
  const proj = calculatePlayerProjectedScore(card);
  const winProb = getPlayerWinProbability(card.upcomingFixture);
  const formattedDate = formatKickoffDate(card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl sm:rounded-3xl border border-slate-700/80 bg-[#0B0F17] p-4 sm:p-6 shadow-2xl my-2 sm:my-6 text-slate-100 font-sans max-h-none">
        
        {/* Top Header Bar: Close Button */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition shadow-md"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-400">
              Fiche Joueur SO5
            </span>
          </div>
        </div>

        {/* Player Profile Header Card (Sorare Style) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-4 sm:p-5 border border-slate-800 shadow-lg">
          <div className="flex flex-col-reverse sm:flex-row items-center sm:items-start justify-between gap-4 text-center sm:text-left">
            
            <div className="flex-1 w-full">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
                <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-black ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
                  {card.positionCode}
                </span>
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  {card.club.pictureUrl && (
                    <img src={card.club.pictureUrl} alt={card.club.name} className="h-4 w-4 object-contain" />
                  )}
                  {card.club.name}
                  {card.club.league && (
                    <span className="opacity-70">({card.club.league})</span>
                  )}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{card.displayName}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {card.league} • {card.age} ans • {typeof card.country === 'string' ? card.country : (card.country?.name || 'International')}
              </p>

              {/* Starter Badge */}
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900/90 border border-slate-800 px-2.5 py-1 text-xs justify-center w-full sm:w-auto">
                <span className={`h-2 w-2 rounded-full ${card.status === 'STARTER' ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/50'}`}></span>
                <span className="font-semibold text-slate-300">{statusInfo.label}</span>
                <span className="text-slate-500">•</span>
                <span className="font-bold text-emerald-400">{card.starterConfidence}% conf.</span>
              </div>
            </div>

            {/* Player Card Portrait */}
            <div className="relative flex-shrink-0">
              <img
                src={card.pictureUrl}
                alt={card.displayName}
                referrerPolicy="no-referrer"
                className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl object-contain border-2 border-emerald-500/50 shadow-2xl bg-slate-950/50 p-1"
              />
            </div>
          </div>
        </div>

        {/* PROCHAIN MATCH BANNER */}
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/40 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-wider text-white">Date du prochain match</span>
            </div>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-black text-emerald-300">
              {winProb}% chances de victoire
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 rounded-xl p-3 border border-slate-800">
            <div>
              <div className="text-sm font-black text-emerald-400">{formattedDate}</div>
              <div className="text-xs text-slate-300 mt-0.5">
                {card.club.name} {card.upcomingFixture?.isHome ? '(Domicile 🏠)' : '(Extérieur ✈️)'} vs <strong className="text-white">{card.upcomingFixture?.opponent || 'Adversaire'}</strong>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Difficulté</span>
                <span className="text-xs font-bold text-amber-400">{card.upcomingFixture?.difficultyRating || 3}/5</span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Projeté</span>
                <span className="text-sm font-black text-emerald-400">{proj.projectedScore} pts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sorare Metrics Row: Last 5, Last 15, Last 40, Bonus */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Last 5 */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Score L5</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{card.scores.l5}</div>
            <div className="mt-1 flex flex-col items-center justify-center">
              <span className="text-[9px] text-slate-400">Joués</span>
              <span className="text-[10px] font-bold text-emerald-400">{getPlayingPercentage(card, 5)}%</span>
            </div>
          </div>

          {/* Last 15 */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Score L15</span>
            <div className="text-xl sm:text-2xl font-black text-white">{card.scores.l15 || 45}</div>
            <div className="mt-1 flex flex-col items-center justify-center">
              <span className="text-[9px] text-slate-400">Joués</span>
              <span className="text-[10px] font-bold text-slate-300">{getPlayingPercentage(card, 15)}%</span>
            </div>
          </div>

          {/* Last 40 */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Score L40</span>
            <div className="text-xl sm:text-2xl font-black text-slate-300">{card.scores.l40}</div>
            <div className="mt-1 flex flex-col items-center justify-center">
              <span className="text-[9px] text-slate-400">Joués</span>
              <span className="text-[10px] font-bold text-slate-400">{getPlayingPercentage(card, 40)}%</span>
            </div>
          </div>

          {/* Bonus */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 text-center flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bonus</span>
            <div className="text-base sm:text-lg font-black text-emerald-400 my-auto">+2%</div>
            <span className="text-[9px] text-slate-500">XP & Saison</span>
          </div>
        </div>

        {/* PERFORMANCE GRAPH WITH EXACT COLOR CODING */}
        <div className="mt-4 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <span>Historique des {selectedPeriod} Derniers Matchs</span>
            </h3>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {([5, 10, 15, 40] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-2 py-0.5 text-[10px] font-black rounded transition-all ${
                    selectedPeriod === p
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  L{p}
                </button>
              ))}
            </div>
          </div>

          {/* EXACT LEGEND PER USER REQUEST */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3.5 text-[10px] text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            {/* Noir: Non joué */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-black border border-slate-700 shadow-inner flex-shrink-0 inline-block"></span>
              <span><strong>Noir :</strong> DNP (0 pt)</span>
            </div>

            {/* Bleu: Base départ */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-blue-500/80 shadow-[0_0_6px_rgba(59,130,246,0.4)] flex-shrink-0 inline-block"></span>
              <span><strong>Bleu :</strong> Base (35/25 pts)</span>
            </div>

            {/* Blanc: All-Around Score */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)] flex-shrink-0 inline-block"></span>
              <span><strong>Blanc :</strong> All-Around (AAS)</span>
            </div>

            {/* Vert: Score Décisif */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] flex-shrink-0 inline-block"></span>
              <span><strong>Vert :</strong> Décisif (≥60 pts)</span>
            </div>

            {/* Rouge: Actions Négatives */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)] flex-shrink-0 inline-block"></span>
              <span><strong>Rouge :</strong> Négatif & Malus</span>
            </div>
          </div>

          {/* Match Scores Bar Graph for Selected Period */}
          <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800/80 overflow-x-auto">
            <div className={`flex items-end gap-1.5 h-32 pt-5 ${selectedPeriod === 40 ? 'min-w-[760px]' : selectedPeriod === 15 ? 'min-w-[480px]' : selectedPeriod === 10 ? 'min-w-[360px]' : 'min-w-[280px]'}`}>
              {(selectedPeriod === 5 ? matchPerformances.slice(-5) : selectedPeriod === 10 ? matchPerformances.slice(-10) : selectedPeriod === 15 ? matchPerformances.slice(-15) : matchPerformances).map((match) => {
                const globalIndex = matchPerformances.indexOf(match);
                const isSelected = selectedMatchIndex === globalIndex;
                const heightPct = match.isDNP 
                  ? 12 
                  : Math.max(18, Math.min(100, (match.totalScore / 100) * 100));

                // Segment calculations
                const hasDecisive = (match.decisiveScore >= 60) || (match.decisiveActions && match.decisiveActions.length > 0);
                const isNegative = match.negativeMalus > 0 || (match.totalScore < (match.baseScore || 25) && !match.isDNP);

                return (
                  <button
                    key={globalIndex}
                    type="button"
                    onClick={() => setSelectedMatchIndex(globalIndex)}
                    onMouseEnter={() => setSelectedMatchIndex(globalIndex)}
                    className={`flex flex-col items-center gap-1 flex-1 group cursor-pointer transition-all duration-150 rounded-lg p-1 ${
                      isSelected 
                        ? 'bg-slate-800/80 ring-1 ring-emerald-400/80' 
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Top Score Label */}
                    <span
                      className={`text-[8px] font-black tracking-tighter ${
                        match.isDNP
                          ? 'text-slate-600 font-bold'
                          : hasDecisive
                          ? 'text-emerald-400 font-black'
                          : isNegative
                          ? 'text-rose-500 font-black'
                          : 'text-white font-bold'
                      }`}
                    >
                      {match.isDNP ? 'DNP' : match.totalScore}
                    </span>

                    {/* The Stacked / Segmented Bar */}
                    <div className="w-full max-w-[18px] bg-slate-900 rounded-t-md overflow-hidden h-24 flex items-end shadow-inner">
                      {match.isDNP ? (
                        // NOIR : Non joué (DNP)
                        <div
                          className="w-full bg-black border border-slate-800 rounded-t-md flex items-center justify-center transition-all"
                          style={{ height: `${heightPct}%` }}
                        >
                          <span className="text-[6px] text-slate-600 font-black">0</span>
                        </div>
                      ) : (
                        // JOUEUR ACTIF : Stacked Segments
                        <div
                          className="w-full flex flex-col justify-end rounded-t-md overflow-hidden transition-all duration-300"
                          style={{ height: `${heightPct}%` }}
                        >
                          {/* Segment Vert : Score Décisif (si action décisive validée >= 60 pts) */}
                          {hasDecisive && (
                            <div
                              className="w-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                              style={{ height: '35%' }}
                              title="Score Décisif (Vert)"
                            />
                          )}

                          {/* Segment Blanc : All-Around Score (AAS) */}
                          <div
                            className="w-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)] flex-1"
                            title="All-Around Score (Blanc)"
                          />

                          {/* Segment Bleu : Base de départ (35 pts Titulaire / 25 pts Remplaçant) */}
                          <div
                            className={`w-full ${match.isSub ? 'bg-blue-600/80' : 'bg-blue-500/80'} shadow-[0_0_6px_rgba(59,130,246,0.3)]`}
                            style={{ height: match.isSub ? '25%' : '35%' }}
                            title={`Base de départ (${match.isSub ? '25 pts remplaçant' : '35 pts titulaire'})`}
                          />

                          {/* Segment Rouge : Actions Négatives & Malus (si carton, etc.) */}
                          {isNegative && (
                            <div
                              className="w-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                              style={{ height: '20%' }}
                              title="Action Négative / Malus (Rouge)"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Match Tag (M1 to M40) */}
                    <span
                      className={`text-[8px] font-mono ${
                        isSelected
                          ? 'text-emerald-400 font-black underline'
                          : 'text-slate-500'
                      }`}
                    >
                      M{match.matchIndex}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SELECTED MATCH DETAILED BREAKDOWN ACCORDING TO USER COLOR SPECIFICATION */}
          {selectedMatch && (
            <div className="mt-3.5 rounded-xl bg-slate-950 p-3.5 border border-slate-800 shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-black text-white">
                    {selectedMatch.matchLabel} (M{selectedMatch.matchIndex})
                  </span>
                  <span className="text-xs font-semibold text-slate-300">
                    {selectedMatch.isHome ? 'Domicile 🏠' : 'Extérieur ✈️'} vs {selectedMatch.opponent}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    • {selectedMatch.result}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Score Match :</span>
                  <span
                    className={`text-base font-black px-2 py-0.5 rounded-md ${
                      selectedMatch.isDNP
                        ? 'bg-black text-slate-500 border border-slate-800'
                        : selectedMatch.totalScore >= 60
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : selectedMatch.totalScore < (selectedMatch.baseScore || 25)
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-white/15 text-white border border-white/30'
                    }`}
                  >
                    {selectedMatch.isDNP ? 'DNP (0 pt)' : `${selectedMatch.totalScore} pts`}
                  </span>
                </div>
              </div>

              {/* Breakdown Details Grid */}
              {selectedMatch.isDNP ? (
                <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-black border border-slate-800 text-slate-400 text-xs">
                  <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 border border-slate-800">
                    <UserX className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">Non Joué (Did Not Play) - 0 pt</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Le joueur est resté sur le banc des remplaçants ou n'était pas inscrit sur la feuille de match pour cette rencontre.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  
                  {/* 1. COLONNE À GAUCHE : Base de Départ (Bleu) */}
                  <div className="rounded-xl bg-blue-950/30 p-2.5 border border-blue-500/40 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>Base Départ</span>
                        </span>
                        <span className="font-black text-blue-400 text-xs">
                          +{selectedMatch.baseScore || (selectedMatch.isSub ? 25 : 35)} pts
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        {selectedMatch.isSub ? (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[11px] border border-blue-500/30">
                            <span>🔄 Remplaçant entré</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[11px] border border-blue-500/30">
                            <span>⚡ Titulaire (11 de départ)</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                          <span>⏱️ {selectedMatch.minutesPlayed} mins de jeu</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                          {selectedMatch.isSub 
                            ? 'Point de départ officiel de 25 pts pour un remplaçant entrant en cours de jeu.' 
                            : 'Point de départ officiel de 35 pts pour un joueur titulaire au coup d\'envoi.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Score Décisif (VERT) - STRICTEMENT ACTIONS DÉCISIVES */}
                  {(() => {
                    const hasDecisive = (selectedMatch.decisiveScore >= 60) || (selectedMatch.decisiveActions && selectedMatch.decisiveActions.length > 0);
                    return (
                      <div className={`rounded-xl p-2.5 border flex flex-col justify-between ${
                        hasDecisive
                          ? 'bg-emerald-950/40 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800/80 opacity-70'
                      }`}>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                              <Award className="h-3 w-3" />
                              <span>Score Décisif (Vert)</span>
                            </span>
                            <span className="font-black text-emerald-400 text-xs">
                              {hasDecisive ? `${selectedMatch.decisiveScore} pts` : '0 pt'}
                            </span>
                          </div>

                          {hasDecisive ? (
                            <ul className="space-y-1 text-[11px] text-slate-200 font-medium">
                              {selectedMatch.decisiveActions.map((act, idx) => (
                                <li key={idx} className="flex items-center gap-1.5 text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                  <span>{act}</span>
                                </li>
                              ))}
                              {selectedMatch.decisiveActions.length === 0 && (
                                <li className="flex items-center gap-1.5 text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                  <span>Action décisive validée ({selectedMatch.decisiveScore} pts)</span>
                                </li>
                              )}
                            </ul>
                          ) : (
                            <p className="text-[10px] text-slate-400 mt-1">
                              0 action décisive directe (0 but, 0 passe d., 0 penalty arrêté, 0 clean sheet).
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3. All-Around Score (BLANC) */}
                  <div className="rounded-xl bg-slate-900/90 p-2.5 border border-slate-700 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white flex items-center gap-1">
                          <Activity className="h-3 w-3 text-slate-300" />
                          <span>All-Around Score (Blanc)</span>
                        </span>
                        <span className="font-black text-white text-xs">
                          +{selectedMatch.allAroundScore} pts
                        </span>
                      </div>
                      <ul className="space-y-1 text-[11px] text-slate-300">
                        {selectedMatch.allAroundDetails.map((det, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
                            <span>{det}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 4. Actions Négatives & Malus (ROUGE) */}
                  <div className={`rounded-xl p-2.5 border flex flex-col justify-between ${
                    selectedMatch.negativeMalus > 0 || selectedMatch.negativeActions.length > 0
                      ? 'bg-rose-950/40 border-rose-500/50 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 opacity-70'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Actions Négatives (Rouge)</span>
                        </span>
                        <span className="font-black text-rose-400 text-xs">
                          {selectedMatch.negativeMalus > 0 ? `-${selectedMatch.negativeMalus} pts` : '0 malus'}
                        </span>
                      </div>
                      {selectedMatch.negativeActions.length > 0 ? (
                        <ul className="space-y-1 text-[11px] text-rose-300 font-medium">
                          {selectedMatch.negativeActions.map((act, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                              <span>{act}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-1">
                          0 faute majeure, 0 penalty concédé, 0 carton rouge direct.
                        </p>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Scout Report Section */}
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-950 p-4 border border-emerald-500/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Analyse & Recommandation IA Gemini
              </h3>
            </div>
            {isLoadingAI && <span className="text-[10px] text-slate-400 animate-pulse">Analyse en cours...</span>}
          </div>

          {aiReport && (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white">Verdict :</span>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-black text-emerald-400 border border-emerald-500/30">
                  {aiReport.verdict}
                </span>
                <span className="text-slate-400 text-[11px]">
                  Plafond estimé : <strong>{aiReport.floorScore} - {aiReport.ceilingScore} pts</strong>
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                {aiReport.keyAdvice}
              </p>
            </div>
          )}
        </div>

        {/* DETAILED PLAYER ACTION & SCORE BREAKDOWN STATISTICS SECTION (MATCHING IMAGE.PNG) */}
        {periodStats && (
          <div className="mt-4 rounded-2xl bg-[#0d1117] border border-slate-800 p-3.5 sm:p-4 shadow-2xl font-sans">
            
            {/* 1. Period Selector Tabs (Last 5 / Last 10 / Last 15 / Last 40) */}
            <div className="grid grid-cols-4 gap-1 bg-[#161b22] p-1 rounded-xl border border-slate-800 mb-3.5">
              <button
                type="button"
                onClick={() => setSelectedPeriod(5)}
                className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                  selectedPeriod === 5
                    ? 'bg-[#2b3240] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last 5
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod(10)}
                className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                  selectedPeriod === 10
                    ? 'bg-[#2b3240] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last 10
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod(15)}
                className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                  selectedPeriod === 15
                    ? 'bg-[#2b3240] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last 15
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod(40)}
                className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                  selectedPeriod === 40
                    ? 'bg-[#2b3240] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last 40
              </button>
            </div>

            {/* 2. Top KPI Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#131822] p-3.5 rounded-xl border border-slate-800/80 mb-3.5">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block mb-0.5">Average score</span>
                <span className="text-2xl font-black text-cyan-400">{periodStats.avgScore}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block mb-0.5">Played</span>
                <span className="text-2xl font-black text-white underline decoration-purple-500 decoration-2 underline-offset-4">
                  {periodStats.playedPct}%
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block mb-0.5">All around</span>
                <span className="text-2xl font-black text-white">{periodStats.avgAllAround}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 block mb-0.5">Decisive</span>
                <span className="text-2xl font-black text-white">{periodStats.avgDecisive}</span>
              </div>
            </div>

            {/* 3. Main Split Grid: Left Score Distribution & Right Action Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              
              {/* LEFT CARD: Score Bracket Breakdown */}
              <div className="bg-[#131822] rounded-xl p-3.5 border border-slate-800/80 flex flex-col justify-between">
                <div>
                  {/* Stacked Progress Bar */}
                  <div className="h-3.5 w-full bg-slate-900 rounded-full overflow-hidden flex mb-3.5 border border-slate-800/80 shadow-inner">
                    {[
                      { bg: 'bg-white', count: periodStats.s100, label: '100' },
                      { bg: 'bg-[#00F0FF]', count: periodStats.s75_99, label: '75 to 99' },
                      { bg: 'bg-[#00E676]', count: periodStats.s60_74, label: '60 to 74' },
                      { bg: 'bg-[#AEEA00]', count: periodStats.s50_59, label: '50 to 59' },
                      { bg: 'bg-[#FFD600]', count: periodStats.s35_49, label: '35 to 49' },
                      { bg: 'bg-[#FF9100]', count: periodStats.s20_34, label: '20 to 34' },
                      { bg: 'bg-[#FF3D00]', count: periodStats.s0_19, label: '0 to 19' },
                      { bg: 'bg-black border border-slate-700', count: periodStats.dnp, label: 'DNP' },
                    ]
                      .filter((t) => t.count > 0)
                      .map((t, i) => (
                        <div
                          key={i}
                          className={`h-full ${t.bg}`}
                          style={{ width: `${(t.count / selectedPeriod) * 100}%` }}
                          title={`${t.label}: ${t.count}`}
                        />
                      ))}
                  </div>

                  {/* Score Brackets Tier List */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
                        <span className="font-bold text-slate-100">100</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s100}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]" />
                        <span className="font-bold text-slate-100">75 <span className="text-slate-400 font-medium">to</span> 99</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s75_99}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#00E676] shadow-[0_0_6px_#00E676]" />
                        <span className="font-bold text-slate-100">60 <span className="text-slate-400 font-medium">to</span> 74</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s60_74}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#AEEA00]" />
                        <span className="font-bold text-slate-100">50 <span className="text-slate-400 font-medium">to</span> 59</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s50_59}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FFD600]" />
                        <span className="font-bold text-slate-100">35 <span className="text-slate-400 font-medium">to</span> 49</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s35_49}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FF9100]" />
                        <span className="font-bold text-slate-100">20 <span className="text-slate-400 font-medium">to</span> 34</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s20_34}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#FF3D00]" />
                        <span className="font-bold text-slate-100">0 <span className="text-slate-400 font-medium">to</span> 19</span>
                      </div>
                      <span className="font-black text-white">{periodStats.s0_19}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-black border border-slate-500 shadow-[0_0_4px_#000000]" />
                        <span className="font-bold text-slate-100">
                          DNP <span className="text-[11px] text-slate-400 font-normal">Did not play</span>
                        </span>
                      </div>
                      <span className="font-black text-white">{periodStats.dnp}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT CARD: Detailed Action Statistics */}
              <div className="bg-[#131822] rounded-xl p-3.5 border border-slate-800/80">
                
                {/* Mode Switcher: Total | Per 90' */}
                <div className="flex justify-end mb-3">
                  <div className="inline-flex bg-[#1a212e] p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setStatMode('total')}
                      className={`px-3 py-1 text-[11px] font-black rounded-md transition-all ${
                        statMode === 'total'
                          ? 'bg-[#2b3345] text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatMode('per90')}
                      className={`px-3 py-1 text-[11px] font-black rounded-md transition-all ${
                        statMode === 'per90'
                          ? 'bg-[#2b3345] text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Per 90′
                    </button>
                  </div>
                </div>

                {/* Statistics Group */}
                <div className="mb-4">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Statistics</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>Game started</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.gamesStarted, true)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>Mins played</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.totalMinsPlayed, true)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <CornerDownRight className="h-3.5 w-3.5 text-slate-400" />
                        <span>Set piece taken</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.setPiecesTaken)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Send className="h-3.5 w-3.5 text-slate-400" />
                        <span>Accurate pass</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.accuratePasses)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>Won tackle</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.wonTackles)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        <span>Interception won</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.interceptionsWon)}</span>
                    </div>
                  </div>
                </div>

                {/* Decisive Actions Group */}
                <div>
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Decisive actions</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">⚽</span>
                        <span>Goal</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.goals)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">🅰️</span>
                        <span>Goal assist</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.goalAssists)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">🎯</span>
                        <span>Penalty assist</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.penaltyAssists)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px]">🛡️</span>
                        <span>Last man tackle</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.lastManTackles)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-3 rounded-sm bg-amber-400 text-black flex items-center justify-center text-[8px] font-black">🟨</span>
                        <span>Yellow card</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.yellowCards)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-3 rounded-sm bg-rose-500 text-white flex items-center justify-center text-[8px] font-black">🟥</span>
                        <span>Red card</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.redCards)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">❌</span>
                        <span>Error lead to goal</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.errorsLeadToGoal)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">⚠️</span>
                        <span>Penalty conceded</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.penaltiesConceded)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="h-4 w-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">⚽</span>
                        <span>Own goal</span>
                      </div>
                      <span className="font-black text-white">{formatStatVal(periodStats.ownGoals)}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
          >
            Fermer
          </button>
          {onAssignToSlot && (
            <button
              onClick={() => {
                const targetSlot =
                  card.positionCode === 'GK'
                    ? 'gk'
                    : card.positionCode === 'DEF'
                    ? 'def'
                    : card.positionCode === 'MID'
                    ? 'mid'
                    : 'fwd';
                onAssignToSlot(card, targetSlot);
                onClose();
              }}
              className="rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-95"
            >
              Aligner dans le Terrain
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
