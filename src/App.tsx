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
import { StorageService } from './utils/storage';
import { optimizeLineup, generateFourDistinctLineups, getPlayerUniqueKey } from './utils/optimizer';
import { CURRENT_GAME_WEEK } from './data/mockGallery';
import { SorareCard, Lineup, StrategyType, LineupOptimizationFilters } from './types';
import { CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin'>('pitch');
  const [username, setUsernameState] = useState<string>(StorageService.getUsername());
  const [cards, setCards] = useState<SorareCard[]>([]);
  const [exportLineupTarget, setExportLineupTarget] = useState<Lineup | null>(null);
  const [degradedModeInfo, setDegradedModeInfo] = useState<{ isDegraded: boolean; reason?: string } | null>(null);
  
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
    return optimizeLineup(initialCards, 'BALANCED', CURRENT_GAME_WEEK.number, filters);
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSynced, setLastSynced] = useState<string | null>(StorageService.getLastSync());

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
      const fourCompos = generateFourDistinctLineups(cards, deferredStrategy, CURRENT_GAME_WEEK.number, deferredFilters);
      setCompositions(prevComps => {
        if (!prevComps || prevComps.length === 0) {
          setLineup(fourCompos[0]);
          setSelectedCompoIndex(0);
          return fourCompos;
        }
        const merged = fourCompos.map((newCompo, idx) => {
          const existing = prevComps[idx];
          if (existing && existing.isLocked) {
            return existing; // Preserve locked compo!
          }
          return {
            ...newCompo,
            id: existing?.id || newCompo.id,
            name: existing?.name || newCompo.name,
            isLocked: existing?.isLocked || false,
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

  // Load cards on startup and sync with Sorare live API
  useEffect(() => {
    const loadedCards = StorageService.getCards();
    setCards(loadedCards);

    // Generate optimal initial lineup
    if (loadedCards.length > 0) {
      setLineup(optimizeLineup(loadedCards, 'BALANCED', CURRENT_GAME_WEEK.number));
    }

    // Auto-sync with Sorare API in background on startup
    const autoSync = async () => {
      try {
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
            setLineup(optimizeLineup(data.cards, 'BALANCED', CURRENT_GAME_WEEK.number));
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
        fetch('/api/admin/logs/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  const setUsername = (newUsername: string) => {
    setUsernameState(newUsername);
    StorageService.saveUsername(newUsername);
  };

  // Sync with Sorare GraphQL API
  const handleSyncWithSorare = async (customUsername?: string) => {
    const targetName = customUsername || username;
    setIsSyncing(true);
    let pollInterval: any;

    try {
      const apiKey = StorageService.getApiKey();
      
      // Start polling for progress
      pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`/api/sorare/sync-progress?username=${encodeURIComponent(targetName)}`);
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.progress) {
              const { fetchedPages, estimatedTotalPages, fetchedCards, status } = progressData.progress;
              if (status === 'fetching') {
                const pct = estimatedTotalPages > 0 ? Math.min(100, Math.round((fetchedPages / estimatedTotalPages) * 100)) : 0;
                setToast({ 
                  message: `Synchronisation en cours: ${fetchedCards} cartes trouvées (~${pct}%)`, 
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
        headers: apiKey ? { 'x-sorare-api-key': apiKey } : {}
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
          setLineup(optimizeLineup(data.cards, 'BALANCED', CURRENT_GAME_WEEK.number));
          const syncTimestamp = new Date().toISOString();
          setLastSynced(syncTimestamp);
          showToast(
            data.isDegradedMode 
              ? `Mode dégradé : ${data.cards.length} cartes en cache utilisées.` 
              : `${data.cards.length} vraies cartes synchronisées pour ${data.user?.clubName || targetName} !`, 
            data.isDegradedMode ? 'info' : 'success'
          );
        } else {
          const currentCards = StorageService.getCards();
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
      const cached = StorageService.getCards();
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
      const response = await fetch('/api/ai/optimize-lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards,
          strategy,
          gameWeek: CURRENT_GAME_WEEK.number,
          filters,
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        if (resJson.success && resJson.data) {
          const aiData = resJson.data;
          const rec = aiData.recommendedLineup;

          const gk = cards.find(c => c.id === rec.gkId) || cards.find(c => c.positionCode === 'GK') || null;
          const def = cards.find(c => c.id === rec.defId) || cards.find(c => c.positionCode === 'DEF') || null;
          const mid = cards.find(c => c.id === rec.midId) || cards.find(c => c.positionCode === 'MID') || null;
          const fwd = cards.find(c => c.id === rec.fwdId) || cards.find(c => c.positionCode === 'FWD') || null;
          const extra = cards.find(c => c.id === rec.extraId) || cards.find(c => c.positionCode !== 'GK' && c.id !== gk?.id && c.id !== def?.id && c.id !== mid?.id && c.id !== fwd?.id) || null;

          const primaryLineup: Lineup = {
            id: `lineup-gemini-${Date.now()}`,
            name: `Compo 1`,
            strategy,
            gameWeek: CURRENT_GAME_WEEK.number,
            slots: { gk, def, mid, fwd, extra },
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
            },
            createdAt: new Date().toISOString(),
          };

          // Generate 4 distinct lineups using filter constraints
          const otherLineups = generateFourDistinctLineups(cards, strategy, CURRENT_GAME_WEEK.number, filters);
          const fourTeams = [
            { ...primaryLineup, name: 'Compo 1' },
            { ...(otherLineups[1] || otherLineups[0]), name: 'Compo 2' },
            { ...(otherLineups[2] || otherLineups[0]), name: 'Compo 3' },
            { ...(otherLineups[3] || otherLineups[0]), name: 'Compo 4' },
          ];

          setCompositions(fourTeams);
          setLineup(fourTeams[0]);
          setSelectedCompoIndex(0);
          showToast('4 équipes optimisées avec succès par Gemini avec vos filtres !', 'success');
          return;
        }
      }
      throw new Error('Erreur API IA');
    } catch (e: any) {
      console.warn('Fallback to deterministic 4 SO5 lineups with filters', e);
      const fourTeams = generateFourDistinctLineups(cards, strategy, CURRENT_GAME_WEEK.number, filters);
      setCompositions(fourTeams);
      setLineup(fourTeams[0]);
      setSelectedCompoIndex(0);
      showToast('4 équipes optimisées avec succès selon vos filtres !', 'success');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Slot swap handler
  const handleSwapPlayerInSlot = (player: SorareCard) => {
    if (!slotToSwap) return;
    if (isPlayerAlreadyInLineup(lineup, player, slotToSwap)) {
      showToast("Ce joueur est déjà aligné dans cette composition sur un autre poste !", "error");
      return;
    }

    let updatedLineup: Lineup | null = null;

    setLineup(prev => {
      const updatedSlots = {
        ...prev.slots,
        [slotToSwap]: player,
      };

      const baseSum = (
        (updatedSlots.gk?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.def?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.mid?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.fwd?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.extra?.upcomingFixture?.projectedScore || 0)
      );

      const capPlayer = updatedSlots[prev.captainSlot];
      const capBonus = capPlayer ? Math.round((capPlayer.upcomingFixture?.projectedScore || 0) * 0.20 * 10) / 10 : 0;

      const updated = {
        ...prev,
        slots: updatedSlots,
        projectedTotal: Math.round(baseSum * 10) / 10,
        projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
      };

      updatedLineup = updated;
      return updated;
    });

    // Sync back to compositions
    setTimeout(() => {
      if (updatedLineup) {
        setCompositions(comps => {
          const copy = [...comps];
          if (copy[selectedCompoIndex]) {
            copy[selectedCompoIndex] = updatedLineup!;
          }
          return copy;
        });
      }
    }, 0);

    showToast(`${player.displayName} assigné au poste ${slotToSwap.toUpperCase()}`);
    setSlotToSwap(null);
  };

  // Add custom card
  const handleAddCard = (newCard: SorareCard) => {
    const updated = [newCard, ...cards];
    setCards(updated);
    StorageService.saveCards(updated);
    showToast(`Carte de ${newCard.displayName} ajoutée à la galerie !`);
  };

  // Direct assign to slot from gallery or scout
  const handleAssignToSlot = (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => {
    setSlotToSwap(slot);
    handleSwapPlayerInSlot(card);
    setCurrentTab('pitch');
  };

  const handleReplacePlayerInCompo = (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra', player: SorareCard) => {
    const targetCompo = compositions[compoIndex];
    if (targetCompo && isPlayerAlreadyInLineup(targetCompo, player, slot)) {
      showToast("Ce joueur est déjà aligné dans cette composition sur un autre poste !", "error");
      return;
    }

    setCompositions(comps => {
      const copy = [...comps];
      if (!copy[compoIndex]) return comps;
      
      const compo = copy[compoIndex];
      const updatedSlots = {
        ...compo.slots,
        [slot]: player,
      };

      const baseSum = (
        (updatedSlots.gk?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.def?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.mid?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.fwd?.upcomingFixture?.projectedScore || 0) +
        (updatedSlots.extra?.upcomingFixture?.projectedScore || 0)
      );

      const capPlayer = updatedSlots[compo.captainSlot];
      const capBonus = capPlayer ? Math.round((capPlayer.upcomingFixture?.projectedScore || 0) * 0.20 * 10) / 10 : 0;

      const updated = {
        ...compo,
        slots: updatedSlots,
        projectedTotal: Math.round(baseSum * 10) / 10,
        projectedTotalWithCaptain: Math.round((baseSum + capBonus) * 10) / 10,
      };

      copy[compoIndex] = updated;

      if (compoIndex === selectedCompoIndex) {
        setLineup(updated);
      }

      return copy;
    });

    showToast(`${player.displayName} a remplacé le joueur dans la Compo ${compoIndex + 1} !`, 'success');
  };

  const handleSelectComposition = (index: number) => {
    setSelectedCompoIndex(index);
    if (compositions[index]) {
      setLineup(compositions[index]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Navigation Header */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        username={username}
        setUsername={setUsername}
        gameWeek={CURRENT_GAME_WEEK}
        isSyncing={isSyncing}
        onSync={handleSyncWithSorare}
        isOnline={isOnline}
        lastSynced={lastSynced}
        totalCardsCount={cards.length}
        strategy={strategy}
        setStrategy={setStrategy}
        scoringFocus={filters.scoringFocus || 'BALANCED'}
        setScoringFocus={(focus) => setFilters(prev => ({ ...prev, scoringFocus: focus }))}
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

      {/* Main Container */}
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Toast Notification Banner */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-emerald-500/40 animate-bounce">
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
          />
        )}

        {/* Tab 2: Gallery & Stats */}
        {currentTab === 'gallery' && (
          <GalleryPage
            cards={cards}
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
            gameWeek={CURRENT_GAME_WEEK}
            onOpenScout={(c) => setScoutCard(c)}
            strategy={strategy}
          />
        )}

        {/* Tab 4: Live Scoring SO5 */}
        {currentTab === 'live' && (
          <LiveScoringView
            cards={cards}
            lineup={lineup}
            compositions={compositions}
            onOpenScout={(c) => setScoutCard(c)}
            gameWeek={CURRENT_GAME_WEEK.number}
            strategy={strategy}
          />
        )}

        {/* Tab 5: AI Coach Chat */}
        {currentTab === 'ai-coach' && (
          <AICoachPage
            cards={cards}
            gameWeekNumber={CURRENT_GAME_WEEK.number}
          />
        )}

        {/* Tab 6: Admin & Console */}
        {currentTab === 'admin' && (
          <AdminPage />
        )}
      </main>

      {/* Lineup Export & Direct Submission Modal */}
      {exportLineupTarget && (
        <LineupExportModal
          lineup={exportLineupTarget}
          onClose={() => setExportLineupTarget(null)}
          gameWeek={CURRENT_GAME_WEEK.number}
        />
      )}

      {/* Player Scout Modal */}
      {scoutCard && (
        <PlayerScoutModal
          card={scoutCard}
          allCards={cards}
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
          onSelectPlayer={handleSwapPlayerInSlot}
          onClose={() => setSlotToSwap(null)}
        />
      )}

    </div>
  );
}
