import React, { useState, useEffect } from 'react';
import { SorareCard, StrategyType } from '../types';
import { calculatePlayerProjectedScore } from '../utils/optimizer';
import { formatPositionBadge } from '../utils/sorareSlug';
import { X, TrendingUp, ShieldAlert, Zap, Layers, Sparkles, Award, Calculator, Info, CheckCircle2 } from 'lucide-react';

interface ProjectionBreakdownModalProps {
  card: SorareCard;
  strategy?: StrategyType;
  allGalleryCards?: SorareCard[];
  onUpdateCard?: (updatedCard: SorareCard) => void;
  onClose: () => void;
}

export const ProjectionBreakdownModal: React.FC<ProjectionBreakdownModalProps> = ({
  card,
  strategy = 'BALANCED',
  allGalleryCards = [],
  onUpdateCard,
  onClose,
}) => {
  const [currentCard, setCurrentCard] = useState<SorareCard>(card);
  const breakdown = calculatePlayerProjectedScore(currentCard, strategy as StrategyType, allGalleryCards);
  const posBadge = formatPositionBadge(currentCard.positionCode);
  const fixture = currentCard.upcomingFixture;
  const [apiData, setApiData] = useState<any>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [isEditingBonus, setIsEditingBonus] = useState(false);
  const [customBonusInput, setCustomBonusInput] = useState<string>(
    currentCard.customBonusPercentage !== undefined ? String(currentCard.customBonusPercentage) : String(breakdown.cardBonusPercentage)
  );

  const handleApplyBonus = (val: number) => {
    const updated = {
      ...currentCard,
      customBonusPercentage: val,
      bonusPercentage: val
    };
    setCurrentCard(updated);
    if (onUpdateCard) {
      onUpdateCard(updated);
    }
  };

  const handleResetBonus = () => {
    const updated = {
      ...currentCard,
      customBonusPercentage: undefined
    };
    setCurrentCard(updated);
    if (onUpdateCard) {
      onUpdateCard(updated);
    }
  };

  useEffect(() => {
    if (fixture?.opponent) {
      setLoadingApi(true);
      // Appel vers le proxy backend
      // On cherche l'équipe pour obtenir son ID
      fetch(`/api/football/team?name=${encodeURIComponent(card.club?.name || '')}`)
        .then(r => r.json())
        .then(teamRes => {
          if (teamRes.success && teamRes.team?.id) {
             return fetch(`/api/football/fixture/upcoming?teamId=${teamRes.team.id}`);
          }
          throw new Error('Team not found');
        })
        .then(r => r.json())
        .then(fixtureRes => {
          if (fixtureRes.success && fixtureRes.fixture?.fixture?.id) {
             const fixtureId = fixtureRes.fixture.fixture.id;
             // On fetch les odds et predictions
             Promise.all([
               fetch(`/api/football/odds?fixtureId=${fixtureId}`).then(r=>r.json()),
               fetch(`/api/football/predictions?fixtureId=${fixtureId}`).then(r=>r.json())
             ]).then(([oddsRes, predRes]) => {
                setApiData({
                   odds: oddsRes.odds,
                   predictions: predRes.predictions
                });
                setLoadingApi(false);
             });
          } else {
             setLoadingApi(false);
          }
        })
        .catch(err => {
          console.error("API Football error:", err);
          setLoadingApi(false);
        });
    }
  }, [card.club?.name, fixture?.opponent]);

  const getStrategyName = (s: StrategyType) => {
    switch (s) {
      case 'PURE_FORM': return 'Forme Pure (L5: 75% | L15: 20% | L40: 5%)';
      case 'SAFE_TITULAR': return 'Titulaires Sûrs (L5: 35% | L15: 40% | L40: 25%)';
      case 'HIGH_CEILING': return 'Haut Plafond (L5: 60% | L15: 30% | L40: 10%)';
      case 'BALANCED':
      default:
        return 'Équilibrée (L5: 50% | L15: 35% | L40: 15%)';
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
                <span className="text-[10px] text-slate-400 block font-semibold">Base + Bonus</span>
                <span className="text-base font-bold text-slate-200">{breakdown.totalProjectedScore} pts</span>
              </div>
              <span className="text-emerald-400 font-bold text-sm">➜</span>
              <div className="text-center border-l border-slate-800 pl-3">
                <span className="text-[10px] text-emerald-400 block font-bold uppercase">Fourchette Projetée</span>
                <span className="text-lg font-black text-emerald-400">{breakdown.projectedFloor} - {breakdown.projectedCeiling} pts</span>
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

            <div className="text-xs text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span>Note de forme pondérée :</span>
                <span className="font-mono text-emerald-300 font-bold text-[11px]">
                  ({breakdown.l5Boosted} × {breakdown.strategyWeights.l5}) + ({breakdown.l15Boosted} × {breakdown.strategyWeights.l15}) + ({breakdown.l40Boosted} × {breakdown.strategyWeights.l40}) = {Math.round((breakdown.boostedBaseFormScore + breakdown.regressionPenalty) * 10) / 10} pts
                </span>
              </div>
              {breakdown.regressionPenalty > 0 && (
                <div className="flex items-center justify-between text-rose-400 font-semibold border-t border-slate-800 pt-1.5 mt-0.5">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 rotate-180" />
                    Régression vers la moyenne (L5 vs L40) :
                  </span>
                  <span>-{breakdown.regressionPenalty} pts</span>
                </div>
              )}
              {breakdown.filterLabel && (
                <div className="flex items-center justify-between text-indigo-400 font-semibold border-t border-slate-800 pt-1.5 mt-0.5">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                    Filtre d'historique :
                  </span>
                  <span className="text-[11px] text-indigo-300 font-medium">{breakdown.filterLabel}</span>
                </div>
              )}
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
                <span className="text-slate-400 text-[10px] font-semibold">Bonus contextuels & Game State</span>
                <div className="mt-1 space-y-1">
                  {breakdown.cleanSheetFactor > 0 && (
                    <span className="font-bold text-white text-[11px] block">
                      +{breakdown.cleanSheetFactor} pts Clean Sheet
                    </span>
                  )}
                  {breakdown.bookmakerActionBonus > 0 && (
                    <span className="font-bold text-sky-400 text-[11px] block">
                      +{breakdown.bookmakerActionBonus} pts Buteur/Passeur
                    </span>
                  )}
                  
                  {breakdown.advancedStatsBonus && breakdown.advancedStatsBonus > 0 ? (
                    <span className="font-bold text-emerald-400 text-[11px] block">
                      +{breakdown.advancedStatsBonus} pts (Régression xG/xA)
                      <span className="text-[9px] font-normal ml-1 block text-slate-400 italic">🎯 Forte production attendue</span>
                    </span>
                  ) : null}
                  {breakdown.weatherBonus !== 0 && (
                    <span className={`font-bold ${breakdown.weatherBonus > 0 ? 'text-emerald-400' : 'text-rose-400'} text-[11px] block`}>
                      {breakdown.weatherBonus > 0 ? '+' : ''}{breakdown.weatherBonus} pts Météo
                      {breakdown.weatherImpactLabel && <span className="text-[9px] font-normal ml-1 block text-slate-400 italic">🌧️ {breakdown.weatherImpactLabel}</span>}
                    </span>
                  )}
                  {breakdown.contextualBonus !== 0 && (
                    <span className={`font-bold ${breakdown.contextualBonus > 0 ? 'text-emerald-400' : 'text-rose-400'} text-[11px] block`}>
                      {breakdown.contextualBonus > 0 ? '+' : ''}{breakdown.contextualBonus} pts (Context)
                      {breakdown.contextualImpactLabel && <span className="text-[9px] font-normal ml-1 block text-slate-400 italic">{breakdown.contextualImpactLabel}</span>}
                    </span>
                  )}
                  {breakdown.cleanSheetFactor === 0 && breakdown.bookmakerActionBonus === 0 && breakdown.contextualBonus === 0 && (
                    <span className="text-slate-500 italic text-[10px]">Aucun bonus additionnel</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Impact des absents et du scénario de match</span>
              </div>
            </div>
          </div>

          {/* Section 4: Volatility & Reliant Type */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Layers className="w-4 h-4" />
                <span>Analyse de Volatilité & Profil de Score</span>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                breakdown.volatilityRating === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                breakdown.volatilityRating === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {breakdown.volatilityRating === 'HIGH' ? 'VOLATILITÉ HAUTE' : breakdown.volatilityRating === 'MEDIUM' ? 'VOLATILITÉ MODÉRÉE' : 'VOLATILITÉ FAIBLE'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${
                  breakdown.reliantType === 'AA_RELIANT' ? 'border-sky-500/50 bg-sky-500/10' :
                  breakdown.reliantType === 'DECISIVE_RELIANT' ? 'border-rose-500/50 bg-rose-500/10' :
                  'border-slate-500/50 bg-slate-500/10'
                }`}>
                  {breakdown.reliantType === 'AA_RELIANT' ? <Zap className="w-5 h-5 text-sky-400" /> :
                   breakdown.reliantType === 'DECISIVE_RELIANT' ? <Award className="w-5 h-5 text-rose-400" /> :
                   <Info className="w-5 h-5 text-slate-400" />}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">TYPE DE JOUEUR</span>
                  <span className="text-xs font-black text-white">
                    {breakdown.reliantType === 'AA_RELIANT' ? 'AA-RELIANT (Stable)' :
                     breakdown.reliantType === 'DECISIVE_RELIANT' ? 'DECISIVE-RELIANT (Volatil)' :
                     'PROFIL ÉQUILIBRÉ'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Confidence Range</span>
                  <span className="text-[9px] font-bold text-emerald-400">-{Math.round(breakdown.projectedScore - breakdown.projectedFloor)} / +{Math.round(breakdown.projectedCeiling - breakdown.projectedScore)} pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-400">{breakdown.projectedFloor}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex relative">
                    {/* Visual bar centered on the projected score */}
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/40"
                      style={{
                        left: `${((breakdown.projectedFloor - breakdown.projectedFloor) / (breakdown.projectedCeiling - breakdown.projectedFloor)) * 100}%`,
                        right: '0%'
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_white] z-10"
                      style={{ left: `${((breakdown.projectedScore - breakdown.projectedFloor) / (breakdown.projectedCeiling - breakdown.projectedFloor)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-slate-400">{breakdown.projectedCeiling}</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed italic">
              * La fourchette représente l'écart probable entre un match "sans action décisive" et un match avec un impact majeur, ajusté selon le volume d'All-Around historique du joueur.
            </p>
          </div>

          {/* Section 5 : Décomposition Complète du Bonus de Carte (API Sorare) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Étape 4 : Décomposition des Bonus de la Carte (API Sorare)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-300">Total : +{breakdown.cardBonusPercentage}%</span>
                {onUpdateCard && (
                  <button
                    onClick={() => setIsEditingBonus(!isEditingBonus)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition"
                  >
                    {isEditingBonus ? 'Fermer' : 'Ajuster'}
                  </button>
                )}
              </div>
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
                  {breakdown.bonusBreakdown.editionBonus >= 20
                    ? 'In-Season / Spéciale (+20%)'
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
                <span className="text-[9px] text-slate-400 mt-0.5 block">Niveau Grade: {currentCard.grade || 0}</span>
              </div>

              {/* Bonus Rareté Base */}
              <div className="p-2.5 rounded-xl bg-slate-900 border border-amber-500/20">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Rareté Base</span>
                <span className="text-base font-black text-amber-300 mt-1 block">+{breakdown.bonusBreakdown.rarityBonus}%</span>
                <span className="text-[9px] text-slate-400 mt-0.5 block">{currentCard.rarity?.toUpperCase()}</span>
              </div>
            </div>

            {/* Interactive Bonus Adjuster Panel */}
            {isEditingBonus && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span>Ajuster manuellement le bonus total de la carte :</span>
                  {currentCard.customBonusPercentage !== undefined && (
                    <button
                      onClick={handleResetBonus}
                      className="text-[10px] text-slate-400 hover:text-amber-300 underline"
                    >
                      Réinitialiser calcul auto
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[0, 5, 10, 15, 20, 25, 30].map(val => (
                    <button
                      key={val}
                      onClick={() => {
                        handleApplyBonus(val);
                        setCustomBonusInput(String(val));
                      }}
                      className={`px-2.5 py-1 text-xs font-black rounded-lg border transition ${
                        breakdown.cardBonusPercentage === val
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      +{val}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={customBonusInput}
                    onChange={(e) => setCustomBonusInput(e.target.value)}
                    className="w-24 px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                    placeholder="ex: 20"
                  />
                  <button
                    onClick={() => {
                      const num = parseFloat(customBonusInput);
                      if (!isNaN(num) && num >= 0) {
                        handleApplyBonus(num);
                      }
                    }}
                    className="px-3 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded transition"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            )}

            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
              <span className="font-semibold">Gain attribué par le bonus :</span>
              <span className="font-black text-amber-300 text-sm">+{breakdown.cardBonusScore} pts</span>
            </div>
          </div>

        </div>


        {/* --- API FOOTBALL INTELLIGENCE --- */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-indigo-400" />
            <h4 className="text-sm font-bold text-slate-200">Intelligence API-Football (Live Data)</h4>
          </div>
          
          {loadingApi ? (
            <div className="text-xs text-slate-400 animate-pulse flex items-center gap-2">
               <div className="w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
               Interrogation des bookmakers et des datas en cours...
            </div>
          ) : apiData ? (
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Victoire Attendue</span>
                   <span className="text-sm font-bold text-emerald-400">{apiData.predictions?.predictions?.percent?.home || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Cote Buteur</span>
                   <span className="text-sm font-bold text-indigo-400">{apiData.odds?.bookmakers?.[0]?.bets?.find((b:any) => b.name === 'Anytime Goalscorer')?.values?.[0]?.odd || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Buts Attendus (Equipe)</span>
                   <span className="text-sm font-bold text-amber-400">{apiData.predictions?.predictions?.goals?.home || 'N/A'}</span>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col">
                   <span className="text-[10px] text-slate-500 font-bold uppercase">Système de jeu</span>
                   <span className="text-sm font-bold text-slate-300">{apiData.predictions?.teams?.home?.last_5?.form || '4-3-3'}</span>
                </div>
             </div>
          ) : (
            <div className="text-xs text-slate-500 italic flex items-center justify-between">
              <span>La clé API n'est pas renseignée ou aucune donnée trouvée.</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">Simulation Active</span>
            </div>
          )}
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
