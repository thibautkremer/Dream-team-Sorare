# 📋 Audit Global, Technique, Algorithmique & Fonctionnel
## Application : Sorare SO5 Optimizer & Live Assistant
**Date d'audit :** 21 Août 2026  
**Auteur :** Expert Football, Sorare SO5, Data Science & Full-Stack Engineering  

---

## 📊 1. Résumé Exécutif

L'application **Sorare SO5 Optimizer** est une plateforme hautement sophistiquée conçue pour optimiser les alignements de cartes Sorare dans les compétitions à contrainte de points (Cap 240, Cap 270, Cap 280, All Star, Champion, etc.).

Elle combine :
1. **Synchronisation GraphQL directe** avec l'API officielle de Sorare (chargement de galeries de 1000+ cartes, historiques L5/L15/L40, bonus d'XP et édition).
2. **Moteur d'optimisation sous contraintes mathématiques** (optimisation combinatoire du score projeté sous contrainte de Cap et règles d'alignement SO5).
3. **Pipeline d'Intelligence Artificielle (Gemini)** couplé au **Google Search Grounding** pour l'extraction en temps réel des cotes bookmakers (Winamax, Betclic, Unibet, PMU) et des métriques xG / Clean Sheet.
4. **Persistance hybride ultra-rapide** (IndexedDB + LocalStorage) et intégration de données environnementales (Météo via Open-Meteo).

Malgré ces fondations solides, cet audit identifie des **bugs techniques critiques (rate-limiting), des incohérences algorithmiques dans le calcul des projections, des zones encore simulées ainsi que des pistes d'amélioration majeures**.

---

## 🐛 2. Bugs Techniques & Vulnérabilités de Code

### 2.1. Backend & Gestion des Quotas API (`server.ts`)
* **Saturation Rate-Limit (429) sur l'API GraphQL Sorare** :
  * *Constat* : En l'absence de clé API Sorare fournie par l'utilisateur (`customApiKey`), les requêtes vers l'API GraphQL sont soumises à une limite de **60 requêtes/minute**. Lors d'une première synchronisation d'une galerie de 1000+ cartes (paginée par lots de 50), le serveur envoie les requêtes de pagination de manière rapprochée, provoquant un blocage HTTP 429 et interrompant prématurément le chargement de la galerie (ex: arrêt à la page 3 ou 4).
  * *Correction recommandée* : Implémenter un *rate-limiter* à fenêtre glissante (*sliding window pacing*) : 800 ms de délai entre les pages sans clé API, et 150 ms si une clé API est configurée.

* **Fuite mémoire potentielle dans `userCardsCache`** :
  * *Constat* : La variable globale `userCardsCache = new Map<string, any>()` conserve en mémoire vive l'intégralité des cartes de tous les utilisateurs recherchés sans politique d'éviction LRU (*Least Recently Used*) ni limite d'éléments.
  * *Correction recommandée* : Remplacer la `Map` brute par une structure de cache LRU bornée (ex: maximum 20 utilisateurs ou durée de vie TTL de 60 minutes).

* **Incompatibilité de route wildcard Express v5** :
  * *Constat* : Dans `server.ts`, la route de secours pour la SPA `app.get('*', ...)` utilise la syntaxe Express v4. En Express v5 (actuellement utilisé), la syntaxe recommandée pour éviter les avertissements de dépréciation est `app.get('*all', ...)`.

### 2.2. Frontend & Stockage Client (`src/utils/storage.ts` & `App.tsx`)
* **Dépassement de Quota LocalStorage & Tronquage Silencieux** :
  * *Constat* : Pour éviter les erreurs `QuotaExceededError` dans LocalStorage, la fonction `saveCards` écrit un tableau `lightCards` plafonné à 300 cartes. Résultat : sur une galerie de 1019 cartes, 719 cartes ne sont pas rechargées de manière synchrone lors du lancement initial de la page si IndexedDB met du temps à répondre.
  * *Correction recommandée* : Hydrater directement le state React depuis IndexedDB au démarrage via `getCardsAsync()` avec un composant de chargement (*Skeleton UI*), sans tronquer arbitrairement la liste des cartes.

