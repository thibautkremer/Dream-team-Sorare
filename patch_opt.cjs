const fs = require('fs');
let code = fs.readFileSync('src/utils/optimizer.ts', 'utf8');

const oldKeyFunc = `export function getPlayerUniqueKey(card: SorareCard): string {
  return (card.slug || card.displayName || card.id).toLowerCase().trim();
}`;

const newKeyFunc = `export function getPlayerUniqueKey(card: SorareCard): string {
  return (card.playerSlug || card.displayName || card.slug || card.id).toLowerCase().trim();
}`;

const oldSelectFunc = `export function selectPlayerForPosition(
  candidates: ScoreBreakdown[],
  selectedPlayers: SorareCard[],
  ignoreOpponentsConstraint: boolean = false,
  proximityThreshold: number = 4.0
): SorareCard | null {
  if (candidates.length === 0) return null;

  // 1. RÈGLE 1 : Éliminer les candidats qui affrontent un joueur déjà présent dans l'équipe
  let filtered = candidates;
  if (!ignoreOpponentsConstraint && selectedPlayers.length > 0) {
    const nonOpponents = candidates.filter(cand => {
      return !selectedPlayers.some(sel => areOpponents(cand.player, sel));
    });
    // Si au moins une option n'est pas un adversaire, on applique strictement la règle
    if (nonOpponents.length > 0) {
      filtered = nonOpponents;
    }
  }

  if (filtered.length === 0) return null;

  // 2. RÈGLE 2 : Si des joueurs sont proches en terme de score projeté, PRIVILÉGIER les joueurs d'une même équipe
  const topCandidate = filtered[0];
  const topScore = topCandidate.projectedScore;

  // Trouver tous les candidats dont le score est proche du top (écart <= 4 pts)
  const closeCandidates = filtered.filter(cand => (topScore - cand.projectedScore) <= proximityThreshold);

  if (closeCandidates.length > 1 && selectedPlayers.length > 0) {
    // Calculer le nombre de coéquipiers déjà dans l'équipe pour chaque candidat
    const candidateClubScores = closeCandidates.map(cand => {
      const candClub = cand.player.club?.name;
      const teammates = selectedPlayers.filter(sel => isSameClub(sel.club?.name, candClub));
      const teammateCount = teammates.length;
      return {
        cand,
        teammateCount,
        // Score effectif bonifié pour prioriser le stacking même club
        effectiveScore: cand.projectedScore + (teammateCount * 2.0)
      };
    });

    const withTeammates = candidateClubScores.filter(item => item.teammateCount > 0);
    if (withTeammates.length > 0) {
      // Trier par nombre de coéquipiers puis score effectif
      withTeammates.sort((a, b) => b.teammateCount - a.teammateCount || b.effectiveScore - a.effectiveScore);
      return withTeammates[0].cand.player;
    }
  }

  return topCandidate.player;
}`;

const newSelectFunc = `export function selectPlayerForPosition(
  candidates: ScoreBreakdown[],
  selectedPlayers: SorareCard[],
  ignoreOpponentsConstraint: boolean = false,
  proximityThreshold: number = 4.0
): SorareCard | null {
  if (candidates.length === 0) return null;

  // 1. RÈGLE 1 : STRICTE. Éliminer les candidats qui affrontent un joueur déjà présent dans l'équipe
  let filtered = candidates;
  if (!ignoreOpponentsConstraint && selectedPlayers.length > 0) {
    filtered = candidates.filter(cand => {
      return !selectedPlayers.some(sel => areOpponents(cand.player, sel));
    });
  }

  if (filtered.length === 0) return null;

  const topCandidate = filtered[0];
  const topScore = topCandidate.projectedScore;

  // Trouver tous les candidats dont le score est proche du top (écart <= 4 pts)
  const closeCandidates = filtered.filter(cand => (topScore - cand.projectedScore) <= proximityThreshold);

  if (closeCandidates.length > 1) {
    // Évaluer chaque candidat proche
    const evaluated = closeCandidates.map(cand => {
      const candClub = cand.player.club?.name;
      const teammates = selectedPlayers.filter(sel => isSameClub(sel.club?.name, candClub));
      const teammateCount = teammates.length;
      const bonus = cand.player.bonusPercentage || 0;
      
      return {
        cand,
        teammateCount,
        bonus,
        // Le critère principal de score projeté est gardé comme fallback
      };
    });

    evaluated.sort((a, b) => {
      if (b.teammateCount !== a.teammateCount) {
        return b.teammateCount - a.teammateCount; // Privilégier le stacking
      }
      if (b.bonus !== a.bonus) {
        return b.bonus - a.bonus; // Privilégier le plus gros bonus (RÈGLE 3)
      }
      return b.cand.projectedScore - a.cand.projectedScore;
    });

    return evaluated[0].cand.player;
  }

  return topCandidate.player;
}`;

if (code.includes(oldKeyFunc)) {
  code = code.replace(oldKeyFunc, newKeyFunc);
  console.log('patched key');
} else {
  console.log('could not find key');
}

if (code.includes(oldSelectFunc)) {
  code = code.replace(oldSelectFunc, newSelectFunc);
  console.log('patched select');
} else {
  console.log('could not find select');
}

fs.writeFileSync('src/utils/optimizer.ts', code);
