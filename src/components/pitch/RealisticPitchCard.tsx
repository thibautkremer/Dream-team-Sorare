import React, { useState } from 'react';
import { Sparkles, Trophy, Shield, Star, Award, ArrowRightLeft, Crown, Swords, Users, AlertTriangle, AlertCircle, CheckCircle2, Target, Calendar, BarChart2, Trash2 } from 'lucide-react';
import { SorareCard, Lineup, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, areOpponents, isSameClub } from '../../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, formatInjuryBadge, getPlayerStars, getCardTotalBonus, getCardBonusBreakdown } from '../../utils/sorareSlug';

interface RealisticPitchCardProps {
  card: SorareCard | null;
  slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
  slotLabel: string;
  expectedPosition: 'GK' | 'DEF' | 'MID' | 'FWD' | 'EXTRA';
  targetLineup: Lineup;
  allCards: SorareCard[];
  isCaptain: boolean;
  onSetCaptain: (slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onOpenScout: (card: SorareCard) => void;
  onQuickSwap: (slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onClearSlot?: (slotKey: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  playerStatusMap?: Record<string, any>;
}

export const RealisticPitchCard: React.FC<RealisticPitchCardProps> = ({
  card,
  slotKey,
  slotLabel,
  expectedPosition,
  targetLineup,
  allCards,
  isCaptain,
  onSetCaptain,
  onOpenScout,
  onQuickSwap,
  onClearSlot,
  playerStatusMap = {},
}) => {
  const [showBonusDetail, setShowBonusDetail] = useState(false);

  if (!card) {
    return (
      <div
        onClick={() => onQuickSwap(slotKey)}
        className="group relative flex flex-col items-center justify-center h-48 sm:h-56 w-full max-w-[155px] xs:max-w-[165px] sm:max-w-[185px] rounded-2xl border-2 border-dashed border-emerald-500/40 bg-slate-950/70 p-3 text-center shadow-xl backdrop-blur-md transition-all duration-200 hover:border-emerald-400 hover:bg-slate-900/90 cursor-pointer hover:scale-105"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-emerald-500/30 text-emerald-400 font-black text-sm group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors shadow-inner">
          {expectedPosition}
        </div>
        <span className="mt-2.5 text-xs font-bold text-slate-200">Slot {slotLabel}</span>
        <span className="mt-1 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          + Choisir joueur
        </span>
      </div>
    );
  }

  const rarity = (card.rarity || 'LIMITED').toUpperCase();
  const posBadge = formatPositionBadge(card.positionCode || expectedPosition);
  const cardBreakdown = calculatePlayerProjectedScore(card, targetLineup.strategy, allCards);
  const bonusIfCaptain = isCaptain ? Math.round((cardBreakdown.baseProjectedScore * 0.20) * 10) / 10 : 0;
  const totalBonusPct = Math.round((cardBreakdown.cardBonusPercentage + (isCaptain ? 20 : 0)) * 10) / 10;
  const finalProjectedScore = Math.round((cardBreakdown.projectedScore + bonusIfCaptain) * 10) / 10;

  const winProb = getPlayerWinProbability(card.upcomingFixture);
  const injuryInfo = formatInjuryBadge(card.injuryStatus);
  const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
  const stars = getPlayerStars(card);
  const bonusBreakdown = getCardBonusBreakdown(card);

  // Synergy / Conflict
  const otherPlayers = Object.entries(targetLineup.slots)
    .filter(([k, p]) => k !== slotKey && p !== null)
    .map(([_, p]) => p as SorareCard);
  const opposingTeammate = otherPlayers.find(other => areOpponents(card, other));
  const stackedTeammates = otherPlayers.filter(other => isSameClub(card.club?.name, other.club?.name));

  // Rarity theme
  const getCardRarityClasses = () => {
    switch (rarity) {
      case 'UNIQUE':
        return {
          border: isCaptain ? 'border-amber-300 ring-2 ring-amber-400 shadow-2xl' : 'border-amber-400/80 shadow-xl',
          glow: 'from-amber-950/60 via-slate-900/95 to-black',
          badge: 'bg-black text-amber-300 border-amber-400/80',
          accent: 'text-amber-300',
        };
      case 'SUPER_RARE':
        return {
          border: isCaptain ? 'border-blue-400 ring-2 ring-blue-400 shadow-2xl' : 'border-blue-500/80 shadow-xl',
          glow: 'from-blue-950/70 via-slate-900/95 to-slate-950',
          badge: 'bg-blue-950 text-blue-200 border-blue-400/70',
          accent: 'text-blue-300',
        };
      case 'RARE':
        return {
          border: isCaptain ? 'border-red-400 ring-2 ring-red-400 shadow-2xl' : 'border-red-600/80 shadow-xl',
          glow: 'from-rose-950/70 via-slate-900/95 to-slate-950',
          badge: 'bg-red-950 text-red-200 border-red-400/70',
          accent: 'text-rose-300',
        };
      case 'LIMITED':
      default:
        return {
          border: isCaptain ? 'border-emerald-400 ring-2 ring-emerald-400/60 shadow-2xl' : 'border-amber-500/60 shadow-xl',
          glow: 'from-amber-950/40 via-slate-900/95 to-slate-950',
          badge: 'bg-amber-950 text-amber-300 border-amber-500/50',
          accent: 'text-amber-300',
        };
    }
  };

  const theme = getCardRarityClasses();

  return (
    <div
      onClick={() => onOpenScout(card)}
      className={`group/pitchCard relative flex flex-col justify-between w-full max-w-[155px] xs:max-w-[165px] sm:max-w-[190px] rounded-2xl border ${theme.border} bg-gradient-to-b ${theme.glow} p-2.5 sm:p-3 text-slate-100 shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:z-20 cursor-pointer overflow-hidden`}
    >
      {/* Top Bar: Position, Stars, Captain Button */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800/80">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`flex h-4.5 w-4.5 items-center justify-center rounded text-[9.5px] font-black shrink-0 ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
            {card.positionCode}
          </span>
          <span className="text-[9px] font-extrabold uppercase text-slate-300 truncate">
            {slotKey === 'extra' ? 'EXTRA' : slotLabel}
          </span>
        </div>

        {/* Captain Action Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetCaptain(slotKey);
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black transition-all shadow-sm ${
            isCaptain
              ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-300/80 shadow-emerald-500/50 scale-105'
              : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-emerald-300 hover:border-emerald-500/50'
          }`}
          title={isCaptain ? 'Capitaine actif (+20% bonus)' : 'Nommer Capitaine (+20%)'}
        >
          <Crown className={`h-2.5 w-2.5 ${isCaptain ? 'fill-slate-950' : ''}`} />
          <span>{isCaptain ? 'CAP +20%' : 'C'}</span>
        </button>
      </div>

      {/* Center Visual: Player Photo, Club, Stars */}
      <div className="relative mt-2 flex flex-col items-center">
        <div className="relative">
          {card.pictureUrl ? (
            <img
              src={card.pictureUrl}
              alt={card.displayName}
              referrerPolicy="no-referrer"
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-contain bg-slate-950/70 border border-slate-700/80 p-0.5 shadow-md group-hover/pitchCard:scale-105 transition-transform"
            />
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-slate-400 text-sm">
              {card.positionCode}
            </div>
          )}
          {card.club?.pictureUrl && (
            <img
              src={card.club.pictureUrl}
              alt={card.club.name}
              referrerPolicy="no-referrer"
              className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-950 border border-slate-700 p-0.5"
            />
          )}
          {isCaptain && (
            <div className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-md">
              <Crown className="h-3 w-3 fill-slate-950" />
            </div>
          )}
        </div>

        <h4 className="mt-1.5 truncate max-w-full text-xs font-black text-white group-hover/pitchCard:text-emerald-400 transition text-center">
          {card.displayName}
        </h4>
        <span className="truncate max-w-full text-[10px] text-slate-400 font-medium">
          {card.club?.name || 'Club'}
        </span>

        {/* Stars */}
        <div className="flex items-center gap-0.5 mt-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-2 w-2 ${
                i < stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Projected Score & Bonus Display Box */}
      <div className="mt-2 rounded-xl bg-slate-950/80 p-1.5 sm:p-2 border border-slate-800/80 space-y-1">
        <div className="flex items-center justify-between text-[9.5px]">
          <span className="text-slate-400">Score Brut</span>
          <span className="font-mono font-bold text-slate-300">{cardBreakdown.baseProjectedScore} pts</span>
        </div>

        <div className="flex items-center justify-between text-[9.5px]">
          <span className="text-amber-300 font-semibold">Bonus Total</span>
          <span className="font-mono font-extrabold text-amber-300">+{totalBonusPct}%</span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
          <span className="font-black text-slate-200">Projeté</span>
          <span className="font-mono font-black text-emerald-400 text-xs sm:text-sm">
            {finalProjectedScore} pts
          </span>
        </div>
      </div>

      {/* Synergies / Duels Badge */}
      {stackedTeammates.length > 0 && (
        <div className="mt-1 flex items-center justify-between text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
          <span className="flex items-center gap-1">
            <Users className="h-2.5 w-2.5" />
            <span>Stack {stackedTeammates.length + 1}x</span>
          </span>
          <span className="text-emerald-400">Synergie</span>
        </div>
      )}

      {opposingTeammate && (
        <div className="mt-1 flex items-center justify-between text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300">
          <span className="flex items-center gap-1">
            <Swords className="h-2.5 w-2.5 text-rose-400" />
            <span>Duel</span>
          </span>
          <span className="truncate max-w-[60px] text-rose-400">vs {opposingTeammate.displayName.split(' ').pop()}</span>
        </div>
      )}

      {/* Next Matchup Quick Pill */}
      {card.upcomingFixture ? (
        <div className="mt-1.5 flex items-center justify-between rounded-lg bg-slate-950/90 px-1.5 py-1 text-[9px] border border-slate-800">
          <span className="text-slate-300 font-bold truncate max-w-[70px]">
            {card.upcomingFixture.isHome ? '🏠 vs' : '✈️ @'} {card.upcomingFixture.opponent}
          </span>
          <span className="font-black text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-mono">
            {winProb}%
          </span>
        </div>
      ) : (
        <div className="mt-1.5 rounded-lg bg-slate-950/50 p-1 text-[8.5px] text-slate-500 text-center border border-slate-800/40">
          Pas de match GW
        </div>
      )}

      {/* Actions (Quick Swap & Clear) */}
      <div className="mt-2 flex w-full gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickSwap(slotKey);
          }}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-900/90 py-1 text-[9.5px] font-extrabold text-slate-300 hover:border-emerald-500/40 hover:bg-slate-800 hover:text-emerald-400 transition"
        >
          <ArrowRightLeft className="h-2.5 w-2.5" />
          <span>Remplacer</span>
        </button>

        {onClearSlot && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearSlot(slotKey);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/90 text-slate-400 hover:border-rose-500/40 hover:bg-rose-950/40 hover:text-rose-400 transition"
            title="Vider ce poste"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