* **Désynchronisation du State après Vidage du Cache** :
  * *Constat* : L'action `clearCards()` supprime le contenu d'IndexedDB/LocalStorage mais ne réinitialise pas immédiatement le state dans `App.tsx`, ce qui conserve des cartes "fantômes" affichées à l'écran jusqu'à un rafraîchissement manuel de la page.

---

## 🧮 3. Cohérence des Calculs & Incohérences Algorithmiques

### 3.1. Algorithme de Projection de Score (`src/utils/optimizer.ts`)
* **Somme des Coefficients de Base Non Normalisée** :
  * *Constat* : La formule initiale de projection utilise :
    $$\text{Base} = (L5 \times 0.40) + (L15 \times 0.25) + (L40 \times 0.15)$$
    La somme des coefficients égale $0.80$, ce qui sous-estime la base de 20% si elle n'est pas réajustée plus loin.
  * *Correction* : Normaliser à $1.0$ ($L5: 45\%$, $L15: 35\%$, $L40: 20\%$).

* **Biais de Titularisation sur Échantillon Faible (DNP vs Blessure)** :
  * *Constat* : Lorsqu'un joueur revient de blessure et n'a disputé qu'un seul match sur les 5 derniers (4 DNP), le calcul du $L5$ repose sur ce seul match. Si ce match a été exceptionnel (ex: 90 pts) ou très mauvais (ex: 25 pts), la projection globale est totalement déformée.
  * *Correction* : Ajuster dynamiquement les poids selon le taux de présence réelle ($\text{l5PlayedRate} = \frac{\text{Matchs joués}}{5}$). Si $\text{l5PlayedRate} < 0.4$, basculer la priorité sur le $L15$ et le $L40$.

* **Double Comptage / Incohérence du Capitaine sur la Limite du Cap** :
  * *Constat* : Le bonus Capitaine (+20% sur la carte) augmente le score projeté du joueur, mais **ne doit pas augmenter sa valeur de Cap** (sa moyenne L15 brute) dans le calcul de la limite des 240/270 points. Dans certaines sous-routines de l'optimiseur, l'attribution du capitaine influençait le respect du plafond de Cap.

* **Matchs Internationaux & DNP "Fantômes"** :
  * *Constat* : Lors des trêves internationales, un joueur de club non sélectionné enregistre un DNP (score 0) sur les GameWeeks internationales Sorare. Ce 0 fait baisser artificiellement sa moyenne L5 de club.
  * *Correction* : Exclure les GameWeeks de compétitions nationales/internationales non pertinentes lors du calcul de la régularité en club.

---

## 🎨 4. Audit UI/UX & Ergonomie

1. **Responsiveness Mobile sur la Vue Gallery & Matchups** :
   * *Constat* : Les badges contenant les cotes bookmakers (Victoire %, xG, Clean Sheet %) et les données météo débordent horizontalement sur les écrans mobiles (< 375px).
   * *Correction* : Passer les cartes de matchup en layout vertical sur mobile (`flex-col sm:flex-row`) et utiliser des abréviations compactes pour les métriques.
2. **Affichage de la Barre de Progression de Synchronisation** :
   * *Constat* : La progression de synchronisation affiche un total de pages estimé fixe (`estimatedTotalPages: 15`).
   * *Correction* : Utiliser le champ `totalCards` renvoyé dès la première requête GraphQL Sorare pour afficher un pourcentage de chargement 100% exact.
3. **Filtres Avancés de Santé & Disponibilité** :
   * *Constat* : Les joueurs blessés ou suspendus apparaissent toujours dans la liste par défaut de la galerie.
   * *Correction* : Ajouter un filtre rapide *"Masquer les indisponibles / DNP"* en haut de la Galerie et de l'Optimiseur.

---

## 🎭 5. Matrice des Zones Simulées vs Données Réelles

