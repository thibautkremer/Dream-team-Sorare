import React from 'react';
import { Shield, Users, BarChart3, Radio, Sparkles, Terminal, BellRing, Bell } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: 'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin';
  setCurrentTab: (tab: 'pitch' | 'gallery' | 'matchups' | 'live' | 'ai-coach' | 'admin') => void;
  totalCardsCount: number;
  alertsCount: number;
  onOpenStartingXIMonitor?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  totalCardsCount,
  alertsCount,
  onOpenStartingXIMonitor,
}) => {
  const navItems = [
    {
      id: 'pitch' as const,
      label: 'Terrain',
      icon: Shield,
      badge: null,
    },
    {
      id: 'gallery' as const,
      label: 'Galerie',
      icon: Users,
      badge: totalCardsCount > 0 ? `${totalCardsCount}` : null,
    },
    {
      id: 'matchups' as const,
      label: 'Cotes',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'live' as const,
      label: 'Live SO5',
      icon: Radio,
      badge: 'LIVE',
      isLive: true,
    },
    {
      id: 'ai-coach' as const,
      label: 'Coach IA',
      icon: Sparkles,
      badge: null,
    },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Navigation mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.5)] px-2 pt-1.5 pb-safe pb-2"
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2 min-w-[56px] min-h-[46px] rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-emerald-400 font-black'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              {/* Active pill background indicator */}
              {isActive && (
                <span className="absolute inset-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 pointer-events-none" />
              )}

              {/* Icon with potential live ping or badge */}
              <div className="relative">
                <Icon className={`h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110 text-emerald-400' : 'text-slate-400'}`} />
                
                {item.isLive && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}

                {item.badge && !item.isLive && (
                  <span className="absolute -top-1.5 -right-3 rounded-full bg-slate-800 border border-slate-700 px-1 py-0.2 text-[8px] font-black text-slate-300">
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`text-[10px] tracking-tight mt-1 whitespace-nowrap ${isActive ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Compos Alert / Monitor Button or Admin */}
        {alertsCount > 0 ? (
          <button
            onClick={onOpenStartingXIMonitor}
            className="relative flex flex-col items-center justify-center py-1 px-2 min-w-[56px] min-h-[46px] rounded-xl text-rose-400 font-black transition-all animate-pulse bg-rose-950/40 border border-rose-500/50"
            title={`${alertsCount} joueur(s) non-titulaire(s) détecté(s)`}
          >
            <div className="relative">
              <BellRing className="h-5 w-5 text-rose-400" />
              <span className="absolute -top-1 -right-2 rounded-full bg-rose-500 text-slate-950 text-[9px] font-black px-1">
                {alertsCount}
              </span>
            </div>
            <span className="text-[10px] text-rose-300 font-bold mt-1">
              Alerte !
            </span>
          </button>
        ) : (
          <button
            onClick={() => setCurrentTab('admin')}
            className={`relative flex flex-col items-center justify-center py-1 px-2 min-w-[56px] min-h-[46px] rounded-xl transition-all ${
              currentTab === 'admin'
                ? 'text-emerald-400 font-black'
                : 'text-slate-400 hover:text-slate-200 active:scale-95'
            }`}
            title="Administration & Logs"
          >
            {currentTab === 'admin' && (
              <span className="absolute inset-0 rounded-xl bg-emerald-500/10 border border-emerald-500/25 pointer-events-none" />
            )}
            <Terminal className={`h-5 w-5 ${currentTab === 'admin' ? 'scale-110 text-emerald-400' : 'text-slate-400'}`} />
            <span className={`text-[10px] tracking-tight mt-1 ${currentTab === 'admin' ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
              Admin
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
