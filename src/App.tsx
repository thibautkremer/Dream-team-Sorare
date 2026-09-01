import React, { useState, useEffect, useDeferredValue } from 'react';
import { Navbar } from './components/Navbar';
import { PitchPage } from './pages/PitchPage';
import { GalleryPage } from './pages/GalleryPage';
import { MatchupsPage } from './pages/MatchupsPage';
import { AICoachPage } from './pages/AICoachPage';
import { AdminPage } from './pages/AdminPage';
import { PlayerScoutModal } from './components/PlayerScoutModal';
import { ProjectionBreakdownModal } from './components/ProjectionBreakdownModal';
import { LineupAnalysisDrawer } from './components/LineupAnalysisDrawer';
import { SlotSwapModal } from './components/SlotSwapModal';
import { LiveScoringView } from './components/LiveScoringView';
import { LineupExportModal } from './components/LineupExportModal';
import { StartingXIMonitorModal } from './components/StartingXIMonitorModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { useStartingXIMonitor } from './hooks/useStartingXIMonitor';
import { StorageService } from './utils/storage';
import { 
  optimizeLineup, 
  generateFourDistinctLineups, 
  sanitizeAllCompositionsNoDuplicates,
  getPlayerUniqueKey, 
  calculatePlayerProjectedScore, 
  sanitizeLineupNoDuplicatePlayers, 
  isPlayerNonStarter, 
  computePlayerPlayingStatus,
  enforceSingleStarterPerClub,
  validateLineup, 
  validateLineupDuringOptimization 
} from './utils/optimizer';

import { SorareCard, Lineup, StrategyType, LineupOptimizationFilters, PlayingStatus, OfficialLineupStatus } from './types';
import { getCurrentGameWeekNumber } from './data/fixturesData';
import { CheckCircle2, AlertCircle, ShieldAlert, Sparkles, RefreshCw, Share2 } from 'lucide-react';

