import React, { useState, useMemo } from 'react';
import { Search, Filter, Plus, ArrowUpDown, Shield, Flame, Activity, CheckCircle2, AlertTriangle, Sparkles, UserPlus, ChevronLeft, ChevronRight, Layers, Award, Calendar, Percent, Star } from 'lucide-react';
import { SorareCard, PositionCode, PlayingStatus } from '../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, isCardMatchOnOrBeforeDate, getCardAasL15, getCardDsL15 } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus, getPlayerStars } from '../utils/sorareSlug';

interface GalleryViewProps {
  cards: SorareCard[];
  onOpenScout: (card: SorareCard) => void;
  onAssignToSlot: (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onAddCard: (card: SorareCard) => void;
}

const CARDS_PER_PAGE = 36;

export const GalleryView: React.FC<GalleryViewProps> = ({
  cards,
  onOpenScout,
  onAssignToSlot,
  onAddCard,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<PositionCode | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<PlayingStatus | 'ALL'>('ALL');
  const [selectedRarity, setSelectedRarity] = useState<string>('ALL');
  const [selectedBonusTier, setSelectedBonusTier] = useState<'ALL' | '0-4' | '5-9' | '10-14' | '15-19' | '20+'>('ALL');
  const [selectedStarsFilter, setSelectedStarsFilter] = useState<'ALL' | '1' | '2' | '3' | '4' | '5'>('ALL');
  const [sortBy, setSortBy] = useState<
    | 'L5_DESC' | 'L5_ASC'
    | 'L15_DESC'
    | 'L40_DESC' | 'L40_ASC'
    | 'L10_DESC' | 'L10_ASC'
    | 'PROJ_DESC' | 'PROJ_ASC'
    | 'NAME_ASC' | 'NAME_DESC'
    | 'CLUB_ASC' | 'CLUB_DESC'
    | 'BONUS_ASC' | 'BONUS_DESC'
    | 'STARS_DESC' | 'STARS_ASC'
    | 'AAS_L15_DESC'
    | 'DS_L15_DESC'
  >('L5_DESC');
  const [maxMatchDate, setMaxMatchDate] = useState<string>('');
  const [minWinProb, setMinWinProb] = useState<number>(0);
  const [minProjectedScore, setMinProjectedScore] = useState<number>(0);
  const [minAasL15, setMinAasL15] = useState<number>(0);
  const [minDsL15, setMinDsL15] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // New card form state
  const [newCardName, setNewCardName] = useState('');
  const [newCardPos, setNewCardPos] = useState<PositionCode>('MID');
  const [newCardClub, setNewCardClub] = useState('');
  const [newCardL5, setNewCardL5] = useState(60);
  const [newCardL15, setNewCardL15] = useState(58);
  const [newCardL40, setNewCardL40] = useState(55);
  const [newCardStatus, setNewCardStatus] = useState<PlayingStatus>('STARTER');

  // Compute position counts across all cards
  const counts = useMemo(() => {
    const res = { ALL: cards.length, GK: 0, DEF: 0, MID: 0, FWD: 0 };
    cards.forEach(c => {
      if (c.positionCode === 'GK') res.GK++;
      else if (c.positionCode === 'DEF') res.DEF++;
      else if (c.positionCode === 'MID') res.MID++;
      else if (c.positionCode === 'FWD') res.FWD++;
    });
    return res;
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        card.displayName.toLowerCase().includes(q) ||
        (card.club?.name && card.club.name.toLowerCase().includes(q)) ||
        (card.matchName && card.matchName.toLowerCase().includes(q));
      
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

      const matchesPos = selectedPosition === 'ALL' || card.positionCode === selectedPosition;
      
      let matchesStatus = true;
      if (selectedStatus !== 'ALL') {
        const requiredLevel = getStatusLevel(selectedStatus);
        const cardLevel = getStatusLevel(card.status);
        if (selectedStatus === 'NOT_PLAYING') {
          const isNotPlaying = (card.status as string) === 'NOT_PLAYING' || card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED';
          if (!isNotPlaying) matchesStatus = false;
        } else if (cardLevel < requiredLevel) {
          matchesStatus = false;
        }
      }

      const matchesRarity = selectedRarity === 'ALL' || card.rarity.toUpperCase() === selectedRarity.toUpperCase();

      let matchesDate = true;
      if (maxMatchDate) {
        matchesDate = isCardMatchOnOrBeforeDate(card, maxMatchDate);
      }
      
      let matchesWin = true;
      if (minWinProb > 0) {
        const winProb = getPlayerWinProbability(card.upcomingFixture);
        matchesWin = winProb >= minWinProb;
      }

      let matchesBonus = true;
      if (selectedBonusTier !== 'ALL') {
        const bonus = getCardTotalBonus(card);
        if (selectedBonusTier === '0-4') matchesBonus = bonus >= 0 && bonus < 5;
        else if (selectedBonusTier === '5-9') matchesBonus = bonus >= 5 && bonus < 10;
        else if (selectedBonusTier === '10-14') matchesBonus = bonus >= 10 && bonus < 15;
        else if (selectedBonusTier === '15-19') matchesBonus = bonus >= 15 && bonus < 20;
        else if (selectedBonusTier === '20+') matchesBonus = bonus >= 20;
      }

      let matchesStars = true;
      if (selectedStarsFilter !== 'ALL') {
        matchesStars = getPlayerStars(card) === Number(selectedStarsFilter);
      }

      let matchesScore = true;
      if (minProjectedScore > 0) {
        const { projectedScore } = calculatePlayerProjectedScore(card);
        matchesScore = projectedScore >= minProjectedScore;
      }

      let matchesAas = true;
      if (minAasL15 > 0) {
        matchesAas = getCardAasL15(card) >= minAasL15;
      }

      let matchesDs = true;
      if (minDsL15 > 0) {
        matchesDs = getCardDsL15(card) >= minDsL15;
      }

      return matchesSearch && matchesPos && matchesStatus && matchesRarity && matchesDate && matchesWin && matchesBonus && matchesStars && matchesScore && matchesAas && matchesDs;
    });
  }, [cards, searchTerm, selectedPosition, selectedStatus, selectedRarity, selectedBonusTier, selectedStarsFilter, maxMatchDate, minWinProb, minProjectedScore, minAasL15, minDsL15]);

