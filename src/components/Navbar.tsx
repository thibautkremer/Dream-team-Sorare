import React, { useState } from 'react';
import { Shield, RefreshCw, Sparkles, Trophy, Users, BarChart3, Clock, Wifi, WifiOff, CheckCircle2, Link2, ExternalLink, Key, Check, Info, Terminal, Radio } from 'lucide-react';
import { GameWeekInfo } from '../types';
import { StorageService, SorareUserMeta } from '../utils/storage';

interface NavbarProps {
  currentTab: 'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin';
  setCurrentTab: (tab: 'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin') => void;
  username: string;
  setUsername: (name: string) => void;
  gameWeek: GameWeekInfo;
  isSyncing: boolean;
  onSync: (customName?: string) => void;
  isOnline: boolean;
  lastSynced: string | null;
  totalCardsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  username,
  setUsername,
  gameWeek,
  isSyncing,
  onSync,
  isOnline,
  lastSynced,
  totalCardsCount,
}) => {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [tempUsername, setTempUsername] = useState(username);
  const [apiKeyInput, setApiKeyInput] = useState(StorageService.getApiKey());
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const userMeta: SorareUserMeta = StorageService.getUserMeta();

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempUsername.trim()) {
      setUsername(tempUsername.trim());
      StorageService.saveApiKey(apiKeyInput.trim());
      setIsAccountModalOpen(false);
      onSync(tempUsername.trim());
    }
  };

  const handleSaveApiKeyOnly = () => {
    StorageService.saveApiKey(apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2500);
  };

  const formattedLastSync = lastSynced
    ? new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-400 to-lime-400 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Trophy className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-white">TEAM SORARE</span>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-400 uppercase">
                SO5 Free Tier
              </span>
            </div>
            <p className="text-xs text-slate-400">Optimiseur & IA Prédictive</p>
          </div>
        </div>

        {/* User Account & Sync Control */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Sorare Official Linked Badge */}
          <button
            onClick={() => {
              setTempUsername(username);
              setIsAccountModalOpen(true);
            }}
            title="Gérer le compte Sorare lié"
            className="group flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-xs text-slate-200 transition-all hover:border-emerald-500/60 hover:bg-emerald-950/50 shadow-sm"
          >
            <div className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs border border-emerald-500/40">
              <Link2 className="h-3.5 w-3.5" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <div className="text-left hidden xs:block">
              <div className="flex items-center gap-1">
                <span className="font-bold text-white group-hover:text-emerald-300">{username}</span>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1 rounded">Lié</span>
              </div>
              <span className="text-[10px] text-slate-400">{userMeta.clubName || 'Thib 8 FC'} • {totalCardsCount} cartes</span>
            </div>
          </button>

          {/* Sync Button */}
          <button
            onClick={() => onSync()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:bg-slate-800 hover:text-white disabled:opacity-60 shadow-sm"
            title="Synchroniser avec Sorare GraphQL"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sync...' : 'Sync Sorare'}</span>
          </button>

          {/* Network indicator */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-400">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400" title="Connecté à l'API">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="hidden md:inline font-medium">API Sorare</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-emerald-500" title="Mode Hors-Ligne actif">
                <WifiOff className="h-3 w-3" />
                <span className="hidden md:inline font-medium">Hors-Ligne</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-bar */}
      <div className="border-t border-slate-800/60 bg-slate-950/60 px-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between overflow-x-auto py-1 scrollbar-none">
          <nav className="flex space-x-1 sm:space-x-2">
            
            <button
              onClick={() => setCurrentTab('pitch')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'pitch'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Terrain SO5</span>
            </button>

            <button
              onClick={() => setCurrentTab('gallery')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'gallery'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Galerie Cartes ({totalCardsCount} réelles)</span>
            </button>

            <button
              onClick={() => setCurrentTab('matchups')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'matchups'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Cotes & Bookmakers</span>
            </button>

            <button
              onClick={() => setCurrentTab('live')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'live'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Scoring SO5</span>
            </button>

            <button
              onClick={() => setCurrentTab('ai-coach')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'ai-coach'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Coach IA Gemini</span>
            </button>

            <button
              onClick={() => setCurrentTab('admin')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                currentTab === 'admin'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>Admin & Console</span>
            </button>
          </nav>

          {/* Game Week Tag & Sync Timestamp */}
          <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 pl-4">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-300">{gameWeek.label}</span>
            {formattedLastSync && (
              <span className="text-slate-500">• Sync à {formattedLastSync}</span>
            )}
          </div>
        </div>
      </div>

      {/* Sorare Account Management Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Compte Sorare Officiel</h3>
                  <p className="text-xs text-emerald-400 font-medium">Synchronisation directe GraphQL en direct</p>
                </div>
              </div>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Current Connected Info Box */}
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{username}</span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/40">
                      VRAIES CARTES SYNCHRONISÉES
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">Club : <span className="font-semibold text-white">{userMeta.clubName || 'Thib 8 FC'}</span></p>
                  <p className="text-xs text-slate-400">Slug API : <code className="text-emerald-400">thib-8</code></p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400">{totalCardsCount}</div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Cartes chargées</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-300 border-t border-emerald-500/20 pt-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Connecté à l'API publique Sorare (https://api.sorare.com/graphql)</span>
              </div>
            </div>

            {/* Form to change / re-sync */}
            <form onSubmit={handleSaveAccount} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300">
                  Nom d'utilisateur Sorare
                </label>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  placeholder="Ex: Thib 8"
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Recherche automatique du profil et des cartes Sorare associées.
                </p>
              </div>

              {/* Optional Sorare API Key for high rate-limits */}
              <div>
                <label className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Clé API Sorare (Optionnel)</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-500">Pour lever les limites de requêtes</span>
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Optionnel : Clé API développeur Sorare"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKeyOnly}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                  >
                    {apiKeySaved ? <Check className="h-4 w-4 text-emerald-400" /> : 'Sauvegarder'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-300">
                  <Info className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Mode Gratuit Sorare (Common Tier)</span>
                </div>
                <p>
                  Toutes tes cartes gratuites sont automatiquement récupérées avec leurs notes SO5 réelles (L5, L15, L40), statuts de titulaires et calendriers.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition active:scale-95 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Synchronisation...' : 'Synchroniser mes vraies cartes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
