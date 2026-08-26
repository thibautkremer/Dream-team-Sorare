import React, { useState, useMemo } from 'react';
import { Sparkles, Crown, Shield, ArrowRightLeft, Eye, AlertTriangle, AlertCircle, CheckCircle2, ChevronRight, Activity, Flame, Zap, Award, Filter, ChevronDown, ChevronUp, Calendar, Percent, Send, Share2, Scale, Swords, Users, ShieldCheck, Lock, Unlock, Download, BellRing, Radio } from 'lucide-react';
import { SorareCard, Lineup, StrategyType, SlotPosition, LineupOptimizationFilters, NonStarterAlert, StartingXIPlayerInfo } from '../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, getPlayerRecentMatchAnalysis, getLineupOpponentConflicts, getLineupClubStacks, areOpponents, isSameClub } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, formatInjuryBadge, getPlayerStars, getCardTotalBonus } from '../utils/sorareSlug';

interface PitchViewProps {
  lineup: Lineup;
  setLineup: React.Dispatch<React.SetStateAction<Lineup>>;
  cards: SorareCard[];
  onOptimizeAI: (strategy: StrategyType) => Promise<void>;
  isOptimizing: boolean;
  onOpenScout: (card: SorareCard) => void;
  onOpenAnalysis: () => void;
  onSelectSlotToSwap: (slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  filters: LineupOptimizationFilters;
  setFilters: React.Dispatch<React.SetStateAction<LineupOptimizationFilters>>;
  compositions: Lineup[];
  selectedCompoIndex: number;
  onSelectComposition: (index: number) => void;
  onExportLineup?: (lineup: Lineup) => void;
  onToggleLockCompo?: (index: number) => void;
  onImportSorareLineups?: () => void;
  alerts?: NonStarterAlert[];
  playerStatusMap?: Record<string, StartingXIPlayerInfo>;
  onOpenStartingXIMonitor?: () => void;
}

export const PitchView: React.FC<PitchViewProps> = ({
  lineup,
  setLineup,
  cards,
  onOptimizeAI,
  isOptimizing,
  onOpenScout,
  onOpenAnalysis,
  onSelectSlotToSwap,
  filters,
  setFilters,
  compositions,
  selectedCompoIndex,
  onSelectComposition,
  onExportLineup,
  onToggleLockCompo,
  onImportSorareLineups,
  alerts = [],
  playerStatusMap = {},
  onOpenStartingXIMonitor,
}) => {
  // Accordion state: filters open by default, can be toggled
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  
  // Track which composition's pitch is currently expanded (hidden by default = null)
  const [expandedPitchIndex, setExpandedPitchIndex] = useState<number | null>(null);

  // Mobile layout state: compact list mode vs vertical formation mode
  const [mobileCompactView, setMobileCompactView] = useState(false);

  // Touch swipe support for switching compositions on mobile
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Detect horizontal swipe (horizontal movement > 50px and more prominent than vertical)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        // Swipe Left -> Next composition
        const nextIdx = (selectedCompoIndex + 1) % compositions.length;
        onSelectComposition(nextIdx);
        setExpandedPitchIndex(nextIdx);
      } else {
        // Swipe Right -> Previous composition
        const prevIdx = (selectedCompoIndex - 1 + compositions.length) % compositions.length;
        onSelectComposition(prevIdx);
        setExpandedPitchIndex(prevIdx);
      }
    }
  };

  // Track removed sold/missing cards count for desynchronization alert
  const [removedCardsCount, setRemovedCardsCount] = useState<number>(0);

  // Validate lineup slots against current gallery to remove sold/missing cards safely
  React.useEffect(() => {
    if (!cards || cards.length === 0) return;
    const cardIds = new Set(cards.map(c => c.id));
    let removedTotal = 0;
    const newSlots = { ...lineup.slots };

    (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
      const card = newSlots[slotKey];
      if (card && !cardIds.has(card.id)) {
        // Card is no longer in gallery
        newSlots[slotKey] = null;
        removedTotal++;
      }
    });

    if (removedTotal > 0) {
      setRemovedCardsCount(prev => prev + removedTotal);
      setLineup(prev => ({
        ...prev,
        slots: newSlots
      }));
    }
  }, [cards]);

  const handleToggleCompositionPitch = (index: number) => {
    onSelectComposition(index);
    if (expandedPitchIndex === index) {
      setExpandedPitchIndex(null); // Collapse on second click
    } else {
      setExpandedPitchIndex(index); // Expand this composition's pitch
    }
  };

  const handleCaptainChangeForLineup = (targetLineup: Lineup, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => {
    const slots = targetLineup.slots;
    const playerObj = slots[slot];
    if (!playerObj) return;

    const getProj = (c: SorareCard | null) => c ? calculatePlayerProjectedScore(c, targetLineup.strategy).projectedScore : 0;
    const baseSum = (
      getProj(slots.gk) +
      getProj(slots.def) +
      getProj(slots.mid) +
      getProj(slots.fwd) +
      getProj(slots.extra)
    );

    const getBaseProj = (c: SorareCard | null) => c ? calculatePlayerProjectedScore(c, targetLineup.strategy).baseProjectedScore : 0;
    const captainBaseScore = getBaseProj(playerObj);
    const captainBonus = Math.round((captainBaseScore * 0.20) * 10) / 10;

    const updatedLineup: Lineup = {
      ...targetLineup,
      captainSlot: slot,
      projectedTotalWithCaptain: Math.round((baseSum + captainBonus) * 10) / 10,
    };

    setLineup(updatedLineup);
  };

  // Helper to render an individual pitch card on the field
  const renderPitchCard = (
    targetLineup: Lineup,
    slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra',
    slotLabel: string,
    expectedPosition: 'GK' | 'DEF' | 'MID' | 'FWD' | 'EXTRA'
  ) => {
    const card = targetLineup.slots[slotKey];
    const isCaptain = targetLineup.captainSlot === slotKey;
    const posBadge = formatPositionBadge(card?.positionCode || expectedPosition);
    const statusInfo = card ? formatStatusBadge(card.status, card.starterConfidence) : null;

    if (!card) {
      return (
        <div
          onClick={() => onSelectSlotToSwap(slotKey)}
          className="group relative flex h-52 w-full max-w-[150px] xs:max-w-[160px] sm:h-60 sm:w-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700/80 bg-slate-900/70 p-3 text-center shadow-lg backdrop-blur transition hover:border-emerald-400 hover:bg-slate-800/80"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-slate-400 group-hover:bg-emerald-400 group-hover:text-slate-950 transition">
            <span className="text-sm font-black">{expectedPosition}</span>
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-300">Emplacement {slotLabel}</span>
          <span className="text-[11px] text-emerald-400 font-bold mt-1">Cliquer pour choisir</span>
        </div>
      );
    }

    const cardBreakdown = calculatePlayerProjectedScore(card, targetLineup.strategy, cards);
    const projected = cardBreakdown.projectedScore;
    const bonusIfCaptain = isCaptain ? Math.round((cardBreakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
    const totalBonusPct = Math.round((cardBreakdown.cardBonusPercentage + (isCaptain ? 20 : 0)) * 10) / 10;
    const totalBonusScore = Math.round((cardBreakdown.cardBonusScore + bonusIfCaptain) * 10) / 10;
    const winProb = getPlayerWinProbability(card.upcomingFixture);
    const recentStats = getPlayerRecentMatchAnalysis(card);
    const injuryInfo = formatInjuryBadge(card.injuryStatus);

    // Conflict and synergy detection with rest of lineup
    const otherPlayers = Object.entries(targetLineup.slots)
      .filter(([k, p]) => k !== slotKey && p !== null)
      .map(([_, p]) => p as SorareCard);
    const opposingTeammate = otherPlayers.find(other => areOpponents(card, other));
    const stackedTeammates = otherPlayers.filter(other => isSameClub(card.club?.name, other.club?.name));

    return (
      <div
        onClick={() => onOpenScout(card)}
        className={`relative flex h-auto min-h-[275px] sm:min-h-[335px] w-full max-w-[150px] xs:max-w-[160px] sm:w-48 flex-col justify-between rounded-2xl border transition-all duration-300 shadow-xl overflow-hidden backdrop-blur-md cursor-pointer hover:scale-[1.03] hover:border-emerald-500/50 active:scale-[0.99] group/card pb-1.5 ${
          isCaptain
            ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-gradient-to-b from-emerald-950/50 via-slate-900/90 to-slate-950 shadow-emerald-500/10'
            : 'border-slate-700/70 bg-slate-900/90 hover:border-slate-500'
        }`}
      >
        {/* Card Header Top */}
        <div className="flex items-center justify-between p-2 bg-slate-950/80 border-b border-slate-800/60 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black shrink-0 ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
              {card.positionCode}
            </span>
            {/* Tiny Star count */}
            <span className="bg-amber-500/10 text-amber-400 font-extrabold text-[9px] px-1 rounded border border-amber-500/20 shrink-0">
              {getPlayerStars(card)}★
            </span>
            {cardBreakdown.cardBonusPercentage > 0 && (
              <span className="bg-amber-500/15 text-amber-300 font-black text-[9px] px-1 rounded border border-amber-500/30 shrink-0" title={`Bonus intrinsèque de la carte : +${cardBreakdown.cardBonusPercentage}%`}>
                +{cardBreakdown.cardBonusPercentage}%
              </span>
            )}
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
              {slotKey === 'extra' ? 'EXTRA' : slotLabel}
            </span>
          </div>

          {/* Captain Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCaptainChangeForLineup(targetLineup, slotKey);
            }}
            title={isCaptain ? 'Capitaine actif (+20%)' : 'Nommer Capitaine'}
            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black transition-all shrink-0 ${
              isCaptain
                ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/30 ring-1 ring-emerald-300 scale-105'
                : 'bg-slate-800/80 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300'
            }`}
          >
            <Crown className="h-2.5 w-2.5" />
            <span>{isCaptain ? 'CAP' : 'C'}</span>
          </button>
        </div>

        {/* Player Image & Club */}
        <div className="relative flex flex-col items-center px-3 pt-2">
          <div className="relative">
            <img
              src={card.pictureUrl}
              alt={card.displayName}
              referrerPolicy="no-referrer"
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-contain bg-slate-950/60 border-2 border-slate-700/80 shadow-md transition-transform group-hover/card:scale-105 p-1"
            />
            {card.club?.pictureUrl && (
              <img
                src={card.club.pictureUrl}
                alt={card.club.name || 'Club'}
                referrerPolicy="no-referrer"
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border border-slate-700 bg-slate-950 p-0.5 shadow"
              />
            )}
          </div>

          <h3 className="mt-2 text-center text-xs sm:text-sm font-black text-white truncate max-w-full group-hover/card:text-emerald-400 transition">
            {card.displayName}
          </h3>
          
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap justify-center">
            <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{card.club?.name || 'Club'}</span>
            {injuryInfo ? (
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${injuryInfo.bg} ${injuryInfo.color} flex items-center gap-1`}>
                <span>{injuryInfo.icon}</span>
                <span>{injuryInfo.label}</span>
              </span>
            ) : statusInfo ? (
              <span className={`text-[9px] font-bold ${statusInfo.color}`}>
                • {statusInfo.label}
              </span>
            ) : null}
          </div>
        </div>

        {/* Projected Score & Next Match Info */}
        <div className="px-2.5 pb-2.5">
          {/* Projected Score Box */}
          <div className="rounded-xl bg-slate-950/80 p-2 border border-slate-800/80">
            <div className="space-y-0.5 text-[10px]">
              <div className="flex items-center justify-between text-slate-400">
                <span>Base :</span>
                <span className="font-semibold text-slate-200">{cardBreakdown.baseProjectedScore} ({cardBreakdown.projectedFloor}-{cardBreakdown.projectedCeiling}) pts</span>
              </div>
              {isCaptain ? (
                <>
                  <div className="flex items-center justify-between text-slate-400 text-[9.5px]">
                    <span className="text-slate-400">Bonus Carte (+{cardBreakdown.cardBonusPercentage}%) :</span>
                    <span className="font-semibold text-amber-300">+{cardBreakdown.cardBonusScore} pts</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[9.5px]">
                    <span className="text-emerald-400 font-semibold">Bonus Cap (+20%) :</span>
                    <span className="font-semibold text-emerald-400">+{bonusIfCaptain} pts</span>
                  </div>
                  <div className="flex items-center justify-between font-bold border-t border-slate-800/60 pt-0.5 mt-0.5">
                    <span className="text-amber-300">Total Bonus (+{totalBonusPct}%) :</span>
                    <span className="font-bold text-amber-300">+{totalBonusScore} pts</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Bonus Carte (+{cardBreakdown.cardBonusPercentage}%) :</span>
                  <span className="font-bold text-amber-300">+{cardBreakdown.cardBonusScore} pts</span>
                </div>
              )}
              <div className="flex items-center justify-between font-black border-t border-slate-800/80 pt-1 mt-1">
                <span className="text-slate-300">Total Projeté :</span>
                <span className="text-emerald-400 text-xs font-black">
                  {Math.round((cardBreakdown.baseProjectedScore + totalBonusScore) * 10) / 10} pts
                </span>
              </div>
            </div>

            {/* Tactical Club Synergy or Opponent Conflict Badge */}
            {stackedTeammates.length > 0 && (
              <div className="mt-1 flex items-center justify-between text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                <span className="flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  <span>Stack Club ({stackedTeammates.length + 1}x)</span>
                </span>
                <span className="text-[8px] text-emerald-400">Synergie</span>
              </div>
            )}

            {opposingTeammate && (
              <div className="mt-1 flex items-center justify-between text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300">
                <span className="flex items-center gap-1">
                  <Swords className="h-2.5 w-2.5 text-rose-400" />
                  <span>Duel direct</span>
                </span>
                <span className="text-[8px] text-rose-400 truncate max-w-[65px]">vs {opposingTeammate.displayName.split(' ').pop()}</span>
              </div>
            )}

            {/* Last Match Status Badge */}
            <div className="mt-1 flex items-center justify-between text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800">
              <span className="text-slate-400">
                {recentStats.isLive ? '🔴 M1 (En direct):' : 'M1 (Dernier):'}
              </span>
              {recentStats.playedLastMatch || recentStats.lastMatchScore > 0 ? (
                <span className={`font-extrabold ${recentStats.isLive ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                  {recentStats.isLive ? '🔴 ' : '✓ '}{recentStats.lastMatchScore} pts
                </span>
              ) : (
                <span className="text-rose-400 font-extrabold">⚠️ Non joué</span>
              )}
            </div>

            {/* Next Fixture Snippet with Win Prob & Date */}
            {card.upcomingFixture && (
              <div className="mt-1 border-t border-slate-800/60 pt-1 text-[10px] space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 truncate max-w-[85px] font-medium">
                    {card.upcomingFixture.isHome ? 'vs' : '@'} {card.upcomingFixture.opponent}
                  </span>
                  <span className="font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                    {winProb}% Vic.
                  </span>
                </div>
                <div className="text-[9px] text-slate-500 truncate">
                  📅 {formatKickoffDate(card.upcomingFixture.kickoffDate || card.upcomingFixture.matchDate)}
                </div>
              </div>
            )}

            {/* Official Starting Lineup Badge (1h before kickoff) */}
            {(() => {
              const pSlug = (card.playerSlug || card.slug || card.displayName || '').toLowerCase();
              const sInfo = playerStatusMap ? Object.values(playerStatusMap).find(
                i => i.playerSlug.toLowerCase() === pSlug || i.displayName.toLowerCase() === card.displayName.toLowerCase()
              ) : null;

              if (!sInfo) return null;

              if (sInfo.lineupStatus === 'CONFIRMED_BENCH') {
                return (
                  <div className="mt-1 flex items-center justify-between text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500 text-rose-300 animate-pulse">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5 text-rose-400" />
                      <span>REMPLAÇANT</span>
                    </span>
                    <span className="text-[8px] text-rose-300 uppercase">Compo off.</span>
                  </div>
                );
              }
              if (sInfo.lineupStatus === 'CONFIRMED_OUT') {
                return (
                  <div className="mt-1 flex items-center justify-between text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500 text-rose-300">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-2.5 w-2.5 text-rose-400" />
                      <span>HORS GROUPE</span>
                    </span>
                    <span className="text-[8px] text-rose-300 uppercase">Compo off.</span>
                  </div>
                );
              }
              if (sInfo.lineupStatus === 'CONFIRMED_STARTER') {
                return (
                  <div className="mt-1 flex items-center justify-between text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/60 text-emerald-300">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                      <span>TITULAIRE</span>
                    </span>
                    <span className="text-[8px] text-emerald-400 uppercase">Compo off. 1h</span>
                  </div>
                );
              }
              if (sInfo.minutesUntilKickoff !== null && sInfo.minutesUntilKickoff > 0) {
                const minToOfficial = Math.max(0, sInfo.minutesUntilKickoff - 60);
                return (
                  <div className="mt-1 flex items-center justify-between text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    <span>Compo officielle :</span>
                    <span className="font-bold text-slate-300">
                      {minToOfficial === 0 ? 'Imminente' : `dans ${minToOfficial} min`}
                    </span>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Swap Player Action */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectSlotToSwap(slotKey);
            }}
            className="mt-1.5 w-full flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 hover:text-emerald-400 transition"
          >
            <ArrowRightLeft className="h-3 w-3" />
            <span>Remplacer</span>
          </button>
        </div>
      </div>
    );
  };

  // Helper to render the full football pitch for a given lineup
  const renderPitchContainer = (targetLineup: Lineup, compoIndex: number) => {
    // Calcul précis du score brut et de la contribution totale des bonus
    const slotsArr = (['gk', 'def', 'mid', 'fwd', 'extra'] as const)
      .map(slotKey => targetLineup.slots[slotKey])
      .filter((c): c is SorareCard => c !== null);

    const breakdowns = slotsArr.map(c => calculatePlayerProjectedScore(c, targetLineup.strategy, cards));
    const rawBaseSum = Math.round(breakdowns.reduce((acc, b) => acc + b.baseProjectedScore, 0) * 10) / 10;
    const cardBonusSum = Math.round(breakdowns.reduce((acc, b) => acc + b.cardBonusScore, 0) * 10) / 10;
    
    const captainCard = targetLineup.slots[targetLineup.captainSlot];
    const captainBreakdown = captainCard ? calculatePlayerProjectedScore(captainCard, targetLineup.strategy, cards) : null;
    const captainBonusPoints = captainBreakdown ? Math.round((captainBreakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
    const totalBonusSum = Math.round((cardBonusSum + captainBonusPoints) * 10) / 10;

    return (
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative mt-4 rounded-3xl border-2 border-emerald-800/50 bg-gradient-to-b from-emerald-950 via-emerald-900 to-slate-950 p-4 sm:p-8 shadow-2xl overflow-hidden transition-all duration-300 touch-pan-y select-none"
      >
        {/* Mobile Swipe Navigation Helper Bar */}
        <div className="md:hidden flex items-center justify-between bg-slate-950/80 border border-emerald-500/30 rounded-xl px-3 py-1.5 mb-3 text-[11px] text-emerald-300 font-bold">
          <button
            type="button"
            onClick={() => {
              const prevIdx = (compoIndex - 1 + compositions.length) % compositions.length;
              onSelectComposition(prevIdx);
              setExpandedPitchIndex(prevIdx);
            }}
            className="flex items-center gap-1 text-slate-300 hover:text-white active:scale-95"
          >
            <span>‹</span>
            <span>Compo {((compoIndex - 1 + compositions.length) % compositions.length) + 1}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-normal">Balayer ◄ ►</span>
            <div className="flex items-center gap-1">
              {compositions.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === compoIndex ? 'w-4 bg-emerald-400' : 'w-1.5 bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextIdx = (compoIndex + 1) % compositions.length;
              onSelectComposition(nextIdx);
              setExpandedPitchIndex(nextIdx);
            }}
            className="flex items-center gap-1 text-slate-300 hover:text-white active:scale-95"
          >
            <span>Compo {((compoIndex + 1) % compositions.length) + 1}</span>
            <span>›</span>
          </button>
        </div>

        {/* Pitch Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-emerald-800/40">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <div>
              <h4 className="text-sm font-black text-emerald-300 uppercase tracking-wider">
                Terrain Tactique - {targetLineup.name}
              </h4>
              <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                <span>Base : <strong className="text-slate-200">{rawBaseSum} pts</strong></span>
                <span>•</span>
                <span className="text-amber-300 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                  Bonus Cartes & Cap : +{totalBonusSum} pts
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Mobile View Mode Toggle */}
            <button
              type="button"
              onClick={() => setMobileCompactView(v => !v)}
              className="md:hidden flex items-center gap-1.5 rounded-xl bg-slate-800/90 border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:text-white transition"
            >
              <span>{mobileCompactView ? '⚽ Formation' : '📋 Vue Compacte'}</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-emerald-500/30">
              <span className="text-xs text-slate-300">Total :</span>
              <span className="text-base font-black text-emerald-400">
                {targetLineup.projectedTotalWithCaptain} pts
              </span>
            </div>
            {onExportLineup && (
              <button
                type="button"
                onClick={() => onExportLineup(targetLineup)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md hover:bg-emerald-400 transition"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Exporter / Soumettre</span>
              </button>
            )}
          </div>
        </div>

        {/* Pitch Lines Decoration */}
        <div className="pointer-events-none absolute inset-0 opacity-15">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white"></div>
          <div className="absolute top-1/2 left-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"></div>
          <div className="absolute top-0 left-1/2 h-28 w-64 -translate-x-1/2 border-2 border-t-0 border-white"></div>
          <div className="absolute bottom-0 left-1/2 h-28 w-64 -translate-x-1/2 border-2 border-b-0 border-white"></div>
          <div className="absolute top-0 left-0 h-10 w-10 rounded-br-full border-b-2 border-r-2 border-white"></div>
          <div className="absolute top-0 right-0 h-10 w-10 rounded-bl-full border-b-2 border-l-2 border-white"></div>
          <div className="absolute bottom-0 left-0 h-10 w-10 rounded-tr-full border-t-2 border-r-2 border-white"></div>
          <div className="absolute bottom-0 right-0 h-10 w-10 rounded-tl-full border-t-2 border-l-2 border-white"></div>
        </div>

        {/* Pitch Positions Grid - Responsive layout (Vertical tactical on Mobile, Horizontal on Desktop) */}
        <div className="relative z-10 py-4 w-full">
          {/* Smartphone Mobile View */}
          <div className="flex md:hidden flex-col items-center gap-4 w-full">
            {mobileCompactView ? (
              /* Mobile Compact List View */
              <div className="flex flex-col gap-2 w-full py-1">
                {(['gk', 'def', 'mid', 'fwd', 'extra'] as const).map(slotKey => {
                  const card = targetLineup.slots[slotKey];
                  const isCap = targetLineup.captainSlot === slotKey;
                  const posBadge = formatPositionBadge(card?.positionCode || (slotKey === 'extra' ? 'EXTRA' : slotKey.toUpperCase() as any));
                  
                  return (
                    <div
                      key={slotKey}
                      onClick={() => card && onOpenScout(card)}
                      className={`flex items-center justify-between p-3 rounded-2xl bg-slate-900/95 border transition shadow-md cursor-pointer ${
                        isCap ? 'border-emerald-400 ring-1 ring-emerald-400/40 bg-emerald-950/40' : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border ${posBadge.bg} ${posBadge.text} ${posBadge.border}`}>
                          {slotKey === 'extra' ? 'EXTRA' : slotKey.toUpperCase()}
                        </span>
                        {card ? (
                          <div className="flex items-center gap-2.5">
                            <img
                              src={card.pictureUrl}
                              alt={card.displayName}
                              referrerPolicy="no-referrer"
                              className="h-10 w-10 rounded-xl object-contain bg-slate-950 p-0.5 border border-slate-700"
                            />
                            <div>
                              <div className="text-xs font-black text-white flex items-center gap-1.5">
                                <span>{card.displayName}</span>
                                {isCap && (
                                  <span className="bg-emerald-400 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                                    CAP
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span>{card.club?.name || 'Club'}</span>
                                <span className="text-amber-400 font-bold">• +{getCardTotalBonus(card)}%</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-500 font-semibold">Slot vide — Aucun joueur</span>
                        )}
                      </div>
                      {card && (() => {
                        const breakdown = calculatePlayerProjectedScore(card, targetLineup.strategy, cards);
                        const bonusIfCap = isCap ? Math.round((breakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
                        const finalPScore = Math.round((breakdown.projectedScore + bonusIfCap) * 10) / 10;
                        return (
                          <div className="text-right pl-2">
                            <span className="text-xs font-black text-emerald-400 block">
                              {finalPScore} pts
                            </span>
                            <span className="text-[9px] text-slate-400 block">
                              {isCap ? 'Projeté (avec Cap)' : 'Projeté'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Smartphone Vertical Tactical Flow (football formation layout) */
              <>
                {/* Attack: FWD & EXTRA side by side */}
                <div className="flex justify-center items-center gap-2 sm:gap-4 w-full px-1">
                  <div className="w-[48%] max-w-[155px] flex justify-center scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-all duration-300">
                    {renderPitchCard(targetLineup, 'fwd', 'Attaquant', 'FWD')}
                  </div>
                  <div className="w-[48%] max-w-[155px] flex justify-center scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-all duration-300">
                    {renderPitchCard(targetLineup, 'extra', 'Extra', 'EXTRA')}
                  </div>
                </div>
                
                {/* Midfield: MID */}
                <div className="flex justify-center w-full">
                  <div className="scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-all duration-300">
                    {renderPitchCard(targetLineup, 'mid', 'Milieu', 'MID')}
                  </div>
                </div>
                
                {/* Defense: DEF */}
                <div className="flex justify-center w-full">
                  <div className="scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-all duration-300">
                    {renderPitchCard(targetLineup, 'def', 'Défenseur', 'DEF')}
                  </div>
                </div>
                
                {/* Goalkeeper: GK */}
                <div className="flex justify-center w-full">
                  <div className="scale-[0.88] xs:scale-95 sm:scale-100 origin-center transition-all duration-300">
                    {renderPitchCard(targetLineup, 'gk', 'Gardien', 'GK')}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* PC / Wide Screen Horizontal Row */}
          <div className="hidden md:flex flex-row flex-wrap items-center justify-center gap-4 lg:gap-6 w-full">
            <div>{renderPitchCard(targetLineup, 'gk', 'Gardien', 'GK')}</div>
            <div>{renderPitchCard(targetLineup, 'def', 'Défenseur', 'DEF')}</div>
            <div>{renderPitchCard(targetLineup, 'mid', 'Milieu', 'MID')}</div>
            <div>{renderPitchCard(targetLineup, 'fwd', 'Attaquant', 'FWD')}</div>
            <div>{renderPitchCard(targetLineup, 'extra', 'Extra (Joker)', 'EXTRA')}</div>
          </div>
        </div>

        {/* Pitch Legend Bottom */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-800/40 pt-4 text-xs text-emerald-300/80">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-emerald-400" />
            <span>Capitaine avec <strong>+20% de bonus</strong> (cliquez sur le badge C pour changer)</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span><strong>Anti-conflit actif</strong> : 0 joueur adverse dans la même compo</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-400" />
            <span><strong>Synergie de club</strong> : Stacking priorisé à score projeté proche</span>
          </div>
        </div>
      </div>
    );
  };

  const activeLineupForSummary = compositions[selectedCompoIndex] || lineup;

  return (
    <div className="space-y-6">
      
      {/* Desynchronization Alert Banner if missing/sold cards were removed */}
      {removedCardsCount > 0 && (
        <div className="rounded-2xl border border-amber-500/50 bg-amber-950/80 p-4 text-xs text-amber-200 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
            <span>
              <strong>Synchronisation locale :</strong> {removedCardsCount} carte(s) enregistrée(s) (vendue(s) ou transférée(s)) ne figurent plus dans votre galerie et ont été automatiquement retirées de vos compositions.
            </span>
          </div>
          <button
            onClick={() => setRemovedCardsCount(0)}
            className="rounded-lg bg-amber-500/20 border border-amber-500/50 px-3 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/30 transition shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Urgent Non-Starter Lineup Alert Banner */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-500/80 bg-gradient-to-r from-rose-950/90 via-slate-900/90 to-rose-950/90 p-4 sm:p-5 shadow-2xl shadow-rose-950/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white font-black shadow-lg shadow-rose-500/40">
                <AlertTriangle className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <Radio className="h-3 w-3 animate-ping text-rose-400" />
                    Alerte Compositions Officielles (1h avant coup d'envoi)
                  </span>
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-300 border border-rose-500/40">
                    {alerts.length} non-titulaire{alerts.length > 1 ? 's' : ''} détecté{alerts.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-white font-bold mt-1">
                  {alerts[0].message}
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Ce joueur est confirmé remplaçant ou absent. Remplacez-le par un titulaire avant le coup d'envoi pour éviter un DNP (0 pt).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
              <button
                onClick={() => {
                  const firstAlert = alerts[0];
                  const targetIdx = compositions.findIndex(c => c.id === firstAlert.lineupId || c.name === firstAlert.lineupName);
                  if (targetIdx >= 0 && targetIdx !== selectedCompoIndex) {
                    onSelectComposition(targetIdx);
                  }
                  const slotKey = firstAlert.slot.toLowerCase() as 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
                  onSelectSlotToSwap(slotKey);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 px-4 py-2.5 text-xs font-black text-white transition shadow-lg shadow-rose-950/60 cursor-pointer"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Remplacer immédiatement</span>
              </button>
              {onOpenStartingXIMonitor && (
                <button
                  onClick={onOpenStartingXIMonitor}
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-200 transition"
                >
                  Toutes les compos ({alerts.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP FILTERS & CONSTRAINTS PANEL (Collapsible on Click) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-md overflow-hidden">
        
        {/* Clickable Header that collapses/expands the filter section */}
        <div
          onClick={() => setIsFiltersOpen(prev => !prev)}
          className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-slate-800/40 transition select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Filter className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Filtres et Contraintes d'Optimisation</span>
                {(!isFiltersOpen && (filters.maxMatchDate || (filters.minWinProb && filters.minWinProb > 0) || filters.minL5 || filters.minL15 || filters.minAasL15 || filters.minDsL15 || filters.starterOnly || filters.homeOnly)) && (
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    Filtres actifs
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                {isFiltersOpen ? 'Cliquez pour réduire la section des filtres' : 'Cliquez pour afficher et modifier les filtres'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOptimizeAI('BALANCED');
              }}
              disabled={isOptimizing}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 px-4 py-2 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-60"
            >
              <Sparkles className={`h-4 w-4 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span>{isOptimizing ? 'Calcul IA en cours...' : 'Optimiser avec Gemini'}</span>
            </button>

            <button
              onClick={onOpenAnalysis}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <Activity className="h-4 w-4 text-emerald-400" />
              <span>Rapport Tactique</span>
            </button>

            <div className="p-1 rounded-lg bg-slate-800 text-slate-300">
              {isFiltersOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </div>

        {/* Collapsible Filter Body */}
        {isFiltersOpen && (
          <div className="p-4 sm:p-6 pt-0 border-t border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              
              {/* Date Filter (Matchs jusqu'à cette date, incluse) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-emerald-400" />
                    <span>Matchs jusqu'au (inclus)</span>
                  </span>
                  {filters.maxMatchDate && (
                    <button
                      type="button"
                      onClick={() => setFilters(prev => ({ ...prev, maxMatchDate: undefined }))}
                      className="text-[10px] text-emerald-400 hover:underline"
                    >
                      Effacer
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={filters.maxMatchDate || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxMatchDate: e.target.value || undefined }))}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {
                        // Browser opens picker natively
                      }
                    }}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                  {filters.maxMatchDate && (
                    <button
                      type="button"
                      onClick={() => setFilters(prev => ({ ...prev, maxMatchDate: undefined }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs bg-slate-800 rounded px-1"
                      title="Effacer le filtre date"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Win Probability Filter (Paliers de 5% entre 25 et 50%) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Percent className="h-3 w-3 text-emerald-400" />
                  <span>% Victoire de l'équipe</span>
                </label>
                <select
                  value={filters.minWinProb || 0}
                  onChange={(e) => setFilters(prev => ({ ...prev, minWinProb: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value={0}>Toutes les cotes (Sans minimum)</option>
                  <option value={25}>&ge; 25% chances de victoire</option>
                  <option value={30}>&ge; 30% chances de victoire</option>
                  <option value={35}>&ge; 35% chances de victoire</option>
                  <option value={40}>&ge; 40% chances de victoire</option>
                  <option value={45}>&ge; 45% chances de victoire</option>
                  <option value={50}>&ge; 50% chances de victoire</option>
                </select>
              </div>

              {/* Min L5 */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Flame className="h-3 w-3 text-emerald-400" />
                  <span>Forme L5 Minimale</span>
                </label>
                <select
                  value={filters.minL5 || 0}
                  onChange={(e) => setFilters(prev => ({ ...prev, minL5: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value={0}>Aucun minimum</option>
                  <option value={40}>&ge; 40 pts (Correct)</option>
                  <option value={45}>&ge; 45 pts (Bon)</option>
                  <option value={50}>&ge; 50 pts (Solide)</option>
                  <option value={55}>&ge; 55 pts (Elite)</option>
                  <option value={60}>&ge; 60 pts (Top Surchauffe)</option>
                </select>
              </div>

              {/* Min L15 */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Activity className="h-3 w-3 text-emerald-400" />
                  <span>Forme L15 Minimale</span>
                </label>
                <select
                  value={filters.minL15 || 0}
                  onChange={(e) => setFilters(prev => ({ ...prev, minL15: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value={0}>Aucun minimum</option>
                  <option value={40}>&ge; 40 pts (Correct)</option>
                  <option value={45}>&ge; 45 pts (Bon)</option>
                  <option value={50}>&ge; 50 pts (Solide)</option>
                  <option value={55}>&ge; 55 pts (Elite)</option>
                  <option value={60}>&ge; 60 pts (Top Régulier)</option>
                </select>
              </div>

              {/* Min DS L15 */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Flame className="h-3 w-3 text-amber-400" />
                  <span>Score Décisif (DS) L15</span>
                </label>
                <select
                  value={filters.minDsL15 || 0}
                  onChange={(e) => setFilters(prev => ({ ...prev, minDsL15: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value={0}>Aucun minimum</option>
                  <option value={20}>&ge; 20 pts</option>
                  <option value={30}>&ge; 30 pts</option>
                  <option value={40}>&ge; 40 pts</option>
                  <option value={50}>&ge; 50 pts</option>
                </select>
              </div>

              {/* Min AAS L15 */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Activity className="h-3 w-3 text-blue-400" />
                  <span>Score All-Around (AAS) L15</span>
                </label>
                <select
                  value={filters.minAasL15 || 0}
                  onChange={(e) => setFilters(prev => ({ ...prev, minAasL15: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value={0}>Aucun minimum</option>
                  <option value={10}>&ge; 10 pts</option>
                  <option value={15}>&ge; 15 pts</option>
                  <option value={20}>&ge; 20 pts</option>
                  <option value={25}>&ge; 25 pts</option>
                </select>
              </div>

              {/* Preferred Extra Position */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Poste EXTRA (Joker)</label>
                <select
                  value={filters.preferredExtraPosition || 'AUTO'}
                  onChange={(e) => setFilters(prev => ({ ...prev, preferredExtraPosition: e.target.value as any }))}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                >
                  <option value="AUTO">Automatique (Meilleur Champ)</option>
                  <option value="FWD">Forcer Attaquant (2 FWD)</option>
                  <option value="MID">Forcer Milieu (2 MID)</option>
                  <option value="DEF">Forcer Défenseur (2 DEF)</option>
                </select>
              </div>

              {/* Scoring Focus Profile (AAS vs DS vs Équilibré) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Scale className="h-3 w-3 text-blue-400" />
                  <span>Orientation Tactique (AAS / DS)</span>
                </label>
                <select
                  value={filters.scoringFocus || 'BALANCED'}
                  onChange={(e) => setFilters(prev => ({ ...prev, scoringFocus: e.target.value as any }))}
                  className="w-full rounded-lg bg-slate-900 border border-blue-500/40 px-3 py-1.5 text-xs text-blue-300 font-bold focus:outline-none focus:border-blue-400"
                >
                  <option value="BALANCED">⚖️ Équilibré (AAS + DS)</option>
                  <option value="AAS">🛡️ Focus AAS (Volume & Régularité)</option>
                  <option value="DS">⚡ Focus DS (Scores Décisifs & Plafond)</option>
                </select>
              </div>

              {/* Toggles & Reset button */}
              <div className="sm:col-span-2 md:col-span-4 flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">Titularisation :</span>
                    <select
                      value={filters.minStarterConfidence || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setFilters(prev => ({ 
                          ...prev, 
                          minStarterConfidence: val,
                          starterOnly: val >= 85
                        }));
                      }}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value={0}>Toutes confiances</option>
                      <option value={40}>Probable (40%+)</option>
                      <option value={60}>Très Probable (60%+)</option>
                      <option value={85}>Titulaire Indiscutable (85%+)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.homeOnly || false}
                      onChange={(e) => setFilters(prev => ({ ...prev, homeOnly: e.target.checked }))}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 h-4 w-4"
                    />
                    <span className="text-xs font-medium text-slate-200">Domicile uniquement (🏠)</span>
                  </label>
                </div>

                <button
                  onClick={() => setFilters({
                    rarity: 'ALL',
                    ageCategory: 'ALL',
                    starterOnly: false,
                    minStarterConfidence: 0,
                    homeOnly: false,
                    maxFixtureDifficulty: 5,
                    minL5: 0,
                    minL15: 0,
                    preferredExtraPosition: 'AUTO',
                    selectedClub: 'ALL',
                    maxMatchDate: undefined,
                    minWinProb: 0,
                    scoringFocus: 'BALANCED',
                  })}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline"
                >
                  Réinitialiser tous les filtres
                </button>
              </div>
            </div>
          </div>
        )}
      </div>


      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>Les 4 Compositions Optimisées</span>
            <span className="text-[11px] font-normal text-slate-400 lowercase hidden sm:inline">(cliquez sur une compo pour déplier/replier son terrain)</span>
          </h3>

          {onImportSorareLineups && (
            <button
              onClick={onImportSorareLineups}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-sm w-fit"
              title="Importer vos équipes actuellement enregistrées sur Sorare pour la Game Week active"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Importer mes équipes Sorare</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          {compositions.map((comp, idx) => {
            const isSelected = idx === selectedCompoIndex;
            const isPitchOpen = expandedPitchIndex === idx;
            const conflicts = getLineupOpponentConflicts(comp.slots);
            const stacks = getLineupClubStacks(comp.slots);

            return (
              <div key={comp.id || idx} className="space-y-2">
                {/* Composition Card Row */}
                <div
                  onClick={() => handleToggleCompositionPitch(idx)}
                  className={`cursor-pointer rounded-2xl border p-4 sm:p-5 transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                    isPitchOpen
                      ? 'border-emerald-500 bg-emerald-950/30 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/40'
                      : isSelected
                      ? 'border-emerald-500/60 bg-slate-900/90 hover:border-emerald-500'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90'
                  }`}
                >
                  {/* Left Side: Compo Title & Projected Score */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider rounded bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">
                        Compo {idx + 1}
                      </span>
                      {isSelected && (
                        <span className="bg-emerald-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">
                          Sélectionnée
                        </span>
                      )}
                      
                      {/* Lock Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLockCompo?.(idx);
                        }}
                        className={`ml-2 px-2.5 py-0.5 rounded-lg border transition flex items-center gap-1 text-[11px] font-bold ${
                          comp.isLocked
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title={comp.isLocked ? "Composition verrouillée (protégée contre l'écrasement)" : "Verrouiller cette composition"}
                      >
                        {comp.isLocked ? <Lock className="h-3 w-3 text-amber-400" /> : <Unlock className="h-3 w-3" />}
                        <span>{comp.isLocked ? 'Verrouillée' : 'Verrouiller'}</span>
                      </button>

                      <span className="text-[11px] text-slate-400 ml-auto md:ml-2">
                        {isPitchOpen ? '▼ Masquer' : '▶ Terrain'}
                      </span>
                    </div>

                    <h4 className="font-black text-base sm:text-lg text-white">{comp.name || `Compo ${idx + 1}`}</h4>
                    
                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-xl sm:text-2xl font-black text-emerald-400">{comp.projectedTotalWithCaptain}</span>
                      <span className="text-xs text-slate-400 font-semibold">pts projetés</span>
                      <span className="text-xs text-slate-500">
                        (Cap: {comp.slots[comp.captainSlot]?.displayName || 'Capitaine'} | <span className="text-amber-400 font-bold">+{Math.round((comp.projectedTotalWithCaptain - comp.projectedTotal) * 10) / 10} pts</span>)
                      </span>
                      <span className="text-xs text-blue-400 font-semibold ml-1">
                        CS: {comp.slots.gk?.upcomingFixture?.bookmaker?.cleanSheetProb || 60}%
                      </span>
                    </div>

                    {/* Tactical synergy & conflict summary chips */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {conflicts.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="h-3 w-3 text-emerald-400" />
                          <span>0 duel direct (aucun adversaire)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-950/70 border border-rose-500/30 px-2 py-0.5 rounded-full">
                          <Swords className="h-3 w-3 text-rose-400" />
                          <span>{conflicts.length} duel direct</span>
                        </span>
                      )}

                      {stacks.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                          <Users className="h-3 w-3 text-cyan-400" />
                          <span>Synergie {stacks.map(s => `${s.count}x ${s.clubName}`).join(', ')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side: 5 Player Thumbnails (Enlarged & Showing Projected Score + Card Bonus Badge) */}
                  <div className="grid grid-cols-5 sm:flex sm:items-start sm:justify-end gap-1.5 xs:gap-2 sm:gap-3 border-t md:border-t-0 border-slate-800/80 pt-3 md:pt-0 w-full sm:w-auto">
                    {(['gk', 'def', 'mid', 'fwd', 'extra'] as const).map((slotKey) => {
                      const player = comp.slots[slotKey];
                      const breakdown = player ? calculatePlayerProjectedScore(player, comp.strategy, cards) : null;
                      const isCap = comp.captainSlot === slotKey;
                      const bonusIfCap = isCap && breakdown ? Math.round((breakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
                      const finalScore = breakdown ? Math.round((breakdown.projectedScore + bonusIfCap) * 10) / 10 : 0;
                      const cardBonus = player ? getCardTotalBonus(player) : 0;
                      const posCode = player?.positionCode || (slotKey === 'extra' ? 'EXTRA' : slotKey.toUpperCase());
                      const posBadge = formatPositionBadge(posCode as any);

                      return (
                        <div key={slotKey} className="flex flex-col items-center gap-1">
                          {/* Avatar */}
                          <div
                            className={`relative aspect-square w-full max-w-[48px] xs:max-w-[54px] sm:w-16 sm:h-16 rounded-xl bg-slate-950 border flex items-center justify-center overflow-hidden shadow-md transition-transform hover:scale-105 ${
                              isCap ? 'border-emerald-400 ring-2 ring-emerald-400/40' : 'border-slate-700'
                            }`}
                            title={player?.displayName || slotKey.toUpperCase()}
                          >
                            {player ? (
                              <img
                                src={player.pictureUrl}
                                alt={player.displayName}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-contain p-0.5"
                              />
                            ) : (
                              <span className="text-[10px] font-black text-slate-500">
                                {slotKey === 'extra' ? 'EX' : slotKey.substring(0, 2).toUpperCase()}
                              </span>
                            )}

                            {/* Mini Position badge */}
                            <span className={`absolute top-0.5 left-0.5 text-[8px] font-black px-1 rounded ${posBadge.bg} ${posBadge.text}`}>
                              {posCode}
                            </span>

                            {/* Card Bonus Pill */}
                            {player && (
                              <span className="absolute bottom-0.5 left-0.5 text-[8px] font-black px-1 py-0.2 rounded bg-amber-500/90 text-slate-950 shadow">
                                +{cardBonus}%
                              </span>
                            )}

                            {/* Crown if Captain */}
                            {isCap && (
                              <div className="absolute top-0.5 right-0.5 bg-emerald-400 text-slate-950 p-0.5 rounded-full shadow">
                                <Crown className="h-2.5 w-2.5" />
                              </div>
                            )}
                          </div>

                          {/* Player Projected Score Underneath Thumbnail */}
                          {player ? (
                            <div className="text-center">
                              <span className={`text-[11px] font-black block ${isCap ? 'text-emerald-400' : 'text-slate-200'}`}>
                                {finalScore}
                              </span>
                              <span className="text-[9px] text-slate-400 truncate max-w-[56px] block">
                                {player.displayName.split(' ').pop()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600 font-bold">-</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* The Pitch Container Rendered Directly Below the Active Composition */}
                {isPitchOpen && renderPitchContainer(comp, idx)}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
