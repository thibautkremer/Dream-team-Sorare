/**
 * Intégration de l'API-Football (v3.football.api-sports.io)
 * Fournit les cotes en temps réel, les prédictions (victoire, probabilités de but),
 * les statistiques zonales, les compositions et les événements en direct.
 */

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

// Cache mémoire serveur pour éviter de sur-consommer le quota API-Football
const memoryCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes de cache

/**
 * Fonction générique pour interroger API-Football de manière sécurisée (Côté Serveur)
 */
export async function fetchApiFootball(endpoint: string, params: Record<string, string> = {}) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const cacheKey = `${endpoint}?${new URLSearchParams(params).toString()}`;
  
  const cached = memoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  if (!apiKey) {
    return null;
  }

  const queryParams = new URLSearchParams(params).toString();
  const url = `${API_FOOTBALL_BASE_URL}${endpoint}?${queryParams}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!response.ok) {
      console.warn(`[API-Football] Status HTTP ${response.status} pour ${endpoint}`);
      return null;
    }

    const data = await response.json();
    if (data && data.response) {
      memoryCache.set(cacheKey, { timestamp: Date.now(), data });
    }
    return data;
  } catch (error) {
    console.error('[API-Football] Erreur appel :', error);
    return null;
  }
}

/**
 * Recherche une équipe par nom pour obtenir son ID API-Football
 */
export async function searchTeam(teamName: string) {
  if (!teamName || teamName === 'Club Non Renseigné') return null;
  const res = await fetchApiFootball('/teams', { search: teamName });
  if (res && res.response && res.response.length > 0) {
    return res.response[0].team;
  }
  return null;
}

/**
 * Recherche le fixtureId d'un match à venir pour une équipe
 */
export async function searchUpcomingFixture(teamId: string, next: string = '1') {
  const res = await fetchApiFootball('/fixtures', { team: teamId, next });
  if (res && res.response && res.response.length > 0) {
    return res.response[0];
  }
  return null;
}

/**
 * Récupère les prédictions complètes pour un match (xG, % Win, Forme, H2H)
 */
export async function getMatchPredictions(fixtureId: string) {
  const res = await fetchApiFootball('/predictions', { fixture: fixtureId });
  if (res && res.response && res.response.length > 0) {
    return res.response[0];
  }
  return null;
}

/**
 * Récupère les cotes des bookmakers (1X2, Clean Sheet, Buteur Anytime, O/U 2.5)
 */
export async function getMatchOdds(fixtureId: string) {
  const res = await fetchApiFootball('/odds', { fixture: fixtureId });
  if (res && res.response && res.response.length > 0) {
    return res.response[0];
  }
  return null;
}

/**
 * Récupère les blessés et suspendus d'un match
 */
export async function getInjuries(fixtureId: string, teamId?: string) {
  const params: Record<string, string> = { fixture: fixtureId };
  if (teamId) params.team = teamId;
  const res = await fetchApiFootball('/injuries', params);
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les compositions probables ou officielles
 */
export async function getLineups(fixtureId: string) {
  const res = await fetchApiFootball('/fixtures/lineups', { fixture: fixtureId });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les statistiques et événements en direct (Live Scoring)
 */
export async function getLiveFixtures() {
  const res = await fetchApiFootball('/fixtures', { live: 'all' });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les événements d'un match en direct (Buts, Cartons, Remplacements)
 */
export async function getFixtureEvents(fixtureId: string) {
  const res = await fetchApiFootball('/fixtures/events', { fixture: fixtureId });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère les statistiques de match détaillées (Tirs, Possession, Passes, Fautes)
 */
export async function getFixtureStatistics(fixtureId: string) {
  const res = await fetchApiFootball('/fixtures/statistics', { fixture: fixtureId });
  if (res && res.response) {
    return res.response;
  }
  return [];
}

/**
 * Récupère l'historique direct (Head to Head) entre deux équipes
 */
export async function getHeadToHead(h2h: string) {
  const res = await fetchApiFootball('/fixtures/headtohead', { h2h, last: '5' });
  if (res && res.response) {
    return res.response;
  }
  return [];
}
