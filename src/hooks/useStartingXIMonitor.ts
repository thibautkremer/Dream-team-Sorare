import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { SorareCard, Lineup, StartingXIPlayerInfo, NonStarterAlert } from '../types';
import { StorageService } from '../utils/storage';
import { NotificationService } from '../utils/notifications';
import { AppLogger } from '../utils/logger';
import { getPlayerUniqueKey } from '../utils/optimizer';

interface UseStartingXIMonitorProps {
  cards: SorareCard[];
  compositions: Lineup[];
  currentLineup: Lineup;
}

export function useStartingXIMonitor({
  cards,
  compositions,
  currentLineup,
}: UseStartingXIMonitorProps) {
  const [playerStatusMap, setPlayerStatusMap] = useState<Record<string, StartingXIPlayerInfo>>({});
  const [alerts, setAlerts] = useState<NonStarterAlert[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(NotificationService.getPermission());
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(NotificationService.isEnabledInSettings());

  // Keep track of already notified alerts in current session to prevent notification spam
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());

  // Extract all unique players across all compositions
  const uniquePlayersInCompositions = useMemo(() => {
    const allLineups = compositions.length > 0 ? compositions : [currentLineup];
    const map = new Map<string, SorareCard>();

    allLineups.forEach((lp) => {
      if (!lp.slots) return;
      Object.values(lp.slots).forEach((player) => {
        if (player) {
          const key = getPlayerUniqueKey(player);
          if (!map.has(key)) {
            map.set(key, player);
          }
        }
      });
    });

    return Array.from(map.values());
  }, [compositions, currentLineup]);

  const checkStartingXI = useCallback(async () => {
    if (uniquePlayersInCompositions.length === 0) {
      setAlerts([]);
      return;
    }

    setIsChecking(true);
    try {
      const allLineups = compositions.length > 0 ? compositions : [currentLineup];
      const apiKey = StorageService.getApiKey() || '';
      const appToken = StorageService.getAppToken() || '';

      const res = await fetch('/api/lineups/starting-xi-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-sorare-api-key': apiKey } : {}),
          ...(appToken ? { 'x-app-token': appToken } : {}),
        },
        body: JSON.stringify({
          players: uniquePlayersInCompositions.map((p) => ({
            id: p.id,
            slug: p.slug,
            playerSlug: p.playerSlug,
            displayName: p.displayName || p.name,
            status: p.status,
            club: p.club,
            upcomingFixture: p.upcomingFixture,
          })),
          lineups: allLineups,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPlayerStatusMap(data.playerStatusMap || {});
          
          const newAlerts: NonStarterAlert[] = Array.isArray(data.alerts) ? data.alerts : [];
          setAlerts(newAlerts);
          setLastChecked(new Date());

          // Trigger browser notification, sound, and admin log for each newly detected alert
          newAlerts.forEach((alert) => {
            const alertKey = `${alert.id}_${alert.issueType}_${alert.minutesUntilKickoff || 0}`;
            if (!notifiedAlertIdsRef.current.has(alertKey)) {
              notifiedAlertIdsRef.current.add(alertKey);
              NotificationService.notifyNonStarter(alert);
              AppLogger.logLineupAlert(alert);
              
              toast.error(`🚨 Alerte Lineup: ${alert.player.displayName || alert.player.name}`, {
                description: `Est ${alert.statusLabel.toLowerCase()} dans "${alert.lineupName}".`,
                duration: 10000,
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('[useStartingXIMonitor] Error checking starting XI:', err);
    } finally {
      setIsChecking(false);
    }
  }, [uniquePlayersInCompositions, compositions, currentLineup]);

  // Initial check and periodic polling
  useEffect(() => {
    checkStartingXI();

    const getPollingInterval = () => {
      let shortestTime = Infinity;
      const now = new Date().getTime();
      uniquePlayersInCompositions.forEach(p => {
        if (p.upcomingFixture?.matchDate) {
          const matchTime = new Date(p.upcomingFixture.matchDate).getTime();
          const diff = matchTime - now;
          if (diff > 0 && diff < shortestTime) {
            shortestTime = diff;
          }
        }
      });
      // If a match is within 2 hours, poll every 60s, else 5 minutes
      if (shortestTime < 2 * 60 * 60 * 1000) {
        return 60 * 1000;
      }
      return 5 * 60 * 1000;
    };

    let interval = setInterval(checkStartingXI, getPollingInterval());

    return () => clearInterval(interval);
  }, [checkStartingXI, uniquePlayersInCompositions]);

  const requestNotificationPermission = async () => {
    const perm = await NotificationService.requestPermission();
    setPermission(perm);
    if (perm === 'granted') {
      setNotificationsEnabled(true);
      NotificationService.setEnabledInSettings(true);
      NotificationService.playAlertSound();
    }
    return perm;
  };

  const toggleNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    NotificationService.setEnabledInSettings(enabled);
    if (enabled && permission !== 'granted') {
      requestNotificationPermission();
    }
  };

  const dismissAlert = (alertId: string) => {
    NotificationService.muteAlert(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  return {
    playerStatusMap,
    alerts,
    isChecking,
    lastChecked,
    refetch: checkStartingXI,
    permission,
    requestNotificationPermission,
    notificationsEnabled,
    toggleNotifications,
    dismissAlert,
    monitoredPlayersCount: uniquePlayersInCompositions.length,
  };
}
