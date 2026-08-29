import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { Search, Filter, Plus, ArrowUpDown, Shield, Flame, Activity, CheckCircle2, AlertTriangle, Sparkles, UserPlus, ChevronLeft, ChevronRight, Layers, Award, Calendar, Percent, Star, X, ArrowRight, TrendingUp, TrendingDown, Info, RefreshCw, LayoutGrid, Square, SlidersHorizontal, Table, Tag, Trophy, BarChart2, Check, ExternalLink } from 'lucide-react';
import { SorareCard, PositionCode, PlayingStatus, StrategyType } from '../types';
import { calculatePlayerProjectedScore, getPlayerWinProbability, formatKickoffDate, isCardMatchOnOrBeforeDate, getCardAasL15, getCardDsL15, precomputeClubContexts, getPlayerRecentMatchAnalysis } from '../utils/optimizer';
import { formatPositionBadge, formatStatusBadge, getCardTotalBonus, getPlayerStars } from '../utils/sorareSlug';
import { StorageService } from '../utils/storage';
import { GalleryCompareModal } from './gallery/GalleryCompareModal';
import { CardTagModal } from './gallery/CardTagModal';
import { GalleryTableView } from './gallery/GalleryTableView';
import { GalleryStacksView } from './gallery/GalleryStacksView';

interface GalleryViewProps {
  cards: SorareCard[];
  strategy?: StrategyType;
  isLoadingCards?: boolean;
  onOpenScout: (card: SorareCard) => void;
  onAssignToSlot: (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onAddCard: (card: SorareCard) => void;
  compositions?: any[];
  onReplacePlayerInCompo?: (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra', player: SorareCard) => void;
}

const CARDS_PER_PAGE = 36;

export const GalleryView: React.FC<GalleryViewProps> = ({
  cards,
  strategy = 'BALANCED',
  isLoadingCards = false,
  onOpenScout,
  onAssignToSlot,
  onAddCard,
  compositions = [],
  onReplacePlayerInCompo,
}) => {
  // Display Mode (Point 5: Detailed, Compact, Table, Stacks)
  const [displayMode, setDisplayMode] = useState<'grid_detailed' | 'grid_compact' | 'table' | 'stacks'>('grid_detailed');

  const [searchTerm, setSearchTerm] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [selectedPosition, setSelectedPosition] = useState<PositionCode | 'ALL'>('ALL');
  
  // Point 2: Alignment & Availability filter
  const [alignmentFilter, setAlignmentFilter] = useState<'ALL' | 'UNALIGNED_READY' | 'ALIGNED' | 'OVERUSED' | 'NO_FIXTURE'>('ALL');

  // Point 3: Favorites & Custom Tags State
  const [favorites, setFavorites] = useState<string[]>(() => StorageService.getFavorites());
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [cardTags, setCardTags] = useState<Record<string, string[]>>(() => StorageService.getCardTags());
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('ALL');
  const [selectedCardForTags, setSelectedCardForTags] = useState<SorareCard | null>(null);

  // Point 4: Head-to-Head Comparison State
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);

  // AUDIT FIX (4.3): quick one-click toggle to hide injured/suspended/DNP players
  const [hideUnavailable, setHideUnavailable] = useState(false);
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
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);
  const [mobileColumns, setMobileColumns] = useState<'1' | '2'>('2');
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // States for advanced interactive player replacement flow
  const [selectedCardForReplace, setSelectedCardForReplace] = useState<SorareCard | null>(null);
  const [selectedCompoIndexForReplace, setSelectedCompoIndexForReplace] = useState<number>(0);
  const [showReplacePopup, setShowReplacePopup] = useState(false);
  const [playerToReplaceSlot, setPlayerToReplaceSlot] = useState<'gk' | 'def' | 'mid' | 'fwd' | 'extra' | null>(null);
  const [playerToReplaceCard, setPlayerToReplaceCard] = useState<SorareCard | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  // New card form state
  const [newCardName, setNewCardName] = useState('');
  const [newCardPos, setNewCardPos] = useState<PositionCode>('MID');
  const [newCardClub, setNewCardClub] = useState('');
  const [newCardL5, setNewCardL5] = useState(60);
  const [newCardL15, setNewCardL15] = useState(58);
  const [newCardL40, setNewCardL40] = useState(55);
  const [newCardStatus, setNewCardStatus] = useState<PlayingStatus>('STARTER');

  // Load favorites & tags from storage on mount
  useEffect(() => {
    setFavorites(StorageService.getFavorites());
    setCardTags(StorageService.getCardTags());
  }, []);

  const handleToggleFavorite = (cardId: string) => {
    const updated = StorageService.toggleFavorite(cardId);
    setFavorites(updated);
  };

  const handleSaveCardTags = (cardId: string, tags: string[]) => {
    const updated = StorageService.setCardTags(cardId, tags);
    setCardTags(updated);
  };

