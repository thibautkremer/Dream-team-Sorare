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