  const sortedCards = useMemo(() => {
    return [...filteredCards].sort((a, b) => {
      switch (sortBy) {
        case 'L5_DESC':
          return (b.scores?.l5 || 0) - (a.scores?.l5 || 0);
        case 'L5_ASC':
          return (a.scores?.l5 || 0) - (b.scores?.l5 || 0);
        case 'L15_DESC':
          return (b.scores?.l15 || 0) - (a.scores?.l15 || 0);
        case 'L10_DESC': {
          const scoreB = b.scores?.l10 || (b.scores?.last10Scores && b.scores.last10Scores.length ? b.scores.last10Scores.reduce((acc, v) => acc + v, 0) / b.scores.last10Scores.length : 0) || 0;
          const scoreA = a.scores?.l10 || (a.scores?.last10Scores && a.scores.last10Scores.length ? a.scores.last10Scores.reduce((acc, v) => acc + v, 0) / a.scores.last10Scores.length : 0) || 0;
          return scoreB - scoreA;
        }
        case 'L10_ASC': {
          const scoreB = b.scores?.l10 || (b.scores?.last10Scores && b.scores.last10Scores.length ? b.scores.last10Scores.reduce((acc, v) => acc + v, 0) / b.scores.last10Scores.length : 0) || 0;
          const scoreA = a.scores?.l10 || (a.scores?.last10Scores && a.scores.last10Scores.length ? a.scores.last10Scores.reduce((acc, v) => acc + v, 0) / a.scores.last10Scores.length : 0) || 0;
          return scoreA - scoreB;
        }
        case 'L40_DESC':
          return (b.scores?.l40 || 0) - (a.scores?.l40 || 0);
        case 'L40_ASC':
          return (a.scores?.l40 || 0) - (b.scores?.l40 || 0);
        case 'PROJ_DESC':
          return calculatePlayerProjectedScore(b).projectedScore - calculatePlayerProjectedScore(a).projectedScore;
        case 'PROJ_ASC':
          return calculatePlayerProjectedScore(a).projectedScore - calculatePlayerProjectedScore(b).projectedScore;
        case 'NAME_ASC':
          return a.displayName.localeCompare(b.displayName);
        case 'NAME_DESC':
          return b.displayName.localeCompare(a.displayName);
        case 'CLUB_ASC': {
          const clubA = a.club?.name || '';
          const clubB = b.club?.name || '';
          return clubA.localeCompare(clubB);
        }
        case 'CLUB_DESC': {
          const clubA = a.club?.name || '';
          const clubB = b.club?.name || '';
          return clubB.localeCompare(clubA);
        }
        case 'BONUS_DESC':
          return getCardTotalBonus(b) - getCardTotalBonus(a);
        case 'BONUS_ASC':
          return getCardTotalBonus(a) - getCardTotalBonus(b);
        case 'STARS_DESC':
          return getPlayerStars(b) - getPlayerStars(a);
        case 'STARS_ASC':
          return getPlayerStars(a) - getPlayerStars(b);
        case 'AAS_L15_DESC':
          return getCardAasL15(b) - getCardAasL15(a);
        case 'DS_L15_DESC':
          return getCardDsL15(b) - getCardDsL15(a);
        default:
          return 0;
      }
    });
  }, [filteredCards, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(sortedCards.length / CARDS_PER_PAGE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * CARDS_PER_PAGE;
  const paginatedCards = sortedCards.slice(startIndex, startIndex + CARDS_PER_PAGE);

  const handlePageChange = (p: number) => {
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName.trim()) return;

    const fullPosition =
      newCardPos === 'GK'
        ? 'Goalkeeper'
        : newCardPos === 'DEF'
        ? 'Defender'
        : newCardPos === 'MID'
        ? 'Midfielder'
        : 'Forward';

    const card: SorareCard = {
      id: `custom-card-${Date.now()}`,
      slug: newCardName.toLowerCase().replace(/\s+/g, '-'),
      displayName: newCardName.trim(),
      matchName: newCardName.trim(),
      position: fullPosition,
      positionCode: newCardPos,
      positionName: newCardPos === 'GK' ? 'Gardien' : newCardPos === 'DEF' ? 'Défenseur' : newCardPos === 'MID' ? 'Milieu' : 'Attaquant',
      rarity: 'COMMON',
      seasonYear: 2026,
      pictureUrl: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=300&auto=format&fit=crop&q=80',
      avatarUrl: '',
      age: 25,
      club: {
        name: newCardClub.trim() || 'Club',
        slug: 'custom-club',
        pictureUrl: '',
        country: 'France',
      },
      status: newCardStatus,
      starterConfidence: newCardStatus === 'STARTER' ? 95 : newCardStatus === 'REGULAR' ? 80 : 30,
      injuryStatus: 'FIT',
      scores: {
        l5: Number(newCardL5),
        l15: Number(newCardL15),
        l40: Number(newCardL40),
        last5Scores: [Number(newCardL5), Number(newCardL5) - 4, Number(newCardL5) + 6, Number(newCardL5) - 2, Number(newCardL5) + 3],
        consistencyRate: 80,
        decisiveRate: 25,
      },
      upcomingFixture: {
        opponent: 'Adversaire GW',
        isHome: true,
        difficultyRating: 2,
        kickoffDate: '2026-08-22T20:45:00Z',
        competitionName: 'Ligue 1',
        projectedScore: Math.round(Number(newCardL5) * 1.05 * 10) / 10,
        bookmaker: {
          win: 58,
          draw: 3.50,
          loss: 4.20,
          cleanSheetProb: 45,
          goalExpectancy: 1.8,
        },
      },
    };

    onAddCard(card);
    setIsAddModalOpen(false);
    setNewCardName('');
    setNewCardClub('');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header & Search Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <span>Galerie Officielle Sorare</span>
              </h2>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-0.5 text-xs text-emerald-400 font-extrabold shadow-sm">
                {cards.length.toLocaleString('fr-FR')} Cartes Réelles
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cliquez sur une carte pour ouvrir sa fiche détaillée, son historique complet sur 15 matchs et sa date de match.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-400 transition active:scale-95 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              <span>Ajouter Manuellement</span>
            </button>
            {confirmClear ? (
              <div className="flex gap-1">
                <button
                  onClick={async () => {
                    import('../utils/storage').then(async mod => {
                      const username = mod.StorageService.getUsername();
                      await fetch(`/api/sorare/user-cards?username=${encodeURIComponent(username)}&clearCache=true`);
                      mod.StorageService.clearCards();
                      window.location.reload();
                    });
                  }}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-600/20 hover:bg-red-500 transition active:scale-95 whitespace-nowrap"
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-600 transition active:scale-95 whitespace-nowrap"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-2 rounded-xl bg-red-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-400 transition active:scale-95 whitespace-nowrap"
              >
                Effacer Galerie
              </button>
            )}
          </div>
        </div>

        {/* Position Distribution Counters */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 border-t border-slate-800/80 pt-4">
          <button
            onClick={() => { setSelectedPosition('ALL'); setCurrentPage(1); }}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition border ${
              selectedPosition === 'ALL'
                ? 'border-emerald-400 bg-emerald-500/15 text-white font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span>Toutes les cartes</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-emerald-400">{counts.ALL}</span>
          </button>

          <button
            onClick={() => { setSelectedPosition('GK'); setCurrentPage(1); }}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition border ${
              selectedPosition === 'GK'
                ? 'border-lime-400 bg-lime-500/15 text-white font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-lime-500/20 text-[10px] font-black text-lime-400">GK</span>
              <span>Gardiens</span>
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-lime-400">{counts.GK}</span>
          </button>

          <button
            onClick={() => { setSelectedPosition('DEF'); setCurrentPage(1); }}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition border ${
              selectedPosition === 'DEF'
                ? 'border-blue-400 bg-blue-500/15 text-white font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-500/20 text-[10px] font-black text-blue-400">DEF</span>
              <span>Défenseurs</span>
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-blue-400">{counts.DEF}</span>
          </button>

          <button
            onClick={() => { setSelectedPosition('MID'); setCurrentPage(1); }}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition border ${
              selectedPosition === 'MID'
                ? 'border-emerald-400 bg-emerald-500/15 text-white font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-emerald-500/20 text-[10px] font-black text-emerald-400">MID</span>
              <span>Milieux</span>
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-emerald-400">{counts.MID}</span>
          </button>

          <button
            onClick={() => { setSelectedPosition('FWD'); setCurrentPage(1); }}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition border col-span-2 sm:col-span-1 ${
              selectedPosition === 'FWD'
                ? 'border-rose-400 bg-rose-500/15 text-white font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-rose-500/20 text-[10px] font-black text-rose-400">FWD</span>
              <span>Attaquants</span>
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-rose-400">{counts.FWD}</span>
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          
          {/* Search Box */}
          <div className="relative md:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Rechercher par nom, club..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* Date Filter (Match jusqu'au...) */}
          <div className="relative">
            <input
              type="date"
              value={maxMatchDate}
              onChange={(e) => { setMaxMatchDate(e.target.value); setCurrentPage(1); }}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none"
              title="Match inclus jusqu'à cette date"
            />
            {maxMatchDate && (
              <button
                type="button"
                onClick={() => { setMaxMatchDate(''); setCurrentPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs bg-slate-800 rounded px-1"
                title="Effacer le filtre date"
              >
                ✕
              </button>
            )}
          </div>

          {/* Star Filter */}
          <div>
            <select
              value={selectedStarsFilter}
              onChange={(e) => { setSelectedStarsFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-2 text-xs text-amber-400 font-semibold focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL" className="text-slate-300">Toutes les étoiles</option>
              <option value="5" className="text-amber-400">★★★★★ (5 Étoiles)</option>
              <option value="4" className="text-amber-400">★★★★☆ (4 Étoiles)</option>
              <option value="3" className="text-amber-400">★★★☆☆ (3 Étoiles)</option>
              <option value="2" className="text-amber-400">★★☆☆☆ (2 Étoiles)</option>
              <option value="1" className="text-amber-400">★☆☆☆☆ (1 Étoile)</option>
            </select>
          </div>

          {/* Projected Score Filter */}
          <div>
            <select
              value={minProjectedScore}
              onChange={(e) => { setMinProjectedScore(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value={0}>Tous les scores projetés</option>
              <option value={30}>&ge; 30 pts projetés</option>
              <option value={35}>&ge; 35 pts projetés</option>
              <option value={40}>&ge; 40 pts projetés</option>
              <option value={45}>&ge; 45 pts projetés</option>
              <option value={50}>&ge; 50 pts projetés</option>
              <option value={55}>&ge; 55 pts projetés</option>
              <option value={60}>&ge; 60 pts projetés</option>
              <option value={65}>&ge; 65 pts projetés</option>
              <option value={70}>&ge; 70 pts projetés</option>
            </select>
          </div>

          <div>
            <select
              value={minDsL15}
              onChange={(e) => { setMinDsL15(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-amber-400 focus:outline-none"
            >
              <option value={0}>Toutes les DS (L15)</option>
              <option value={20}>DS L15 &ge; 20 pts</option>
              <option value={30}>DS L15 &ge; 30 pts</option>
              <option value={40}>DS L15 &ge; 40 pts</option>
              <option value={50}>DS L15 &ge; 50 pts</option>
            </select>
          </div>

          <div>
            <select
              value={minAasL15}
              onChange={(e) => { setMinAasL15(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-blue-400 focus:outline-none"
            >
              <option value={0}>Toutes les AAS (L15)</option>
              <option value={10}>AAS L15 &ge; 10 pts</option>
              <option value={15}>AAS L15 &ge; 15 pts</option>
              <option value={20}>AAS L15 &ge; 20 pts</option>
              <option value={25}>AAS L15 &ge; 25 pts</option>
            </select>
          </div>

          {/* Bonus Tier Filter (0-4, 5-9, 10-14, 15-19, 20+) */}
          <div>
            <select
              value={selectedBonusTier}
              onChange={(e) => { setSelectedBonusTier(e.target.value as any); setCurrentPage(1); }}
              className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-2 text-xs text-amber-300 font-semibold focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL" className="text-slate-300">Tous les bonus</option>
              <option value="0-4" className="text-amber-300">Bonus 0% - 4%</option>
              <option value="5-9" className="text-amber-300">Bonus 5% - 9%</option>
              <option value="10-14" className="text-amber-300">Bonus 10% - 14%</option>
              <option value="15-19" className="text-amber-300">Bonus 15% - 19%</option>
              <option value="20+" className="text-amber-300">Bonus 20%+</option>
            </select>
          </div>

          {/* Win Probability Filter (Palier de 5% entre 25 et 50%) */}
          <div>
            <select
              value={minWinProb}
              onChange={(e) => { setMinWinProb(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value={0}>Toutes les cotes</option>
              <option value={25}>&ge; 25% chances victoire</option>
              <option value={30}>&ge; 30% chances victoire</option>
              <option value={35}>&ge; 35% chances victoire</option>
              <option value={40}>&ge; 40% chances victoire</option>
              <option value={45}>&ge; 45% chances victoire</option>
              <option value={50}>&ge; 50% chances victoire</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value as any); setCurrentPage(1); }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="STARTER">Titulaires indiscutables</option>
              <option value="REGULAR">Réguliers (ou mieux)</option>
              <option value="SUBSTITUTE">Remplaçants (ou mieux)</option>
              <option value="DOUBTFUL">Incertains (ou mieux)</option>
              <option value="NOT_PLAYING">DNP (Ne joue pas)</option>
            </select>
          </div>

          {/* Sort Selector */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none font-semibold"
            >
              <option value="PROJ_DESC">Score Projeté (Décroissant)</option>
              <option value="PROJ_ASC">Score Projeté (Croissant)</option>
              <option value="AAS_L15_DESC">Score All-Around L15 (Décroissant)</option>
              <option value="DS_L15_DESC">Score Décisif L15 (Décroissant)</option>
              <option value="STARS_DESC">Nombre d'étoiles (Décroissant)</option>
              <option value="STARS_ASC">Nombre d'étoiles (Croissant)</option>
              <option value="L5_DESC">Forme L5 (Décroissant)</option>
              <option value="L5_ASC">Forme L5 (Croissant)</option>
              <option value="L10_DESC">Forme L10 (Décroissant)</option>
              <option value="L10_ASC">Forme L10 (Croissant)</option>
              <option value="L40_DESC">Régularité L40 (Décroissant)</option>
              <option value="L40_ASC">Régularité L40 (Croissant)</option>
              <option value="BONUS_DESC">Bonus % (Décroissant)</option>
              <option value="BONUS_ASC">Bonus % (Croissant)</option>
              <option value="NAME_ASC">Nom (A-Z)</option>
              <option value="NAME_DESC">Nom (Z-A)</option>
              <option value="CLUB_ASC">Équipe (A-Z)</option>
              <option value="CLUB_DESC">Équipe (Z-A)</option>
            </select>
          </div>
        </div>

        {/* Filter Badges Active */}
        {(maxMatchDate || minWinProb > 0 || searchTerm || selectedPosition !== 'ALL' || selectedStatus !== 'ALL' || selectedBonusTier !== 'ALL' || selectedStarsFilter !== 'ALL' || minProjectedScore > 0 || minAasL15 > 0 || minDsL15 > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/60">
            <span className="text-[11px] text-slate-400">Filtres actifs :</span>
            {maxMatchDate && (
              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                Match &le; {maxMatchDate}
              </span>
            )}
            {selectedStarsFilter !== 'ALL' && (
              <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                {selectedStarsFilter} Étoile{Number(selectedStarsFilter) > 1 ? 's' : ''}
              </span>
            )}
            {minProjectedScore > 0 && (
              <span className="rounded-md bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                Score &ge; {minProjectedScore}
              </span>
            )}
            {minDsL15 > 0 && (
              <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                DS &ge; {minDsL15}
              </span>
            )}
            {minAasL15 > 0 && (
              <span className="rounded-md bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                AAS &ge; {minAasL15}
              </span>
            )}
            {selectedBonusTier !== 'ALL' && (
              <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                Bonus {selectedBonusTier === '20+' ? '≥ 20%' : `${selectedBonusTier}%`}
              </span>
            )}
            {minWinProb > 0 && (
              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                Victoire &ge; {minWinProb}%
              </span>
            )}
            <button
              onClick={() => {
                setMaxMatchDate('');
                setMinWinProb(0);
                setSearchTerm('');
                setSelectedPosition('ALL');
                setSelectedStatus('ALL');
                setSelectedRarity('ALL');
                setSelectedBonusTier('ALL');
                setSelectedStarsFilter('ALL');
                setMinProjectedScore(0);
                setMinAasL15(0);
                setMinDsL15(0);
              }}
              className="text-[10px] font-bold text-slate-400 hover:text-white underline ml-auto"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* Cards Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Affichage de <strong className="text-white">{sortedCards.length}</strong> carte(s) trouvée(s)
          {totalPages > 1 && ` • Page ${validPage} sur ${totalPages}`}
        </span>
      </div>

      {/* Cards Grid - Each Card is Clickable to Open Player Scout Modal */}
      {paginatedCards.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Filter className="mx-auto h-8 w-8 text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">Aucune carte ne correspond à vos filtres</p>
          <p className="text-xs text-slate-500 mt-1">Essayez d'élargir la date ou de réduire le pourcentage de victoire minimum.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-9">
          {paginatedCards.map((card) => {
            const posBadge = formatPositionBadge(card.positionCode);
            const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
            const bonusPct = getCardTotalBonus(card);
            const isInjured = card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED';
            const winProb = getPlayerWinProbability(card.upcomingFixture);
            const formattedDate = formatKickoffDate(card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate);
            const breakdown = calculatePlayerProjectedScore(card, 'BALANCED', cards);
            const projScore = breakdown.projectedScore;

            return (
              <div
                key={card.id}
                onClick={() => onOpenScout(card)}
                className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden shadow-lg hover:shadow-2xl cursor-pointer hover:scale-[1.02] hover:border-emerald-500/60 active:scale-[0.99] ${
                  isInjured
                    ? 'border-rose-900/60 bg-rose-950/20 opacity-80'
                    : card.status === 'DOUBTFUL' || card.status === 'NOT_PLAYING'
                    ? 'border-slate-800/80 bg-slate-900/60 opacity-85'
                    : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {/* Card Top Header */}
                <div className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
                        {card.positionCode}
                      </span>
                      {card.rarity && card.rarity.toUpperCase() !== 'COMMON' && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black text-emerald-400 border border-emerald-500/30 uppercase">
                          {card.rarity}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span
                        className="rounded-md border border-amber-500/40 bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-black text-amber-300 shadow-sm flex items-center gap-0.5 shrink-0"
                        title={`Bonus de la carte: +${bonusPct}%`}
                      >
                        <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                        +{bonusPct}%
                      </span>
                    </div>
                  </div>

                  {/* Player Profile & Picture */}
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="relative h-16 w-16 flex-shrink-0">
                      {card.pictureUrl ? (
                        <img
                          src={card.pictureUrl}
                          alt={card.displayName}
                          referrerPolicy="no-referrer"
                          className="h-16 w-16 rounded-xl object-contain bg-slate-950/40 border border-slate-700 shadow p-0.5"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="h-16 w-16 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 items-center justify-center text-slate-400 font-bold text-xs"
                        style={{ display: card.pictureUrl ? 'none' : 'flex' }}
                      >
                        {card.positionCode}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-white group-hover:text-emerald-400 transition">
                        {card.displayName}
                      </h4>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="truncate text-xs text-slate-400">{card.club?.name || 'Club'}</p>
                        {/* Star Rating Miniature */}
                        <div className="flex items-center gap-0.5 shrink-0 bg-slate-950/40 px-1 py-0.5 rounded border border-slate-800/50">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-2.5 w-2.5 ${
                                i < getPlayerStars(card)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>{card.age} ans</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-semibold">{card.starterConfidence}% titulaire</span>
                      </div>
                    </div>
                  </div>

                  {/* SO5 Stats Pillars (L5 / L15 / L40) */}
                  <div className="mt-3.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950/80 p-2 border border-slate-800/80">
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold text-slate-400">L5 (Forme)</span>
                      <span className={`text-sm font-black ${
                        card.scores.l5 >= 60 ? 'text-emerald-400' : card.scores.l5 >= 48 ? 'text-emerald-400' : card.scores.l5 > 0 ? 'text-slate-300' : 'text-slate-500'
                      }`}>
                        {card.scores.l5 > 0 ? card.scores.l5 : '0.0'}
                      </span>
                    </div>

                    <div className="text-center border-x border-slate-800/80">
                      <span className="block text-[10px] font-semibold text-slate-400">L15</span>
                      <span className="text-sm font-black text-slate-300">
                        {card.scores.l15 > 0 ? card.scores.l15 : '-'}
                      </span>
                    </div>

                    <div className="text-center">
                      <span className="block text-[10px] font-semibold text-slate-400">L40</span>
                      <span className="text-sm font-black text-slate-400">
                        {card.scores.l40 > 0 ? card.scores.l40 : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Upcoming Matchup & Win Prob from Bookmaker */}
                  {card.upcomingFixture && (
                    <div className="mt-2.5 rounded-xl bg-slate-950/70 p-2 text-[11px] border border-slate-800/60 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] truncate max-w-[130px] font-medium">
                          {card.upcomingFixture.isHome ? '🏠 vs' : '✈️ @'} <strong className="text-slate-200">{card.upcomingFixture.opponent}</strong>
                        </span>
                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          {winProb}% Victoire
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/60 pt-1">
                        <span>{formattedDate}</span>
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="font-semibold text-slate-300" title="Score de base">{breakdown.baseProjectedScore} pts</span>
                          <span className="font-bold text-amber-300" title={`Bonus de carte de +${breakdown.cardBonusPercentage}% (soit +${breakdown.cardBonusScore} pts)`}>+{breakdown.cardBonusPercentage}% (+{breakdown.cardBonusScore} pts)</span>
                          <span className="font-black text-emerald-400 bg-emerald-500/10 px-1 rounded" title="Score total projeté avec bonus">= {projScore} ({breakdown.projectedFloor}-{breakdown.projectedCeiling}) pts</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer - Removed Scout button as clicking card opens player page */}
                <div className="border-t border-slate-800/80 bg-slate-950/90 p-2.5 flex items-center justify-between gap-1.5">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Cliquer pour analyser
                  </span>

                  <div className="relative group/dropdown">
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      Aligner ▾
                    </button>
                    
                    {/* Position dropdown */}
                    <div className="absolute right-0 bottom-full mb-1 hidden group-hover/dropdown:flex flex-col rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl z-20 min-w-[120px]">
                      {card.positionCode === 'GK' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'gk'); }}
                          className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                        >
                          En Gardien (GK)
                        </button>
                      )}
                      {card.positionCode === 'DEF' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'def'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Défenseur (DEF)
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'extra'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Joker (EXTRA)
                          </button>
                        </>
                      )}
                      {card.positionCode === 'MID' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'mid'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Milieu (MID)
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'extra'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Joker (EXTRA)
                          </button>
                        </>
                      )}
                      {card.positionCode === 'FWD' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'fwd'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Attaquant (FWD)
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onAssignToSlot(card, 'extra'); }}
                            className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-emerald-400"
                          >
                            En Joker (EXTRA)
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(Math.max(1, validPage - 1))}
            disabled={validPage === 1}
            className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Précédent</span>
          </button>

          <span className="px-4 text-xs font-bold text-slate-400">
            Page <strong className="text-white">{validPage}</strong> / {totalPages}
          </span>

          <button
            onClick={() => handlePageChange(Math.min(totalPages, validPage + 1))}
            disabled={validPage === totalPages}
            className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <span>Suivant</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add Custom Card Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white">Ajouter une carte manuellement</h3>
            <p className="text-xs text-slate-400 mt-1">Créez une nouvelle carte personnalisée dans votre collection.</p>

            <form onSubmit={handleCreateCard} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nom complet du joueur</label>
                <input
                  type="text"
                  required
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                  placeholder="ex: Kylian Mbappé"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Poste</label>
                  <select
                    value={newCardPos}
                    onChange={(e) => setNewCardPos(e.target.value as PositionCode)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="GK">Gardien (GK)</option>
                    <option value="DEF">Défenseur (DEF)</option>
                    <option value="MID">Milieu (MID)</option>
                    <option value="FWD">Attaquant (FWD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Club</label>
                  <input
                    type="text"
                    value={newCardClub}
                    onChange={(e) => setNewCardClub(e.target.value)}
                    placeholder="ex: Real Madrid"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
                  >
                  </input>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Score L5</label>
                  <input
                    type="number"
                    value={newCardL5}
                    onChange={(e) => setNewCardL5(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Score L15</label>
                  <input
                    type="number"
                    value={newCardL15}
                    onChange={(e) => setNewCardL15(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Score L40</label>
                  <input
                    type="number"
                    value={newCardL40}
                    onChange={(e) => setNewCardL40(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Créer la carte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
