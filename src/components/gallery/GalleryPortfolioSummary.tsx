import React, { useMemo } from 'react';
import { Wallet, TrendingUp, Sparkles, Shield, Award, Layers, CheckCircle2, AlertTriangle, Coins } from 'lucide-react';
import { SorareCard } from '../../types';
import { getCardTotalBonus, getPlayerStars } from '../../utils/sorareSlug';

interface GalleryPortfolioSummaryProps {
  cards: SorareCard[];
  favoritesCount: number;
  tagsCount: number;
  onFilterRarity?: (rarity: string) => void;
  onFilterQuick?: (filterType: string) => void;
}

export const GalleryPortfolioSummary: React.FC<GalleryPortfolioSummaryProps> = ({
  cards,
  favoritesCount,
  tagsCount,
  onFilterRarity,
  onFilterQuick,
}) => {
  const stats = useMemo(() => {
    let limitedCount = 0;
    let rareCount = 0;
    let superRareCount = 0;
    let uniqueCount = 0;
    let customCount = 0;

    let inSeasonCount = 0;
    let u23Count = 0;
    let readyStarters = 0;
    let injuredOrDnp = 0;
    let highBonusCount = 0;

    let totalEstimatedEth = 0;

    cards.forEach((card) => {
      const rarity = (card.rarity || 'LIMITED').toUpperCase();
      const bonus = getCardTotalBonus(card);
      const isCurrentSeason = typeof card.seasonYear === 'number' && card.seasonYear >= 2024;
      const isU23 = typeof card.age === 'number' && card.age <= 23;
      const stars = getPlayerStars(card);

      // Floor price approximations based on rarity & star rating
      let baseEth = 0.002; // default limited floor
      if (rarity === 'UNIQUE') {
        uniqueCount++;
        baseEth = 0.45 + (stars * 0.15);
      } else if (rarity === 'SUPER_RARE') {
        superRareCount++;
        baseEth = 0.08 + (stars * 0.04);
      } else if (rarity === 'RARE') {
        rareCount++;
        baseEth = 0.015 + (stars * 0.01);
      } else {
        limitedCount++;
        baseEth = 0.0015 + (stars * 0.002);
      }

      // Bonus boost multiplier
      const bonusMultiplier = 1 + (bonus / 100);
      totalEstimatedEth += baseEth * bonusMultiplier;

      if (isCurrentSeason) inSeasonCount++;
      if (isU23) u23Count++;
      if (card.status === 'STARTER' && card.upcomingFixture) readyStarters++;
      if (card.status === 'NOT_PLAYING' || card.injuryStatus === 'INJURED' || card.injuryStatus === 'SUSPENDED') {
        injuredOrDnp++;
      }
      if (bonus >= 10) highBonusCount++;
    });

    const ethPriceEur = 2800; // estimated conversion
    const totalEur = Math.round(totalEstimatedEth * ethPriceEur);

    return {
      limitedCount,
      rareCount,
      superRareCount,
      uniqueCount,
      inSeasonCount,
      u23Count,
      readyStarters,
      injuredOrDnp,
      highBonusCount,
      totalEstimatedEth: Math.round(totalEstimatedEth * 1000) / 1000,
      totalEur,
    };
  }, [cards]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        
        {/* Left: Financial Valuation & Portefeuille */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-400 shrink-0 shadow-inner">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Valorisation Portefeuille Galerie
              </h3>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-2 py-0.5 rounded-full">
                Floor Estimé
              </span>
            </div>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {stats.totalEstimatedEth.toFixed(3)} ETH
              </span>
              <span className="text-sm font-bold text-slate-400">
                ≈ {stats.totalEur.toLocaleString('fr-FR')} €
              </span>
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                ({cards.length} cartes au total)
              </span>
            </div>
          </div>
        </div>

        {/* Middle: Rarity Breakdown Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onFilterRarity?.('LIMITED')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 hover:bg-amber-900/50 transition text-xs text-amber-300 font-bold"
            title="Filtrer les cartes Limited"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-sm" />
            <span>Limited :</span>
            <span className="text-white font-extrabold">{stats.limitedCount}</span>
          </button>

          {stats.rareCount > 0 && (
            <button
              type="button"
              onClick={() => onFilterRarity?.('RARE')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/40 hover:bg-rose-900/50 transition text-xs text-rose-300 font-bold"
              title="Filtrer les cartes Rare"
            >
              <span className="h-2 w-2 rounded-full bg-rose-500 shadow-sm" />
              <span>Rare :</span>
              <span className="text-white font-extrabold">{stats.rareCount}</span>
            </button>
          )}

          {stats.superRareCount > 0 && (
            <button
              type="button"
              onClick={() => onFilterRarity?.('SUPER_RARE')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/40 hover:bg-blue-900/50 transition text-xs text-blue-300 font-bold"
              title="Filtrer les cartes Super Rare"
            >
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-sm" />
              <span>Super Rare :</span>
              <span className="text-white font-extrabold">{stats.superRareCount}</span>
            </button>
          )}

          {stats.uniqueCount > 0 && (
            <button
              type="button"
              onClick={() => onFilterRarity?.('UNIQUE')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-amber-400/80 hover:bg-slate-900 transition text-xs text-amber-200 font-bold"
              title="Filtrer les cartes Unique"
            >
              <span className="h-2 w-2 rounded-full bg-amber-300 shadow-sm" />
              <span>Unique :</span>
              <span className="text-white font-extrabold">{stats.uniqueCount}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom: Quick Tactical Indicators (Point 4: Filtres 1-clic) */}
      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80">
        {/* 1. Titulaires prêts */}
        <button
          type="button"
          onClick={() => onFilterQuick?.('READY_GW')}
          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 transition text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <span className="block text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 transition">
                Prêts pour la GW
              </span>
              <span className="text-[10px] text-slate-500">Titulaires avec match</span>
            </div>
          </div>
          <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
            {stats.readyStarters}
          </span>
        </button>

        {/* 2. Pépites U23 */}
        <button
          type="button"
          onClick={() => onFilterQuick?.('U23')}
          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 transition text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 font-bold">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <span className="block text-[11px] font-bold text-slate-200 group-hover:text-cyan-400 transition">
                Pépites U23
              </span>
              <span className="text-[10px] text-slate-500">&le; 23 ans éligibles</span>
            </div>
          </div>
          <span className="text-xs font-black text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20">
            {stats.u23Count}
          </span>
        </button>

        {/* 3. In-Season (+5% / +20%) */}
        <button
          type="button"
          onClick={() => onFilterQuick?.('IN_SEASON')}
          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 transition text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 font-bold">
              <Award className="h-4 w-4" />
            </span>
            <div>
              <span className="block text-[11px] font-bold text-slate-200 group-hover:text-amber-300 transition">
                In-Season
              </span>
              <span className="text-[10px] text-slate-500">Cartes 2024+ avec bonus</span>
            </div>
          </div>
          <span className="text-xs font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
            {stats.inSeasonCount}
          </span>
        </button>

        {/* 4. Alertes Infirmerie / DNP */}
        <button
          type="button"
          onClick={() => onFilterQuick?.('INJURED_DNP')}
          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-rose-500/50 transition text-left group"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 font-bold">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <span className="block text-[11px] font-bold text-slate-200 group-hover:text-rose-400 transition">
                Infirmerie & DNP
              </span>
              <span className="text-[10px] text-slate-500">À ne pas aligner</span>
            </div>
          </div>
          <span className="text-xs font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
            {stats.injuredOrDnp}
          </span>
        </button>
      </div>
    </div>
  );
};
