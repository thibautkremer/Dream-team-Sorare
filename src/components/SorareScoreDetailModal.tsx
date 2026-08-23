import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronDown, 
  ChevronUp, 
  Shield, 
  Flame, 
  Award, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Zap,
  Target,
  Clock,
  Sparkles
} from 'lucide-react';
import { SorareCard } from '../types';
import { getCardTotalBonus } from '../utils/sorareSlug';
import { StorageService } from '../utils/storage';

export interface SorareScoreDetailModalProps {
  card: SorareCard;
  sorareLive: any;
  isCaptain?: boolean;
  onClose: () => void;
}

const STAT_LABELS_FR: Record<string, { label: string; unit?: string }> = {
  // Decisive Positive
  goals: { label: 'Buts marqués' },
  goal_assist: { label: 'Passes décisives' },
  assist_penalty_won: { label: 'Penalty provoqué amené au but' },
  clearance_off_line: { label: 'Sauvetage sur la ligne' },
  last_man_tackle: { label: 'Tacle en dernier défenseur' },
  penalty_save: { label: 'Penalty arrêté' },
  
  // Decisive Negative
  red_card: { label: 'Carton rouge' },
  own_goals: { label: 'But contre son camp' },
  penalty_conceded: { label: 'Penalty concédé' },
  error_lead_to_goal: { label: 'Erreur menant à un but' },

  // General
  mins_played: { label: 'Minutes jouées', unit: 'min' },
  yellow_card: { label: 'Cartons jaunes' },
  fouls: { label: 'Fautes commises' },
  was_fouled: { label: 'Fautes subies' },
  error_lead_to_shot: { label: 'Erreur menant à un tir' },
  penalty_kick_missed: { label: 'Penalty manqué' },
  goals_conceded: { label: 'Buts concédés' },
  penalty_won: { label: 'Penalty obtenu' },

  // Defending
  won_tackle: { label: 'Tacles réussis' },
  blocked_cross: { label: 'Centres bloqués' },
  outfielder_block: { label: 'Tirs contrés' },
  double_double: { label: 'Double-double défensif' },
  triple_double: { label: 'Triple-double défensif' },
  triple_triple: { label: 'Triple-triple défensif' },
  clean_sheet: { label: 'Clean sheet' },
  effective_clearance: { label: 'Dégagements' },

  // Possession
  poss_lost_ctrl: { label: 'Pertes de balle' },
  poss_won: { label: 'Ballons récupérés' },
  duel_lost: { label: 'Duels perdus' },
  duel_won: { label: 'Duels gagnés' },
  interception_won: { label: 'Interceptions' },

  // Passing
  accurate_pass: { label: 'Passes réussies' },
  successful_final_third_passes: { label: 'Passes dans le dernier tiers' },
  accurate_long_balls: { label: 'Passes longues réussies' },
  missed_pass: { label: 'Passes manquées' },
  big_chance_created: { label: 'Grosses occasions créées' },
  adjusted_total_att_assist: { label: 'Passes clés' },

  // Attacking
  ontarget_scoring_att: { label: 'Tirs cadrés' },
  won_contest: { label: 'Dribbles réussis' },
  pen_area_entries: { label: 'Entrées dans la surface' },
  big_chance_missed: { label: 'Grosses occasions manquées' },
  shot_off_target: { label: 'Tirs non cadrés' },

  // Goalkeeping
  saves: { label: 'Arrêts' },
  saved_ibox: { label: 'Arrêts dans la surface' },
  dive_save: { label: 'Arrêts plongeants' },
  dive_catch: { label: 'Captes plongeantes' },
  good_high_claim: { label: 'Sorties aériennes réussies' },
  punches: { label: 'Dégagements des poings' },
  gk_smother: { label: 'Sorties dans les pieds' },
  accurate_keeper_sweeper: { label: 'Interventions gardien volant' },
  cross_not_claimed: { label: 'Sorties aériennes manquées' },
  six_second_violation: { label: 'Règle des 6 secondes' },
};

