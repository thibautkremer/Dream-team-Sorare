// Centralized Application Logger & Alert Ingestion
import { AppLogEntry, NonStarterAlert } from '../types';
import { StorageService } from './storage';

export class AppLogger {
  private static isInitialized = false;

  /**
   * Initialize global unhandled error and rejection listeners
   */
  static initGlobalListeners(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Capture uncaught JavaScript errors
    window.addEventListener('error', (event) => {
      this.logError(
        `Erreur JavaScript non interceptée : ${event.message || 'Erreur inconnue'}`,
        event.error || event.message,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
        'CRITICAL'
      );
    });

    // Capture unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const errorMsg = typeof reason === 'object' && reason?.message ? reason.message : String(reason || 'Promise rejetée');
      this.logError(
        `Promise Rejection non gérée : ${errorMsg}`,
        reason,
        {
          stack: reason?.stack,
        },
        'ERROR'
      );
    });

    // Capture offline/online events
    window.addEventListener('offline', () => {
      this.logAlert(
        'Connexion Internet perdue : Bascule en mode hors-ligne local',
        { status: 'offline', timestamp: new Date().toISOString() },
        'WARNING'
      );
    });

    window.addEventListener('online', () => {
      this.logInfo(
        'Connexion Internet rétablie : Synchronisation prête',
        { status: 'online', timestamp: new Date().toISOString() }
      );
    });
  }

  /**
   * Log an error event to the backend console
   */
  static async logError(
    description: string,
    errorObj?: any,
    metadata?: Record<string, any>,
    severity: 'ERROR' | 'CRITICAL' = 'ERROR'
  ): Promise<void> {
    const errorStr = errorObj instanceof Error ? errorObj.message : typeof errorObj === 'string' ? errorObj : JSON.stringify(errorObj || '');
    const stack = errorObj instanceof Error ? errorObj.stack : undefined;

    const payload: Partial<AppLogEntry> = {
      description,
      service: 'Application Error',
      method: 'CLIENT_ERROR',
      status: 'ERROR',
      severity,
      statusCode: 500,
      durationMs: 0,
      requestSummary: metadata || {},
      responseSummary: { error: errorStr, stack },
      error: errorStr || description,
      component: metadata?.component || 'Client UI',
    };

    this.sendToServer(payload);
  }

  /**
   * Log a warning / alert event (e.g. Starting XI non-starter, Degraded Mode)
   */
  static async logAlert(
    description: string,
    metadata?: Record<string, any>,
    severity: 'WARNING' | 'CRITICAL' = 'WARNING',
    service: 'Lineup Alert' | 'System & Sync' | 'Odds Engine' | 'Application Error' = 'Lineup Alert'
  ): Promise<void> {
    const payload: Partial<AppLogEntry> = {
      description,
      service,
      method: 'APP_ALERT',
      status: 'WARNING',
      severity,
      statusCode: severity === 'CRITICAL' ? 409 : 200,
      durationMs: 0,
      requestSummary: metadata || {},
      responseSummary: { alert: description },
      error: severity === 'CRITICAL' ? description : undefined,
      component: metadata?.component || 'Lineup Monitor',
    };

    this.sendToServer(payload);
  }

  /**
   * Log informational system event
   */
  static async logInfo(
    description: string,
    metadata?: Record<string, any>,
    service: 'System & Sync' | 'Sorare API' | 'Gemini AI' = 'System & Sync'
  ): Promise<void> {
    const payload: Partial<AppLogEntry> = {
      description,
      service,
      method: 'INFO_EVENT',
      status: 'INFO',
      severity: 'INFO',
      statusCode: 200,
      durationMs: 0,
      requestSummary: metadata || {},
      responseSummary: { info: description },
    };

    this.sendToServer(payload);
  }

  /**
   * Log a Starting XI non-starter alert specifically
   */
  static async logLineupAlert(alert: NonStarterAlert): Promise<void> {
    this.logAlert(
      `🚨 [Alerte Compo H-1h] ${alert.player.displayName} non-titulaire (${alert.statusLabel}) dans "${alert.lineupName}"`,
      {
        lineupId: alert.lineupId,
        lineupName: alert.lineupName,
        slot: alert.slot,
        player: alert.player.displayName,
        match: alert.matchSummary,
        issueType: alert.issueType,
        minutesUntilKickoff: alert.minutesUntilKickoff,
      },
      alert.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      'Lineup Alert'
    );
  }

  /**
   * Send log entry to server
   */
  private static async sendToServer(payload: Partial<AppLogEntry>): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      
      const appToken = StorageService.getAppToken();
      
      await fetch('/api/admin/logs/event', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(appToken ? { 'x-app-token': appToken } : {})
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Ignore background network failure to avoid recursive logging loops
    }
  }
}
