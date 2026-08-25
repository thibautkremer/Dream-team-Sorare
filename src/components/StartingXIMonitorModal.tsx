import React from 'react';
import { 
  X, 
  Bell, 
  BellRing, 
  BellOff, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  ShieldAlert, 
  Zap, 
  ArrowRight, 
  Volume2, 
  Shield, 
  Radio, 
  Users 
} from 'lucide-react';
import { SorareCard, Lineup, NonStarterAlert, StartingXIPlayerInfo } from '../types';
import { NotificationService } from '../utils/notifications';
import { formatKickoffDate } from '../utils/optimizer';

interface StartingXIMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: NonStarterAlert[];
  playerStatusMap: Record<string, StartingXIPlayerInfo>;
  compositions: Lineup[];
  isChecking: boolean;
  lastChecked: Date | null;
  onRefresh: () => void;
  permission: NotificationPermission;
  onRequestPermission: () => Promise<NotificationPermission>;
  notificationsEnabled: boolean;
  onToggleNotifications: (enabled: boolean) => void;
  onSelectSlotToSwap: (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onDismissAlert?: (alertId: string) => void;
}

export const StartingXIMonitorModal: React.FC<StartingXIMonitorModalProps> = ({
  isOpen,
  onClose,
  alerts,
  playerStatusMap,
  compositions,
  isChecking,
  lastChecked,
  onRefresh,
  permission,
  onRequestPermission,
  notificationsEnabled,
  onToggleNotifications,
  onSelectSlotToSwap,
  onDismissAlert,
}) => {
  if (!isOpen) return null;

  const hasPermission = permission === 'granted';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <BellRing className="h-5 w-5 animate-pulse" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white ring-2 ring-slate-900">
                  {alerts.length}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Monitoring Compos Officielles & Titulaires</h2>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  <Radio className="h-2.5 w-2.5 animate-ping" />
                  Live 1h avant match
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Détection automatique des feuilles de match Opta et alertes si un joueur n'est pas titulaire
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          
          {/* Notification Permission & Audio Settings Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${hasPermission && notificationsEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                  {hasPermission && notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Notifications Système & Sonores</span>
                    {hasPermission && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                        Activé
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {hasPermission 
                      ? 'Vous recevrez une notification instantanée dès qu\'un joueur sur le banc est détecté.' 
                      : 'Autorisez les notifications de votre navigateur pour être prévenu même quand l\'onglet est réduit.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!hasPermission ? (
                  <button
                    onClick={onRequestPermission}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition shadow-sm"
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    Autoriser les alertes
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => NotificationService.playAlertSound()}
                      title="Tester le signal sonore"
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={notificationsEnabled} 
                        onChange={(e) => onToggleNotifications(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Non-Starter Alerts Section */}
          {alerts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-400 animate-bounce" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Joueurs non-titulaires détectés ({alerts.length})
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">Action requise avant le coup d'envoi</span>
              </div>

              <div className="space-y-2">
                {alerts.map((alert) => {
                  // Find composition index
                  const compoIdx = compositions.findIndex((c) => c.id === alert.lineupId || c.name === alert.lineupName);
                  const effectiveCompoIdx = compoIdx >= 0 ? compoIdx : 0;

                  return (
                    <div 
                      key={alert.id}
                      className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 relative overflow-hidden transition hover:border-rose-500/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img 
                            src={alert.player.pictureUrl || alert.player.avatarUrl} 
                            alt={alert.player.displayName} 
                            className="h-12 w-12 rounded-xl object-contain bg-slate-950 border border-rose-500/30 p-0.5"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">
                                {alert.player.displayName || alert.player.name}
                              </span>
                              <span className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-black text-rose-300">
                                🚨 {alert.statusLabel}
                              </span>
                            </div>
                            <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                              <span className="text-slate-400">Équipe :</span>
                              <strong className="text-emerald-400">{alert.lineupName}</strong>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-300 font-semibold">{alert.slotLabel}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                              <span>{alert.matchSummary}</span>
                              {alert.minutesUntilKickoff !== null && (
                                <span className="text-amber-400 font-semibold">
                                  ⏳ Coup d'envoi dans {alert.minutesUntilKickoff} min
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => {
                              const slotKey = alert.slot.toLowerCase() as 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
                              onSelectSlotToSwap(effectiveCompoIdx, slotKey);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 px-3 py-1.5 text-xs font-bold text-white transition shadow-lg shadow-rose-950/50"
                          >
                            <span>Remplacer</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                          {onDismissAlert && (
                            <button
                              onClick={() => onDismissAlert(alert.id)}
                              className="text-[10px] text-slate-500 hover:text-slate-300 transition"
                            >
                              Ignorer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-400">Toutes les compositions sont sécurisées !</div>
                <p className="text-[11px] text-slate-400">
                  Aucun joueur sur le banc ou absent n'a été détecté dans vos équipes actives.
                </p>
              </div>
            </div>
          )}

          {/* Monitored Players List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Statut des joueurs dans vos compositions
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {lastChecked && (
                  <span className="text-[10px] text-slate-500">
                    Vérifié à {lastChecked.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={onRefresh}
                  disabled={isChecking}
                  title="Rafraîchir les feuilles de match"
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-950/50 border border-emerald-500/30 px-2 py-1 rounded-lg transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
                  <span>Vérifier</span>
                </button>
              </div>
            </div>

            {/* List of compositions & players */}
            <div className="space-y-4">
              {compositions.map((compo, compoIdx) => {
                const slots = compo.slots || {};
                const slotKeys: Array<'gk' | 'def' | 'mid' | 'fwd' | 'extra'> = ['gk', 'def', 'mid', 'fwd', 'extra'];

                return (
                  <div key={compo.id || compoIdx} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-emerald-400" />
                        {compo.name || `Composition ${compoIdx + 1}`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        GW {compo.gameWeek}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {slotKeys.map((slot) => {
                        const player = slots[slot];
                        if (!player) {
                          return (
                            <div key={slot} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800/80 text-slate-600 text-xs">
                              <span className="uppercase font-bold text-[10px]">{slot}</span>
                              <span>Emplacement vide</span>
                            </div>
                          );
                        }

                        const pSlug = (player.playerSlug || player.slug || player.displayName || '').toLowerCase();
                        // Look up in playerStatusMap
                        const info = Object.values(playerStatusMap).find(
                          (i) => i.playerSlug.toLowerCase() === pSlug || i.displayName.toLowerCase() === player.displayName.toLowerCase()
                        );

                        const isStarter = info?.isStarter ?? (player.status === 'STARTER' || player.status === 'CONFIRMED');
                        const isLineupOut = info?.isLineupAnnounced ?? false;
                        const isBench = info?.lineupStatus === 'CONFIRMED_BENCH' || player.status === 'SUBSTITUTE' || player.status === 'BENCH';

                        return (
                          <div 
                            key={slot}
                            className={`flex items-center justify-between p-2 rounded-lg border text-xs transition ${
                              isBench
                                ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                                : isStarter && isLineupOut
                                ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                                : 'bg-slate-900/80 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="uppercase font-black text-[10px] text-slate-500 w-8">
                                {slot}
                              </span>
                              <div className="truncate">
                                <div className="font-bold text-white truncate text-[11px]">
                                  {player.displayName || player.name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {player.club?.name || 'Club'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 pl-2">
                              {isBench ? (
                                <span className="rounded bg-rose-500/20 border border-rose-500/50 px-1.5 py-0.5 text-[9px] font-black text-rose-300">
                                  🚨 Remplaçant
                                </span>
                              ) : isStarter && isLineupOut ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-500/50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                  ⚡ Titulaire Opta
                                </span>
                              ) : (
                                <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                                  ⏳ En attente 1h
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanatory footer */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              Comment fonctionne le système 1h avant match ?
            </div>
            <p>
              Les clubs et Opta publient les compositions officielles entre <strong>60 et 75 minutes avant le coup d'envoi</strong>. L'application interroge en temps réel les feuilles de match officielles. Si un joueur de votre composition n'est pas dans le XI de départ (sur le banc ou hors groupe), une alerte visuelle et une notification push vous permettent de le remplacer immédiatement.
            </p>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-800 px-6 py-3 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Actualisation automatique toutes les 60s
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-1.5 text-xs font-bold text-white transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