import { Toaster } from 'sonner';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin'>('pitch');
  const [username, setUsernameState] = useState<string>(StorageService.getUsername());
  const [cards, setCards] = useState<SorareCard[]>([]);
  // AUDIT FIX: true until the initial IndexedDB hydration (getCardsAsync) resolves, so the UI can
  // show a proper loading skeleton instead of briefly flashing a misleading "no cards match your
  // filters" empty-state message while the real (untruncated) gallery is still loading.
  const [isLoadingCards, setIsLoadingCards] = useState(true);
  const [exportLineupTarget, setExportLineupTarget] = useState<Lineup | null>(null);
  const [degradedModeInfo, setDegradedModeInfo] = useState<{ isDegraded: boolean; reason?: string } | null>(null);
  const [gameWeek, setGameWeek] = useState(() => getCurrentGameWeekNumber());
  const [isStartingXIModalOpen, setIsStartingXIModalOpen] = useState(false);
  
  const [filters, setFilters] = useState<LineupOptimizationFilters>({
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
  });

  const [compositions, setCompositions] = useState<Lineup[]>([]);
  const [selectedCompoIndex, setSelectedCompoIndex] = useState<number>(0);
  const [strategy, setStrategy] = useState<StrategyType>('BALANCED');

  // Deferred values for non-blocking UI during heavy combinatorial calculations
  const deferredFilters = useDeferredValue(filters);
  const deferredStrategy = useDeferredValue(strategy);

  const [lineup, setLineup] = useState<Lineup>(() => {
    const initialCards = StorageService.getCards();
    return optimizeLineup(initialCards, 'BALANCED', gameWeek, filters);
  });

  // Starting XI Lineup Real-Time Monitor (1 hour before match & notification alerts)
  const {
    playerStatusMap,
    alerts: startingXIAlerts,
    isChecking: isCheckingStartingXI,
    lastChecked: startingXILastChecked,
    refetch: refetchStartingXI,
    permission: notifPermission,
    requestNotificationPermission,
    notificationsEnabled,
    toggleNotifications,
    dismissAlert,
  } = useStartingXIMonitor({
    cards,
    compositions,
    currentLineup: lineup,
  });

  // Synchroniser dynamiquement les prédictions de titularisation et alertes dans les cartes
  useEffect(() => {
    if (playerStatusMap && Object.keys(playerStatusMap).length > 0) {
      setCards(prevCards => {
        let changed = false;
        const updated = prevCards.map(c => {
          const key = getPlayerUniqueKey(c);
          const info = playerStatusMap[key];
          if (info) {
            let newStatus = c.status;
            let newConf = c.starterConfidence;
            if (info.lineupStatus === 'CONFIRMED_BENCH' || info.playingStatus === 'SUBSTITUTE' || info.playingStatus === 'BENCH') {
              newStatus = 'SUBSTITUTE';
              newConf = 20;
            } else if (info.lineupStatus === 'CONFIRMED_OUT' || info.playingStatus === 'NOT_PLAYING') {
              newStatus = 'NOT_PLAYING';
              newConf = 0;
            } else if (info.lineupStatus === 'CONFIRMED_STARTER' || info.playingStatus === 'STARTER') {
              newStatus = 'STARTER';
              newConf = 100;
            }
            if (newStatus !== c.status || newConf !== c.starterConfidence || info.lineupStatus !== c.lineupStatus) {
              changed = true;
              return {
                ...c,
                status: newStatus as any,
                starterConfidence: newConf,
                playingStatus: info.playingStatus as any,
                lineupStatus: info.lineupStatus as any,
              };
            }
          }
          return c;
        });
        return changed ? updated : prevCards;
      });
    }
  }, [playerStatusMap]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSynced, setLastSynced] = useState<string | null>(StorageService.getLastSync());
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Pull-to-refresh mobile gesture support
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const pullTouchStartRef = React.useRef<{ y: number; x: number } | null>(null);

  const handleGlobalTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== 'undefined' && window.scrollY <= 5 && e.touches.length === 1) {
      pullTouchStartRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    } else {
      pullTouchStartRef.current = null;
    }
  };

  const handleGlobalTouchMove = (e: React.TouchEvent) => {
    if (!pullTouchStartRef.current || e.touches.length === 0) return;
    const deltaY = e.touches[0].clientY - pullTouchStartRef.current.y;
    const deltaX = Math.abs(e.touches[0].clientX - pullTouchStartRef.current.x);

    // Only activate if vertical pull down at top and not lateral swipe
    if (typeof window !== 'undefined' && window.scrollY <= 0 && deltaY > 0 && deltaY > deltaX * 1.2) {
      const distance = Math.min(90, deltaY * 0.4);
      setPullDistance(distance);
      setIsPulling(true);
    }
  };

  const handleGlobalTouchEnd = async () => {
    if (pullDistance >= 55 && !isSyncing) {
      setPullDistance(0);
      setIsPulling(false);
      showToast('Actualisation Sorare en cours...', 'info');
      await handleSyncWithSorare();
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
    pullTouchStartRef.current = null;
  };

  const cancelSync = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSyncing(false);
      showToast('Synchronisation annulée', 'error');
    }
  };

  // Helper to check if a player is already in a lineup (preventing duplicate player in same composition)
  const isPlayerAlreadyInLineup = (lineupObj: Lineup, player: SorareCard, excludeSlot?: string): boolean => {
    const pKey = getPlayerUniqueKey(player);
    for (const [sKey, pVal] of Object.entries(lineupObj.slots)) {
      if (sKey !== excludeSlot && pVal && getPlayerUniqueKey(pVal) === pKey) {
        return true;
      }
    }
    return false;
  };

  // Generate 4 compositions dynamically whenever cards, deferred filters, or deferred strategy change (preserving locked ones)
  useEffect(() => {
    if (cards.length > 0) {
      const fourCompos = generateFourDistinctLineups(cards, deferredStrategy, gameWeek, deferredFilters);
      setCompositions(prevComps => {
        if (!prevComps || prevComps.length === 0) {
          setLineup(fourCompos[0]);
          setSelectedCompoIndex(0);
          return fourCompos;
        }
        // AUDIT FIX (2.15): previously, a manual edit (player swap) on a composition that wasn't
        // locked was silently discarded the moment a filter/strategy change regenerated the 4
        // compos, with no warning. We now detect this case (isManuallyEdited && !isLocked) and
        // surface a toast before the edit is overwritten, so the user understands why their
        // change disappeared instead of just being surprised.
        const overwrittenEditedNames = prevComps
          .filter(c => c && c.isManuallyEdited && !c.isLocked)
          .map(c => c.name);
        if (overwrittenEditedNames.length > 0) {
          setTimeout(() => {
            showToast(
              `Modification manuelle non verrouillée annulée sur ${overwrittenEditedNames.join(', ')} (verrouillez 🔒 une compo pour protéger vos changements).`,
              'info'
            );
          }, 0);
        }
        const merged = fourCompos.map((newCompo, idx) => {
          const existing = prevComps[idx];
          if (existing && (existing.isLocked || existing.isManuallyEdited)) {
            return existing; // Preserve manually edited or locked compo!
          }
          return {
            ...newCompo,
            id: existing?.id || newCompo.id,
            name: existing?.name || newCompo.name,
            isLocked: existing?.isLocked || false,
            isManuallyEdited: false,
          };
        });
        setLineup(merged[selectedCompoIndex] || merged[0]);
        return merged;
      });
    }
  }, [cards, deferredFilters, deferredStrategy]);

  const handleToggleLockCompo = (index: number) => {
    setCompositions(comps => {
      const copy = [...comps];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          isLocked: !copy[index].isLocked,
        };
        showToast(copy[index].isLocked ? `Compo ${index + 1} verrouillée.` : `Compo ${index + 1} déverrouillée.`);
      }
      return copy;
    });
  };

  const handleClearCompo = (index: number) => {
    setCompositions(comps => {
      const copy = [...comps];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          slots: { gk: null, def: null, mid: null, fwd: null, extra: null },
          projectedTotal: 0,
          projectedTotalWithCaptain: 0,
          captainSlot: 'gk',
          isManuallyEdited: true,
        };
        showToast(`Compo ${index + 1} vidée avec succès.`, 'info');
      }
      if (index === selectedCompoIndex) {
        setLineup(copy[index]);
      }
      return copy;
    });
  };

  const handleClearSlot = (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => {
    setCompositions(comps => {
      const copy = [...comps];
      const comp = copy[compoIndex];
      if (comp) {
        const newSlots = { ...comp.slots, [slot]: null };
        
        // Recalculate totals
        const getSlotPlayerScore = (c: SorareCard | null) => {
          if (!c) return 0;
          return calculatePlayerProjectedScore(c, comp.strategy || strategy, cards).projectedScore;
        };

        const baseSum = (
          getSlotPlayerScore(newSlots.gk) +
          getSlotPlayerScore(newSlots.def) +
          getSlotPlayerScore(newSlots.mid) +
          getSlotPlayerScore(newSlots.fwd) +
          getSlotPlayerScore(newSlots.extra)
        );

        let capBonus = 0;
        let capSlot = comp.captainSlot;
        
        // If we clear the captain, try to assign a new one, or set to a valid default
        if (capSlot === slot || !newSlots[capSlot]) {
            const availableSlots = (['gk', 'def', 'mid', 'fwd', 'extra'] as const).filter(s => newSlots[s] !== null);
            capSlot = availableSlots.length > 0 ? availableSlots[0] : 'gk';
        }

        const capPlayer = newSlots[capSlot];
        if (capPlayer) {
            capBonus = Math.round(getSlotPlayerScore(capPlayer) * 0.20 * 10) / 10;
        }

        copy[compoIndex] = {
          ...comp,
          slots: newSlots,
          captainSlot: capSlot,
          projectedTotal: Math.round(baseSum * 10) / 10,
          projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
          isManuallyEdited: true,
        };

        if (compoIndex === selectedCompoIndex) {
          setLineup(copy[compoIndex]);
        }
      }
      return copy;
    });
  };

  const handleUpdateLineup = (updatedLineup: Lineup | ((prev: Lineup) => Lineup)) => {
    setLineup(prev => {
      const next = typeof updatedLineup === 'function' ? updatedLineup(prev) : updatedLineup;
      setCompositions(prevComps => {
        const newComps = [...prevComps];
        const targetIndex = newComps.findIndex(c => c.id === next.id);
        if (targetIndex !== -1) {
          newComps[targetIndex] = next;
        } else if (newComps[selectedCompoIndex]) {
          newComps[selectedCompoIndex] = next;
        }
        return newComps;
      });
      return next;
    });
  };

  // Modals state
  const [scoutCard, setScoutCard] = useState<SorareCard | null>(null);
  const [breakdownCard, setBreakdownCard] = useState<SorareCard | null>(null);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [slotToSwap, setSlotToSwap] = useState<'gk' | 'def' | 'mid' | 'fwd' | 'extra' | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- NEW: Flux API-Football / Opta (Polling XI de départ) ---
  useEffect(() => {
    const pollStartingXI = async () => {
      if (!isOnline) return;
      try {
        // En conditions réelles, /api/sports/starting-xi interroge API-Football ou Opta
        const res = await fetch('/api/sports/starting-xi');
        if (res.ok) {
          const data = await res.json();
          if (data.confirmedSlugs && data.confirmedSlugs.length > 0) {
            setCards(prevCards => {
              let changed = false;
              const newCards = prevCards.map(c => {
                if (data.confirmedSlugs.includes(c.slug)) {
                  changed = true;
                  return { 
                    ...c, 
                    status: 'STARTER' as PlayingStatus, 
                    playingStatus: 'STARTER' as PlayingStatus,
                    lineupStatus: 'CONFIRMED_STARTER' as OfficialLineupStatus,
                    isStarter: true,
                    confirmed_starter: true,
                    starterConfidence: 100 
                  };
                }
                return c;
              });
              return changed ? newCards : prevCards;
            });
          }
        }
      } catch (e) {
        // Silent fail for polling
      }
    };
    
    // Poll every 5 minutes
    const intervalId = setInterval(pollStartingXI, 5 * 60 * 1000);
    pollStartingXI();
    return () => clearInterval(intervalId);
  }, [isOnline]);

  // Load cards on startup and sync with Sorare live API
  useEffect(() => {
    const initCards = async () => {
      const loadedCards = await StorageService.getCardsAsync();
      setCards(loadedCards);
      setIsLoadingCards(false);
      
      // Generate optimal initial lineup
      if (loadedCards.length > 0) {
        setLineup(optimizeLineup(loadedCards, 'BALANCED', gameWeek));
      }
    };
    initCards();

    // Auto-sync with Sorare API in background on startup
    const autoSync = async () => {
      try {
        // Fetch dynamic game week first
        const gwRes = await fetch('/api/sorare/gameweek');
        let currentGw = gameWeek;
        if (gwRes.ok) {
          const gwData = await gwRes.json();
          if (gwData.gameWeek) {
            setGameWeek(gwData.gameWeek);
            currentGw = gwData.gameWeek;
          }
        }

        const currentName = StorageService.getUsername();
        const apiKey = StorageService.getApiKey();
        const url = `/api/sorare/user-cards?username=${encodeURIComponent(currentName)}`;
        const response = await fetch(url, {
          headers: apiKey ? { 'x-sorare-api-key': apiKey } : {}
        });
        if (response.ok) {
          const data = await response.json();
          if (data.cards && Array.isArray(data.cards) && data.cards.length > 0) {
            StorageService.saveCards(data.cards);
            if (data.user) {
              StorageService.saveUserMeta(data.user);
            }
            setCards(data.cards);
            setLineup(optimizeLineup(data.cards, 'BALANCED', currentGw));
            setLastSynced(new Date().toISOString());
            console.log(`[Sorare] Synced ${data.cards.length} real cards on startup`);
          }
        }
      } catch (e) {
        console.warn('Initial sync notice, using cached real gallery', e);
      }
    };
    autoSync();

    // Monitor online/offline state
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Global error handlers for UI Logs
    const logClientError = (msg: string, err?: any) => {
      try {
        if (!msg || msg.trim() === '' || msg === 'Uncaught ' || msg === 'Script error.') return;
        if (
          msg.includes('websocket') ||
          msg.includes('Failed to fetch') ||
          msg.includes('AbortError') ||
          msg.includes('NetworkError') ||
          msg.includes('Load failed') ||
          msg.includes('ResizeObserver')
        ) {
          return;
        }
        const appToken = StorageService.getAppToken();
        fetch('/api/admin/logs/client', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(appToken ? { 'x-app-token': appToken } : {})
          },
          body: JSON.stringify({ message: msg, error: String(err || '') })
        }).catch(() => {});
      } catch {
        // Safe silence
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        const msg = event.reason?.message || String(event.reason || '');
        if (msg) {
          logClientError(msg, event.reason);
        }
      } catch {}
    };

    const handleError = (event: ErrorEvent) => {
      try {
        if (event.message) {
          logClientError(event.message, event.error);
        }
      } catch {}
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Fetch weather and populate on cards' upcoming fixtures (with anti-loop guard)
  useEffect(() => {
    if (cards.length === 0) return;
    
    // Find all cards with an upcoming fixture that do not have weather already populated
    const cardsToUpdate = cards.filter(c => c.upcomingFixture && !c.upcomingFixture.weather);
    if (cardsToUpdate.length === 0) return;

    // Get unique home/host clubs for those matches
    const hostClubsMap = new Map<string, string[]>(); // host club name -> card IDs
    cardsToUpdate.forEach(c => {
      const host = c.upcomingFixture?.isHome ? (c.club?.name || '') : (c.upcomingFixture?.opponent || '');
      if (host) {
        if (!hostClubsMap.has(host)) {
          hostClubsMap.set(host, []);
        }
        hostClubsMap.get(host)!.push(c.id);
      }
    });

    const uniqueHosts = Array.from(hostClubsMap.keys()).slice(0, 15); // limit to 15 concurrent fetches per batch
    if (uniqueHosts.length === 0) return;

    const fetchWeatherAndAttach = async () => {
      let updatedAny = false;
      const cardsClone = [...cards];

      for (const host of uniqueHosts) {
        try {
          const res = await fetch(`/api/weather?city=${encodeURIComponent(host)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              const cardIds = hostClubsMap.get(host) || [];
              cardIds.forEach(cid => {
                const idx = cardsClone.findIndex(c => c.id === cid);
                if (idx !== -1 && cardsClone[idx].upcomingFixture) {
                  const desc = data.description || '';
                  const isRainy = desc.toLowerCase().includes('pluie') || 
                                  desc.toLowerCase().includes('orage') || 
                                  desc.toLowerCase().includes('averses') || 
                                  desc.toLowerCase().includes('neige');
                  
                  cardsClone[idx] = {
                    ...cardsClone[idx],
                    upcomingFixture: {
                      ...cardsClone[idx].upcomingFixture!,
                      weather: {
                        temp: data.temp,
                        temperature: data.temp,
                        description: data.description,
                        wind: data.wind,
                        isRainy,
                      }
                    }
                  };
                  updatedAny = true;
                }
              });
            }
          }
          // Small delay to avoid API rate limits
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.warn(`[Weather] Error loading weather for ${host}:`, err);
        }
      }

      if (updatedAny) {
        setCards(cardsClone);
        StorageService.saveCards(cardsClone);
        console.log('[Weather] Injected live weather into matching cards and updated local cache');
      }
    };

    fetchWeatherAndAttach();
  }, [cards]);

  const setUsername = (newUsername: string) => {
    setUsernameState(newUsername);
    StorageService.saveUsername(newUsername);
  };

  // Sync with Sorare GraphQL API
  const handleSyncWithSorare = async (customUsername?: string) => {
    const targetName = customUsername || username;
    setIsSyncing(true);
    let pollInterval: any;
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const apiKey = StorageService.getApiKey();
      
      // Start polling for progress
      pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/sorare/sync-progress?username=${encodeURIComponent(targetName)}`, { signal });
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.progress) {
              const { fetchedPages, estimatedTotalPages, fetchedCards, status } = progressData.progress;
              if (status === 'fetching') {
                const pct = estimatedTotalPages > 0 ? Math.min(100, Math.round((fetchedPages / estimatedTotalPages) * 100)) : 0;
                setToast({ 
                  message: `Synchronisation en cours: ${fetchedCards} cartes trouvées (~${pct}%) - Cliquez ici pour annuler`, 
                  type: 'info' 
                });
              }
            }
          }
        } catch (e) {
          // ignore poll errors
        }
      }, 1500);

      const url = `/api/sorare/user-cards?username=${encodeURIComponent(targetName)}&forceRefresh=true`;
      const response = await fetch(url, {
        headers: apiKey ? { 'x-sorare-api-key': apiKey } : {},
        signal
      });
      const data = await response.json();
      
      if (pollInterval) clearInterval(pollInterval);

      if (response.ok) {
        if (data.isDegradedMode) {
          setDegradedModeInfo({ isDegraded: true, reason: data.degradedReason || "Données en cache Sorare utilisées due à une limitation de l'API (429/503)." });
        } else {
          setDegradedModeInfo(null);
        }

        if (data.cards && Array.isArray(data.cards) && data.cards.length > 0) {
          StorageService.saveCards(data.cards);
          if (data.user) {
            StorageService.saveUserMeta(data.user);
          }
          setCards(data.cards);
          setLineup(optimizeLineup(data.cards, 'BALANCED', gameWeek));
          const syncTimestamp = new Date().toISOString();
          setLastSynced(syncTimestamp);
          showToast(
            data.isDegradedMode 
              ? `Mode dégradé : ${data.cards.length} cartes en cache utilisées.` 
              : `${data.cards.length} vraies cartes synchronisées pour ${data.user?.clubName || targetName} !`, 
            data.isDegradedMode ? 'info' : 'success'
          );
        } else {
          const currentCards = await StorageService.getCardsAsync();
          setCards(currentCards);
          setLastSynced(new Date().toISOString());
          showToast(`Aucune carte trouvée pour ${targetName} sur Sorare.`, 'info');
        }
      } else {
        if (data.isDegradedMode) {
          setDegradedModeInfo({ isDegraded: true, reason: data.degradedReason || data.error });
        }
        throw new Error(data.error || 'Erreur de réponse API');
      }
    } catch (e: any) {
      if (pollInterval) clearInterval(pollInterval);
      console.warn('Sync notice, using offline cards cache', e);
      const cached = await StorageService.getCardsAsync();
      setCards(cached);
      showToast(`Erreur API: ${e.message}. Mode Hors-Ligne utilisé.`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // AI Optimization with Gemini 3.7 Flash (server-side) + algorithmic fallback
  const handleOptimizeAI = async (strategy: StrategyType = 'BALANCED') => {
    setIsOptimizing(true);
    try {
      // 1. Extraire les cartes des compositions VERROUILLÉES pour ne pas réutiliser les mêmes cartes
      const lockedUsedCardIds = new Set<string>();
      compositions.forEach((comp) => {
        if (comp && comp.isLocked && comp.slots) {
          Object.values(comp.slots).forEach((c) => {
            if (c) {
              lockedUsedCardIds.add(c.id);
            }
          });
        }
      });

      // 2. Filtrer les cartes disponibles en excluant rigoureusement les remplaçants et non-joueurs
      const availableCardsForOptimization = cards.filter(c => !isPlayerNonStarter(c) && !lockedUsedCardIds.has(c.id));

      const appToken = StorageService.getAppToken();
      const response = await fetch('/api/ai/optimize-lineup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(appToken ? { 'x-app-token': appToken } : {})
        },
        body: JSON.stringify({
          cards: availableCardsForOptimization.length > 0 ? availableCardsForOptimization : cards,
          strategy,
          gameWeek: gameWeek,
          filters,
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson.success && resJson.data) {
          const aiData = resJson.data;
          const rec = aiData.recommendedLineup;

          const findValidSlotCard = (cardId: string, pos: string) => {
            const byId = cards.find(c => c.id === cardId);
            if (byId && !isPlayerNonStarter(byId) && !lockedUsedCardIds.has(byId.id)) return byId;
            return cards.find(c => (pos === 'EXTRA' ? c.positionCode !== 'GK' : c.positionCode === pos) && !isPlayerNonStarter(c) && !lockedUsedCardIds.has(c.id)) || null;
          };

          const rawGk = findValidSlotCard(rec.gkId, 'GK');
          const rawDef = findValidSlotCard(rec.defId, 'DEF');
          const rawMid = findValidSlotCard(rec.midId, 'MID');
          const rawFwd = findValidSlotCard(rec.fwdId, 'FWD');
          const rawExtra = findValidSlotCard(rec.extraId, 'EXTRA');

          const proposedValidation = validateLineup({ gk: rawGk, def: rawDef, mid: rawMid, fwd: rawFwd, extra: rawExtra });
          if (!proposedValidation.isValid) {
            console.log('[AI Optimization Validation] Lineup rejected non-starters or duplicates:', proposedValidation.rejectionReasons);
          }

          const sanitizedSlots = sanitizeLineupNoDuplicatePlayers({ gk: rawGk, def: rawDef, mid: rawMid, fwd: rawFwd, extra: rawExtra }, cards);

          const primaryLineup: Lineup = {
            id: `lineup-gemini-${Date.now()}`,
            name: `Compo 1`,
            strategy,
            gameWeek: gameWeek,
            slots: sanitizedSlots,
            captainSlot: (rec.captainSlot as any) || 'fwd',
            projectedTotal: aiData.projectedTotalScore || 340,
            projectedTotalWithCaptain: aiData.projectedTotalScore || 375,
            filtersUsed: filters,
            analysis: {
              summary: aiData.summary,
              strengths: aiData.strengths || [],
              risks: aiData.risks || [],
              captainReasoning: aiData.captainReasoning,
              cleanSheetOutlook: aiData.cleanSheetOutlook || 'Favorable',
              tacticalPerPosition: aiData.tacticalPerPosition || {
                gk: 'Gardien aligné pour clean sheet.',
                def: 'Défenseur à fort apport offensif.',
                mid: 'Milieu régulier avec gros volume de passes.',
                fwd: 'Buteur principal en forme.',
                extra: 'Extra offensif à fort plafond.',
              },
              source: resJson.source || 'gemini_ai',
            },
            createdAt: new Date().toISOString(),
          };

          // Générer 4 équipes distinctes en tenant compte des joueurs verrouillés
          const otherLineups = generateFourDistinctLineups(cards, strategy, gameWeek, filters, lockedUsedCardIds);
          const fourTeams = [
            { ...primaryLineup, name: 'Compo 1' },
            { ...(otherLineups[1] || otherLineups[0]), name: 'Compo 2' },
            { ...(otherLineups[2] || otherLineups[0]), name: 'Compo 3' },
            { ...(otherLineups[3] || otherLineups[0]), name: 'Compo 4' },
          ];

          setCompositions(prevComps => {
            const merged = fourTeams.map((newCompo, idx) => {
              const existing = prevComps[idx];
              if (existing && existing.isLocked) {
                return existing; // Conserver la composition verrouillée !
              }
              return {
                ...newCompo,
                name: existing?.name || newCompo.name,
                isLocked: false,
              };
            });
            setLineup(merged[selectedCompoIndex] || merged[0]);
            return merged;
          });

          showToast('4 équipes optimisées par Gemini (compos verrouillées préservées) !', 'success');
          return;
        }
      }
      throw new Error('Erreur API IA');
    } catch (e: any) {
      console.warn('Fallback to deterministic 4 SO5 lineups with filters', e);
      const lockedUsedCardIds = new Set<string>();
      compositions.forEach((comp) => {
        if (comp && comp.isLocked && comp.slots) {
          Object.values(comp.slots).forEach((c) => {
            if (c) {
              lockedUsedCardIds.add(c.id);
            }
          });
        }
      });
      const fourTeams = generateFourDistinctLineups(cards, strategy, gameWeek, filters, lockedUsedCardIds);
      setCompositions(prevComps => {
        const merged = fourTeams.map((newCompo, idx) => {
          const existing = prevComps[idx];
          if (existing && existing.isLocked) {
            return existing; // Conserver la composition verrouillée !
          }
          return {
            ...newCompo,
            name: existing?.name || newCompo.name,
            isLocked: false,
          };
        });
        setLineup(merged[selectedCompoIndex] || merged[0]);
        return merged;
      });
      showToast('Compositions optimisées selon vos filtres (compos verrouillées préservées) !', 'success');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Retire une carte de toutes les autres compositions si elle y est déjà alignée (Garantie Règle Unicité de Carte)
  const removePlayerFromOtherCompositions = (
    compositionsList: Lineup[],
    player: SorareCard,
    targetCompoIndex: number
  ): { updatedCompositions: Lineup[]; removedFromIndex: number | null } => {
    let removedFromIndex: number | null = null;

    const updatedCompositions = compositionsList.map((comp, idx) => {
      if (idx === targetCompoIndex || !comp?.slots) return comp;
      
      let modified = false;
      const newSlots = { ...comp.slots };

      (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
        const slotVal = newSlots[slotKey];
        if (slotVal && slotVal.id === player.id) {
          newSlots[slotKey] = null;
          modified = true;
          removedFromIndex = idx;
        }
      });

      if (modified) {
        const getSlotPlayerScore = (c: SorareCard | null) => {
          if (!c) return 0;
          return calculatePlayerProjectedScore(c, comp.strategy || strategy, cards).projectedScore;
        };

        const baseSum = (
          getSlotPlayerScore(newSlots.gk) +
          getSlotPlayerScore(newSlots.def) +
          getSlotPlayerScore(newSlots.mid) +
          getSlotPlayerScore(newSlots.fwd) +
          getSlotPlayerScore(newSlots.extra)
        );

        const capPlayer = newSlots[comp.captainSlot];
        const capBonus = capPlayer ? Math.round(getSlotPlayerScore(capPlayer) * 0.20 * 10) / 10 : 0;

        return {
          ...comp,
          slots: newSlots,
          projectedTotal: Math.round(baseSum * 10) / 10,
          projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
        };
      }

      return comp;
    });

    return { updatedCompositions, removedFromIndex };
  };

  // Slot swap handler.
  // Directly updates targetSlot on active lineup and ensures immediate synchronization
  // with compositions state and locks the edited compo so it is never discarded.
  const handleSwapPlayerInSlot = (player: SorareCard, targetSlot?: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => {
    const resolvedSlot = targetSlot ?? slotToSwap;
    if (!resolvedSlot) return;

    const currentCompo = compositions[selectedCompoIndex] || lineup;
    if (isPlayerAlreadyInLineup(currentCompo, player, resolvedSlot)) {
      showToast("Ce joueur est déjà aligné dans cette composition sur un autre poste !", "error");
      return;
    }

    // Retirer le joueur d'éventuelles autres compositions
    const { updatedCompositions: cleanedCompositions, removedFromIndex } = removePlayerFromOtherCompositions(
      compositions,
      player,
      selectedCompoIndex
    );

    const updatedSlots = {
      ...(cleanedCompositions[selectedCompoIndex]?.slots || currentCompo.slots),
      [resolvedSlot]: player,
    };

    const getSlotPlayerScore = (card: SorareCard | null) => {
      if (!card) return 0;
      return calculatePlayerProjectedScore(card, currentCompo.strategy || strategy, cards).projectedScore;
    };

    const baseSum = (
      getSlotPlayerScore(updatedSlots.gk) +
      getSlotPlayerScore(updatedSlots.def) +
      getSlotPlayerScore(updatedSlots.mid) +
      getSlotPlayerScore(updatedSlots.fwd) +
      getSlotPlayerScore(updatedSlots.extra)
    );

    const capPlayer = updatedSlots[currentCompo.captainSlot];
    const capBonus = capPlayer ? Math.round(getSlotPlayerScore(capPlayer) * 0.20 * 10) / 10 : 0;

    const updated: Lineup = {
      ...currentCompo,
      slots: updatedSlots,
      projectedTotal: Math.round(baseSum * 10) / 10,
      projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
      isLocked: true,
      isManuallyEdited: true,
    };

    const finalCompositions = [...cleanedCompositions];
    finalCompositions[selectedCompoIndex] = updated;

    setLineup(updated);
    setCompositions(finalCompositions);

    if (removedFromIndex !== null) {
      showToast(`🔄 ${player.displayName} transféré de la Compo ${removedFromIndex + 1} vers la Compo ${selectedCompoIndex + 1} (unicité 🔒)`);
    } else {
      showToast(`${player.displayName} assigné au poste ${resolvedSlot.toUpperCase()} (Compo ${selectedCompoIndex + 1} mise à jour 🔒)`);
    }
    setSlotToSwap(null);
  };

  // Add custom card
  const handleAddCard = (newCard: SorareCard) => {
    const updated = [newCard, ...cards];
    setCards(updated);
    StorageService.saveCards(updated);
    showToast(`Carte de ${newCard.displayName} ajoutée à la galerie !`);
  };

  // Direct assign to slot from gallery or scout.
  const handleAssignToSlot = (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => {
    handleSwapPlayerInSlot(card, slot);
    setCurrentTab('pitch');
  };

  const handleReplacePlayerInCompo = (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra', player: SorareCard) => {
    const targetCompo = compositions[compoIndex] || lineup;
    if (targetCompo && isPlayerAlreadyInLineup(targetCompo, player, slot)) {
      showToast("Ce joueur est déjà aligné dans cette composition sur un autre poste !", "error");
      return;
    }

    const { updatedCompositions: cleanedCompositions, removedFromIndex } = removePlayerFromOtherCompositions(
      compositions,
      player,
      compoIndex
    );

    const updatedSlots = {
      ...(cleanedCompositions[compoIndex]?.slots || targetCompo.slots),
      [slot]: player,
    };

    const getSlotPlayerScore = (c: SorareCard | null) => {
      if (!c) return 0;
      return calculatePlayerProjectedScore(c, targetCompo.strategy || strategy, cards).projectedScore;
    };

    const baseSum = (
      getSlotPlayerScore(updatedSlots.gk) +
      getSlotPlayerScore(updatedSlots.def) +
      getSlotPlayerScore(updatedSlots.mid) +
      getSlotPlayerScore(updatedSlots.fwd) +
      getSlotPlayerScore(updatedSlots.extra)
    );

    const capPlayer = updatedSlots[targetCompo.captainSlot];
    const capBonus = capPlayer ? Math.round(getSlotPlayerScore(capPlayer) * 0.20 * 10) / 10 : 0;

    const updated: Lineup = {
      ...targetCompo,
      slots: updatedSlots,
      projectedTotal: Math.round(baseSum * 10) / 10,
      projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
      isLocked: true,
      isManuallyEdited: true,
    };

    const finalCompositions = [...cleanedCompositions];
    finalCompositions[compoIndex] = updated;

    setCompositions(finalCompositions);

    if (compoIndex === selectedCompoIndex) {
      setLineup(updated);
    }

    if (removedFromIndex !== null) {
      showToast(`🔄 ${player.displayName} transféré de la Compo ${removedFromIndex + 1} vers la Compo ${compoIndex + 1} (unicité 🔒)`);
    } else {
      showToast(`${player.displayName} aligné sur le poste ${slot.toUpperCase()} dans ${targetCompo.name || `Compo ${compoIndex + 1}`}`);
    }
  };

  const handleSelectComposition = (index: number) => {
    setSelectedCompoIndex(index);
    if (compositions[index]) {
      setLineup(compositions[index]);
    }
  };

  const handleImportSorareLineups = async () => {
    try {
      showToast('Importation de vos compositions réelles depuis Sorare...', 'info');
      const res = await fetch(`/api/sorare/user-lineups?username=${encodeURIComponent(username || 'thib-8')}`);
      const data = await res.json();

      if (!data.success || !data.lineups || data.lineups.length === 0) {
        showToast(data.message || 'Aucune composition active trouvée sur Sorare pour cette Game Week.', 'info');
        return;
      }

      // Map imported lineups to user gallery cards
      const importedCompositions: Lineup[] = data.lineups.map((l: any, i: number) => {
        const slots: Record<string, SorareCard | null> = {
          gk: null,
          def: null,
          mid: null,
          fwd: null,
          extra: null,
        };

        const findCard = (cardData: any) => {
          if (!cardData) return null;
          return cards.find(c => c.id === cardData.id || c.slug === cardData.slug || c.displayName.toLowerCase() === cardData.displayName?.toLowerCase()) || {
            id: cardData.id || `imported-${Math.random()}`,
            slug: cardData.slug || 'player',
            displayName: cardData.displayName || 'Joueur',
            matchName: cardData.displayName || 'Joueur',
            position: cardData.positionCode || 'MID',
            positionCode: cardData.positionCode || 'MID',
            positionName: cardData.positionCode || 'Milieu',
            rarity: (cardData.rarity?.toLowerCase() || 'common') as any,
            seasonYear: 2024,
            pictureUrl: cardData.pictureUrl || '',
            avatarUrl: cardData.pictureUrl || '',
            age: 25,
            club: { name: cardData.club?.name || 'Club', slug: 'club', pictureUrl: '', country: 'France', league: 'Ligue 1' },
            grade: 0,
            xp: 0,
            power: '1.050',
            scores: { l5: cardData.scores?.l5 || 50, l15: cardData.scores?.l15 || 50, l40: 50, last5Scores: [50, 50, 50, 50, 50], recentMatches: [] },
            status: 'STARTER',
            starterConfidence: 90,
            injuryStatus: 'FIT',
            upcomingFixture: {
              gameWeek: gameWeek,
              opponent: 'Adversaire',
              isHome: true,
              difficultyRating: 3,
              matchDate: new Date().toISOString(),
              kickoffFormatted: 'Ce week-end',
              kickoffRelative: 'GW Active',
              hasUpcomingMatch: true,
              competitionName: 'Championnat',
              projectedScore: cardData.scores?.l5 || 50,
            },
          } as SorareCard;
        };

        slots.gk = findCard(l.slots.gk);
        slots.def = findCard(l.slots.def);
        slots.mid = findCard(l.slots.mid);
        slots.fwd = findCard(l.slots.fwd);
        slots.extra = findCard(l.slots.extra);

        const baseTotal = (slots.gk?.upcomingFixture?.projectedScore || 0) +
          (slots.def?.upcomingFixture?.projectedScore || 0) +
          (slots.mid?.upcomingFixture?.projectedScore || 0) +
          (slots.fwd?.upcomingFixture?.projectedScore || 0) +
          (slots.extra?.upcomingFixture?.projectedScore || 0);

        const capSlot = l.captainSlot || 'fwd';
        const capCard = slots[capSlot];
        const capBonus = capCard ? (capCard.upcomingFixture?.projectedScore || 0) * 0.20 : 0;

        return {
          id: l.id || `imported-${i + 1}`,
          name: l.name || `Compo Sorare ${i + 1}`,
          strategy: 'BALANCED',
          gameWeek: gameWeek,
          slots,
          captainSlot: capSlot,
          projectedTotal: Math.round(baseTotal * 10) / 10,
          projectedTotalWithCaptain: Math.round((baseTotal + capBonus) * 10) / 10,
          isLocked: true,
          createdAt: new Date().toISOString(),
        };
      });

      // Fill up to 4 compositions
      const finalCompositions = [...importedCompositions];
      while (finalCompositions.length < 4) {
        const idx = finalCompositions.length;
        finalCompositions.push({
          ...(compositions[idx] || compositions[0]),
          name: `Compo ${idx + 1}`,
        });
      }

      setCompositions(finalCompositions);
      setLineup(finalCompositions[0]);
      setSelectedCompoIndex(0);
      showToast(`${importedCompositions.length} composition(s) réelle(s) importée(s) depuis Sorare avec succès !`, 'success');
    } catch (e: any) {
      console.error('Lineup import error:', e);
      showToast('Impossible de récupérer les compositions en ligne Sorare.', 'error');
    }
  };

  return (
    <div
      onTouchStart={handleGlobalTouchStart}
      onTouchMove={handleGlobalTouchMove}
      onTouchEnd={handleGlobalTouchEnd}
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950"
    >
      <Toaster theme="dark" position="top-center" richColors />
      {/* Pull to Refresh Mobile Indicator */}
      {isPulling && pullDistance > 8 && (
        <div
          style={{ transform: `translate(-50%, ${pullDistance}px)` }}
          className="fixed top-2 left-1/2 z-50 transition-transform duration-75 pointer-events-none md:hidden"
        >
          <div className="flex items-center gap-2 bg-slate-900/95 border border-emerald-500/50 text-emerald-300 text-xs font-black px-4 py-2 rounded-full shadow-2xl backdrop-blur-md">
            <RefreshCw className={`h-3.5 w-3.5 ${pullDistance >= 55 ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{pullDistance >= 55 ? 'Relâcher pour synchroniser' : 'Tirer pour actualiser'}</span>
          </div>
        </div>
      )}
      
      {/* Navigation Header */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        username={username}
        setUsername={setUsername}
        gameWeek={{ number: gameWeek }}
        isSyncing={isSyncing}
        onSync={handleSyncWithSorare}
        isOnline={isOnline}
        lastSynced={lastSynced}
        totalCardsCount={cards.length}
        strategy={strategy}
        setStrategy={setStrategy}
        scoringFocus={filters.scoringFocus || 'BALANCED'}
        setScoringFocus={(focus) => setFilters(prev => ({ ...prev, scoringFocus: focus }))}
        alertsCount={startingXIAlerts.length}
        onOpenStartingXIMonitor={() => setIsStartingXIModalOpen(true)}
      />

      {/* Degraded Mode Warning Banner */}
      {degradedModeInfo?.isDegraded && (
        <div id="degraded-mode-banner" className="bg-amber-950/90 border-b border-amber-500/50 px-4 py-2 text-xs font-medium text-amber-200 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Mode Dégradé Actif :</strong> {degradedModeInfo.reason || "Données Sorare en cache local utilisées suite à une limitation temporaire (429/503)."}
            </span>
          </div>
          <button
            onClick={() => setDegradedModeInfo(null)}
            className="text-amber-400 hover:text-white font-bold text-[11px] underline ml-4"
          >
            Masquer
          </button>
        </div>
      )}

      {/* Active Sync Progress & Cancel Banner */}
      {isSyncing && (
        <div id="sync-active-banner" className="bg-emerald-950/90 border-b border-emerald-500/50 px-4 py-2.5 text-xs font-medium text-emerald-200 flex items-center justify-between backdrop-blur-md sticky top-0 z-40 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span>
              <strong>Synchronisation Sorare en direct :</strong> Récupération des cartes réelles et métriques SO5...
            </span>
          </div>
          <button
            onClick={cancelSync}
            className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500 hover:text-white transition shadow-sm"
          >
            Annuler la synchronisation
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="w-full max-w-full overflow-x-hidden px-2.5 sm:px-6 lg:px-8 py-3 sm:py-6 pb-24 md:pb-8">
        
        {/* Toast Notification Banner */}
        {toast && (
          <div 
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-emerald-500/40 animate-bounce ${isSyncing && toast.type === 'info' ? 'cursor-pointer hover:bg-slate-800' : ''}`}
            onClick={() => {
              if (isSyncing && toast.type === 'info') {
                cancelSync();
              }
            }}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-emerald-400" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Tab 1: Pitch & SO5 Optimizer */}
        {currentTab === 'pitch' && (
          <PitchPage
            lineup={lineup}
            setLineup={handleUpdateLineup as any}
            cards={cards}
            onOptimizeAI={handleOptimizeAI}
            isOptimizing={isOptimizing}
            onOpenScout={(c) => setScoutCard(c)}
            onOpenAnalysis={() => setIsAnalysisOpen(true)}
            onSelectSlotToSwap={(slot) => setSlotToSwap(slot)}
            filters={filters}
            setFilters={setFilters}
            compositions={compositions}
            selectedCompoIndex={selectedCompoIndex}
            onSelectComposition={handleSelectComposition}
            onExportLineup={(l) => setExportLineupTarget(l)}
            onToggleLockCompo={handleToggleLockCompo}
            onClearCompo={handleClearCompo}
            onClearSlot={handleClearSlot}
            onImportSorareLineups={handleImportSorareLineups}
            onReplacePlayerInCompo={handleReplacePlayerInCompo}
            alerts={startingXIAlerts}
            playerStatusMap={playerStatusMap}
            onOpenStartingXIMonitor={() => setIsStartingXIModalOpen(true)}
          />
        )}

        {/* Tab 2: Gallery & Stats */}
        {currentTab === 'gallery' && (
          <GalleryPage
            cards={cards}
            strategy={strategy}
            isLoadingCards={isLoadingCards}
            onOpenScout={(c) => setScoutCard(c)}
            onAssignToSlot={handleAssignToSlot}
            onAddCard={handleAddCard}
            compositions={compositions}
            onReplacePlayerInCompo={handleReplacePlayerInCompo}
          />
        )}

        {/* Tab 3: Matchups & Bookmakers */}
        {currentTab === 'matchups' && (
          <MatchupsPage
            cards={cards}
            gameWeek={{ number: gameWeek }}
            onOpenScout={(c) => setScoutCard(c)}
            strategy={strategy}
            onUpdateCards={(newCards) => {
              setCards(newCards);
              StorageService.saveCards(newCards);
            }}
          />
        )}

        {/* Tab 4: Live Scoring SO5 */}
        {currentTab === 'live' && (
          <LiveScoringView
            cards={cards}
            lineup={lineup}
            compositions={compositions}
            onOpenScout={(c) => setScoutCard(c)}
            gameWeek={gameWeek}
            strategy={strategy}
          />
        )}

        {/* Tab 5: AI Coach Chat */}
        {currentTab === 'ai-coach' && (
          <AICoachPage
            cards={cards}
            gameWeekNumber={gameWeek}
          />
        )}

        {/* Tab 6: Admin & Console */}
        {currentTab === 'admin' && (
          <AdminPage cards={cards} gameWeek={gameWeek} />
        )}
      </main>

      {/* Lineup Export & Direct Submission Modal */}
      {exportLineupTarget && (
        <LineupExportModal
          lineup={exportLineupTarget}
          onClose={() => setExportLineupTarget(null)}
          gameWeek={gameWeek}
        />
      )}

      {/* Player Scout Modal */}
      {scoutCard && (
        <PlayerScoutModal
          card={scoutCard}
          allCards={cards}
          strategy={strategy}
          onClose={() => setScoutCard(null)}
          onAssignToSlot={handleAssignToSlot}
        />
      )}

      {/* Projection Breakdown Modal */}
      {breakdownCard && (
        <ProjectionBreakdownModal
          card={breakdownCard}
          strategy={strategy}
          allGalleryCards={cards}
          onUpdateCard={(updated) => {
            const newCards = cards.map(c => c.id === updated.id ? updated : c);
            setCards(newCards);
            setBreakdownCard(updated);
            StorageService.saveCards(newCards);
            setCompositions(prevComps => prevComps.map(comp => {
              let changed = false;
              const newSlots = { ...comp.slots };
              (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
                if (newSlots[slotKey]?.id === updated.id) {
                  newSlots[slotKey] = updated;
                  changed = true;
                }
              });
              if (!changed) return comp;
              return { ...comp, slots: newSlots };
            }));
            setLineup(prev => {
              let changed = false;
              const newSlots = { ...prev.slots };
              (['gk', 'def', 'mid', 'fwd', 'extra'] as const).forEach(slotKey => {
                if (newSlots[slotKey]?.id === updated.id) {
                  newSlots[slotKey] = updated;
                  changed = true;
                }
              });
              if (!changed) return prev;
              return { ...prev, slots: newSlots };
            });
          }}
          onClose={() => setBreakdownCard(null)}
        />
      )}

      {/* Detailed Tactical Analysis Drawer */}
      {isAnalysisOpen && (
        <LineupAnalysisDrawer
          lineup={lineup}
          onClose={() => setIsAnalysisOpen(false)}
        />
      )}

      {/* Slot Swap Modal */}
      {slotToSwap && (
        <SlotSwapModal
          slot={slotToSwap}
          cards={cards}
          filters={filters}
          currentLineup={compositions[selectedCompoIndex] || lineup}
          compositions={compositions}
          selectedCompoIndex={selectedCompoIndex}
          onSelectPlayer={handleSwapPlayerInSlot}
          onClose={() => setSlotToSwap(null)}
        />
      )}

      {/* Starting XI Lineup Live Monitor Modal (1h before matches & alerts) */}
      <StartingXIMonitorModal
        isOpen={isStartingXIModalOpen}
        onClose={() => setIsStartingXIModalOpen(false)}
        alerts={startingXIAlerts}
        playerStatusMap={playerStatusMap}
        compositions={compositions}
        isChecking={isCheckingStartingXI}
        lastChecked={startingXILastChecked}
        onRefresh={refetchStartingXI}
        permission={notifPermission}
        onRequestPermission={requestNotificationPermission}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={toggleNotifications}
        onSelectSlotToSwap={(compoIdx, slot) => {
          setSelectedCompoIndex(compoIdx);
          setSlotToSwap(slot);
        }}
        onDismissAlert={dismissAlert}
      />

      {/* Context-Aware Mobile Floating Action Button (FAB) */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden flex flex-col items-end gap-2 animate-fadeIn">
        {currentTab === 'pitch' && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setExportLineupTarget(compositions[selectedCompoIndex] || lineup)}
              className="flex items-center gap-2 rounded-full bg-slate-900 text-emerald-400 border border-emerald-500/40 px-3.5 py-2.5 shadow-2xl active:scale-95 transition hover:brightness-110"
              title="Exporter la composition"
            >
              <Share2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold">Exporter</span>
            </button>
            <button
              type="button"
              onClick={() => handleOptimizeAI(strategy)}
              disabled={isOptimizing}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-slate-950 font-black shadow-2xl shadow-emerald-500/40 active:scale-95 transition hover:brightness-110 border border-emerald-300"
              title="Optimiser Automatiquement la Compo"
            >
              <Sparkles className={`h-4 w-4 ${isOptimizing ? 'animate-spin' : ''}`} />
              <span className="text-xs font-black">Optimiser Auto</span>
            </button>
          </div>
        )}

        {currentTab === 'live' && (
          <button
            type="button"
            onClick={() => handleSyncWithSorare()}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 text-slate-950 font-black shadow-2xl shadow-cyan-500/40 active:scale-95 transition hover:brightness-110 border border-cyan-300"
            title="Actualiser les scores Live"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="text-xs font-black">Actualiser</span>
          </button>
        )}
      </div>

      {/* Ergonomic Mobile Bottom Navigation Bar (md:hidden) */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        totalCardsCount={cards.length}
        alertsCount={startingXIAlerts.length}
        onOpenStartingXIMonitor={() => setIsStartingXIModalOpen(true)}
      />

    </div>
  );
}
 