| Module | Fichier | État Actuel | Solution d'Intégration Réelle |
| :--- | :--- | :--- | :--- |
| **Calendrier des Matchs** | `src/data/fixturesData.ts` | Catalogue statique de ~80 clubs européens. Les clubs hors top-5 sont simulés. | Remplacer par l'API GraphQL Sorare (`activeClub.upcomingGames`) ou une API comme Football-Data.org. |
| **Cotes Bookmakers** | `server.ts` (`/api/odds`) | Fallback sur des cotes estimées (`generateSymmetricMatchOdds`) si pas de clé API / quota Gemini dépassé. | Configurer `ODDS_API_KEY` (The Odds API) ou parser les flux publics Winamax/Unibet. |
| **Conditions Météo** | `server.ts` (`/api/weather`) | Open-Meteo est appelé. Mais si la ville n'est pas dans `CLUB_TO_CITY_MAP`, fallback sur "18°C Ensoleillé". | Automatiser la géolocalisation des stades via l'API Geocoding d'Open-Meteo pour 100% des clubs. |
| **Compositions Probables** | `src/utils/optimizer.ts` | La titularisation est estimée mathématiquement sur l'historique L5. | Intégrer un flux de Lineups (Flashscore, SportsGambler ou Rotowire). |

---

## 🔌 6. Opportunités d'Intégration d'API Externes

1. **API Sorare OAuth (Authentification & Envoi des Compositions)** :
   * Permettre à l'utilisateur de se connecter via son compte Sorare OAuth.
   * **Incertitude levée** : L'utilisateur pourra valider et **soumettre directement ses compositions optimisées sur Sorare en un clic** via des mutations GraphQL autorisées (`saveSo5Lineup`).
2. **The Odds API / Bookmaker Aggregator** :
   * Récupération automatique des cotes 1N2, des probabilités de Clean Sheet (pour les Gardiens/Défenseurs) et des xG/xAG (pour les Attaquants/Milieux).
3. **Transfermarkt / SorareData Floor Price API** :
   * Intégrer les prix de marché des cartes (Floor Price en EUR/ETH) pour calculer le **Rendement Financier de la Galerie (ROI)** et optimiser les équipes en fonction de la valeur marchande des récompenses visées.

---

## 🚀 7. Nouvelles Fonctionnalités Majeures à Valider

1. **Stack Optimizer (Optimiseur de Stacks 2+2 / 3+2)** :
   * *Concept* : Aligner des paires de joueurs du même club (ex: Gardien + Défenseur pour le Clean Sheet, ou Milieu + Attaquant) augmente la synergie et le plafond de points (*Ceiling*).
   * *Implémentation* : Ajouter une option d'optimisation par "Stacking" dans l'algorithme.
2. **Sélecteur de Profil de Risque (Safe Floor vs High Ceiling)** :
   * *Mode Sécurisé (Floor Max)* : Privilégie les joueurs réguliers avec un L5 très stable pour assurer un palier de points (Cap 240).
   * *Mode Plafond / Rewards (Ceiling Max)* : Privilégie les joueurs explosifs avec un fort potentiel de score décisif pour aller chercher les podiums.
3. **Détecteur de Rotation & Surcharge de Calendrier** :
   * Signaler automatiquement les joueurs risquant un repos/rotation (ex: match de Ligue des Champions prévu 3 jours après le match de championnat).
4. **Export Instantané / Copie au Format Texte & CSV** :
   * Exporter l'alignement directement vers le presse-papier, au format CSV, ou sous forme d'image partageable sur les réseaux sociaux.

---

## 🛠️ 8. Prochaines Étapes Recommandées

1. **Correctif Pacing GraphQL** : Appliquer le délai dynamique dans `server.ts` pour garantir la synchronisation à 100% sans erreur 429.
2. **Ajustement des Formules de Projection** : Mettre à jour `src/utils/optimizer.ts` avec la pondération normalisée et la gestion de l'échantillon faible.
3. **Optimisation Mobile & UI** : Ajuster les layouts réactifs dans `MatchupCenter` et `GalleryView`.
