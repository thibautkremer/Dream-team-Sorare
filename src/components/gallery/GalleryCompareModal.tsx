import React from 'react';
import { X, Check, Award, Flame, Activity, Shield, Sparkles, TrendingUp, Calendar, Zap, Star, ArrowUpDown } from 'lucide-react';
import { SorareCard, StrategyType } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, getCardAasL15, getCardDsL15 } from '../../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus, getPlayerStars } from '../../utils/sorareSlug';

interface GalleryCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCards: SorareCard[];
  onRemoveCard: (cardId: string) => void;
  onClear: () => void;
  onOpenScout: (card: SorareCard) => void;
  strategy?: StrategyType;
  allCards?: SorareCard[];
  onReplacePlayer?: (card: SorareCard) => void;
}

export const GalleryCompareModal: React.FC<GalleryCompareModalProps> = ({
  isOpen,
  onClose,
  selectedCards,
  onRemoveCard,
  onClear,
  onOpenScout,
  strategy = 'BALANCED',
  allCards = [],
}) => {
  if (!isOpen || selectedCards.length === 0) return null;

  // Pre-calculate projections and stats for all compared cards
  const comparedData = selectedCards.map((card) => {
    const breakdown = calculatePlayerProjectedScore(card, strategy, allCards);
    const bonus = getCardTotalBonus(card);
    const aas = getCardAasL15(card);
    const ds = getCardDsL15(card);
    const winProb = getPlayerWinProbability(card.upcomingFixture);
    const stars = getPlayerStars(card);

    return {
      card,
      breakdown,
      bonus,
      aas,
      ds,
      winProb,
      stars,
      l5: card.scores.l5 || 0,
      l15: card.scores.l15 || 0,
      l40: card.scores.l40 || 0,
      starterConf: card.starterConfidence || 0,
      proj: breakdown.projectedScore,
      fdr: card.upcomingFixture?.difficultyRating || 3,
    };
  });

  // Calculate highest values for highlighting winners
  const maxL5 = Math.max(...comparedData.map((d) => d.l5));
  const maxL15 = Math.max(...comparedData.map((d) => d.l15));
  const maxL40 = Math.max(...comparedData.map((d) => d.l40));
  const maxProj = Math.max(...comparedData.map((d) => d.proj));
  const maxAas = Math.max(...comparedData.map((d) => d.aas));
  const maxDs = Math.max(...comparedData.map((d) => d.ds));
  const maxBonus = Math.max(...comparedData.map((d) => d.bonus));
  const maxWinProb = Math.max(...comparedData.map((d) => d.winProb));
  const maxStarter = Math.max(...comparedData.map((d) => d.starterConf));
  const minFdr = Math.min(...comparedData.map((d) => d.fdr));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-fade-in">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:p-5 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ArrowUpDown className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Comparateur Côte-à-Côte ({selectedCards.length} joueurs)
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Head-to-Head
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Confrontez directement les statistiques, cotes de match, forme et bonus pour faire le meilleur choix.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="text-xs font-semibold text-slate-400 hover:text-rose-400 px-2 py-1 rounded transition"
            >
              Vider tout
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Table / Grid */}
        <div className="overflow-x-auto overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Top Players Identity Cards */}
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${selectedCards.length}, minmax(220px, 1fr))` }}>
            {comparedData.map(({ card, stars, bonus, breakdown }) => {
              const posBadge = formatPositionBadge(card.positionCode);
              const statusInfo = formatStatusBadge(card.status, card.starterConfidence);

              return (
                <div
                  key={card.id}
                  className="relative rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between shadow-lg"
                >
                  <button
                    onClick={() => onRemoveCard(card.id)}
                    className="absolute top-2 right-2 rounded-full p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                    title="Retirer de la comparaison"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div>
                    {/* Header Badges */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
                        {card.positionCode}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="rounded-md border border-amber-500/40 bg-amber-950/70 px-1.5 py-0.5 text-[9px] font-black text-amber-300 ml-auto flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                        +{bonus}%
                      </span>
                    </div>

                    {/* Photo & Info */}
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-14 flex-shrink-0">
                        {card.pictureUrl ? (
                          <img
                            src={card.pictureUrl}
                            alt={card.displayName}
                            referrerPolicy="no-referrer"
                            className="h-14 w-14 rounded-xl object-contain bg-slate-900 border border-slate-700 p-0.5 shadow"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-xl bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                            {card.positionCode}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-white text-sm truncate">{card.displayName}</h4>
                        <p className="text-xs text-slate-400 truncate">{card.club?.name || 'Club'}</p>
                        <div className="flex items-center gap-0.5 mt-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-2.5 w-2.5 ${i < stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Projected Score Banner */}
                  <div className="mt-4 rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Score Projeté GW
                    </span>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-black text-emerald-400">{breakdown.projectedScore}</span>
                      <span className="text-xs font-bold text-slate-400">pts</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Fourchette: {breakdown.projectedFloor} - {breakdown.projectedCeiling} pts
                    </span>
                  </div>

                  {/* Scout button */}
                  <button
                    onClick={() => {
                      onClose();
                      onOpenScout(card);
                    }}
                    className="mt-3 w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-1.5 text-xs font-bold text-slate-200 transition"
                  >
                    Ouvrir Fiche Complète
                  </button>
                </div>
              );
            })}
          </div>

          {/* Metric Comparison Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 font-bold text-xs text-slate-300 uppercase tracking-wider">
              📊 Tableau Comparatif Détaillé
            </div>

            <table className="w-full text-xs text-left">
              <tbody className="divide-y divide-slate-800/80">
                {/* Score Projeté */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 w-48 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Score Projeté Total</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.proj === maxProj;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-black text-sm px-2.5 py-1 rounded-lg ${isBest ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black' : 'text-slate-300'}`}>
                          {d.proj} pts {isBest && '👑'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Forme L5 */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    <span>Forme L5</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.l5 === maxL5 && d.l5 > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold ${isBest ? 'text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30' : 'text-slate-300'}`}>
                          {d.l5 > 0 ? d.l5 : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Régularité L15 */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-blue-400" />
                    <span>Moyenne L15</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.l15 === maxL15 && d.l15 > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold ${isBest ? 'text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-500/30' : 'text-slate-300'}`}>
                          {d.l15 > 0 ? d.l15 : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* L40 */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400">Moyenne L40</td>
                  {comparedData.map((d) => {
                    const isBest = d.l40 === maxL40 && d.l40 > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center text-slate-400">
                        <span className={isBest ? 'text-slate-200 font-bold' : ''}>
                          {d.l40 > 0 ? d.l40 : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Score All-Around (AAS) L15 */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                    <span>All-Around Score (AAS L15)</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.aas === maxAas && d.aas > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold ${isBest ? 'text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30' : 'text-slate-300'}`}>
                          {d.aas > 0 ? `${d.aas} pts` : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Score Décisif (DS) L15 */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-amber-400" />
                    <span>Score Décisif (DS L15)</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.ds === maxDs && d.ds > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold ${isBest ? 'text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/30' : 'text-slate-300'}`}>
                          {d.ds > 0 ? `${d.ds} pts` : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Bonus de Carte */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>Bonus Total Carte</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.bonus === maxBonus;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-black ${isBest ? 'text-amber-400' : 'text-slate-400'}`}>
                          +{d.bonus}%
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Match GW & Adversaire */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Matchup & Calendrier</span>
                  </td>
                  {comparedData.map((d) => {
                    const f = d.card.upcomingFixture;
                    if (!f) return <td key={d.card.id} className="p-3 text-center text-slate-500 italic">Pas de match</td>;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <div className="font-bold text-white">
                          {f.isHome ? '🏠 vs' : '✈️ @'} {f.opponent}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatKickoffDate(f.kickoffDate || f.matchDate)}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Difficulté Match (FDR) */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400">Difficulté Adversaire (FDR)</td>
                  {comparedData.map((d) => {
                    const isEasiest = d.fdr === minFdr;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          d.fdr <= 2 ? 'bg-emerald-500/20 text-emerald-300' : d.fdr === 3 ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {d.fdr}/5 {isEasiest && '(Plus abordable)'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Chances de Victoire (Bookmaker) */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400">Chances Victoire Match</td>
                  {comparedData.map((d) => {
                    const isBest = d.winProb === maxWinProb && d.winProb > 0;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-black ${isBest ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {d.winProb > 0 ? `${d.winProb}%` : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Sécurité Titularisation */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-semibold text-slate-400 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Sécurité Titulaire</span>
                  </td>
                  {comparedData.map((d) => {
                    const isBest = d.starterConf === maxStarter;
                    return (
                      <td key={d.card.id} className="p-3 text-center">
                        <span className={`font-bold ${isBest ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {d.starterConf}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4 bg-slate-950/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {selectedCards.length} joueur{selectedCards.length > 1 ? 's' : ''} en confrontation active
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 transition"
          >
            Fermer le comparateur
          </button>
        </div>

      </div>
    </div>
  );
};
