import React from 'react';
import { X, Sparkles, Shield, Crown, CheckCircle2, AlertTriangle, Target, Zap, Award } from 'lucide-react';
import { Lineup } from '../types';

interface LineupAnalysisDrawerProps {
  lineup: Lineup;
  onClose: () => void;
}

export const LineupAnalysisDrawer: React.FC<LineupAnalysisDrawerProps> = ({ lineup, onClose }) => {
  const captain = lineup.slots[lineup.captainSlot];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 sm:p-6 backdrop-blur-sm flex justify-center items-start sm:items-center">
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-5 sm:p-6 shadow-2xl my-4 sm:my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-slate-800 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-black text-white">Rapport Tactique & Justifications IA</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Analyse détaillée de la composition SO5 pour la Game Week {lineup.gameWeek}.
          </p>
        </div>

        {/* Summary Card */}
        <div className="mt-4 rounded-2xl bg-slate-950 p-4 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Stratégie appliquée :</span>
            <span className="rounded-lg bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              {lineup.name}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {lineup.analysis.summary}
          </p>
        </div>

        {/* Captain Breakdown */}
        <div className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-950 to-slate-950 p-4 border border-emerald-500/30">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
              Choix du Capitaine (+20% de bonus SO5)
            </h3>
          </div>
          <p className="text-xs font-bold text-white mt-1">
            {captain?.displayName} ({captain?.club.name})
          </p>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {lineup.analysis.captainReasoning}
          </p>
        </div>

        {/* Tactical roles by position */}
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Rôles & Justifications par Poste :
          </h4>

          <div className="grid grid-cols-1 gap-2 text-xs">
            
            <div className="rounded-xl bg-slate-950/70 p-2.5 border border-slate-800">
              <span className="font-bold text-lime-400">Gardien (GK) : </span>
              <span className="text-slate-300">{lineup.analysis.tacticalPerPosition.gk}</span>
            </div>

            <div className="rounded-xl bg-slate-950/70 p-2.5 border border-slate-800">
              <span className="font-bold text-blue-400">Défenseur (DEF) : </span>
              <span className="text-slate-300">{lineup.analysis.tacticalPerPosition.def}</span>
            </div>

            <div className="rounded-xl bg-slate-950/70 p-2.5 border border-slate-800">
              <span className="font-bold text-emerald-400">Milieu (MID) : </span>
              <span className="text-slate-300">{lineup.analysis.tacticalPerPosition.mid}</span>
            </div>

            <div className="rounded-xl bg-slate-950/70 p-2.5 border border-slate-800">
              <span className="font-bold text-rose-400">Attaquant (FWD) : </span>
              <span className="text-slate-300">{lineup.analysis.tacticalPerPosition.fwd}</span>
            </div>

            <div className="rounded-xl bg-slate-950/70 p-2.5 border border-slate-800">
              <span className="font-bold text-purple-400">Extra (Joker) : </span>
              <span className="text-slate-300">{lineup.analysis.tacticalPerPosition.extra}</span>
            </div>
          </div>
        </div>

        {/* Strengths & Risks */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-emerald-950/20 p-3 border border-emerald-900/40">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Points Forts :
            </span>
            <ul className="space-y-1 text-slate-300 list-disc pl-4">
              {lineup.analysis.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-rose-950/20 p-3 border border-rose-900/40">
            <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="h-4 w-4" />
              Points de Vigilance :
            </span>
            <ul className="space-y-1 text-slate-300 list-disc pl-4">
              {lineup.analysis.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition"
          >
            Fermer le Rapport
          </button>
        </div>

      </div>
    </div>
  );
};
