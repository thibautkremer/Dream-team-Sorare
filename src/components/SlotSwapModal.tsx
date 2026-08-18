import React, { useState } from 'react';
import { X, Search, Check, Flame, Calendar, AlertCircle } from 'lucide-react';
import { SorareCard, SlotPosition, LineupOptimizationFilters } from '../types';
import { calculatePlayerProjectedScore, formatKickoffDate, isCardMatchOnOrBeforeDate } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge } from '../utils/sorareSlug';

interface SlotSwapModalProps {
  slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra' | null;
  cards: SorareCard[];
  filters?: LineupOptimizationFilters;
  onSelectPlayer: (player: SorareCard) => void;
  onClose: () => void;
}

export const SlotSwapModal: React.FC<SlotSwapModalProps> = ({ slot, cards, filters, onSelectPlayer, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [enforceDateFilter, setEnforceDateFilter] = useState(true);

  if (!slot) return null;

  const getPositionTarget = (s: string) => {
    switch (s) {
      case 'gk': return 'Gardien (GK)';
      case 'def': return 'Défenseur (DEF)';
      case 'mid': return 'Milieu (MID)';
      case 'fwd': return 'Attaquant (FWD)';
      case 'extra': return 'Extra / Joker (DEF, MID, FWD)';
      default: return 'Poste';
    }
  };

  // Filter cards by slot eligibility & date filter
  const eligibleCards = cards.filter((card) => {
    if (slot === 'gk' && card.positionCode !== 'GK') return false;
    if (slot === 'def' && card.positionCode !== 'DEF') return false;
    if (slot === 'mid' && card.positionCode !== 'MID') return false;
    if (slot === 'fwd' && card.positionCode !== 'FWD') return false;
    if (slot === 'extra' && card.positionCode === 'GK') return false; // Any outfield player

    if (enforceDateFilter && filters?.maxMatchDate) {
      if (!isCardMatchOnOrBeforeDate(card, filters.maxMatchDate)) {
        return false;
      }
    }

    return true;
  });

  const searchedCards = eligibleCards.filter((card) =>
    card.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.club.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => calculatePlayerProjectedScore(b).projectedScore - calculatePlayerProjectedScore(a).projectedScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Sélectionner un joueur pour le poste : <span className="text-emerald-400">{getPositionTarget(slot)}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchedCards.length} candidats disponibles dans votre effectif
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Date Filter Alert Banner */}
        {filters?.maxMatchDate && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-950/40 border border-emerald-500/30 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>Filtre actif : Matchs &le; <strong>{filters.maxMatchDate}</strong></span>
            </div>
            <button
              onClick={() => setEnforceDateFilter(!enforceDateFilter)}
              className="text-[11px] font-bold text-slate-300 hover:text-white underline"
            >
              {enforceDateFilter ? 'Voir tous sans limite date' : 'Réappliquer limite date'}
            </button>
          </div>
        )}

        {/* Search */}
        <div className="mt-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom ou club..."
            autoFocus
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        {/* Player List */}
        <div className="mt-3 max-h-80 overflow-y-auto space-y-2 pr-1">
          {searchedCards.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aucun joueur trouvé pour ce poste {filters?.maxMatchDate && enforceDateFilter ? `avec un match avant le ${filters.maxMatchDate}` : ''}.
            </div>
          ) : (
            searchedCards.map((card) => {
              const posBadge = formatPositionBadge(card.positionCode);
              const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
              const isNotPlaying = card.status === 'NOT_PLAYING' || card.injuryStatus === 'INJURED';
              const kickoffDateStr = formatKickoffDate(card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate);

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    onSelectPlayer(card);
                    onClose();
                  }}
                  className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                    isNotPlaying
                      ? 'border-rose-900/40 bg-rose-950/20 opacity-70 hover:opacity-100'
                      : 'border-slate-800 bg-slate-950 hover:border-emerald-400/60 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={card.pictureUrl}
                      alt={card.displayName}
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-xl object-contain bg-slate-950/40 border border-slate-700"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${posBadge.bg} ${posBadge.text}`}>
                          {card.positionCode}
                        </span>
                        <span className="text-xs font-bold text-white">{card.displayName}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{card.club.name} • vs {card.upcomingFixture?.opponent || 'GW'}</p>
                      <p className="text-[10px] text-slate-500">📅 {kickoffDateStr}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[10px] text-slate-400">Projeté:</span>
                      <span className="text-xs font-black text-emerald-400">{calculatePlayerProjectedScore(card).projectedScore}</span>
                    </div>
                    <span className={`text-[9px] font-semibold ${statusInfo.color} px-1.5 py-0.5 rounded border inline-block mt-0.5`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};
