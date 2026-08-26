import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { StorageService } from '../utils/storage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('ErrorBoundary caught error:', error, errorInfo);

    // AUDIT FIX (2.16): this used to only log to the browser console, so a crash in production
    // (where nobody has devtools open) left no trace anywhere. /api/admin/logs/client already
    // exists server-side and is used elsewhere — just wasn't wired up here. Best-effort only:
    // if this fails (e.g. offline), we don't want to throw from inside error handling itself.
    const appToken = typeof window !== 'undefined' ? StorageService.getAppToken() : '';
    fetch('/api/admin/logs/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(appToken ? { 'x-app-token': appToken } : {}),
      },
      body: JSON.stringify({
        message: error.message || 'Unknown React render error',
        error: `${error.stack || error}\n\nComponent stack:${errorInfo.componentStack}`,
      }),
    }).catch(() => { /* best-effort, never throw from an error boundary */ });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100 font-sans">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-emerald-500/30 p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Une erreur inattendue est survenue</h2>
            <p className="text-xs text-slate-400">
              L'application a rencontré un problème d'affichage. Vos cartes et données sauvegardées sont préservées.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-xs shadow-lg transition"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Recharger l'application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

