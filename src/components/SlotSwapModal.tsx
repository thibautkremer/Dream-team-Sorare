import React, { useState, useMemo } from 'react';
import { X, Search, Check, Flame, Calendar, AlertCircle, Filter, SlidersHorizontal, ShieldAlert, Users, Swords } from 'lucide-react';
import { SorareCard, SlotPosition, LineupOptimizationFilters, Lineup } from '../types';
import { calculatePlayerProjectedScore, formatKickoffDate, isCardMatchOnOrBeforeDate, getPlayerWinProbability, getCardAasL15, getCardDsL15, areOpponents, isSameClub } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus } from '../utils/sorareSlug';

interface SlotSwapModalProps {
  slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra' | null;
  cards: SorareCard[];
  filters?: LineupOptimizationFilters;
  currentLineup?: Lineup;
  onSelectPlayer: (player: SorareCard) => void;
  onClose: () => void;
}

export const SlotSwapModal: React.FC<SlotSwapModalProps> = ({ slot, cards, filters, currentLineup, onSelectPlayer, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [enforceDateFilter, setEnforceDateFilter] = useState(true);
  const [hideOpponents, setHideOpponents] = useState(false);
  const [prioritizeTeammates, setPrioritizeTeammates] = useState(true);
  
  // Advanced filters state
  const [maxDateFilter, setMaxDateFilter] = useState<string>(filters?.maxMatchDate || '');
  const [minWinProb, setMinWinProb] = useState(0);
  const [minL5, setMinL5] = useState(0);
  const [minL15, setMinL15] = useState(0);
  const [minAasL15, setMinAasL15] = useState(0);
  const [minDsL15, setMinDsL15] = useState(0);
  const [minBonus, setMinBonus] = useState(0);
  const [minProjectedScore, setMinProjectedScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [extraPositionFilter, setExtraPositionFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'PROJ_DESC' | 'PROJ_ASC' | 'AAS_L15_DESC' | 'DS_L15_DESC' | 'L5_DESC' | 'L15_DESC'>('PROJ_DESC');

  if (!slot) return null;

  // Autres joueurs actuellement dans l'équipe (hors poste ciblé)
  const otherTeamPlayers: SorareCard[] = useMemo(() => {
    if (!currentLineup?.slots) return [];
    return Object.entries(currentLineup.slots)
      .filter(([slotKey, player]) => slotKey !== slot && player !== null)
      .map(([_, player]) => player as SorareCard);
  }, [currentLineup, slot]);

  const getStatusLevel = (status: string) => {
    switch (status) {
      case 'STARTER': return 5;
      case 'REGULAR': return 4;
      case 'SUBSTITUTE':
      case 'SUPER_SUBSTITUTE': return 3;
      case 'DOUBTFUL':
      case 'BENCH': return 2;
      case 'NOT_PLAYING':
      case 'INJURED':
      case 'SUSPENDED': return 1;
      default: return 0;
    }
  };
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

  const cardsWithInfo = useMemo(() => {
    return cards.map(card => {
      const opposingPlayer = otherTeamPlayers.find(other => areOpponents(card, other));
      const teammates = otherTeamPlayers.filter(other => isSameClub(card.club?.name, other.club?.name));

      return {
        card,
        proj: calculatePlayerProjectedScore(card, currentLineup?.strategy || 'BALANCED', cards, undefined, filters?.scoringFocus || 'BALANCED'),
        bonus: getCardTotalBonus(card),
        winProb: getPlayerWinProbability(card.upcomingFixture),
        opposingPlayer,
        teammates,
      };
    });
  }, [cards, otherTeamPlayers, currentLineup?.strategy, filters?.scoringFocus]);

  const searchedCardsInfo = useMemo(() => {
    return cardsWithInfo.filter(({ card, proj, bonus, winProb, opposingPlayer }) => {
      // Slot check
      if (slot === 'gk' && card.positionCode !== 'GK') return false;
      if (slot === 'def' && card.positionCode !== 'DEF') return false;
      if (slot === 'mid' && card.positionCode !== 'MID') return false;
      if (slot === 'fwd' && card.positionCode !== 'FWD') return false;
      if (slot === 'extra' && card.positionCode === 'GK') return false; 
  
      // Extra Position Filter
      if (slot === 'extra' && extraPositionFilter !== 'ALL' && card.positionCode !== extraPositionFilter) return false;

      // Filter out opponents if toggle is checked
      if (hideOpponents && opposingPlayer) return false;
  
      // Search Term
      if (searchTerm) {
        const match = card.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || (card.club?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        if (!match) return false;
      }
  
      // Date Filter
      if (enforceDateFilter && maxDateFilter) {
        if (!isCardMatchOnOrBeforeDate(card, maxDateFilter)) return false;
      }
  
      // Advanced Filters
      if (minWinProb > 0 && winProb < minWinProb) return false;
      if (minL5 > 0 && (card.scores?.l5 || 0) < minL5) return false;
      if (minL15 > 0 && (card.scores?.l15 || 0) < minL15) return false;
      if (minAasL15 > 0 && getCardAasL15(card) < minAasL15) return false;
      if (minDsL15 > 0 && getCardDsL15(card) < minDsL15) return false;
      if (minBonus > 0 && bonus < minBonus) return false;
      if (minProjectedScore > 0 && proj.projectedScore < minProjectedScore) return false;
  
      // Status Filter (Minimum logic)
      if (statusFilter !== 'ALL') {
        const requiredLevel = getStatusLevel(statusFilter);
        const cardLevel = getStatusLevel(card.status);
        if (statusFilter === 'DNP') {
          if (card.status !== 'NOT_PLAYING') return false;
        } else if (cardLevel < requiredLevel) {
          return false;
        }
      }
  
      return true;
    }).sort((a, b) => {
      // Si le tri est par score projeté et que la priorité coéquipiers est activée
      if (prioritizeTeammates && sortBy === 'PROJ_DESC') {
        const aHasTeammate = a.teammates.length > 0;
        const bHasTeammate = b.teammates.length > 0;
        const scoreDiff = Math.abs(b.proj.projectedScore - a.proj.projectedScore);

        // Si les deux joueurs sont proches (diff <= 4 pts), privilégier celui qui a des coéquipiers
        if (scoreDiff <= 4.0 && (aHasTeammate || bHasTeammate)) {
          if (aHasTeammate && !bHasTeammate) return -1;
          if (!aHasTeammate && bHasTeammate) return 1;
          if (a.teammates.length !== b.teammates.length) return b.teammates.length - a.teammates.length;
        }
      }

      switch (sortBy) {
        case 'PROJ_DESC': return b.proj.projectedScore - a.proj.projectedScore;
        case 'PROJ_ASC': return a.proj.projectedScore - b.proj.projectedScore;
        case 'AAS_L15_DESC': return getCardAasL15(b.card) - getCardAasL15(a.card);
        case 'DS_L15_DESC': return getCardDsL15(b.card) - getCardDsL15(a.card);
        case 'L5_DESC': return (b.card.scores?.l5 || 0) - (a.card.scores?.l5 || 0);
        case 'L15_DESC': return (b.card.scores?.l15 || 0) - (a.card.scores?.l15 || 0);
        default: return b.proj.projectedScore - a.proj.projectedScore;
      }
    });
  }, [cardsWithInfo, slot, extraPositionFilter, hideOpponents, prioritizeTeammates, searchTerm, enforceDateFilter, maxDateFilter, minWinProb, minL5, minL15, minAasL15, minDsL15, minBonus, minProjectedScore, statusFilter, sortBy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-[95vw] h-[95vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 p-4 sm:p-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Sélectionner un joueur pour le poste : <span className="text-emerald-400">{getPositionTarget(slot)}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchedCardsInfo.length} candidats disponibles dans votre effectif
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tactical Quick Toggles (Same-Team Stacking & No-Opponents) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-200 hover:text-white font-medium">
              <input
                type="checkbox"
                checked={prioritizeTeammates}
                onChange={e => setPrioritizeTeammates(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1 text-emerald-300">
                <Users className="h-3.5 w-3.5" />
                <span>Privilégier même équipe si scores proches</span>
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-200 hover:text-white font-medium">
              <input
                type="checkbox"
                checked={hideOpponents}
                onChange={e => setHideOpponents(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1 text-rose-300">
                <Swords className="h-3.5 w-3.5" />
                <span>Masquer les adversaires directs de la compo</span>
              </span>
            </label>
          </div>

          {otherTeamPlayers.length > 0 && (
            <span className="text-[11px] text-slate-400">
              Coéquipiers en place : <strong className="text-slate-200">{otherTeamPlayers.map(p => p.club?.name).filter(Boolean).join(', ')}</strong>
            </span>
          )}
        </div>

        {/* Date Filter Alert Banner */}
        {filters?.maxMatchDate && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 text-xs">
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

        {/* Search & Filter Toggle */}
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par nom ou club..."
              autoFocus
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition ${
              showFilters || maxDateFilter || minWinProb > 0 || minL5 > 0 || minL15 > 0 || minAasL15 > 0 || minDsL15 > 0 || minBonus > 0 || minProjectedScore > 0 || statusFilter !== 'ALL' || extraPositionFilter !== 'ALL'
                ? 'border-emerald-500 bg-emerald-950 text-emerald-400'
                : 'border-slate-700 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtres</span>
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Match jusqu'au</label>
              <input type="date" value={maxDateFilter} onChange={e => setMaxDateFilter(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Score Projeté Min</label>
              <select value={minProjectedScore} onChange={e => setMinProjectedScore(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value={0}>Tous les scores</option>
                <option value={30}>&ge; 30 pts projetés</option>
                <option value={35}>&ge; 35 pts projetés</option>
                <option value={40}>&ge; 40 pts projetés</option>
                <option value={45}>&ge; 45 pts projetés</option>
                <option value={50}>&ge; 50 pts projetés</option>
                <option value={55}>&ge; 55 pts projetés</option>
                <option value={60}>&ge; 60 pts projetés</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-amber-400 mb-1">DS L15 Min</label>
              <select value={minDsL15} onChange={e => setMinDsL15(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-amber-500 outline-none">
                <option value={0}>Toutes DS</option>
                <option value={20}>&ge; 20 pts</option>
                <option value={30}>&ge; 30 pts</option>
                <option value={40}>&ge; 40 pts</option>
                <option value={50}>&ge; 50 pts</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-blue-400 mb-1">AAS L15 Min</label>
              <select value={minAasL15} onChange={e => setMinAasL15(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none">
                <option value={0}>Toutes AAS</option>
                <option value={10}>&ge; 10 pts</option>
                <option value={15}>&ge; 15 pts</option>
                <option value={20}>&ge; 20 pts</option>
                <option value={25}>&ge; 25 pts</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">% Victoire Min</label>
              <select value={minWinProb} onChange={e => setMinWinProb(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value={0}>Toutes les cotes</option>
                <option value={25}>&ge; 25% chances victoire</option>
                <option value={30}>&ge; 30% chances victoire</option>
                <option value={35}>&ge; 35% chances victoire</option>
                <option value={40}>&ge; 40% chances victoire</option>
                <option value={45}>&ge; 45% chances victoire</option>
                <option value={50}>&ge; 50% chances victoire</option>
                <option value={60}>&ge; 60% chances victoire</option>
                <option value={70}>&ge; 70% chances victoire</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Bonus Carte Min</label>
              <select value={minBonus} onChange={e => setMinBonus(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value={0}>Tous les bonus</option>
                <option value={5}>&ge; 5% de bonus</option>
                <option value={8}>&ge; 8% de bonus</option>
                <option value={10}>&ge; 10% de bonus</option>
                <option value={15}>&ge; 15% de bonus</option>
                <option value={20}>&ge; 20% de bonus</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Forme L5 Min</label>
              <select value={minL5} onChange={e => setMinL5(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value={0}>Toutes les formes</option>
                <option value={40}>&ge; 40 points</option>
                <option value={45}>&ge; 45 points</option>
                <option value={50}>&ge; 50 points</option>
                <option value={55}>&ge; 55 points</option>
                <option value={60}>&ge; 60 points</option>
                <option value={65}>&ge; 65 points</option>
                <option value={70}>&ge; 70 points</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Forme L15 Min</label>
              <select value={minL15} onChange={e => setMinL15(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value={0}>Toutes les formes</option>
                <option value={40}>&ge; 40 points</option>
                <option value={45}>&ge; 45 points</option>
                <option value={50}>&ge; 50 points</option>
                <option value={55}>&ge; 55 points</option>
                <option value={60}>&ge; 60 points</option>
                <option value={65}>&ge; 65 points</option>
                <option value={70}>&ge; 70 points</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Statut Minimum</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value="ALL">Tous les statuts</option>
                <option value="STARTER">Titulaire Indiscutable</option>
                <option value="REGULAR">Régulier (ou mieux)</option>
                <option value="SUBSTITUTE">Remplaçant (ou mieux)</option>
                <option value="DNP">DNP Uniquement (Ne joue pas)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">Trier par</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                <option value="PROJ_DESC">Score Projeté</option>
                <option value="AAS_L15_DESC">AAS L15</option>
                <option value="DS_L15_DESC">DS L15</option>
                <option value="L5_DESC">Forme L5</option>
                <option value="L15_DESC">Forme L15</option>
              </select>
            </div>
            {slot === 'extra' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Poste (Joker)</label>
                <select value={extraPositionFilter} onChange={e => setExtraPositionFilter(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-emerald-500 outline-none">
                  <option value="ALL">Tous les postes</option>
                  <option value="DEF">Défenseur (DEF)</option>
                  <option value="MID">Milieu (MID)</option>
                  <option value="FWD">Attaquant (FWD)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Player List */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 pb-4">
          {searchedCardsInfo.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aucun joueur trouvé pour ce poste {filters?.maxMatchDate && enforceDateFilter ? `avec un match avant le ${filters.maxMatchDate}` : ''}.
            </div>
          ) : (
            searchedCardsInfo.map(({ card, proj, opposingPlayer, teammates }) => {
              const posBadge = formatPositionBadge(card.positionCode);
              const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
              const isNotPlaying = card.status === 'NOT_PLAYING' || card.injuryStatus === 'INJURED';
              const kickoffDateStr = formatKickoffDate(card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate);
              const isOpponent = Boolean(opposingPlayer);
              const isTeammate = teammates.length > 0;

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    onSelectPlayer(card);
                    onClose();
                  }}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border p-3 cursor-pointer transition ${
                    isOpponent
                      ? 'border-rose-700/60 bg-rose-950/25 hover:border-rose-500'
                      : isTeammate
                      ? 'border-emerald-500/60 bg-emerald-950/20 hover:border-emerald-400'
                      : isNotPlaying
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${posBadge.bg} ${posBadge.text}`}>
                          {card.positionCode}
                        </span>
                        <span className="text-xs font-bold text-white">{card.displayName}</span>
                        
                        {/* Stacking synergy badge */}
                        {isTeammate && (
                          <span className="rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-black px-1.5 py-0.5 flex items-center gap-1">
                            <Users className="h-2.5 w-2.5" />
                            <span>Même club ({teammates.map(t => t.displayName).join(', ')})</span>
                          </span>
                        )}

                        {/* Opponent alert badge */}
                        {isOpponent && (
                          <span className="rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] font-black px-1.5 py-0.5 flex items-center gap-1">
                            <Swords className="h-2.5 w-2.5" />
                            <span>Affronte {opposingPlayer?.displayName}</span>
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400">{card.club?.name || 'Club'} • vs {card.upcomingFixture?.opponent || 'GW'}</p>
                      <p className="text-[10px] text-slate-500">📅 {kickoffDateStr}</p>
                    </div>
                  </div>

                  <div className="flex items-center sm:flex-col justify-between sm:justify-center sm:items-end gap-1 border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Projeté:</span>
                      <span className="text-xs font-black text-emerald-400">{proj.projectedScore}</span>
                    </div>
                    <span className={`text-[9px] font-semibold ${statusInfo.color} px-1.5 py-0.5 rounded border inline-block`}>
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
