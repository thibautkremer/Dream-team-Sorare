// Web Notification & Audio Alert Manager for Starting XI Monitoring
import { NonStarterAlert } from '../types';

const MUTED_ALERTS_KEY = 'sorare_muted_alerts_v1';
const NOTIFICATIONS_ENABLED_KEY = 'sorare_notifications_enabled_v1';

export class NotificationService {
  /**
   * Check if the browser supports Notification API
   */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Get current permission state
   */
  static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Request browser permission to display system push notifications
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
      }
      return permission;
    } catch {
      return 'denied';
    }
  }

  /**
   * Check if notifications are enabled by the user in the app settings
   */
  static isEnabledInSettings(): boolean {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return val !== 'false' && this.getPermission() === 'granted';
  }

  static setEnabledInSettings(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
  }

  /**
   * Play a subtle, pleasant audio chime using Web Audio API (cross-browser compatible)
   */
  static playAlertSound(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pleasant double ping (F5 to A5)
      osc.frequency.setValueAtTime(698.46, now); // F5
      osc.frequency.setValueAtTime(880.00, now + 0.12); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Audio context might be restricted before user gesture, safely ignore
    }
  }

  /**
   * Send a native browser push notification for a non-starter alert
   */
  static notifyNonStarter(alert: NonStarterAlert): boolean {
    if (!this.isSupported() || Notification.permission !== 'granted' || !this.isEnabledInSettings()) {
      return false;
    }

    try {
      const title = `🚨 Non-titulaire : ${alert.player.displayName || alert.player.name}`;
      const body = `${alert.player.displayName} est ${alert.statusLabel.toLowerCase()} dans "${alert.lineupName}" (${alert.matchSummary}) !`;

      const notification = new Notification(title, {
        body,
        icon: alert.player.pictureUrl || '/vite.svg',
        badge: '/vite.svg',
        tag: `starting-xi-${alert.id}`,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      this.playAlertSound();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get previously muted / acknowledged alert IDs
   */
  static getMutedAlerts(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(MUTED_ALERTS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  /**
   * Mute an alert so it doesn't trigger notification popups repeatedly
   */
  static muteAlert(alertId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const muted = this.getMutedAlerts();
      muted.add(alertId);
      localStorage.setItem(MUTED_ALERTS_KEY, JSON.stringify(Array.from(muted)));
    } catch {
      // ignore
    }
  }

  /**
   * Clear old muted alerts
   */
  static clearMutedAlerts(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MUTED_ALERTS_KEY);
  }
}
