import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Sparkles, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Clock, Activity, Search, ExternalLink, Filter, ChevronRight, X } from 'lucide-react';

interface ApiLog {
  id: string;
  timestamp: string;
  description: string;
  service: 'Sorare API' | 'Gemini AI';
  method: string;
  status: 'SUCCESS' | 'ERROR' | 'RATE_LIMITED' | 'INFO';
  statusCode: number;
  durationMs: number;
  requestSummary: any;
  responseSummary: any;
  error?: string;
}

export const AdminPage: React.FC = () => {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterService, setFilterService] = useState<'ALL' | 'Sorare API' | 'Gemini AI'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(window.location.origin + '/api/admin/logs');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error('Failed to fetch admin logs', e);
      // alert(`Failed to fetch admin logs: ${e}`); // Using alert might be better for user to see, but console.error is better for debug
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // auto refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleClearLogs = async () => {
    try {
      await fetch('/api/admin/logs/clear', { method: 'POST' });
      setLogs([]);
      setSelectedLog(null);
    } catch (e) {
      console.error('Failed to clear logs', e);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filterService !== 'ALL' && log.service !== filterService) return false;
    if (filterStatus === 'SUCCESS' && log.status !== 'SUCCESS') return false;
    if (filterStatus === 'ERROR' && log.status === 'SUCCESS') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMethod = log.method.toLowerCase().includes(q);
      const matchService = log.service.toLowerCase().includes(q);
      const matchError = log.error?.toLowerCase().includes(q) || false;
      const matchDescription = log.description?.toLowerCase().includes(q) || false;
      return matchMethod || matchService || matchError || matchDescription;
    }
    return true;
  });

  const totalCalls = logs.length;
  const sorareCalls = logs.filter(l => l.service === 'Sorare API').length;
  const geminiCalls = logs.filter(l => l.service === 'Gemini AI').length;
  const errorCalls = logs.filter(l => l.status === 'ERROR' || l.status === 'RATE_LIMITED').length;
  const avgDuration = totalCalls > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.durationMs || 0), 0) / totalCalls) : 0;

  return (
    <div className="min-h-screen bg-slate-950 pb-16 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Terminal className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">Console Admin & API Monitor</h1>
                <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-400">
                  Live Stream
                </span>
              </div>
              <p className="text-sm text-slate-400">Suivi en temps réel de toutes les communications backend avec l'API Sorare (GraphQL) et l'IA Gemini.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Rafraîchir</span>
            </button>
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 hover:border-rose-500/50 transition shadow-sm"
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
              <span>Effacer la console</span>
            </button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Appels</span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-white">{totalCalls}</div>
            <div className="mt-1 text-[11px] text-slate-400">En mémoire tampon</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Sorare API</span>
              <Shield className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-400">{sorareCalls}</div>
            <div className="mt-1 text-[11px] text-slate-400">Requêtes GraphQL</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Gemini AI</span>
              <Sparkles className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-cyan-400">{geminiCalls}</div>
            <div className="mt-1 text-[11px] text-slate-400">Inférences LLM</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Erreurs / 429</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-rose-400">{errorCalls}</div>
            <div className="mt-1 text-[11px] text-slate-400">Échecs ou rate-limit</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Latence Moyenne</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-amber-400">{avgDuration} ms</div>
            <div className="mt-1 text-[11px] text-slate-400">Temps de réponse</div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-bold text-slate-400 uppercase mr-2 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Service:
            </span>
            {(['ALL', 'Sorare API', 'Gemini AI'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterService(s)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  filterService === s
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {s === 'ALL' ? 'Tous les services' : s}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-800 mx-2 hidden sm:block"></div>

            {(['ALL', 'SUCCESS', 'ERROR'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  filterStatus === st
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {st === 'ALL' ? 'Tous statuts' : st === 'SUCCESS' ? 'Succès (200)' : 'Erreurs'}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer par méthode ou erreur..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Logs Table / Terminal Stream */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl backdrop-blur-md">
          <div className="border-b border-slate-800 bg-slate-950/80 px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">Flux des Communications en Direct ({filteredLogs.length})</span>
            </div>
            <span className="text-[11px] text-slate-500">Cliquez sur une ligne pour inspecter les payloads JSON</span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="py-20 text-center">
              <Terminal className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-300">Aucun journal d'appel pour le moment</p>
              <p className="mt-1 text-xs text-slate-500">Effectuez une synchronisation Sorare ou utilisez le Coach IA pour générer des communications.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/40 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Service</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Action / Méthode</th>
                    <th className="px-6 py-3">Statut</th>
                    <th className="px-6 py-3">Durée</th>
                    <th className="px-6 py-3 text-right">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
                  {filteredLogs.map((log) => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any);
                    const isSorare = log.service === 'Sorare API';
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="group hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{timeStr}</td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                            isSorare
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                          }`}>
                            {isSorare ? <Shield className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                            <span>{log.service}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3 font-medium text-slate-200">
                          {log.description}
                        </td>
                        <td className="px-6 py-3 font-semibold text-white max-w-xs truncate" title={log.method}>
                          {log.method}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {log.status === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> 200 OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-bold" title={log.error}>
                              <AlertTriangle className="h-3.5 w-3.5" /> {log.statusCode || 'Erreur'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                          {log.durationMs} ms
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button className="rounded-lg p-1 text-slate-400 group-hover:text-white group-hover:bg-slate-700 transition">
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal for Inspecting Request / Response Payload */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
              
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${
                    selectedLog.service === 'Sorare API'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  }`}>
                    {selectedLog.service === 'Sorare API' ? <Shield className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span>{selectedLog.service}</span>
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white font-mono">{selectedLog.method}</h3>
                    <p className="text-[11px] text-slate-400">{new Date(selectedLog.timestamp).toLocaleString()} • {selectedLog.durationMs} ms</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs">
                
                {/* Status & Error if any */}
                {selectedLog.error && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-rose-300">
                    <span className="font-bold">Erreur rencontrée :</span> {selectedLog.error}
                  </div>
                )}

                {/* Request Payload */}
                <div>
                  <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wider mb-2">Requête / Payload envoyé</h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-emerald-400 overflow-x-auto max-h-60">
                    <pre>{JSON.stringify(selectedLog.requestSummary, null, 2)}</pre>
                  </div>
                </div>

                {/* Response Payload */}
                <div>
                  <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wider mb-2">Réponse reçue / Résultat</h4>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-cyan-300 overflow-x-auto max-h-80">
                    <pre>{JSON.stringify(selectedLog.responseSummary, null, 2)}</pre>
                  </div>
                </div>

              </div>

              <div className="border-t border-slate-800 bg-slate-950 px-6 py-3.5 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                >
                  Fermer
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
