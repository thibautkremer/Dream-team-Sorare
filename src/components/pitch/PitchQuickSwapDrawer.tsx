import React, { useMemo } from 'react';
import { X, ArrowRightLeft, Sparkles, Flame, Shield, Target, Calendar, Check } from 'lucide-react';
import { SorareCard, Lineup } from '../../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, areOpponents, isSameClub, getPlayerUniqueKey } from '../../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus } from '../../utils/sorareSlug';

interface PitchQuickSwapDrawerProps {
  slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra' | null;
  lineup: Lineup;
  cards: SorareCard[];
  compositions?: Lineup[];
  selectedCompoIndex?: number;
  onSelectPlayer: (card: SorareCard) => void;
  onClose: () => void;
  onOpenFullModal: () => void;
}

export const PitchQuickSwapDrawer: React.FC<PitchQuickSwapDrawerProps> = ({
  slot,
  lineup,
  cards,
  compositions = [],
  selectedCompoIndex,
  onSelectPlayer,
  onClose,
  onOpenFullModal,
}) => {
  if (!slot) return null;

  const currentCard = lineup.slots[slot];
  const slotTitle = {
    gk: 'Gardien (GK)',
    def: 'Défenseur (DEF)',
    mid: 'Milieu (MID)',
    fwd: 'Attaquant (FWD)',
    extra: 'Extra / Joker (DEF, MID, FWD)',
  }[slot];

  // Candidates for this slot
  const candidateCards = useMemo(() => {
    const otherPlayers = Object.entries(lineup.slots)
      .filter(([k, p]) => k !== slot && p !== null)
      .map(([_, p]) => p as SorareCard);

    const otherIds = new Set(otherPlayers.map(p => p.id));
    const otherPlayerKeys = new Set(otherPlayers.map(p => getPlayerUniqueKey(p)));

    // Cartes utilisées dans d'autres compositions (Règle : 1 carte = 1 seule compo)
    const otherCompositionsCardIds = new Set<string>();
    if (compositions && selectedCompoIndex !== undefined) {
      compositions.forEach((comp, idx) => {
        if (idx !== selectedCompoIndex && comp?.slots) {
          Object.values(comp.slots).forEach(p => {
            if (p) {
              otherCompositionsCardIds.add(p.id);
            }
          });
        }
      });
    }

    return cards
      .filter(card => {
        if (otherIds.has(card.id) || otherPlayerKeys.has(getPlayerUniqueKey(card))) return false;
        if (otherCompositionsCardIds.has(card.id)) return false;
        if (slot === 'gk' && card.positionCode !== 'GK') return false;
        if (slot === 'def' && card.positionCode !== 'DEF') return false;
        if (slot === 'mid' && card.positionCode !== 'MID') return false;
        if (slot === 'fwd' && card.positionCode !== 'FWD') return false;
        if (slot === 'extra' && card.positionCode === 'GK') return false;
        return true;
      })
      .map(card => {
        const breakdown = calculatePlayerProjectedScore(card, lineup.strategy, cards);
        const winProb = getPlayerWinProbability(card.upcomingFixture);
        const isTeammate = otherPlayers.some(p => isSameClub(p.club?.name, card.club?.name));
        const isOpponent = otherPlayers.some(p => areOpponents(p, card));
        const bonus = getCardTotalBonus(card);

        return {
          card,
          breakdown,
          projected: breakdown.projectedScore,
          winProb,
          isTeammate,
          isOpponent,
          bonus,
        };
      })
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 5); // Top 5 best suggestions
  }, [slot, lineup, cards, compositions, selectedCompoIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl border border-emerald-500/40 bg-slate-900 p-5 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Remplacement Rapide - {slotTitle}
              </h3>
              <p className="text-xs text-slate-400">
                Top 5 alternatives intelligentes issues de votre galerie
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current Aligned Player */}
        {currentCard && (
          <div className="my-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src={currentCard.pictureUrl}
                alt={currentCard.displayName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-xl object-contain bg-slate-900 border border-slate-700 p-0.5"
              />
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Actuellement Aligné</span>
                <span className="text-xs font-black text-white">{currentCard.displayName}</span>
                <span className="text-[10px] text-slate-400 block">{currentCard.club?.name}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-emerald-400 block">
                {calculatePlayerProjectedScore(currentCard, lineup.strategy, cards).projectedScore} pts
              </span>
              <span className="text-[9px] text-slate-500">Projeté actuel</span>
            </div>
          </div>
        )}

        {/* Top 5 Smart Suggestions List */}
        <div className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
          {candidateCards.map(({ card, breakdown, projected, winProb, isTeammate, isOpponent, bonus }) => {
            const isSelected = currentCard?.id === card.id;

            return (
              <div
                key={card.id}
                onClick={() => {
                  onSelectPlayer(card);
                  onClose();
                }}
                className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 hover:scale-[1.01] ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950/90 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={card.pictureUrl}
                      alt={card.displayName}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-xl object-contain bg-slate-900 border border-slate-700 p-0.5"
                    />
                    <span className="absolute -top-1 -left-1 text-[8.5px] font-black bg-amber-500 text-slate-950 px-1 rounded shadow">
                      +{bonus}%
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-black text-white truncate">{card.displayName}</h4>
                      {isTeammate && (
                        <span className="text-[8.5px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1 rounded">
                          Stack Club
                        </span>
                      )}
                      {isOpponent && (
                        <span className="text-[8.5px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1 rounded">
                          Duel
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{card.club?.name}</span>
                      <span>•</span>
                      <span>L5: <strong className="text-slate-300">{card.scores.l5 || '-'}</strong></span>
                      {card.upcomingFixture && (
                        <span>• <strong className="text-emerald-400">{winProb}% V</strong></span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-sm font-black text-emerald-400 font-mono block">
                      {projected} pts
                    </span>
                    <span className="text-[9px] text-slate-500 font-semibold">Projeté GW</span>
                  </div>

                  <button
                    type="button"
                    className="p-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black hover:bg-emerald-400 transition"
                    title="Choisir ce joueur"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Open Complete Search Modal */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white transition font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullModal();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
          >
            <span>Ouvrir recherche avancée & filtres...</span>
          </button>
        </div>

      </div>
    </div>
  );
};