const DECISIVE_LEVELS = [
  { score: 0, level: -3, color: 'bg-rose-950/80 text-rose-300 border-rose-800/50' },
  { score: 5, level: -2, color: 'bg-rose-900/70 text-rose-300 border-rose-700/50' },
  { score: 15, level: -1, color: 'bg-amber-950/80 text-amber-300 border-amber-800/50' },
  { score: 35, level: 0, color: 'bg-amber-900/60 text-amber-200 border-amber-700/50' },
  { score: 60, level: 1, color: 'bg-emerald-900/70 text-emerald-300 border-emerald-700/50' },
  { score: 70, level: 2, color: 'bg-emerald-500 text-slate-950 font-black border-emerald-400' },
  { score: 80, level: 3, color: 'bg-teal-700/80 text-teal-200 border-teal-600/50' },
  { score: 90, level: 4, color: 'bg-teal-600/90 text-white border-teal-500/50' },
  { score: 100, level: 5, color: 'bg-cyan-500 text-slate-950 font-black border-cyan-400' },
];

export const SorareScoreDetailModal: React.FC<SorareScoreDetailModalProps> = ({
  card,
  sorareLive,
  isCaptain = false,
  onClose,
}) => {
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    posDecisive: true,
    negDecisive: true,
    general: true,
    defending: true,
    possession: true,
    passing: true,
    attacking: true,
    goalkeeping: true,
  });

  const cardBonus = getCardTotalBonus(card);
  const captainBonus = isCaptain ? 20 : 0;
  const totalBonusPct = Math.round((cardBonus + captainBonus) * 10) / 10;

  const baseLiveScore = sorareLive?.liveScore ?? null;
  const decisiveScore = sorareLive?.decisiveScore ?? (baseLiveScore != null && baseLiveScore >= 35 ? (baseLiveScore >= 60 ? 60 : 35) : 35);
  
  // Calculate final score with bonuses
  const finalLiveScore = baseLiveScore != null 
    ? Math.round(baseLiveScore * (1 + totalBonusPct / 100) * 10) / 10 
    : null;

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const so5ScoreId = sorareLive?.so5ScoreId || sorareLive?.so5ScoresHistory?.[0]?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      if (!so5ScoreId) return;
      setLoading(true);
      try {
        const apiKey = StorageService.getApiKey() || '';
        const res = await fetch('/api/sorare/player-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ so5ScoreId, apiKey })
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.stats) {
            setDetailedStats(data.stats);
          }
        }
      } catch (err) {
        console.warn('[SorareScoreDetailModal] Failed to fetch detailed stats:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchDetails();
    return () => { isMounted = false; };
  }, [so5ScoreId]);

  // Aggregate stats from API or fallback
  const allDetailedScores: any[] = detailedStats?.detailedScore || detailedStats?.allAroundStats || [];

  // Filter STRICTLY for real positive decisive actions (statValue > 0 or points/totalScore > 0)
  const positiveDecisive = allDetailedScores.filter(s => {
    const val = Number(s.statValue) || 0;
    const pts = Number(s.points) || 0;
    const total = Number(s.totalScore) || 0;
    const statName = (s.stat || '').toLowerCase();
    const isPosCategory = s.category === 'POSITIVE_DECISIVE_STAT';
    const isPosStat = ['goals', 'goal_assist', 'assist_penalty_won', 'clearance_off_line', 'last_man_tackle', 'penalty_save'].includes(statName);

    return (isPosCategory || isPosStat) && (val > 0 || pts > 0 || total > 0);
  });

  // Filter STRICTLY for real negative decisive actions (statValue > 0 or negative impact)
  const negativeDecisive = allDetailedScores.filter(s => {
    const val = Number(s.statValue) || 0;
    const pts = Number(s.points) || 0;
    const total = Number(s.totalScore) || 0;
    const statName = (s.stat || '').toLowerCase();
    const isNegCategory = s.category === 'NEGATIVE_DECISIVE_STAT';
    const isNegStat = ['red_card', 'own_goals', 'own_goal', 'penalty_conceded', 'error_lead_to_goal'].includes(statName);

    return (isNegCategory || isNegStat) && (val > 0 || pts < 0 || total < 0);
  });

  // Helper to test if any real stat activity took place
  const hasRealActivity = (s: any) => {
    const val = Number(s.statValue) || 0;
    const pts = Number(s.points) || 0;
    const total = Number(s.totalScore) || 0;
    return val !== 0 || pts !== 0 || total !== 0;
  };

  const generalStats = allDetailedScores.filter(s => 
    (s.category === 'GENERAL' || ['mins_played', 'yellow_card', 'fouls', 'was_fouled', 'error_lead_to_shot', 'penalty_kick_missed', 'goals_conceded', 'penalty_won'].includes(s.stat)) &&
    hasRealActivity(s)
  );
  const defendingStats = allDetailedScores.filter(s => 
    (s.category === 'DEFENDING' || ['won_tackle', 'blocked_cross', 'outfielder_block', 'double_double', 'triple_double', 'triple_triple', 'clean_sheet', 'effective_clearance'].includes(s.stat)) &&
    hasRealActivity(s)
  );
  const possessionStats = allDetailedScores.filter(s => 
    (s.category === 'POSSESSION' || ['poss_lost_ctrl', 'poss_won', 'duel_lost', 'duel_won', 'interception_won'].includes(s.stat)) &&
    hasRealActivity(s)
  );
  const passingStats = allDetailedScores.filter(s => 
    (s.category === 'PASSING' || ['accurate_pass', 'successful_final_third_passes', 'accurate_long_balls', 'missed_pass', 'big_chance_created', 'adjusted_total_att_assist'].includes(s.stat)) &&
    hasRealActivity(s)
  );
  const attackingStats = allDetailedScores.filter(s => 
    (s.category === 'ATTACKING' || ['ontarget_scoring_att', 'won_contest', 'pen_area_entries', 'big_chance_missed', 'shot_off_target'].includes(s.stat)) &&
    hasRealActivity(s)
  );
  const gkStats = allDetailedScores.filter(s => 
    (s.category === 'GOALKEEPING' || ['saves', 'saved_ibox', 'dive_save', 'dive_catch', 'good_high_claim', 'punches', 'gk_smother', 'accurate_keeper_sweeper', 'cross_not_claimed', 'six_second_violation'].includes(s.stat)) &&
    hasRealActivity(s)
  );

  const getSubtotal = (stats: any[]) => {
    const sum = stats.reduce((acc, curr) => acc + (Number(curr.totalScore) || 0), 0);
    return Math.round(sum * 10) / 10;
  };

  const allAroundTotal = Math.round((
    getSubtotal(generalStats) + 
    getSubtotal(defendingStats) + 
    getSubtotal(possessionStats) + 
    getSubtotal(passingStats) + 
    getSubtotal(attackingStats) + 
    getSubtotal(gkStats)
  ) * 10) / 10;

  // Active game info
  const game = sorareLive?.game;
  const isMatchLive = game?.statusTyped === 'live' || game?.statusTyped === 'in_play' || game?.statusTyped === 'playing' || game?.statusTyped === 'ht';
  const isMatchFinished = game?.statusTyped === 'played' || game?.statusTyped === 'finished';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-[#0b1118] border border-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-b from-slate-900 to-[#0b1118] border-b border-slate-800/80">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Player Identity Row */}
          <div className="flex items-center gap-4">
            {/* Card Picture Thumbnail */}
            <div className="relative w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shadow-md flex-shrink-0">
              <img 
                src={card.pictureUrl || card.avatarUrl} 
                alt={card.displayName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {card.grade && (
                <div className="absolute top-1 left-1 bg-slate-950/80 text-[10px] font-black px-1.5 py-0.5 rounded text-white border border-slate-700">
                  {card.grade}
                </div>
              )}
            </div>

            {/* Names & Badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {card.grade && (
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {card.grade}
                  </span>
                )}
                {cardBonus > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    +{cardBonus}%
                  </span>
                )}
                {isCaptain && (
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> +20% Cap
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                {card.displayName}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-slate-400 flex items-center gap-2">
                <span>{card.club?.name || game?.homeTeam || 'Club'}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 uppercase font-bold">{card.positionCode}</span>
              </p>
            </div>

            {/* Total Live Score Pill */}
            <div className="flex flex-col items-end flex-shrink-0">
              <div className={`px-4 py-2 rounded-2xl border shadow-lg ${
                finalLiveScore != null
                  ? finalLiveScore >= 60
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : finalLiveScore >= 40
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-rose-500 text-white border-rose-400'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                <div className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-center">
                  {finalLiveScore != null ? finalLiveScore : '--'}
                </div>
              </div>
              {baseLiveScore != null && totalBonusPct > 0 && (
                <span className="text-[10px] text-slate-400 mt-1 font-semibold">
                  Base: {baseLiveScore} pts (+{totalBonusPct}%)
                </span>
              )}
            </div>
          </div>

          {/* Match Score & Status Header */}
          {game && (
            <div className="mt-4 p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isMatchLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="font-semibold text-slate-300">
                  {isMatchLive ? `En direct • ${game.minute || '1'}'` : (isMatchFinished ? 'Match terminé' : 'Match à venir')}
                </span>
                {game.competition && (
                  <span className="text-slate-500 hidden sm:inline">• {game.competition}</span>
                )}
              </div>
              <div className="flex items-center gap-3 font-bold text-sm">
                <div className="flex items-center gap-1.5">
                  {game.homeTeamPicture && <img src={game.homeTeamPicture} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-slate-200">{game.homeTeam || 'Domicile'}</span>
                </div>
                <span className="bg-slate-900 text-white px-2 py-0.5 rounded-md font-black border border-slate-700">
                  {game.homeGoals ?? 0} - {game.awayGoals ?? 0}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-200">{game.awayTeam || 'Extérieur'}</span>
                  {game.awayTeamPicture && <img src={game.awayTeamPicture} alt="" className="w-4 h-4 object-contain" />}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content: Decisive & All-Around */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">

          {/* Decisive Score Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Score décisif</span>
                <span className="text-emerald-400 font-black">{decisiveScore} pts</span>
              </h3>
            </div>

            {/* Sorare Decisive Level Gauge */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-4">
              <div className="grid grid-cols-9 gap-1 text-center font-bold text-[11px] mb-1">
                {DECISIVE_LEVELS.map((lvl) => {
                  const isCurrent = (decisiveScore >= lvl.score && (lvl.level === 5 || decisiveScore < DECISIVE_LEVELS[DECISIVE_LEVELS.indexOf(lvl) + 1]?.score));
                  return (
                    <div 
                      key={lvl.level}
                      className={`relative py-2 rounded-lg border transition-all ${
                        isCurrent 
                          ? 'bg-emerald-500 text-slate-950 font-black border-emerald-300 shadow-md shadow-emerald-500/20 scale-105 z-10' 
                          : lvl.color
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
                      )}
                      <div>{lvl.score}</div>
                      <div className={`text-[9px] opacity-75 ${isCurrent ? 'text-slate-950 font-black' : 'text-slate-400'}`}>
                        {lvl.level > 0 ? `+${lvl.level}` : lvl.level}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Decisive Action Collapsible Lists */}
            <div className="space-y-2">
              {/* Positive Decisive */}
              <div className="bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden">
                <button
                  onClick={() => toggleSection('posDecisive')}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-900/60 transition"
                >
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-400">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>Actions décisives positives</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-emerald-400">
                      {positiveDecisive.reduce((sum, s) => sum + (Number(s.statValue) > 0 ? Number(s.statValue) : 1), 0)}
                    </span>
                    {openSections.posDecisive ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {openSections.posDecisive && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-900/80 space-y-1.5">
                    {positiveDecisive.length > 0 ? (
                      positiveDecisive.map((s, idx) => {
                        const val = Number(s.statValue) > 0 ? Number(s.statValue) : 1;
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-0">
                            <span className="text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {STAT_LABELS_FR[s.stat]?.label || s.stat}
                            </span>
                            <span className="font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded text-[11px]">
                              {val > 1 ? `x${val}` : '✓'}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 italic py-1">Aucune action décisive positive enregistrée</p>
                    )}
                  </div>
                )}
              </div>

              {/* Negative Decisive */}
              <div className="bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden">
                <button
                  onClick={() => toggleSection('negDecisive')}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-900/60 transition"
                >
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-rose-400">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Actions décisives négatives</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-rose-400">
                      {negativeDecisive.reduce((sum, s) => sum + (Number(s.statValue) > 0 ? Number(s.statValue) : 1), 0)}
                    </span>
                    {openSections.negDecisive ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {openSections.negDecisive && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-900/80 space-y-1.5">
                    {negativeDecisive.length > 0 ? (
                      negativeDecisive.map((s, idx) => {
                        const val = Number(s.statValue) > 0 ? Number(s.statValue) : 1;
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-0">
                            <span className="text-slate-300 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              {STAT_LABELS_FR[s.stat]?.label || s.stat}
                            </span>
                            <span className="font-bold text-rose-300 bg-rose-950/80 border border-rose-500/40 px-2 py-0.5 rounded text-[11px]">
                              {val > 1 ? `x${val}` : '✗'}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 italic py-1">Aucune action décisive négative</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* All-Around Score Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Score All-Around (AAS)</span>
                <span className={`font-black ${allAroundTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {allAroundTotal > 0 ? `+${allAroundTotal}` : allAroundTotal} pts
                </span>
              </h3>
              {loading && (
                <span className="text-xs text-slate-400 animate-pulse flex items-center gap-1">
                  <Activity className="w-3 h-3 animate-spin" /> Synchronisation détaillée...
                </span>
              )}
            </div>

            {/* Collapsible Categories */}
            <div className="space-y-2">
              {[
                { key: 'general', title: 'Général', stats: generalStats },
                { key: 'defending', title: 'Défense', stats: defendingStats },
                { key: 'possession', title: 'Possession & Duels', stats: possessionStats },
                { key: 'passing', title: 'Passes & Création', stats: passingStats },
                { key: 'attacking', title: 'Attaque & Tirs', stats: attackingStats },
                ...(card.positionCode === 'GK' || gkStats.length > 0 ? [{ key: 'goalkeeping', title: 'Gardien de but', stats: gkStats }] : []),
              ].map(({ key, title, stats }) => {
                const sub = getSubtotal(stats);
                const isOpen = openSections[key];
                const activeCount = stats.filter(s => (s.statValue && s.statValue > 0) || (s.totalScore && s.totalScore !== 0)).length;

                return (
                  <div key={key} className="bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden">
                    <button
                      onClick={() => toggleSection(key)}
                      className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-900/60 transition"
                    >
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-200">
                        <span>{title}</span>
                        {activeCount > 0 && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded-full">
                            {activeCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${
                          sub > 0 ? 'text-emerald-400' : sub < 0 ? 'text-rose-400' : 'text-slate-500'
                        }`}>
                          {sub > 0 ? `+${sub}` : sub} pts
                        </span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-1 border-t border-slate-900/80 space-y-1.5">
                        {stats.length > 0 ? (
                          stats
                            .filter(s => (s.statValue && s.statValue > 0) || (s.totalScore && s.totalScore !== 0))
                            .map((s, idx) => {
                              const scoreVal = Number(s.totalScore) || 0;
                              return (
                                <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-300 font-medium">
                                      {STAT_LABELS_FR[s.stat]?.label || s.stat}
                                    </span>
                                    {s.statValue != null && (
                                      <span className="text-[10px] text-slate-500">
                                        (x{s.statValue})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {s.points != null && (
                                      <span className="text-[10px] text-slate-500">
                                        {s.points > 0 ? `+${s.points}` : s.points}/u
                                      </span>
                                    )}
                                    <span className={`font-black text-xs min-w-[36px] text-right ${
                                      scoreVal > 0 ? 'text-emerald-400' : scoreVal < 0 ? 'text-rose-400' : 'text-slate-400'
                                    }`}>
                                      {scoreVal > 0 ? `+${scoreVal}` : scoreVal}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                        ) : (
                          <p className="text-xs text-slate-500 italic py-1">Aucune donnée disponible</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Données en temps réel Sorare SO5</span>
          </div>
          <button 
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </div>
  );
};
