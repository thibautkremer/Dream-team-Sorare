import React from 'react';
import { SorareCard, StrategyType } from '../types';
import { calculatePlayerProjectedScore } from '../utils/optimizer';
import { formatPositionBadge } from '../utils/sorareSlug';
import { X, TrendingUp, ShieldAlert, Zap, Layers, Sparkles, Award, Calculator, Info, CheckCircle2 } from 'lucide-react';

interface ProjectionBreakdownModalProps {
  card: SorareCard;
  strategy?: StrategyType;
  onClose: () => void;
}

export const ProjectionBreakdownModal: React.FC<ProjectionBreakdownModalProps> = ({
  card,
  strategy = 'BALANCED',
  onClose,
}) => {
  const breakdown = calculatePlayerProjectedScore(card, strategy as StrategyType);
  const posBadge = formatPositionBadge(card.positionCode);
  const fixture = card.upcomingFixture;

  const getStrategyName = (s: StrategyType) => {
    switch (s) {
      case 'PURE_FORM': return 'Pure Forme (75% L5)';
      case 'SAFE_TITULAR': return 'Titulaire Sécurisé (Moyennes lissées)';
      case 'HIGH_CEILING': return 'Plafond Élevé (Potentiel décisif)';
      case 'BALANCED':
      default:
        return 'Équilibrée (50% L5, 35% L15, 15% L40)';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div 
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="relative p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={card.pictureUrl || card.avatarUrl} 
                alt={card.displayName}
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-slate-700 shadow"
              />
              <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 text-[9px] font-black rounded border ${posBadge.bg} ${posBadge.text} ${posBadge.border}`}>
                {posBadge.label}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">{card.displayName}</h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {card.rarity}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {card.club?.name || 'Club'} • {card.league || 'Football'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-200 text-sm">

          {/* Banner Synthèse du Calcul */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-emerald-950/40 to-slate-950 border border-emerald-500/30 shadow-inner flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1.5">
                <Calculator className="w-3.5 h-3.5" />
                <span>Formule du Score Projeté SO5</span>
              </div>
              <div className="text-xs text-slate-300">
                Stratégie : <span className="font-semibold text-amber-300">{getStrategyName(breakdown.strategyUsed)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-emerald-500/40">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block font-semibold">Score de Base</span>
                <span className="text-base font-bold text-slate-200">{breakdown.baseProjectedScore} pts</span>
              </div>
              <span className="text-amber-400 font-bold text-sm">+</span>
              <div className="text-center">
                <span className="text-[10px] text-amber-300 block font-semibold">Bonus ({breakdown.cardBonusPercentage}%)</span>
                <span className="text-base font-bold text-amber-300">+{breakdown.cardBonusScore} pts</span>
              </div>
              <span className="text-emerald-400 font-bold text-sm">=</span>
              <div className="text-center border-l border-slate-800 pl-3">
                <span className="text-[10px] text-emerald-400 block font-bold uppercase">Total Projeté</span>
                <span className="text-lg font-black text-emerald-400">{breakdown.totalProjectedScore} pts</span>
              </div>
            </div>
          </div>

          {/* Section 1 : Forme Récente, Notes Brutes vs Notes Pondérées */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
                <TrendingUp className="w-4 h-4" />
                <span>Étape 1 : Forme & Notes Pondérées (Bonus +{breakdown.cardBonusPercentage}%)</span>
              </div>
              <span className="text-xs font-bold text-slate-300">Base = {breakdown.rawBaseFormScore} pts ➜ Pondérée = {breakdown.boostedBaseFormScore} pts</span>
            </div>

            {/* Tableau comparatif Note Brute vs Note Pondérée avec Bonus */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] font-semibold text-slate-400 block">L5 (5 derniers)</span>
                <div className="my-1">
                  <span className="text-xs text-slate-400 line-through block">{breakdown.l5} pts brut</span>
                  <span className="text-sm font-black text-emerald-400 block">{breakdown.l5Boosted} pts</span>
                </div>
                <span className="text-[9px] text-sky-400 font-bold block">Poids: {Math.round(breakdown.strategyWeights.l5 * 100)}%</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] font-semibold text-slate-400 block">L15 (15 derniers)</span>
                <div className="my-1">
                  <span className="text-xs text-slate-400 line-through block">{breakdown.l15} pts brut</span>
                  <span className="text-sm font-black text-white block">{breakdown.l15Boosted} pts</span>
                </div>
                <span className="text-[9px] text-sky-400 font-bold block">Poids: {Math.round(breakdown.strategyWeights.l15 * 100)}%</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] font-semibold text-slate-400 block">L40 (40 derniers)</span>
                <div className="my-1">
                  <span className="text-xs text-slate-400 line-through block">{breakdown.l40} pts brut</span>
                  <span className="text-sm font-black text-slate-300 block">{breakdown.l40Boosted} pts</span>
                </div>
                <span className="text-[9px] text-sky-400 font-bold block">Poids: {Math.round(breakdown.strategyWeights.l40 * 100)}%</span>
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
              <span>Note de forme pondérée :</span>
              <span className="font-mono text-emerald-300 font-bold text-[11px]">
                ({breakdown.l5Boosted} × {breakdown.strategyWeights.l5}) + ({breakdown.l15Boosted} × {breakdown.strategyWeights.l15}) + ({breakdown.l40Boosted} × {breakdown.strategyWeights.l40}) = {breakdown.boostedBaseFormScore} pts
              </span>
            </div>
          </div>

          {/* Section 2 : Statut & Titularisation */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>Étape 2 : Statut & Maintien de Titularisation</span>
              </div>
              <span className="text-xs font-bold text-indigo-300">x{breakdown.starterFactor} ({breakdown.starterSafety}%)</span>
            </div>

            <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-200 block">Statut du joueur</span>
                <span className="text-[11px] text-indigo-300 font-semibold">{breakdown.starterImpactLabel}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Dernier match joué</span>
                <span className={`text-xs font-bold ${breakdown.playedLastMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {breakdown.playedLastMatch ? `Oui (${breakdown.lastMatchScore} pts)` : 'Non / DNP (-15%)'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3 : Adversaire, FDR & Conditions */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4" />
                <span>Étape 3 : Match, FDR & Bookmakers</span>
              </div>
              <span className="text-xs font-bold text-emerald-300">Coeff x{breakdown.matchupFactor}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <span className="text-slate-400 text-[10px] font-semibold">Match à venir</span>
                <span className="font-bold text-white text-xs mt-1">
                  vs {fixture?.opponent || 'Adversaire'} ({fixture?.isHome ? 'Domicile' : 'Extérieur'})
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold mt-1">{breakdown.matchupImpactLabel}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                <span className="text-slate-400 text-[10px] font-semibold">Bonus Clean Sheet / xG</span>
                <span className="font-bold text-white text-xs mt-1">
                  +{breakdown.cleanSheetFactor} pts Clean Sheet
                </span>
                <span className="text-[10px] text-slate-400 mt-1">Applicable GK & DEF (Cotes Bookmaker)</span>
              </div>
            </div>
          </div>

          {/* Section 4 : Décomposition Complète du Bonus de Carte (API Sorare) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Étape 4 : Décomposition des Bonus de la Carte (API Sorare)</span>
              </div>
              <span className="text-xs font-black text-amber-300">Total : +{breakdown.cardBonusPercentage}%</span>
            </div>

            <p className="text-[11px] text-slate-400">
              L’API Sorare calcule le multiplicateur global via l’attribut <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded font-mono">power: "{breakdown.bonusBreakdown.powerString}"</code>. Voici sa décomposition exacte :
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {/* Bonus Édition */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/20">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Saison / Édition</span>
                <span className="text-base font-black text-amber-300 mt-1 block">+{breakdown.bonusBreakdown.editionBonus}%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block font-medium">
                  {breakdown.bonusBreakdown.editionBonus === 20
                    ? 'Édition Spéciale (+20%)'
                    : breakdown.bonusBreakdown.editionBonus === 5
                    ? 'In-Season Standard (+5%)'
                    : 'Classic Season (+0%)'}
                </span>
              </div>

              {/* Bonus Collection */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/20">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Collection Club</span>
                <span className="text-base font-black text-amber-300 mt-1 block">+{breakdown.bonusBreakdown.collectionBonus}%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Niveau Album Club</span>
              </div>

              {/* Bonus XP & Grade */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/20">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Grade / XP</span>
                <span className="text-base font-black text-amber-300 mt-1 block">+{breakdown.bonusBreakdown.xpGradeBonus}%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Niveau Grade: {card.grade || 0}</span>
              </div>

              {/* Bonus Rareté Base */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/20">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Rareté Base</span>
                <span className="text-base font-black text-amber-300 mt-1 block">+{breakdown.bonusBreakdown.rarityBonus}%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">{card.rarity.toUpperCase()}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
              <span className="font-semibold">Gain attribué par le bonus :</span>
              <span className="font-black text-amber-300 text-sm">+{breakdown.cardBonusScore} pts</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Calculs réactualisés en direct avec l'API Sorare GraphQL</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-colors"
          >
            Compris !
          </button>
        </div>
      </div>
    </div>
  );
};
