import React, { useState } from 'react';
import { Sparkles, Trophy, Shield, Star, Award, BarChart2, Tag, Check, Zap } from 'lucide-react';
import { SorareCard, StrategyType } from '../../types';
import { getCardBonusBreakdown, formatPositionBadge, formatStatusBadge, formatInjuryBadge, getPlayerStars } from '../../utils/sorareSlug';
import { formatKickoffDate, getPlayerWinProbability } from '../../utils/optimizer';

interface VisualSorareCardProps {
  card: SorareCard;
  projectedScore: number;
  baseProjectedScore?: number;
  bonusPct: number;
  isFavorite: boolean;
  isSelectedForCompare: boolean;
  onToggleFavorite: (cardId: string) => void;
  onToggleCompare: (cardId: string) => void;
  onOpenScout: (card: SorareCard) => void;
  onOpenTags?: (card: SorareCard) => void;
  tags?: string[];
  lineups?: Array<{ compoIndex: number; compoName: string }>;
  isCaptain?: boolean;
}

export const VisualSorareCard: React.FC<VisualSorareCardProps> = ({
  card,
  projectedScore,
  baseProjectedScore,
  bonusPct,
  isFavorite,
  isSelectedForCompare,
  onToggleFavorite,
  onToggleCompare,
  onOpenScout,
  onOpenTags,
  tags = [],
  lineups = [],
}) => {
  const [showCaptainPreview, setShowCaptainPreview] = useState(false);
  const rarity = (card.rarity || 'LIMITED').toUpperCase();
  const posBadge = formatPositionBadge(card.positionCode);
  const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
  const injuryInfo = formatInjuryBadge(card.injuryStatus);
  const stars = getPlayerStars(card);
  const bonusBreakdown = getCardBonusBreakdown(card);

  // Captain boost (+20% in Sorare)
  const captainProjected = Math.round((baseProjectedScore || projectedScore) * (1 + (bonusPct + 20) / 100) * 10) / 10;
  const currentProjected = showCaptainPreview ? captainProjected : projectedScore;

  // Rarity theme styling classes
  const getRarityTheme = () => {
    switch (rarity) {
      case 'UNIQUE':
        return {
          cardBorder: 'border-slate-300 ring-1 ring-amber-400/40 shadow-2xl shadow-black/80',
          gradientBg: 'from-slate-900 via-neutral-900 to-black',
          headerBg: 'bg-gradient-to-r from-amber-500/30 via-slate-800 to-amber-500/20 text-amber-200 border-b border-amber-500/40',
          badgeRarity: 'bg-black text-amber-300 border border-amber-400/60 shadow-inner',
          accentText: 'text-amber-300',
          hologram: 'after:absolute after:inset-0 after:bg-gradient-to-tr after:from-amber-500/5 after:via-transparent after:to-purple-500/10 after:pointer-events-none',
        };
      case 'SUPER_RARE':
        return {
          cardBorder: 'border-blue-500/80 ring-1 ring-blue-400/30 shadow-xl shadow-blue-950/40',
          gradientBg: 'from-blue-950/90 via-slate-900 to-slate-950',
          headerBg: 'bg-gradient-to-r from-blue-600/40 via-blue-900/60 to-slate-900 text-blue-200 border-b border-blue-500/40',
          badgeRarity: 'bg-blue-900/90 text-blue-200 border border-blue-400/60',
          accentText: 'text-blue-300',
          hologram: 'after:absolute after:inset-0 after:bg-gradient-to-tr after:from-blue-500/10 after:via-transparent after:to-cyan-400/10 after:pointer-events-none',
        };
      case 'RARE':
        return {
          cardBorder: 'border-red-600/80 ring-1 ring-red-500/30 shadow-xl shadow-red-950/40',
          gradientBg: 'from-rose-950/90 via-slate-900 to-slate-950',
          headerBg: 'bg-gradient-to-r from-red-600/40 via-rose-900/60 to-slate-900 text-rose-200 border-b border-red-500/40',
          badgeRarity: 'bg-red-900/90 text-red-200 border border-red-400/60',
          accentText: 'text-rose-300',
          hologram: 'after:absolute after:inset-0 after:bg-gradient-to-tr after:from-rose-500/10 after:via-transparent after:to-amber-500/10 after:pointer-events-none',
        };
      case 'LIMITED':
      default:
        return {
          cardBorder: 'border-amber-500/60 ring-1 ring-amber-500/30 shadow-xl shadow-amber-950/20',
          gradientBg: 'from-amber-950/40 via-slate-900 to-slate-950',
          headerBg: 'bg-gradient-to-r from-amber-600/30 via-slate-900 to-slate-900 text-amber-200 border-b border-amber-500/30',
          badgeRarity: 'bg-amber-950/90 text-amber-300 border border-amber-500/50',
          accentText: 'text-amber-400',
          hologram: 'after:absolute after:inset-0 after:bg-gradient-to-tr after:from-amber-500/10 after:via-transparent after:to-emerald-500/10 after:pointer-events-none',
        };
    }
  };

  const theme = getRarityTheme();
  const isU23 = typeof card.age === 'number' && card.age <= 23;
  const fixture = card.upcomingFixture;
  const winProb = fixture ? getPlayerWinProbability(fixture) : 0;
  const formattedKickoff = fixture ? formatKickoffDate(fixture.kickoffDate || fixture.matchDate) : '';

  return (
    <div
      onClick={() => onOpenScout(card)}
      className={`group relative flex flex-col justify-between rounded-2xl border ${theme.cardBorder} bg-gradient-to-b ${theme.gradientBg} p-3.5 transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-2xl overflow-hidden ${theme.hologram} ${
        isSelectedForCompare ? 'ring-2 ring-indigo-400 bg-indigo-950/40' : ''
      }`}
    >
      {/* Top Holographic Strip & Edition */}
      <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Position code */}
          <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
            {card.positionCode}
          </span>
          {/* Rarity */}
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide ${theme.badgeRarity}`}>
            {rarity}
          </span>
          {/* Season Year / In-Season */}
          {card.seasonYear && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              bonusBreakdown.hasInSeasonBonus
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700/50'
            }`}>
              {card.seasonYear}{bonusBreakdown.hasInSeasonBonus ? ' ⚡ In-Season' : ''}
            </span>
          )}
          {isU23 && (
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1 py-0.2 rounded text-[8.5px] font-black uppercase">
              U23
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onToggleFavorite(card.id)}
            className={`p-1 rounded transition ${isFavorite ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-amber-400'}`}
            title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onToggleCompare(card.id)}
            className={`p-1 rounded transition ${isSelectedForCompare ? 'text-indigo-300 bg-indigo-500/20' : 'text-slate-500 hover:text-indigo-300'}`}
            title={isSelectedForCompare ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Center Visual: Player Photo, Club, Stars, Power */}
      <div className="mt-3 flex items-center gap-3">
        {/* Photo Container */}
        <div className="relative h-16 w-16 shrink-0">
          {card.pictureUrl ? (
            <img
              src={card.pictureUrl}
              alt={card.displayName}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-xl object-contain bg-slate-950/60 border border-slate-700/70 p-0.5 shadow-md group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-slate-400">
              {card.positionCode}
            </div>
          )}
          {card.club?.pictureUrl && (
            <img
              src={card.club.pictureUrl}
              alt={card.club.name}
              referrerPolicy="no-referrer"
              className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-slate-900 border border-slate-700 p-0.5"
            />
          )}
        </div>

        {/* Player Names & Club */}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-black text-white group-hover:text-emerald-400 transition">
            {card.displayName}
          </h4>
          <p className="truncate text-xs text-slate-400 font-medium">
            {card.club?.name || 'Club'}
          </p>

          {/* Stars & Age */}
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-2.5 w-2.5 ${
                    i < stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{card.age} ans</span>
          </div>

          {/* Starter Confidence / Status Pill */}
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {injuryInfo ? (
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${injuryInfo.bg} ${injuryInfo.color}`}>
                {injuryInfo.icon} {injuryInfo.label}
              </span>
            ) : (
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${statusInfo.color}`}>
                {statusInfo.label} ({card.starterConfidence}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bonus & Power Breakdown Strip */}
      <div className="mt-2.5 rounded-xl bg-slate-950/70 p-2 border border-slate-800/80 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-amber-300 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-400" />
            +{bonusPct}%
          </span>
          <span className="text-[9px] text-slate-500 font-mono">({bonusBreakdown.powerString}x)</span>
        </div>

        {/* Quick Captain Boost Simulator */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowCaptainPreview(!showCaptainPreview);
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-extrabold transition border ${
            showCaptainPreview
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-amber-300'
          }`}
          title="Simuler avec le brassard Capitaine (+20%)"
        >
          <Trophy className="h-2.5 w-2.5" />
          <span>Cap +20%</span>
        </button>
      </div>

      {/* Scores L5 / L15 / Projected GW Box */}
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-950/90 p-2 border border-slate-800/80 text-center">
        <div>
          <span className="block text-[9px] font-semibold text-slate-400">L5</span>
          <span className={`text-xs font-black ${card.scores.l5 >= 55 ? 'text-emerald-400' : 'text-slate-300'}`}>
            {card.scores.l5 > 0 ? card.scores.l5 : '-'}
          </span>
        </div>
        <div className="border-x border-slate-800/80">
          <span className="block text-[9px] font-semibold text-slate-400">L15</span>
          <span className="text-xs font-black text-slate-300">
            {card.scores.l15 > 0 ? card.scores.l15 : '-'}
          </span>
        </div>
        <div className="bg-emerald-500/10 rounded-lg p-0.5 border border-emerald-500/20">
          <span className="block text-[9px] font-extrabold text-emerald-400">
            {showCaptainPreview ? 'Capitaine' : 'Projeté GW'}
          </span>
          <span className="text-xs font-black text-emerald-300">
            {currentProjected} pts
          </span>
        </div>
      </div>

      {/* Next Matchup Details */}
      {fixture ? (
        <div className="mt-2 rounded-xl bg-slate-950/80 p-2 text-[10px] border border-slate-800/70 space-y-1">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-bold truncate max-w-[130px]">
              {fixture.isHome ? '🏠 vs' : '✈️ @'} {fixture.opponent}
            </span>
            <span className="text-[9.5px] font-black text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded">
              {winProb}% V
            </span>
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500">
            <span>{formattedKickoff || 'Match GW'}</span>
            <span className="font-semibold text-slate-400">FDR {fixture.difficultyRating || 3}/5</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-xl bg-slate-950/50 p-2 text-[10px] text-slate-500 text-center border border-slate-800/40">
          ⏸️ Pas de match programmé pour la GW
        </div>
      )}

      {/* Alignment Status & Tags Footer */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[9.5px]">
        {/* Lineups / Availability */}
        <div className="flex items-center gap-1 flex-wrap">
          {lineups.length > 0 ? (
            <span className={`px-1.5 py-0.5 rounded font-bold border ${
              lineups.length >= 2
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              🛡️ {lineups[0].compoName} {lineups.length > 1 ? `(+${lineups.length - 1})` : ''}
            </span>
          ) : (
            <span className="text-slate-500 font-medium">🟢 Prêt (Non aligné)</span>
          )}

          {tags.slice(0, 1).map((t) => (
            <span key={t} className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-1 py-0.2 rounded font-bold">
              🏷️ {t}
            </span>
          ))}
        </div>

        {onOpenTags && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTags(card);
            }}
            className="text-slate-500 hover:text-indigo-300 transition p-0.5"
            title="Gérer les tags"
          >
            <Tag className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