  const handleToggleCompare = (cardId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 4) {
        // limit to 4 players max
        return [...prev.slice(1), cardId];
      }
      return [...prev, cardId];
    });
  };

  const handleRemoveCompareCard = (cardId: string) => {
    setSelectedForCompare((prev) => prev.filter((id) => id !== cardId));
  };

  // Map of which cards are assigned to which compositions (Point 2)
  const playerLineupMap = useMemo(() => {
    const map = new Map<string, Array<{ compoIndex: number; compoName: string }>>();
    compositions.forEach((compo, idx) => {
      const compoName = compo.name || `Compo ${idx + 1}`;
      const slots = compo.slots || {};
      Object.values(slots).forEach((player: any) => {
        if (player && player.id) {
          if (!map.has(player.id)) {
            map.set(player.id, []);
          }
          map.get(player.id)!.push({ compoIndex: idx, compoName });
        }
      });
      if (Array.isArray(compo.players)) {
        compo.players.forEach((player: any) => {
          if (player && player.id) {
            if (!map.has(player.id)) {
              map.set(player.id, []);
            }
            const existing = map.get(player.id)!;
            if (!existing.some(e => e.compoIndex === idx)) {
              existing.push({ compoIndex: idx, compoName });
            }
          }
        });
      }
    });
    return map;
  }, [compositions]);

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

  // Distinct list of all tags present in user collection
  const allAvailableTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(cardTags).forEach((tagList) => {
      tagList.forEach((t) => set.add(t));
    });
    return Array.from(set);
  }, [cardTags]);

  // Memoized Map of card projected scores
  const projectionsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculatePlayerProjectedScore>>();
    const precomputedContext = precomputeClubContexts(cards);
    cards.forEach(card => {
      map.set(card.id, calculatePlayerProjectedScore(card, strategy, cards, precomputedContext));
    });
    return map;
  }, [cards, strategy]);

  // Cards selected for head-to-head comparison
  const cardsForComparison = useMemo(() => {
    return cards.filter((c) => selectedForCompare.includes(c.id));
  }, [cards, selectedForCompare]);

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

      const matchesAvailability = !hideUnavailable || (
        card.status !== 'NOT_PLAYING' && card.injuryStatus !== 'INJURED' && card.injuryStatus !== 'SUSPENDED'
      );

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
        const cached = projectionsMap.get(card.id);
        const projScore = cached ? cached.projectedScore : calculatePlayerProjectedScore(card, strategy).projectedScore;
        matchesScore = projScore >= minProjectedScore;
      }

      let matchesAas = true;
      if (minAasL15 > 0) {
        matchesAas = getCardAasL15(card) >= minAasL15;
      }

      let matchesDs = true;
      if (minDsL15 > 0) {
        matchesDs = getCardDsL15(card) >= minDsL15;
      }

      // Point 3: Favorites filter
      const matchesFavorite = !onlyFavorites || favorites.includes(card.id);

      // Point 3: Custom Tag filter
      const matchesTag =
        selectedTagFilter === 'ALL' ||
        (cardTags[card.id] && cardTags[card.id].includes(selectedTagFilter));

      // Point 2: Alignment & Availability filter
      let matchesAlignment = true;
      const alignedCount = playerLineupMap.get(card.id)?.length || 0;
      const hasFixture = !!card.upcomingFixture?.opponent;

      if (alignmentFilter === 'UNALIGNED_READY') {
        matchesAlignment = hasFixture && alignedCount === 0 && card.status !== 'NOT_PLAYING' && card.injuryStatus !== 'INJURED' && card.injuryStatus !== 'SUSPENDED';
      } else if (alignmentFilter === 'ALIGNED') {
        matchesAlignment = alignedCount > 0;
      } else if (alignmentFilter === 'OVERUSED') {
        matchesAlignment = alignedCount >= 2;
      } else if (alignmentFilter === 'NO_FIXTURE') {
        matchesAlignment = !hasFixture;
      }

      return (
        matchesSearch &&
        matchesPos &&
        matchesAvailability &&
        matchesStatus &&
        matchesRarity &&
        matchesDate &&
        matchesWin &&
        matchesBonus &&
        matchesStars &&
        matchesScore &&
        matchesAas &&
        matchesDs &&
        matchesFavorite &&
        matchesTag &&
        matchesAlignment
      );
    });
  }, [
    cards,
    searchTerm,
    selectedPosition,
    hideUnavailable,
    selectedStatus,
    selectedRarity,
    selectedBonusTier,
    selectedStarsFilter,
    maxMatchDate,
    minWinProb,
    minProjectedScore,
    minAasL15,
    minDsL15,
    onlyFavorites,
    favorites,
    selectedTagFilter,
    cardTags,
    alignmentFilter,
    playerLineupMap,
    projectionsMap,
    strategy,
  ]);

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
        case 'PROJ_DESC': {
          const scoreB = projectionsMap.get(b.id)?.projectedScore ?? 0;
          const scoreA = projectionsMap.get(a.id)?.projectedScore ?? 0;
          return scoreB - scoreA;
        }
        case 'PROJ_ASC': {
          const scoreB = projectionsMap.get(b.id)?.projectedScore ?? 0;
          const scoreA = projectionsMap.get(a.id)?.projectedScore ?? 0;
          return scoreA - scoreB;
        }
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
              Centre de commandement pour optimiser vos compositions, comparer vos cartes et détecter vos stacks.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Display Mode Switcher (Point 5) */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setDisplayMode('grid_detailed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  displayMode === 'grid_detailed'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grille Détaillée"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grille</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode('grid_compact')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  displayMode === 'grid_compact'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grille Compacte"
              >
                <Square className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compact</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  displayMode === 'table'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue Tableau Données"
              >
                <Table className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tableau</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode('stacks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  displayMode === 'stacks'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue Stacks & Synergies Clubs"
              >
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Stacks</span>
              </button>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition active:scale-95 whitespace-nowrap"
            >
              <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden md:inline">Ajouter</span>
            </button>

            {confirmClear ? (
              <div className="flex gap-1">
                <button
                  onClick={async () => {
                      try {
                        const username = StorageService.getUsername();
                        const apiKey = StorageService.getApiKey();
                        await fetch(`/api/sorare/user-cards?username=${encodeURIComponent(username)}&clearCache=true`, {
                          headers: apiKey ? { 'x-sorare-api-key': apiKey } : {}
                        }).catch(() => {});
                        StorageService.clearCards();
                        window.location.reload();
                      } catch (err) {
                        console.error('Failed to clear cache safely', err);
                        window.location.reload();
                      }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-red-600/20 hover:bg-red-500 transition active:scale-95 whitespace-nowrap"
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-600 transition active:scale-95 whitespace-nowrap"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-950/40 transition active:scale-95 whitespace-nowrap"
                title="Effacer la galerie en cache"
              >
                Effacer
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

        {/* Quick Functional Toggles (Points 2 & 3) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80">
          
          {/* Point 2: Alignment & Readiness Quick Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              <span>Alignement GW :</span>
            </span>
            <select
              value={alignmentFilter}
              onChange={(e) => { setAlignmentFilter(e.target.value as any); setCurrentPage(1); }}
              className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-200 focus:border-emerald-400 focus:outline-none"
            >
              <option value="ALL">Tous les statuts d'alignement</option>
              <option value="UNALIGNED_READY">🟢 Prêts pour GW (Non alignés)</option>
              <option value="ALIGNED">🛡️ Déjà alignés dans une compo</option>
              <option value="OVERUSED">⚠️ Doublons (Alignés ≥ 2 fois)</option>
              <option value="NO_FIXTURE">❌ Sans match programmé</option>
            </select>
          </div>

          {/* Point 3: Favorites Quick Toggle */}
          <button
            onClick={() => { setOnlyFavorites((prev) => !prev); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition border ${
              onlyFavorites
                ? 'border-amber-400 bg-amber-500/15 text-amber-300 shadow-sm'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${onlyFavorites ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />
            <span>Favoris ({favorites.length})</span>
          </button>

          {/* Point 3: Custom Tag Dropdown Filter */}
          {allAvailableTags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-indigo-400" />
                <span>Étiquette :</span>
              </span>
              <select
                value={selectedTagFilter}
                onChange={(e) => { setSelectedTagFilter(e.target.value); setCurrentPage(1); }}
                className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-200 focus:border-indigo-400 focus:outline-none"
              >
                <option value="ALL">Toutes les étiquettes</option>
                {allAvailableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    🏷️ {tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AUDIT FIX (4.3): Hide unavailable toggle */}
          <button
            onClick={() => { setHideUnavailable(v => !v); setCurrentPage(1); }}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition border ${
              hideUnavailable
                ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className={`h-3 w-3 rounded-full border flex items-center justify-center ${hideUnavailable ? 'border-amber-400 bg-amber-400' : 'border-slate-600'}`}>
              {hideUnavailable && <span className="h-1 w-1 rounded-full bg-slate-950" />}
            </span>
            <span>Masquer indisponibles (DNP/Blessés)</span>
          </button>

          {/* Point 4: Compare Selection Count Badge */}
          {selectedForCompare.length > 0 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="ml-auto flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 transition animate-pulse"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Comparer ({selectedForCompare.length})</span>
            </button>
          )}
        </div>

        {/* Search Bar & Mobile Filter Toggle */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => { 
                const val = e.target.value; 
                setLocalSearch(val);
                startTransition(() => {
                  setSearchTerm(val); 
                  setCurrentPage(1); 
                });
              }}
              placeholder="Rechercher par nom, club..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* Quick Sort Selector on Mobile/Tablet */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 sm:flex-initial rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-300 focus:border-emerald-400 focus:outline-none font-semibold"
            >
              <option value="PROJ_DESC">Score Projeté (Décroissant)</option>
              <option value="PROJ_ASC">Score Projeté (Croissant)</option>
              <option value="AAS_L15_DESC">All-Around L15</option>
              <option value="DS_L15_DESC">Score Décisif L15</option>
              <option value="STARS_DESC">Étoiles (Décroissant)</option>
              <option value="L5_DESC">Forme L5 (Décroissant)</option>
              <option value="BONUS_DESC">Bonus % (Décroissant)</option>
              <option value="NAME_ASC">Nom (A-Z)</option>
              <option value="CLUB_ASC">Équipe (A-Z)</option>
            </select>

            {/* Mobile 1-Col vs 2-Col Grid Density Switcher */}
            <div className="md:hidden flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setMobileColumns('1')}
                className={`p-2 rounded-lg transition ${
                  mobileColumns === '1'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Affichage 1 Colonne Détaillée"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMobileColumns('2')}
                className={`p-2 rounded-lg transition ${
                  mobileColumns === '2'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Affichage 2 Colonnes Compactes"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Mobile Filter Drawer Toggle Button with Active Badge */}
            <button
              type="button"
              onClick={() => setShowMobileFilters(true)}
              className={`md:hidden flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition shadow-sm ${
                (maxMatchDate || minWinProb > 0 || selectedStatus !== 'ALL' || selectedBonusTier !== 'ALL' || selectedStarsFilter !== 'ALL' || minProjectedScore > 0 || minAasL15 > 0 || minDsL15 > 0 || hideUnavailable)
                  ? 'border-emerald-500 bg-emerald-950/80 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filtres</span>
              {([maxMatchDate, minWinProb > 0, selectedStatus !== 'ALL', selectedBonusTier !== 'ALL', selectedStarsFilter !== 'ALL', minProjectedScore > 0, minAasL15 > 0, minDsL15 > 0, hideUnavailable].filter(Boolean).length > 0) && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[9px] font-black text-slate-950">
                  {[maxMatchDate, minWinProb > 0, selectedStatus !== 'ALL', selectedBonusTier !== 'ALL', selectedStarsFilter !== 'ALL', minProjectedScore > 0, minAasL15 > 0, minDsL15 > 0, hideUnavailable].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters Grid (Always visible on desktop) */}
        <div className="mt-3 hidden md:grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          
          {/* Date Filter (Match jusqu'au...) */}
          <div className="relative">
            <input
              type="date"
              value={maxMatchDate}
              onChange={(e) => { setMaxMatchDate(e.target.value); setCurrentPage(1); }}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Browser opens picker natively
                }
              }}
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
        </div>

        {/* Filter Badges Active */}
        {(maxMatchDate || minWinProb > 0 || searchTerm || selectedPosition !== 'ALL' || hideUnavailable || selectedStatus !== 'ALL' || selectedBonusTier !== 'ALL' || selectedStarsFilter !== 'ALL' || minProjectedScore > 0 || minAasL15 > 0 || minDsL15 > 0) && (
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
                setLocalSearch('');
                setSearchTerm('');
                setSelectedPosition('ALL');
                setHideUnavailable(false);
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

      {/* Active Filter Badges */}
      {(maxMatchDate || minWinProb > 0 || searchTerm || selectedPosition !== 'ALL' || hideUnavailable || selectedStatus !== 'ALL' || selectedBonusTier !== 'ALL' || selectedStarsFilter !== 'ALL' || minProjectedScore > 0 || minAasL15 > 0 || minDsL15 > 0 || onlyFavorites || selectedTagFilter !== 'ALL' || alignmentFilter !== 'ALL') && (
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
          <span className="text-[11px] text-slate-400">Filtres actifs :</span>
          {onlyFavorites && (
            <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 flex items-center gap-1">
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              Favoris uniquement
            </span>
          )}
          {alignmentFilter !== 'ALL' && (
            <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              {alignmentFilter === 'UNALIGNED_READY' && '🟢 Prêts non-alignés'}
              {alignmentFilter === 'ALIGNED' && '🛡️ Déjà alignés'}
              {alignmentFilter === 'OVERUSED' && '⚠️ Doublons (≥ 2 compo)'}
              {alignmentFilter === 'NO_FIXTURE' && '❌ Sans match'}
            </span>
          )}
          {selectedTagFilter !== 'ALL' && (
            <span className="rounded-md bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-bold text-indigo-300 flex items-center gap-1">
              <Tag className="h-2.5 w-2.5 text-indigo-400" />
              Étiquette : {selectedTagFilter}
            </span>
          )}
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
              setLocalSearch('');
              setSearchTerm('');
              setSelectedPosition('ALL');
              setHideUnavailable(false);
              setSelectedStatus('ALL');
              setSelectedRarity('ALL');
              setSelectedBonusTier('ALL');
              setSelectedStarsFilter('ALL');
              setMinProjectedScore(0);
              setMinAasL15(0);
              setMinDsL15(0);
              setOnlyFavorites(false);
              setSelectedTagFilter('ALL');
              setAlignmentFilter('ALL');
            }}
            className="text-[10px] font-bold text-slate-400 hover:text-white underline ml-auto"
          >
            Tout effacer
          </button>
        </div>
      )}

      {/* Cards Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Affichage de <strong className="text-white">{sortedCards.length}</strong> carte(s) trouvée(s)
          {displayMode !== 'stacks' && totalPages > 1 && ` • Page ${validPage} sur ${totalPages}`}
        </span>
        <div className="flex items-center gap-2">
          {selectedForCompare.length > 0 && (
            <button
              onClick={() => setSelectedForCompare([])}
              className="text-[11px] text-slate-400 hover:text-rose-400 font-semibold underline"
            >
              Désélectionner tout ({selectedForCompare.length})
            </button>
          )}
        </div>
      </div>

      {/* Display Mode 1: Stacks & Synergies View */}
      {displayMode === 'stacks' ? (
        <GalleryStacksView
          cards={filteredCards}
          strategy={strategy}
          onOpenScout={onOpenScout}
          onFilterByClub={(clubName) => {
            setSearchTerm(clubName);
            setLocalSearch(clubName);
            setDisplayMode('grid_detailed');
          }}
          onReplacePlayer={(card) => {
            setSelectedCardForReplace(card);
            setShowReplacePopup(true);
            setSelectedCompoIndexForReplace(0);
          }}
          projectionsMap={projectionsMap}
          playerLineupMap={playerLineupMap}
        />
      ) : displayMode === 'table' ? (
        /* Display Mode 2: Table Data View */
        <GalleryTableView
          cards={sortedCards}
          strategy={strategy}
          allCards={cards}
          onOpenScout={onOpenScout}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          cardTags={cardTags}
          onOpenTagModal={(card) => setSelectedCardForTags(card)}
          selectedForCompare={selectedForCompare}
          onToggleCompare={handleToggleCompare}
          onReplacePlayer={(card) => {
            setSelectedCardForReplace(card);
            setShowReplacePopup(true);
            setSelectedCompoIndexForReplace(0);
          }}
          projectionsMap={projectionsMap}
          playerLineupMap={playerLineupMap}
          sortBy={sortBy}
          onSortChange={(newSort) => setSortBy(newSort)}
        />
      ) : isLoadingCards && cards.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center animate-pulse">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-600 border-t-emerald-400 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-300">Chargement de votre galerie...</p>
          <p className="text-xs text-slate-500 mt-1">Récupération de vos cartes depuis le stockage local.</p>
        </div>
      ) : paginatedCards.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Filter className="mx-auto h-8 w-8 text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">Aucune carte ne correspond à vos filtres</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">Essayez de réinitialiser vos recherches ou d'assouplir vos filtres.</p>
          <button
            onClick={() => {
              setLocalSearch('');
              setSearchTerm('');
              setSelectedPosition('ALL');
              setSelectedStatus('ALL');
              setSelectedRarity('ALL');
              setMaxMatchDate('');
              setMinWinProb(0);
              setSelectedBonusTier('ALL');
              setSelectedStarsFilter('ALL');
              setMinProjectedScore(0);
              setMinAasL15(0);
              setMinDsL15(0);
              setOnlyFavorites(false);
              setSelectedTagFilter('ALL');
              setAlignmentFilter('ALL');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Réinitialiser tous les filtres</span>
          </button>
        </div>
      ) : displayMode === 'grid_compact' ? (
        /* Display Mode 3: Grid Compact */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
          {paginatedCards.map((card) => {
            const posBadge = formatPositionBadge(card.positionCode);
            const bonusPct = getCardTotalBonus(card);
            const isInjured = card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED';
            const isFav = favorites.includes(card.id);
            const isCompared = selectedForCompare.includes(card.id);
            const tags = cardTags[card.id] || [];
            const lineups = playerLineupMap.get(card.id) || [];
            const cachedBreakdown = projectionsMap.get(card.id);
            const breakdown = cachedBreakdown || calculatePlayerProjectedScore(card, strategy, cards);

            return (
              <div
                key={card.id}
                onClick={() => onOpenScout(card)}
                className={`group relative flex flex-col justify-between rounded-xl border p-2.5 transition-all duration-150 cursor-pointer shadow hover:shadow-lg hover:border-emerald-500/60 ${
                  isCompared
                    ? 'border-indigo-500 bg-indigo-950/20 ring-1 ring-indigo-500'
                    : isInjured
                    ? 'border-rose-900/60 bg-rose-950/20 opacity-80'
                    : 'border-slate-800 bg-slate-900/90 hover:bg-slate-850'
                }`}
              >
                {/* Compact Top Bar */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1">
                    <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${posBadge.bg} ${posBadge.text} border ${posBadge.border}`}>
                      {card.positionCode}
                    </span>
                    <span className="text-[9px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/30 px-1 py-0.2 rounded">
                      +{bonusPct}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(card.id)}
                      className="p-1 text-slate-500 hover:text-amber-400 transition"
                      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCompare(card.id)}
                      className={`p-1 rounded transition ${isCompared ? 'text-indigo-400 bg-indigo-500/20' : 'text-slate-500 hover:text-indigo-400'}`}
                      title={isCompared ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Photo & Name */}
                <div className="flex items-center gap-2">
                  <div className="relative h-10 w-10 flex-shrink-0">
                    {card.pictureUrl ? (
                      <img
                        src={card.pictureUrl}
                        alt={card.displayName}
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 rounded-lg object-contain bg-slate-950/40 border border-slate-700 p-0.5"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-700">
                        {card.positionCode}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-bold text-white group-hover:text-emerald-400 transition">
                      {card.displayName}
                    </h4>
                    <p className="truncate text-[10px] text-slate-400">{card.club?.name || 'Club'}</p>
                  </div>
                </div>

                {/* Scores pill */}
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-950/80 p-1 text-center border border-slate-800">
                  <div>
                    <span className="block text-[9px] text-slate-400">L5</span>
                    <span className={`text-xs font-black ${card.scores.l5 >= 50 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {card.scores.l5 > 0 ? card.scores.l5 : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-slate-400">Projeté</span>
                    <span className="text-xs font-black text-emerald-400">
                      {breakdown.projectedScore}
                    </span>
                  </div>
                </div>

                {/* Opponent & Alignment info */}
                <div className="mt-1.5 space-y-1">
                  {card.upcomingFixture ? (
                    <div className="flex items-center justify-between text-[9px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/60">
                      <span className="truncate max-w-[70px]">
                        {card.upcomingFixture.isHome ? 'vs' : '@'} {card.upcomingFixture.opponent}
                      </span>
                      <span className="font-bold text-slate-200">
                        FDR {card.upcomingFixture.difficultyRating || 3}/5
                      </span>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-500 text-center py-0.5">Pas de match</div>
                  )}

                  {/* Alignment badge */}
                  <div className="flex items-center justify-between gap-1 text-[9px]">
                    {lineups.length > 0 ? (
                      <span className={`truncate px-1.5 py-0.5 rounded font-bold border ${lineups.length >= 2 ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                        🛡️ {lineups[0].compoName} {lineups.length > 1 ? `(+${lineups.length - 1})` : ''}
                      </span>
                    ) : (
                      <span className="text-slate-500 px-1 font-medium">Non aligné</span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCardForTags(card);
                      }}
                      className="text-slate-500 hover:text-indigo-300 transition"
                      title="Gérer les étiquettes"
                    >
                      <Tag className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Display Mode 4: Grid Detailed */
        <div className={`grid ${mobileColumns === '2' ? 'grid-cols-2 gap-2 sm:gap-4' : 'grid-cols-1 gap-3.5'} sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-9`}>
          {paginatedCards.map((card) => {
            const posBadge = formatPositionBadge(card.positionCode);
            const statusInfo = formatStatusBadge(card.status, card.starterConfidence);
            const bonusPct = getCardTotalBonus(card);
            const isInjured = card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED';
            const winProb = getPlayerWinProbability(card.upcomingFixture);
            const formattedDate = formatKickoffDate(card.upcomingFixture?.kickoffDate || card.upcomingFixture?.matchDate);
            const cachedBreakdown = projectionsMap.get(card.id);
            const breakdown = cachedBreakdown || calculatePlayerProjectedScore(card, strategy, cards);
            const projScore = breakdown.projectedScore;
            const isFav = favorites.includes(card.id);
            const isCompared = selectedForCompare.includes(card.id);
            const tags = cardTags[card.id] || [];
            const lineups = playerLineupMap.get(card.id) || [];

            return (
              <div
                key={card.id}
                onClick={() => onOpenScout(card)}
                className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden shadow-lg hover:shadow-2xl cursor-pointer hover:scale-[1.02] active:scale-[0.99] ${
                  isCompared
                    ? 'border-indigo-500 bg-indigo-950/20 ring-2 ring-indigo-500/50'
                    : isInjured
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

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(card.id)}
                        className={`p-1 rounded-lg transition ${
                          isFav ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-amber-400'
                        }`}
                        title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      >
                        <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>

                      {/* Compare Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleCompare(card.id)}
                        className={`p-1 rounded-lg transition ${
                          isCompared ? 'text-indigo-300 bg-indigo-500/20' : 'text-slate-500 hover:text-indigo-400'
                        }`}
                        title={isCompared ? 'Retirer du comparateur' : 'Ajouter au comparateur'}
                      >
                        <BarChart2 className="h-3.5 w-3.5" />
                      </button>

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

                  {/* Alignment & Tags row */}
                  <div className="mt-2.5 flex items-center justify-between gap-1 flex-wrap text-[10px]">
                    <div className="flex items-center gap-1 flex-wrap">
                      {lineups.length > 0 ? (
                        <span className={`rounded-md border px-1.5 py-0.5 font-bold ${
                          lineups.length >= 2
                            ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                            : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                        }`}>
                          🛡️ {lineups[0].compoName} {lineups.length > 1 ? `(+${lineups.length - 1})` : ''}
                        </span>
                      ) : (
                        <span className="rounded-md border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 text-slate-400">
                          🟢 Non aligné
                        </span>
                      )}

                      {/* Custom Tags Pills */}
                      {tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCardForTags(card);
                      }}
                      className="p-1 text-slate-500 hover:text-indigo-300 rounded hover:bg-slate-800 transition"
                      title="Gérer les étiquettes de cette carte"
                    >
                      <Tag className="h-3 w-3" />
                    </button>
                  </div>

                  {/* SO5 Stats Pillars (L5 / L15 / L40) */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950/80 p-2 border border-slate-800/80">
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

                  {/* M1 (Dernier match / En direct) Score Badge */}
                  {(() => {
                    const recent = getPlayerRecentMatchAnalysis(card);
                    return (
                      <div className="mt-2 flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-slate-950/90 border border-slate-800/80">
                        <span className="text-slate-400 font-medium flex items-center gap-1">
                          {recent.isLive ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" /> : null}
                          {recent.isLive ? '🔴 M1 (Live) :' : 'M1 (Dernier) :'}
                        </span>
                        <span className={`font-black ${recent.isLive ? 'text-amber-400 animate-pulse' : recent.playedLastMatch || recent.lastMatchScore > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {recent.playedLastMatch || recent.lastMatchScore > 0 ? `${recent.lastMatchScore} pts` : 'DNP (0 min)'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Upcoming Matchup & Win Prob from Bookmaker */}
                  {card.upcomingFixture && (
                    <div className="mt-2 rounded-xl bg-slate-950/70 p-2 text-[11px] border border-slate-800/60 space-y-1">
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
                          <span className="font-bold text-amber-300" title={`Bonus de carte: +${breakdown.cardBonusPercentage}%`}>+{breakdown.cardBonusPercentage}%</span>
                          <span className="font-black text-emerald-400 bg-emerald-500/10 px-1 rounded" title="Score total projeté avec bonus">= {projScore} pts</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="border-t border-slate-800/80 bg-slate-950/90 p-2.5 flex items-center justify-between gap-1.5">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Cliquer pour analyser
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCardForReplace(card);
                      setShowReplacePopup(true);
                      setSelectedCompoIndexForReplace(0);
                    }}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition flex items-center gap-1 shrink-0"
                  >
                    <span>Remplacer</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Comparison Dock (Point 4) */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl rounded-2xl border border-indigo-500/50 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md animate-fadeIn">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              <span className="text-xs font-black text-indigo-300 shrink-0">
                Comparateur ({selectedForCompare.length}/4) :
              </span>
              <div className="flex items-center gap-1.5">
                {cardsForComparison.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 px-2 py-1 text-xs text-white shrink-0"
                  >
                    <span className="text-[10px] font-black text-emerald-400">{c.positionCode}</span>
                    <span className="font-bold truncate max-w-[90px]">{c.displayName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCompareCard(c.id)}
                      className="text-slate-500 hover:text-rose-400 ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedForCompare([])}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white"
              >
                Vider
              </button>
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition active:scale-95"
              >
                <BarChart2 className="h-4 w-4" />
                <span>Comparer côte à côte</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 4: Head-to-Head Comparison Modal */}
      <GalleryCompareModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        selectedCards={cardsForComparison}
        onRemoveCard={handleRemoveCompareCard}
        onClear={() => setSelectedForCompare([])}
        onOpenScout={onOpenScout}
        strategy={strategy}
        allCards={cards}
        onReplacePlayer={(card) => {
          setSelectedCardForReplace(card);
          setShowReplacePopup(true);
          setSelectedCompoIndexForReplace(0);
          setShowCompareModal(false);
        }}
      />

      {/* Point 3: Card Tagging Modal */}
      <CardTagModal
        isOpen={!!selectedCardForTags}
        onClose={() => setSelectedCardForTags(null)}
        card={selectedCardForTags}
        currentTags={selectedCardForTags ? cardTags[selectedCardForTags.id] || [] : []}
        onSaveTags={handleSaveCardTags}
        allExistingTags={allAvailableTags}
      />

      {/* Pagination Controls */}
      {displayMode !== 'stacks' && totalPages > 1 && (
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

      {/* MODAL 1: Compositions & Target Slot Chooser */}
      {showReplacePopup && selectedCardForReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ArrowUpDown className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Intégrer dans une composition</h3>
                  <p className="text-xs text-slate-400">Choisissez la composition et le joueur à remplacer</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowReplacePopup(false);
                  setSelectedCardForReplace(null);
                }}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Selected Card Preview */}
            <div className="flex items-center gap-4 rounded-xl bg-slate-950/60 p-3.5 border border-slate-800/80">
              <div className="relative h-12 w-12 flex-shrink-0">
                {selectedCardForReplace.pictureUrl ? (
                  <img
                    src={selectedCardForReplace.pictureUrl}
                    alt={selectedCardForReplace.displayName}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-lg object-contain bg-slate-900 p-0.5 border border-slate-700"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {selectedCardForReplace.positionCode}
                  </div>
                )}
                <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black border ${formatPositionBadge(selectedCardForReplace.positionCode).bg} ${formatPositionBadge(selectedCardForReplace.positionCode).text} border-slate-950`}>
                  {selectedCardForReplace.positionCode}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white truncate">{selectedCardForReplace.displayName}</h4>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 uppercase">
                    {selectedCardForReplace.rarity || 'Common'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">{selectedCardForReplace.club?.name || 'Club'}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="block text-[10px] text-slate-500 font-semibold">Forme L5</span>
                <span className="text-sm font-black text-emerald-400">{selectedCardForReplace.scores?.l5 || '0.0'}</span>
              </div>
              <div className="text-right shrink-0 border-l border-slate-800/80 pl-4">
                <span className="block text-[10px] text-slate-500 font-semibold">Proj. Match</span>
                <span className="text-sm font-black text-amber-300">
                  {calculatePlayerProjectedScore(selectedCardForReplace, strategy, cards).projectedScore} pts
                </span>
              </div>
            </div>

            {/* Compositions Selector */}
            {compositions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-500">
                <Info className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                <p className="text-xs">Aucune composition optimisée n'a été créée pour le moment.</p>
                <p className="text-[11px] text-slate-600 mt-1">Lisez d'abord vos compositions automatiques dans l'onglet principal.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex border-b border-slate-800/80 p-1 bg-slate-950/40 rounded-xl">
                  {compositions.map((compo, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedCompoIndexForReplace(idx)}
                      className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition ${
                        selectedCompoIndexForReplace === idx
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      {compo.name || `Compo ${idx + 1}`}
                      <span className="block text-[10px] font-normal opacity-80">
                        {compo.projectedTotalWithCaptain || compo.projectedTotal || 0} pts
                      </span>
                    </button>
                  ))}
                </div>

                {/* Slots Rows */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-1">Sélectionnez le poste à remplacer :</p>
                  
                  {(() => {
                    const activeCompo = compositions[selectedCompoIndexForReplace];
                    if (!activeCompo) return null;

                    const slotsList = [
                      { key: 'gk', label: 'Gardien', code: 'GK', allowed: ['GK'] },
                      { key: 'def', label: 'Défenseur', code: 'DEF', allowed: ['DEF'] },
                      { key: 'mid', label: 'Milieu de Terrain', code: 'MID', allowed: ['MID'] },
                      { key: 'fwd', label: 'Attaquant', code: 'FWD', allowed: ['FWD'] },
                      { key: 'extra', label: 'Joker', code: 'EXTRA', allowed: ['DEF', 'MID', 'FWD'] },
                    ];

                    return slotsList.map((slot) => {
                      const currentAlignedPlayer = activeCompo.slots[slot.key];
                      const isCompatible = slot.allowed.includes(selectedCardForReplace.positionCode);
                      
                      const alignedBadge = formatPositionBadge(slot.code);

                      return (
                        <div
                          key={slot.key}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-150 ${
                            isCompatible
                              ? 'border-slate-800 bg-slate-900/40 hover:bg-slate-850 hover:border-slate-700/80 cursor-pointer'
                              : 'border-slate-800/40 bg-slate-950/20 opacity-45 cursor-not-allowed'
                          }`}
                          onClick={() => {
                            if (!isCompatible) return;
                            setPlayerToReplaceSlot(slot.key as any);
                            setPlayerToReplaceCard(currentAlignedPlayer || null);
                            setShowReplacePopup(false);
                            setShowComparisonModal(true);
                          }}
                        >
                          {/* Slot Badge & current player details */}
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`flex h-8 w-14 shrink-0 items-center justify-center rounded-lg text-xs font-black border ${alignedBadge.bg} ${alignedBadge.text} border-slate-700/50 shadow-inner`}>
                              {slot.code}
                            </span>

                            {currentAlignedPlayer ? (
                              <div className="flex items-center gap-2.5 min-w-0">
                                {currentAlignedPlayer.pictureUrl ? (
                                  <img
                                    src={currentAlignedPlayer.pictureUrl}
                                    alt={currentAlignedPlayer.displayName}
                                    referrerPolicy="no-referrer"
                                    className="h-8 w-8 rounded object-contain bg-slate-950/60 p-0.5"
                                  />
                                ) : null}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h5 className="text-xs font-bold text-white truncate">{currentAlignedPlayer.displayName}</h5>
                                    {currentAlignedPlayer.upcomingFixture?.opponent && (
                                      <span className="text-[9px] text-slate-400 bg-slate-950/80 px-1 py-0.5 rounded">
                                        vs {currentAlignedPlayer.upcomingFixture.opponent}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    L5: {currentAlignedPlayer.scores?.l5 || 0} • Proj: {calculatePlayerProjectedScore(currentAlignedPlayer, strategy, cards).projectedScore} pts
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs italic text-slate-500 font-medium">Poste vacant • Aucun joueur aligné</span>
                            )}
                          </div>

                          {/* Compat/Replace Actions */}
                          <div className="shrink-0 pl-2">
                            {isCompatible ? (
                              <button
                                type="button"
                                className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition active:scale-95 flex items-center gap-1"
                              >
                                <span>Choisir</span>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-950/40 px-2 py-1 rounded border border-slate-900/80 uppercase">
                                Incompatible
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Cancel Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReplacePopup(false);
                  setSelectedCardForReplace(null);
                }}
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-850 transition"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: Full Comparison & Replace Confirmation */}
      {showComparisonModal && selectedCardForReplace && playerToReplaceSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[95vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <ArrowUpDown className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Comparatif de remplacement</h3>
                  <p className="text-xs text-slate-400">Validez les statistiques avant d'assigner la nouvelle carte</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowComparisonModal(false);
                  setShowReplacePopup(true); // Return to Chooser Modal
                }}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CURRENT PLAYER (LEFT) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 rounded-bl-xl bg-slate-800/80 px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Actuel
                </div>

                {playerToReplaceCard ? (
                  <>
                    {/* Identity */}
                    <div className="flex items-center gap-3">
                      {playerToReplaceCard.pictureUrl ? (
                        <img
                          src={playerToReplaceCard.pictureUrl}
                          alt={playerToReplaceCard.displayName}
                          referrerPolicy="no-referrer"
                          className="h-12 w-12 rounded-lg object-contain bg-slate-900 border border-slate-700"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                          {playerToReplaceCard.positionCode}
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-white">{playerToReplaceCard.displayName}</h4>
                        <p className="text-xs text-slate-400">{playerToReplaceCard.club?.name || 'Club'}</p>
                        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${formatPositionBadge(playerToReplaceCard.positionCode).bg} ${formatPositionBadge(playerToReplaceCard.positionCode).text} border-slate-800`}>
                          {playerToReplaceCard.positionCode}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-900/60 p-2.5 border border-slate-800 text-center">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-500">L5 (Forme)</span>
                        <span className="text-xs font-black text-slate-300">{playerToReplaceCard.scores?.l5 || '0.0'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-500">L15</span>
                        <span className="text-xs font-black text-slate-300">{playerToReplaceCard.scores?.l15 || '0.0'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-500">L40</span>
                        <span className="text-xs font-black text-slate-300">{playerToReplaceCard.scores?.l40 || '0.0'}</span>
                      </div>
                    </div>

                    {/* Projected score */}
                    {(() => {
                      const breakdown = calculatePlayerProjectedScore(playerToReplaceCard, strategy, cards);
                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Score de base :</span>
                            <span className="font-bold text-slate-300">{breakdown.baseProjectedScore} pts</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Bonus de carte :</span>
                            <span className="font-bold text-amber-300">+{breakdown.cardBonusPercentage}% (+{breakdown.cardBonusScore} pts)</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-1.5">
                            <span className="text-slate-300 font-bold">Projection totale :</span>
                            <span className="font-black text-emerald-400 text-sm">{breakdown.projectedScore} pts</span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-800 rounded-xl text-slate-500 space-y-1.5">
                    <Info className="h-6 w-6 text-slate-600" />
                    <p className="text-xs italic">Aucun joueur aligné</p>
                    <p className="text-[10px] text-slate-600">Le score actuel pour ce poste est de 0 pts</p>
                  </div>
                )}
              </div>

              {/* NEW REPLACEMENT PLAYER (RIGHT) */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-4 relative overflow-hidden ring-1 ring-emerald-500/30 shadow-emerald-950/20 shadow-lg">
                <div className="absolute top-0 right-0 rounded-bl-xl bg-emerald-500 px-2.5 py-1 text-[9px] font-bold text-slate-950 uppercase tracking-wider">
                  Nouveau
                </div>

                {/* Identity */}
                <div className="flex items-center gap-3">
                  {selectedCardForReplace.pictureUrl ? (
                    <img
                      src={selectedCardForReplace.pictureUrl}
                      alt={selectedCardForReplace.displayName}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-lg object-contain bg-slate-950 border border-slate-700"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                      {selectedCardForReplace.positionCode}
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">{selectedCardForReplace.displayName}</h4>
                    <p className="text-xs text-slate-400">{selectedCardForReplace.club?.name || 'Club'}</p>
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${formatPositionBadge(selectedCardForReplace.positionCode).bg} ${formatPositionBadge(selectedCardForReplace.positionCode).text} border-slate-800`}>
                      {selectedCardForReplace.positionCode}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-950 p-2.5 border border-slate-800 text-center">
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500">L5 (Forme)</span>
                    <span className="text-xs font-black text-emerald-400">{selectedCardForReplace.scores?.l5 || '0.0'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500">L15</span>
                    <span className="text-xs font-black text-slate-300">{selectedCardForReplace.scores?.l15 || '0.0'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold text-slate-500">L40</span>
                    <span className="text-xs font-black text-slate-300">{selectedCardForReplace.scores?.l40 || '0.0'}</span>
                  </div>
                </div>

                {/* Projected score */}
                {(() => {
                  const breakdown = calculatePlayerProjectedScore(selectedCardForReplace, strategy, cards);
                  return (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Score de base :</span>
                        <span className="font-bold text-slate-300">{breakdown.baseProjectedScore} pts</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Bonus de carte :</span>
                        <span className="font-bold text-amber-300">+{breakdown.cardBonusPercentage}% (+{breakdown.cardBonusScore} pts)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-1.5">
                        <span className="text-slate-200 font-bold font-semibold">Projection totale :</span>
                        <span className="font-black text-emerald-400 text-sm">{breakdown.projectedScore} pts</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* COMPARATIVE METRICS & DELTAS */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider pl-0.5">Indicateurs de comparaison :</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* L5 Delta */}
                {(() => {
                  const oldL5 = playerToReplaceCard?.scores?.l5 || 0;
                  const newL5 = selectedCardForReplace.scores?.l5 || 0;
                  const diff = Math.round((newL5 - oldL5) * 10) / 10;
                  return (
                    <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg text-center">
                      <span className="block text-[10px] text-slate-400 font-medium mb-1">Moyenne L5</span>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-bold text-slate-300">{oldL5}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600" />
                        <span className="text-xs font-bold text-white">{newL5}</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-bold ${
                        diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff} pts
                      </span>
                    </div>
                  );
                })()}

                {/* Projected score Delta */}
                {(() => {
                  const oldProj = playerToReplaceCard ? calculatePlayerProjectedScore(playerToReplaceCard, strategy, cards).projectedScore : 0;
                  const newProj = calculatePlayerProjectedScore(selectedCardForReplace, strategy, cards).projectedScore;
                  const diff = Math.round((newProj - oldProj) * 10) / 10;
                  return (
                    <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg text-center">
                      <span className="block text-[10px] text-slate-400 font-medium mb-1">Projection Match</span>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-bold text-slate-300">{oldProj}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600" />
                        <span className="text-xs font-bold text-white">{newProj}</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-black ${
                        diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff} pts
                      </span>
                    </div>
                  );
                })()}

                {/* FDR delta */}
                {(() => {
                  const oldFdr = playerToReplaceCard?.upcomingFixture?.difficultyRating || 3;
                  const newFdr = selectedCardForReplace.upcomingFixture?.difficultyRating || 3;
                  const diff = newFdr - oldFdr;
                  // lower fdr is easier (better)
                  return (
                    <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg text-center">
                      <span className="block text-[10px] text-slate-400 font-medium mb-1">Difficulté FDR</span>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-bold text-slate-300">{playerToReplaceCard ? `${oldFdr}/5` : 'N/A'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600" />
                        <span className="text-xs font-bold text-white">{newFdr}/5</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-bold ${
                        diff < 0 ? 'text-emerald-400' : diff > 0 ? 'text-amber-500' : 'text-slate-500'
                      }`}>
                        {diff < 0 ? `${diff} (Plus simple)` : diff > 0 ? `+${diff} (Plus dur)` : '='}
                      </span>
                    </div>
                  );
                })()}

                {/* Starter Security Delta */}
                {(() => {
                  const oldConf = playerToReplaceCard?.starterConfidence || 0;
                  const newConf = selectedCardForReplace.starterConfidence || 0;
                  const diff = newConf - oldConf;
                  return (
                    <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-lg text-center">
                      <span className="block text-[10px] text-slate-400 font-medium mb-1">Confiance Titulaire</span>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-bold text-slate-300">{playerToReplaceCard ? `${oldConf}%` : 'N/A'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-600" />
                        <span className="text-xs font-bold text-white">{newConf}%</span>
                      </div>
                      <span className={`inline-block mt-1 text-[10px] font-bold ${
                        diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diff > 0 ? `+${diff}%` : diff === 0 ? '=' : `${diff}%`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Composition Score Outlook */}
              {(() => {
                const oldProj = playerToReplaceCard ? calculatePlayerProjectedScore(playerToReplaceCard, strategy, cards).projectedScore : 0;
                const newProj = calculatePlayerProjectedScore(selectedCardForReplace, strategy, cards).projectedScore;
                const diff = Math.round((newProj - oldProj) * 10) / 10;
                const currentCompo = compositions[selectedCompoIndexForReplace];
                const currentCompoScore = currentCompo?.projectedTotalWithCaptain || currentCompo?.projectedTotal || 0;
                const nextCompoScore = Math.round((currentCompoScore + diff) * 10) / 10;

                return (
                  <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl bg-slate-900 p-3 border border-slate-800">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs text-slate-300 font-medium">Impact sur le score total de la composition :</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-slate-400">{currentCompoScore} pts</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                      <span className="text-sm font-black text-emerald-400">{nextCompoScore} pts</span>
                      <span className={`ml-1 rounded px-2 py-0.5 text-xs font-black ${
                        diff >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {diff >= 0 ? `+${diff}` : diff} pts
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowComparisonModal(false);
                  setShowReplacePopup(true); // Return to Chooser Modal
                }}
                className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-850 transition flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Retour au choix</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  // Perform the actual replacement!
                  if (onReplacePlayerInCompo) {
                    onReplacePlayerInCompo(
                      selectedCompoIndexForReplace,
                      playerToReplaceSlot,
                      selectedCardForReplace
                    );
                  }
                  // Reset State and Close all modals
                  setShowComparisonModal(false);
                  setShowReplacePopup(false);
                  setSelectedCardForReplace(null);
                  setPlayerToReplaceSlot(null);
                  setPlayerToReplaceCard(null);
                }}
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400 transition hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 flex items-center gap-1.5"
              >
                <span>Confirmer le remplacement</span>
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet Filter Drawer */}
      {showMobileFilters && (
        <div
          onClick={() => setShowMobileFilters(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm md:hidden animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-900 p-4 pb-safe shadow-2xl flex flex-col space-y-4"
          >
            {/* Grabber Handle */}
            <div
              onClick={() => setShowMobileFilters(false)}
              className="w-12 h-1.5 bg-slate-700 hover:bg-slate-500 rounded-full mx-auto cursor-pointer transition-colors"
              title="Faire glisser vers le bas pour fermer"
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                <h3 className="text-base font-black text-white">Filtres de Galerie</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filter Fields */}
            <div className="space-y-3 text-xs">
              {/* Position */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Poste</label>
                <div className="grid grid-cols-5 gap-1">
                  {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => { setSelectedPosition(pos); setCurrentPage(1); }}
                      className={`py-2 rounded-xl text-center font-bold border transition ${
                        selectedPosition === pos
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {pos === 'ALL' ? 'Tous' : pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Statut du joueur</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => { setSelectedStatus(e.target.value as any); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-200"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="STARTER">Titulaires indiscutables</option>
                  <option value="REGULAR">Réguliers (ou mieux)</option>
                  <option value="SUBSTITUTE">Remplaçants (ou mieux)</option>
                  <option value="DOUBTFUL">Incertains (ou mieux)</option>
                  <option value="NOT_PLAYING">DNP (Ne joue pas)</option>
                </select>
              </div>

              {/* Alignment Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Statut d'alignement GW</label>
                <select
                  value={alignmentFilter}
                  onChange={(e) => { setAlignmentFilter(e.target.value as any); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-200"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="UNALIGNED_READY">🟢 Prêts pour GW (Non alignés)</option>
                  <option value="ALIGNED">🛡️ Déjà alignés dans une compo</option>
                  <option value="OVERUSED">⚠️ Doublons (Alignés ≥ 2 fois)</option>
                  <option value="NO_FIXTURE">❌ Sans match programmé</option>
                </select>
              </div>

              {/* Favorites only */}
              <div>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyFavorites}
                    onChange={(e) => { setOnlyFavorites(e.target.checked); setCurrentPage(1); }}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 h-4 w-4"
                  />
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    Favoris uniquement ({favorites.length})
                  </span>
                </label>
              </div>

              {/* Hide unavailable */}
              <div>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideUnavailable}
                    onChange={(e) => { setHideUnavailable(e.target.checked); setCurrentPage(1); }}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 h-4 w-4"
                  />
                  <span className="text-amber-300 font-bold">Masquer blessés, suspendus et DNP</span>
                </label>
              </div>

              {/* Max Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Match inclus jusqu'au (Date limite)</label>
                <input
                  type="date"
                  value={maxMatchDate}
                  onChange={(e) => { setMaxMatchDate(e.target.value); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-200"
                />
              </div>

              {/* Win Chance */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Chances de victoire du match</label>
                <select
                  value={minWinProb}
                  onChange={(e) => { setMinWinProb(Number(e.target.value)); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-200"
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

              {/* Stars filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Filtre par Étoiles</label>
                <select
                  value={selectedStarsFilter}
                  onChange={(e) => { setSelectedStarsFilter(e.target.value as any); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-2.5 text-xs text-amber-400 font-bold"
                >
                  <option value="ALL" className="text-slate-300">Toutes les étoiles</option>
                  <option value="5" className="text-amber-400">★★★★★ (5 Étoiles)</option>
                  <option value="4" className="text-amber-400">★★★★☆ (4 Étoiles)</option>
                  <option value="3" className="text-amber-400">★★★☆☆ (3 Étoiles)</option>
                  <option value="2" className="text-amber-400">★★☆☆☆ (2 Étoiles)</option>
                  <option value="1" className="text-amber-400">★☆☆☆☆ (1 Étoile)</option>
                </select>
              </div>

              {/* Card Bonus Tier */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Palier Bonus Carte</label>
                <select
                  value={selectedBonusTier}
                  onChange={(e) => { setSelectedBonusTier(e.target.value as any); setCurrentPage(1); }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-200"
                >
                  <option value="ALL">Tous les bonus</option>
                  <option value="0-4">Bonus 0% - 4%</option>
                  <option value="5-9">Bonus 5% - 9%</option>
                  <option value="10-14">Bonus 10% - 14%</option>
                  <option value="15-19">Bonus 15% - 19%</option>
                  <option value="20+">Bonus 20%+</option>
                </select>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPosition('ALL');
                  setSelectedStatus('ALL');
                  setHideUnavailable(false);
                  setMaxMatchDate('');
                  setMinWinProb(0);
                  setSelectedStarsFilter('ALL');
                  setSelectedBonusTier('ALL');
                  setMinProjectedScore(0);
                  setMinAasL15(0);
                  setMinDsL15(0);
                  setSearchTerm('');
                  setLocalSearch('');
                }}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Réinitialiser
              </button>

              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 text-xs font-black text-slate-950 hover:bg-emerald-400 text-center shadow-lg"
              >
                Appliquer les filtres ({filteredCards.length} cartes)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button for Mobile Gallery Filter */}
      {!showMobileFilters && (
        <button
          type="button"
          onClick={() => setShowMobileFilters(true)}
          className="fixed bottom-20 right-4 z-40 md:hidden flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-slate-950 font-black shadow-2xl shadow-emerald-500/40 active:scale-95 transition hover:brightness-110 border border-emerald-300"
          title="Ouvrir les filtres de la galerie"
        >
          <Filter className="h-4 w-4" />
          <span className="text-xs font-black">Filtrer</span>
          {([maxMatchDate, minWinProb > 0, selectedStatus !== 'ALL', selectedBonusTier !== 'ALL', selectedStarsFilter !== 'ALL', minProjectedScore > 0, minAasL15 > 0, minDsL15 > 0, hideUnavailable].filter(Boolean).length > 0) && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 text-[9px] font-black text-emerald-400">
              {[maxMatchDate, minWinProb > 0, selectedStatus !== 'ALL', selectedBonusTier !== 'ALL', selectedStarsFilter !== 'ALL', minProjectedScore > 0, minAasL15 > 0, minDsL15 > 0, hideUnavailable].filter(Boolean).length}
            </span>
          )}
        </button>
      )}

    </div>
  );
};
