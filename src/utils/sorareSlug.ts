import { SorareCard } from '../types';

/**
 * Nettoyage et normalisation de pseudo utilisateur Sorare
 * Transforme "Thib 8" en "thib-8", supprime les caractères spéciaux, etc.
 */
export function cleanSorareSlug(input: string): string {
  if (!input) return 'thib-8';
  return input
    .trim()
    .toLowerCase()
    // Remplace les espaces et underscores par des tirets
    .replace(/[\s_]+/g, '-')
    // Supprime les caractères non autorisés dans les slugs (ne garde que a-z, 0-9 et -)
    .replace(/[^a-z0-9-]/g, '')
    // Supprime les tirets multiples consécutifs
    .replace(/-+/g, '-')
    // Supprime les tirets au début ou à la fin
    .replace(/^-+|-+$/g, '') || 'thib-8';
}

export function formatPositionBadge(positionCode: string): { label: string; bg: string; text: string; border: string } {
  switch (positionCode) {
    case 'GK':
      return { label: 'G', bg: 'bg-lime-500/15', text: 'text-lime-400', border: 'border-lime-500/30' };
    case 'DEF':
      return { label: 'D', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' };
    case 'MID':
      return { label: 'M', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'FWD':
      return { label: 'A', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' };
    case 'EXTRA':
    default:
      return { label: 'X', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' };
  }
}

export function formatStatusBadge(status: string, confidence: number = 100): { label: string; color: string; desc: string } {
  switch (status) {
    case 'CONFIRMED':
      return {
        label: 'Confirmé (Opta)',
        color: 'text-indigo-400 bg-indigo-950/60 border-indigo-500/30',
        desc: `XI de départ officiel validé (${confidence}%)`
      };
    case 'STARTER':
      return {
        label: 'Titulaire',
        color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30',
        desc: `Titulaire indiscutable (${confidence}% confiance)`
      };
    case 'REGULAR':
      return {
        label: 'Régulier',
        color: 'text-teal-400 bg-teal-950/60 border-teal-500/30',
        desc: `Temps de jeu régulier (${confidence}% confiance)`
      };
    case 'SUPER_SUBSTITUTE':
      return {
        label: 'Super Sub',
        color: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/20',
        desc: 'Entre fréquemment en jeu (20-35 min)'
      };
    case 'SUBSTITUTE':
      return {
        label: 'Remplaçant',
        color: 'text-slate-400 bg-slate-900/60 border-slate-700/30',
        desc: 'Sur le banc de touche'
      };
    case 'NOT_PLAYING':
    default:
      return {
        label: 'Hors Groupe / DNP',
        color: 'text-rose-400 bg-rose-950/60 border-rose-500/30',
        desc: 'Ne joue pas (risque 0 point SO5)'
      };
  }
}

export function formatInjuryBadge(injuryStatus?: string): { icon: string; label: string; color: string; bg: string } | null {
  if (!injuryStatus || injuryStatus === 'FIT') return null;
  const upper = injuryStatus.toUpperCase();
  if (upper === 'INJURED' || upper === 'OUT') {
    return {
      icon: '🚑',
      label: 'Blessé',
      color: 'text-rose-300',
      bg: 'bg-rose-950/80 border-rose-500/40'
    };
  }
  if (upper === 'SUSPENDED') {
    return {
      icon: '🟨',
      label: 'Suspendu',
      color: 'text-amber-300',
      bg: 'bg-amber-950/80 border-amber-500/40'
    };
  }
  if (upper === 'DOUBTFUL' || upper === 'QUESTIONABLE') {
    return {
      icon: '⚠️',
      label: 'Incertain',
      color: 'text-orange-300',
      bg: 'bg-orange-950/80 border-orange-500/40'
    };
  }
  return null;
}

export interface CardBonusBreakdown {
  editionBonus: number;        // Bonus d'Édition / Saison (ex: 5% ou 20%)
  collectionBonus: number;     // Bonus de Collection d'album (ex: 0% à 5%)
  xpGradeBonus: number;        // Bonus Niveau/Grade XP (ex: 0.5% * grade)
  rarityBonus: number;         // Bonus Rareté de base (Rare +10%, Super Rare +20%, Unique +40%)
  totalBonusPercentage: number;// Multiplicateur total de la carte
  powerString: string;         // Ex: "1.230" (depuis l'API Sorare)
  hasInSeasonBonus: boolean;   // Vrai si saison courante (2025/2026)
}

export function getCardBonusBreakdown(card: SorareCard): CardBonusBreakdown {
  const total = getCardTotalBonus(card);
  const powerStr = (1 + total / 100).toFixed(3);
  const isInSeason = card.seasonYear === 2026 || card.seasonYear === 2025;

  let rarityBonus = 0;
  const rarity = (card.rarity || '').toUpperCase();
  if (rarity === 'RARE') rarityBonus = 10;
  else if (rarity === 'SUPER_RARE') rarityBonus = 20;
  else if (rarity === 'UNIQUE') rarityBonus = 40;

  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    const editionBonus = Math.round(((pb.seasonBasisPoints || 0) + (pb.specialEditionCardsBasisPoints || 0)) / 10) / 10;
    const collectionBonus = Math.round((pb.collectionBasisPoints || 0) / 10) / 10;
    const xpGradeBonus = Math.round((pb.xpBasisPoints || 0) / 10) / 10;
    const otherBonus = Math.round((pb.otherBonusBasisPoints || 0) / 10) / 10;

    return {
      editionBonus,
      collectionBonus: Math.max(0, Math.round((collectionBonus + otherBonus) * 10) / 10),
      xpGradeBonus,
      rarityBonus,
      totalBonusPercentage: total,
      powerString: powerStr,
      hasInSeasonBonus: editionBonus > 0,
    };
  }

  let xpGradeBonus = 0;
  if (typeof card.grade === 'number' && card.grade > 0) {
    xpGradeBonus = card.grade * 0.5;
  } else if (typeof card.xp === 'number' && card.xp > 0) {
    xpGradeBonus = Math.min(card.xp / 100, 5);
  }

  // Détermination du bonus d'édition par soustraction / type (y compris pour les cartes communes d'édition spéciale)
  let editionBonus = 0;
  if (rarity === 'COMMON') {
    if (total >= 20) {
      editionBonus = 20; // Édition Spéciale Premium (+20%)
    } else if (total >= 15) {
      editionBonus = 15; // Édition Spéciale Shiny (+15%)
    } else if (total >= 10) {
      editionBonus = 10; // Édition Spéciale Standard (+10%)
    } else if (total >= 5) {
      editionBonus = 5;  // Édition Spéciale Basique (+5%)
    }
  } else {
    if (total >= 20) {
      editionBonus = 20; // Édition Spéciale (+20%)
    } else if (total >= 5 && isInSeason) {
      editionBonus = 5;  // In-Season Standard (+5%)
    }
  }

  // Le solde provient de la collection club
  let collectionBonus = Math.max(0, Math.round((total - editionBonus - xpGradeBonus - rarityBonus) * 10) / 10);

  return {
    editionBonus,
    collectionBonus,
    xpGradeBonus: Math.round(xpGradeBonus * 10) / 10,
    rarityBonus,
    totalBonusPercentage: total,
    powerString: powerStr,
    hasInSeasonBonus: editionBonus > 0,
  };
}

export function getCardTotalBonus(card: SorareCard): number {
  if (typeof card.bonusPercentage === 'number') {
    return card.bonusPercentage;
  }

  if (card.powerBreakdown) {
    const pb = card.powerBreakdown;
    const sumBps = (pb.collectionBasisPoints || 0) +
                   (pb.seasonBasisPoints || 0) +
                   (pb.specialEditionCardsBasisPoints || 0) +
                   (pb.xpBasisPoints || 0) +
                   (pb.otherBonusBasisPoints || 0);
    return Math.round((sumBps / 100) * 10) / 10;
  }

  if (card.power) {
    const p = parseFloat(card.power);
    if (!isNaN(p) && p >= 1.0) {
      return Math.round((p - 1.0) * 100 * 10) / 10;
    }
  }

  return 0;
}

/**
 * Calcule dynamiquement les étoiles d'un joueur (de 1 à 5) selon sa note L15.
 * Représente la qualité/tier réel du joueur sur Sorare.
 */
export function getPlayerStars(card: SorareCard): number {
  const l15 = card.scores?.l15 || card.scores?.l5 || 0;
  if (l15 >= 60) return 5;
  if (l15 >= 50) return 4;
  if (l15 >= 40) return 3;
  if (l15 >= 30) return 2;
  return 1;
}

