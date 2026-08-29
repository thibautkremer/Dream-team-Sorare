import React from 'react';
import { Star, Tag, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Flame, Activity, Zap, Shield, CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { SorareCard, PositionCode, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, getCardAasL15, getCardDsL15 } from '../../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus, getPlayerStars } from '../../utils/sorareSlug';

interface GalleryTableViewProps {
  cards: SorareCard[];
  onOpenScout: (card: SorareCard) => void;
  favorites: string[];
  onToggleFavorite: (cardId: string) => void;
  cardTags: Record<string, string[]>;
  onOpenTagModal: (card: SorareCard) => void;
  selectedForCompare: string[];
  onToggleCompare: (cardId: string) => void;
  onReplacePlayer: (card: SorareCard) => void;
  strategy?: StrategyType;
  allCards?: SorareCard[];
  projectionsMap: Map<string, any>;
  playerLineupMap?: Map<string, Array<{ compoIndex: number; compoName: string }>>;
  sortBy: string;
  onSortChange: (newSort: any) => void;
}

export const GalleryTableView: React.FC<GalleryTableViewProps> = ({
  cards,
  onOpenScout,
  favorites,
  onToggleFavorite,
  cardTags,
  onOpenTagModal,
  selectedForCompare,
  onToggleCompare,
  onReplacePlayer,
  strategy = 'BALANCED',
  allCards = [],
  projectionsMap,
  playerLineupMap,
  sortBy,
  onSortChange,
}) => {
  const getSortIcon = (field: string) => {
    if (sortBy === `${field}_DESC`) return <ArrowDown className="h-3 w-3 text-emerald-400 inline ml-1" />;
    if (sortBy === `${field}_ASC`) return <ArrowUp className="h-3 w-3 text-emerald-400 inline ml-1" />;
    return <ArrowUpDown className="h-3 w-3 text-slate-600 inline ml-1" />;
  };

  const handleHeaderClick = (field: string) => {
    if (sortBy === `${field}_DESC`) {
      onSortChange(`${field}_ASC`);
    } else {
      onSortChange(`${field}_DESC`);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden backdrop-blur-md">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {/* Table Header */}
          <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
            <tr>
              <th className="p-3 w-10 text-center">
                <span className="sr-only">Sélection</span>
              </th>
              <th className="p-3 w-10 text-center">★</th>
              <th
                onClick={() => handleHeaderClick('NAME')}
                className="p-3 font-bold cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                Joueur {getSortIcon('NAME')}
              </th>
              <th
                onClick={() => handleHeaderClick('CLUB')}
                className="p-3 font-bold cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                Club {getSortIcon('CLUB')}
              </th>
              <th className="p-3 font-bold text-center whitespace-nowrap">Poste</th>
              <th
                onClick={() => handleHeaderClick('BONUS')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                Bonus {getSortIcon('BONUS')}
              </th>
              <th
                onClick={() => handleHeaderClick('PROJ')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                Score Proj. {getSortIcon('PROJ')}
              </th>
              <th
                onClick={() => handleHeaderClick('L5')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                L5 {getSortIcon('L5')}
              </th>
              <th
                onClick={() => handleHeaderClick('L15')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                L15 {getSortIcon('L15')}
              </th>
              <th
                onClick={() => handleHeaderClick('AAS_L15')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                AAS L15 {getSortIcon('AAS_L15')}
              </th>
              <th
                onClick={() => handleHeaderClick('DS_L15')}
                className="p-3 font-bold text-center cursor-pointer hover:text-white transition whitespace-nowrap"
              >
                DS L15 {getSortIcon('DS_L15')}
              </th>
              <th className="p-3 font-bold whitespace-nowrap">Match GW (FDR)</th>
              <th className="p-3 font-bold text-center whitespace-nowrap">Statut / Alignement</th>
              <th className="p-3 font-bold whitespace-nowrap">Tags</th>
              <th className="p-3 text-right font-bold whitespace-nowrap">Action</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-800/60">
            {cards.map((card) => {
              const isFav = favorites.includes(card.id);
              const isComparing = selectedForCompare.includes(card.id);
              const posBadge = formatPositionBadge(card.positionCode);
              const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
              const bonusPct = getCardTotalBonus(card);
              const aas = getCardAasL15(card);
              const ds = getCardDsL15(card);
              const tags = cardTags[card.id] || [];

              const cachedBreakdown = projectionsMap.get(card.id);
              const breakdown = cachedBreakdown || calculatePlayerProjectedScore(card, strategy, allCards);
              const projScore = breakdown.projectedScore;

              const alignedCompos = playerLineupMap?.get(card.id) || [];
              const isAligned = alignedCompos.length > 0;
              const hasFixture = !!card.upcomingFixture?.opponent;

              return (
                <tr
                  key={card.id}
                  onClick={() => onOpenScout(card)}
                  className={`hover:bg-slate-800/50 cursor-pointer transition ${
                    isComparing ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  {/* Compare Checkbox */}
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isComparing}
                      onChange={() => onToggleCompare(card.id)}
                      className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 h-4 w-4 cursor-pointer"
                      title="Comparer ce joueur"
                    />
                  </td>

                  {/* Favorite Star */}
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(card.id)}
                      className="p-1 text-slate-600 hover:text-amber-400 transition"
                      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-400'
                        }`}
                      />
                    </button>
                  </td>

                  {/* Player Name & Picture */}
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-8 w-8 rounded-lg overflow-hidden bg-slate-950 border border-slate-700 shrink-0">
                        {card.pictureUrl ? (
                          <img
                            src={card.pictureUrl}
                            alt={card.displayName}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {card.positionCode}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white hover:text-emerald-400 transition">
                          {card.displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <span>{card.age} ans</span>
                          {card.rarity && card.rarity.toUpperCase() !== 'COMMON' && (
                            <span className="text-emerald-400 uppercase font-bold text-[9px]">
                              • {card.rarity}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Club */}
                  <td className="p-3 text-slate-300 font-medium whitespace-nowrap">
                    {card.club?.name || 'Club'}
                  </td>

                  {/* Position */}
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className={`inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-black border ${posBadge.bg} ${posBadge.text} border-slate-700`}>
                      {card.positionCode}
                    </span>
                  </td>

                  {/* Bonus % */}
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30">
                      <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                      +{bonusPct}%
                    </span>
                  </td>

                  {/* Score Projeté */}
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className="font-black text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                      {projScore} pts
                    </span>
                  </td>

                  {/* L5 */}
                  <td className="p-3 text-center font-bold text-slate-200 whitespace-nowrap">
                    <span className={card.scores.l5 >= 60 ? 'text-emerald-400 font-black' : ''}>
                      {card.scores.l5 > 0 ? card.scores.l5 : '-'}
                    </span>
                  </td>

                  {/* L15 */}
                  <td className="p-3 text-center text-slate-300 font-medium whitespace-nowrap">
                    {card.scores.l15 > 0 ? card.scores.l15 : '-'}
                  </td>

                  {/* AAS L15 */}
                  <td className="p-3 text-center text-cyan-300 font-medium whitespace-nowrap">
                    {aas > 0 ? `${aas}` : '-'}
                  </td>

                  {/* DS L15 */}
                  <td className="p-3 text-center text-amber-300 font-medium whitespace-nowrap">
                    {ds > 0 ? `${ds}` : '-'}
                  </td>

                  {/* Match GW (FDR) */}
                  <td className="p-3 whitespace-nowrap">
                    {card.upcomingFixture?.opponent ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300">
                          {card.upcomingFixture.isHome ? '🏠' : '✈️'} {card.upcomingFixture.opponent}
                        </span>
                        <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                          card.upcomingFixture.difficultyRating <= 2
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : card.upcomingFixture.difficultyRating === 3
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          FDR {card.upcomingFixture.difficultyRating}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600 italic">Pas de match</span>
                    )}
                  </td>

                  {/* Statut / Alignement */}
                  <td className="p-3 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {isAligned ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                          <Layers className="h-2.5 w-2.5" />
                          {alignedCompos.length > 1 ? `${alignedCompos.length} compos` : alignedCompos[0]?.compoName || 'Compo 1'}
                        </span>
                      ) : hasFixture ? (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.2 rounded">
                          ✓ Prêt (Libre)
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Tags */}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap max-w-[140px]">
                      {tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[9px] font-bold truncate max-w-[70px]"
                          title={t}
                        >
                          {t}
                        </span>
                      ))}
                      {tags.length > 2 && (
                        <span className="text-[9px] font-bold text-slate-500">+{tags.length - 2}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenTagModal(card)}
                        className="rounded p-1 text-slate-600 hover:text-purple-400 hover:bg-slate-800 transition"
                        title="Ajouter / Modifier les tags"
                      >
                        <Tag className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onReplacePlayer(card)}
                      className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition active:scale-95"
                    >
                      Aligner
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
