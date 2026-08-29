const fs = require('fs');
const content = fs.readFileSync('src/utils/optimizer.ts', 'utf-8');

const startPattern = "// 1. Calcul des probabilités de présence sur le terrain (EV Minutes)";
const endPattern = "projected += scoringFocusBonus;";

const startIndex = content.indexOf(startPattern);
const endIndex = content.indexOf(endPattern, startIndex) + endPattern.length;

if (startIndex !== -1 && endIndex !== -1) {
  const newLogic = `// 1. Calcul des probabilités de présence sur le terrain (EV Minutes)
  let pStarter = 0;
  let pSub = 0;
  let pDnp = 0;
  let starterImpactLabel = '';

  const titularizationPct = (card as any).titularizationPercentage ?? (card.starterConfidence ?? 0);
  pStarter = Math.max(0, Math.min(100, titularizationPct)) / 100;

  if (playerStatus === 'STARTER') {
    pStarter = Math.max(pStarter, 0.85);
    pSub = (1 - pStarter) * 0.5;
    starterImpactLabel = 'Titulaire garanti (Probable Starter)';
  } else if (playerStatus === 'REGULAR') {
    pStarter = Math.max(pStarter, 0.65);
    pSub = Math.max(0.15, (1 - pStarter) * 0.6);
    starterImpactLabel = 'Joueur régulier (Rotation possible)';
  } else if (playerStatus === 'SUPER_SUBSTITUTE') {
    pStarter = Math.min(pStarter, 0.35);
    pSub = Math.max(0.50, (1 - pStarter) * 0.8);
    starterImpactLabel = 'Super Sub (Impact en sortie de banc)';
  } else if (playerStatus === 'SUBSTITUTE' || playerStatus === 'BENCH') {
    pStarter = Math.min(pStarter, 0.15);
    pSub = Math.max(0.30, (1 - pStarter) * 0.5);
    starterImpactLabel = 'Remplaçant (Entrée incertaine)';
  } else {
    pStarter = Math.min(pStarter, 0.05);
    pSub = 0.10;
    starterImpactLabel = 'Non régulier / Réserviste';
  }

  pDnp = 1 - pStarter - pSub;

  if (card.injuryStatus === 'DOUBTFUL') {
    pStarter *= 0.40;
    pSub *= 0.60;
    pDnp = 1 - pStarter - pSub;
    starterImpactLabel += ' • Douteux (-40% temps)';
  } else if (card.injuryStatus === 'QUESTIONABLE') {
    pStarter *= 0.70;
    pSub *= 0.80;
    pDnp = 1 - pStarter - pSub;
    starterImpactLabel += ' • Incertain (-20% temps)';
  }

  const recentMatchDetail = card.scores?.recentMatches?.[0];
  const wasSubInLastMatch = recentMatchDetail 
    ? (recentMatchDetail.isSub === true || recentMatchDetail.baseScore === 25 || (recentMatchDetail.minsPlayed != null && recentMatchDetail.minsPlayed > 0 && recentMatchDetail.minsPlayed < 60))
    : (card.status === 'SUPER_SUBSTITUTE' || card.status === 'SUBSTITUTE' || card.status === 'BENCH');

  if (recentStats.playedLastMatch && wasSubInLastMatch) {
    pStarter *= 0.90;
    pSub *= 1.10;
    starterImpactLabel += ' • Entré en jeu / Remplaçant récemment';
  }

  const hasChangedClub = isPlayerNewTransfer(card);
  if (hasChangedClub) {
    pStarter *= 0.85;
    starterImpactLabel += \` • Adaptation nouveau club (-15%)\`;
  }

  // --- NOUVEAUTÉ : Rotation Risk & Fixture Congestion ---
  // Simulation: si l5 > l15 (joue beaucoup récemment) et l5 > 50, risque de repos.
  // Dans un cas réel, on utiliserait la distance en jours avec le dernier match.
  const isHighRotationRisk = card.scores && (card.scores.l5 > card.scores.l15 + 10) && card.scores.l5 > 55 && pStarter > 0.6;
  if (isHighRotationRisk) {
    pStarter *= 0.80;
    pSub += (1 - pStarter) * 0.3; // Augmente les chances de rentrer en fin de match
    starterImpactLabel += ' • Risque de Rotation (Calendrier chargé)';
  }

  // starterFactor corresponds historically to volume/safety multiplier for UI feedback
  let starterFactor = (pStarter * 1.0) + (pSub * 0.35); 

  // 2. Expected Base Score (Sorare matrix: 35 for Starter, 25 for Sub, 0 for DNP)
  const evBaseScore = (pStarter * 35) + (pSub * 25) + (pDnp * 0);

  // 3. Expected Historical Extra (All-Around + Decisive Bonus above base)
  const assumedHistoricalBase = 33; 
  let historicalExtra = Math.max(-15, baseForm - assumedHistoricalBase);
  
  const aaPct = card.scores?.allAroundContributionPct 
     || card.scores?.aasPercentage 
     || (card.positionCode === 'DEF' ? 65 : card.positionCode === 'GK' ? 20 : card.positionCode === 'MID' ? 60 : 38);
  const aaRatio = Math.max(0.15, Math.min(0.85, aaPct / 100));
  const decRatio = 1.0 - aaRatio;

  const historicalAA = historicalExtra * aaRatio;
  const historicalDec = historicalExtra * decRatio;

  // 4. Match-up and Position Specific Modifications (Home/Away, XG, FDR)
  const fixture = card.upcomingFixture;
  let matchupFactor = 1.0;
  let cleanSheetFactor = 0;
  let matchupImpactLabel = 'Neutre (FDR 3 : 100%)';
  let difficultyRating = fixture?.difficultyRating || 3;
  let allAroundFactor = 1.0;
  let decisiveFactor = 1.0;
  let teamXG = 1.4;
  let oppXG = 1.4;
  const winProb = fixture ? getPlayerWinProbability(fixture) : 50;

  // --- NOUVEAUTÉ : Modèle ELO / Asian Handicap Dynamique ---
  // On simule un ELO dynamique basé sur L5 vs L15 de l'équipe (Approximation via la forme du joueur)
  let eloMomentum = 1.0;
  if (card.scores && card.scores.l5 > card.scores.l15 + 5) eloMomentum = 1.1; // Équipe en forme (Surperformance)
  else if (card.scores && card.scores.l5 < card.scores.l15 - 5) eloMomentum = 0.9; // Équipe dans le dur (Sous-performance)

  if (fixture) {
    switch (difficultyRating) {
      case 1:
        matchupFactor = 1.12;
        matchupImpactLabel = 'Très Favorable (FDR 1 : +12%)';
        break;
      case 2:
        matchupFactor = 1.05;
        matchupImpactLabel = 'Favorable (FDR 2 : +5%)';
        break;
      case 3:
        matchupFactor = 1.00;
        matchupImpactLabel = 'Neutre (FDR 3 : 100%)';
        break;
      case 4:
        matchupFactor = 0.92;
        matchupImpactLabel = 'Délicat (FDR 4 : -8%)';
        break;
      case 5:
        matchupFactor = 0.85;
        matchupImpactLabel = 'Très Difficile (FDR 5 : -15%)';
        break;
    }

    teamXG = fixture?.bookmaker?.goalExpectancy || (difficultyRating === 1 ? 2.1 : difficultyRating === 2 ? 1.7 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.1 : 0.8);
    oppXG = fixture?.bookmaker?.opponentGoalExpectancy || (difficultyRating === 1 ? 0.8 : difficultyRating === 2 ? 1.1 : difficultyRating === 3 ? 1.4 : difficultyRating === 4 ? 1.7 : 2.1);

    // Application du Momentum ELO aux xG
    teamXG *= eloMomentum;
    oppXG *= (2 - eloMomentum);

    // Domicile / Extérieur (Home Advantage)
    if (fixture.isHome) {
      teamXG *= 1.10;
      oppXG *= 0.90;
      matchupFactor *= 1.05;
      matchupImpactLabel += ' • Domicile (+5%)';
    } else {
      teamXG *= 0.90;
      oppXG *= 1.10;
      matchupFactor *= 0.95;
      matchupImpactLabel += ' • Extérieur (-5%)';
    }

    // --- NOUVEAUTÉ : Analyse du Style de Jeu Adverse (Simulation via hash) ---
    // Les adversaires qui jouent bloc haut génèrent plus d'AA (duels, tacles) pour nos DEF/MID.
    // Ceux qui posent le bus (bloc bas) génèrent plus d'AA (passes) pour nos défenseurs.
    const opponentName = fixture.opponent.toLowerCase();
    const isHighPressOpponent = opponentName.includes('atalanta') || opponentName.includes('liverpool') || opponentName.includes('bayer') || opponentName.includes('athletic');
    const isLowBlockOpponent = opponentName.includes('getafe') || opponentName.includes('everton') || opponentName.includes('verona') || difficultyRating >= 4;

    if (isHighPressOpponent && (card.positionCode === 'DEF' || card.positionCode === 'MID')) {
       allAroundFactor *= 1.05;
       matchupImpactLabel += ' • Adversaire Pressing Haut (+AA)';
    } else if (isLowBlockOpponent && card.positionCode === 'DEF') {
       allAroundFactor *= 1.08;
       matchupImpactLabel += ' • Adversaire Bloc Bas (+Passes)';
    }

    // Modulation par position
    if (card.positionCode === 'GK' || card.positionCode === 'DEF') {
      if (oppXG > 1.8) {
        allAroundFactor *= 1.08; // Plus d'arrêts/tacles si l'adversaire attaque beaucoup
      }
      decisiveFactor = Math.max(0.5, (2.0 - oppXG) / 1.0); // Pénible si l'adversaire marque
      
      const cleanSheetProb = fixture?.bookmaker?.cleanSheetProb || Math.max(5, Math.min(85, Math.round(Math.exp(-oppXG) * 100)));
      const baselineCS = 28;
      const csDelta = cleanSheetProb - baselineCS;
      
      if (card.positionCode === 'GK') {
        cleanSheetFactor = csDelta >= 0 ? Math.min(8.0, csDelta * 0.16) : Math.max(-4.5, csDelta * 0.14);
        if (fixture?.isHome) cleanSheetFactor += 1.5;
        if (winProb >= 55) cleanSheetFactor += 1.5;
        else if (winProb < 30) cleanSheetFactor -= 1.5;
      } else {
        cleanSheetFactor = csDelta >= 0 ? Math.min(5.5, csDelta * 0.10) : Math.max(-3.0, csDelta * 0.08);
        if (fixture?.isHome) cleanSheetFactor += 1.2;
      }
    } else if (card.positionCode === 'MID') {
      allAroundFactor = 1.0; // MID est très stable en AA, la difficulté impacte peu
      matchupFactor = 1.0 + ((matchupFactor - 1.0) * 0.5); // Amortit la variance FDR pour les milieux
    } else if (card.positionCode === 'FWD') {
      decisiveFactor = teamXG / 1.4; // Fortement indexé sur les buts attendus
      matchupFactor = 1.0 + ((matchupFactor - 1.0) * 1.5); // Augmente la variance FDR pour les attaquants
    }
  }

  // Set Pieces (Tireurs de coups de pied arrêtés)
  const setPieceRole = detectSetPieceRole(card);
  let setPieceBonus = 0;
  if (setPieceRole.isPenaltyTaker) setPieceBonus += 3.5;
  if (setPieceRole.isCornerTaker) setPieceBonus += 2.0;
  if (setPieceRole.isFreeKickTaker) setPieceBonus += 1.2;

  // Conditions climatiques
  let weatherBonus = 0;
  let weatherImpactLabel = '';
  if (fixture?.weather) {
    const w = fixture.weather;
    if (w.description?.includes('Pluie') || w.description?.includes('Neige')) {
      if (card.positionCode === 'GK') {
        weatherBonus -= 1.5;
        weatherImpactLabel = 'Conditions humides (Erreurs GK -1.5pt)';
      } else if (card.positionCode === 'DEF' && (card.scores?.l5 ?? 0) > 40) {
        weatherBonus += 1.0;
        weatherImpactLabel = 'Conditions humides (Tacles/Duels DEF +1.0pt)';
      }
    }
    if (w.wind > 35) {
      if (card.positionCode === 'MID' || card.positionCode === 'FWD') {
        weatherBonus -= 1.0;
        weatherImpactLabel = 'Vent fort (Jeu long perturbé -1.0pt)';
      }
    }
  }

  // Bonus Bookmakers & NOUVEAUTÉ : Advanced xG/xA per 90 (Regression positive)
  let bookmakerActionBonus = 0;
  if (fixture?.bookmaker) {
    const bm = fixture.bookmaker;
    if (bm.anytimeScorerOdds && bm.anytimeScorerOdds < 4.5) {
      bookmakerActionBonus += Math.max(0, (5.0 - bm.anytimeScorerOdds) * 0.25);
    }
    if (bm.anytimeAssistOdds && bm.anytimeAssistOdds < 5.5) {
      bookmakerActionBonus += Math.max(0, (6.0 - bm.anytimeAssistOdds) * 0.20);
    }
  }

  let advancedStatsBonus = 0;
  if (card.scores?.xG && card.scores.xG > 0) {
    // Si forte production xG (ex: > 0.4) mais peu de réussite, régression positive attendue
    advancedStatsBonus += Math.min(2.5, card.scores.xG * 1.5);
  }
  if (card.scores?.xA && card.scores.xA > 0) {
    advancedStatsBonus += Math.min(2.0, card.scores.xA * 1.2);
  }

  // Dynamique Collective (Team Form) & NOUVEAUTÉ : Dépendances et Arbitrage
  let contextualBonus = 0;
  let contextualImpactLabel = '';
  if (card.status === 'STARTER' && (card.starterConfidence ?? 100) < 60) {
    contextualBonus += 2.0;
    contextualImpactLabel = 'Remplace un titulaire absent (+2pts)';
  } else if (isRegularStarter && card.scores && card.scores.l5 < 35 && card.scores.l15 > 50) {
    contextualBonus += 2.5;
    contextualImpactLabel = 'Retour en forme attendu (+2.5pts)';
  }
  if (winProb >= 65 && pStarter > 0.5) {
    contextualBonus += 1.5; // Team form momentum
  }
  
  // Simulation: Impact Arbitre & Enjeu
  // On prend un pseudo-random basé sur l'ID de la carte pour simuler la désignation d'un arbitre strict
  const refHash = card.id ? parseInt(card.id.substring(0, 4), 16) % 10 : 5;
  if (refHash >= 8 && (card.positionCode === 'DEF' || card.positionCode === 'MID')) {
     allAroundFactor *= 0.95; // Arbitre strict (plus de fautes sifflées contre)
  }

  // 5. Recombinaison Globale (Sorare Math Model)
  const expectedAAS = historicalAA * starterFactor * allAroundFactor * matchupFactor;
  const expectedDec = historicalDec * starterFactor * decisiveFactor * matchupFactor;

  let projected = evBaseScore + expectedAAS + expectedDec + cleanSheetFactor + setPieceBonus + weatherBonus + bookmakerActionBonus + advancedStatsBonus + contextualBonus;

  // 6. Orientation Stratégique AAS vs DS vs Équilibré
  const aasRate = card.scores?.aasPercentage ?? 50;
  const dsRate = card.scores?.decisivePercentage ?? 30;
  let scoringFocusBonus = 0;
  if (scoringFocus === 'AAS') {
    if (aasRate >= 80) scoringFocusBonus += 1.5;
    else if (aasRate >= 60) scoringFocusBonus += 0.5;
    else if (aasRate < 40) scoringFocusBonus -= 2.0;
  } else if (scoringFocus === 'DS') {
    if (dsRate >= 80) {
      scoringFocusBonus += 2.0;
    } else if (dsRate >= 50) {
      scoringFocusBonus += 1.0;
    } else {
      scoringFocusBonus -= 2.0;
    }
  }
  projected += scoringFocusBonus;`;

  const newContent = content.substring(0, startIndex) + newLogic + content.substring(endIndex);
  fs.writeFileSync('src/utils/optimizer.ts', newContent);
  console.log('Successfully updated optimizer.ts with Advanced Heuristics');
} else {
  console.log('Could not find patterns');
}
