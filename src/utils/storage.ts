import { SorareCard, Lineup } from '../types';
import { MOCK_GALLERY } from '../data/mockGallery';

const STORAGE_KEYS = {
  CARDS: 'team_sorare_cards_v5_1019_real',
  USERNAME: 'team_sorare_username_v5',
  USER_META: 'team_sorare_meta_v5',
  API_KEY: 'team_sorare_api_key_v5',
  APP_TOKEN: 'team_sorare_app_token_v1',
  SAVED_LINEUPS: 'team_sorare_saved_lineups_v5',
  ACTIVE_STRATEGY: 'team_sorare_strategy_v5',
  FAVORITES: 'team_sorare_favorites_v5',
  CARD_TAGS: 'team_sorare_card_tags_v5',
  LAST_SYNC: 'team_sorare_last_sync_v5',
  HAS_CLEARED: 'team_sorare_has_cleared',
};

export interface SorareUserMeta {
  slug: string;
  nickname: string;
  clubName: string;
  totalCards: number;
}

// In-memory cache for ultra-fast synchronous access
let memoryCardsCache: SorareCard[] | null = null;
let idbInitPromise: Promise<IDBDatabase | null> | null = null;

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (idbInitPromise) return idbInitPromise;

  idbInitPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open('SorareSO5AssistantDB', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };
      request.onsuccess = (e: any) => {
        resolve(e.target.result);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return idbInitPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('store', 'readonly');
        const store = tx.objectStore('store');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await getIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('store', 'readwrite');
        const store = tx.objectStore('store');
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}


const safeLS = {
  getItem: (k: string) => { try { return typeof window !== 'undefined' ? window.localStorage.getItem(k) : null; } catch(e) { return null; } },
  setItem: (k: string, v: string) => { try { if (typeof window !== 'undefined') window.localStorage.setItem(k, v); } catch(e) {} },
  removeItem: (k: string) => { try { if (typeof window !== 'undefined') window.localStorage.removeItem(k); } catch(e) {} }
};

export class StorageService {
  /**
   * Synchronous getCards: returns memory cache immediately if available,
   * or attempts to read from safeLS.
   */
  static getCards(): SorareCard[] {
    if (memoryCardsCache && memoryCardsCache.length > 0) {
      return memoryCardsCache;
    }
    
    // Attempt immediate synchronous read from localStorage (light data)
    try {
      const lsData = safeLS.getItem(STORAGE_KEYS.CARDS);
      if (lsData) {
        const parsed = JSON.parse(lsData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryCardsCache = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading light cards from localStorage', e);
    }
    
    if (MOCK_GALLERY && Array.isArray(MOCK_GALLERY) && MOCK_GALLERY.length > 0) {
      memoryCardsCache = MOCK_GALLERY;
      return MOCK_GALLERY;
    }
    return memoryCardsCache || [];
  }

  /**
   * Asynchronous getCards with IndexedDB support for 1,000+ full cards
   */
  static async getCardsAsync(): Promise<SorareCard[]> {
    if (memoryCardsCache && memoryCardsCache.length > 0) {
      // Memory cache is already fully hydrated
      return memoryCardsCache;
    }
    // Try IndexedDB first for heavy data
    const idbCards = await idbGet<SorareCard[]>('gallery_cards');
    if (idbCards && Array.isArray(idbCards) && idbCards.length > 0) {
      memoryCardsCache = idbCards;
      return idbCards;
    }
    // Fallback to synchronous
    return this.getCards();
  }

  /**
   * Saves cards into memory cache, IndexedDB (unlimited size) and compact localStorage
   */
  static saveCards(cards: SorareCard[]): void {
    if (!Array.isArray(cards)) return;
    memoryCardsCache = cards;
    
    // Save to IndexedDB asynchronously (heavy data)
    idbSet('gallery_cards', cards).catch(() => {});

    try {
      safeLS.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      
      // Save light version to localStorage to avoid QuotaExceededError (5MB)
      // We only keep essential properties for initial UI render
      const lightCards = cards.map(c => ({
        id: c.id,
        slug: c.slug,
        playerSlug: (c as any).playerSlug || '',
        name: c.displayName || c.name || '',
        displayName: c.displayName || c.name || '',
        matchName: c.matchName || c.displayName || c.name || '',
        rarity: c.rarity,
        seasonYear: c.seasonYear || 2025,
        power: c.power,
        powerBreakdown: c.powerBreakdown,
        bonusPercentage: c.bonusPercentage,
        grade: c.grade,
        xp: c.xp,
        specialEdition: c.specialEdition,
        scores: c.scores,
        starterConfidence: c.starterConfidence,
        status: c.status,
        injuryStatus: c.injuryStatus,
        club: c.club,
        positionCode: c.positionCode,
        pictureUrl: c.pictureUrl,
        upcomingFixture: c.upcomingFixture
      })).slice(0, 300); // Limit to top 300 cards to stay well within localStorage limits
      
      safeLS.setItem(STORAGE_KEYS.CARDS, JSON.stringify(lightCards));
    } catch (e) {
      console.warn('Could not save light cards to localStorage', e);
    }
  }

  static clearCards(): void {
    memoryCardsCache = [];
    idbSet('gallery_cards', []).catch(() => {});
    try {
      safeLS.removeItem(STORAGE_KEYS.CARDS);
      safeLS.removeItem(STORAGE_KEYS.LAST_SYNC);
    } catch (e) {
      console.error('Failed to clear cards', e);
    }
  }

  static getUsername(): string {
    return safeLS.getItem(STORAGE_KEYS.USERNAME) || 'Thib 8';
  }

  static saveUsername(username: string): void {
    safeLS.setItem(STORAGE_KEYS.USERNAME, username);
  }

  static getUserMeta(): SorareUserMeta {
    try {
      const data = safeLS.getItem(STORAGE_KEYS.USER_META);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      slug: 'thib-8',
      nickname: 'Thib 8',
      clubName: 'Thib 8 FC',
      totalCards: 1019,
    };
  }

  static saveUserMeta(meta: SorareUserMeta): void {
    try {
      safeLS.setItem(STORAGE_KEYS.USER_META, JSON.stringify(meta));
    } catch (e) {}
  }

  static getApiKey(): string {
    return safeLS.getItem(STORAGE_KEYS.API_KEY) || '';
  }

  static saveApiKey(apiKey: string): void {
    safeLS.setItem(STORAGE_KEYS.API_KEY, apiKey);
  }

  static getAppToken(): string {
    return safeLS.getItem(STORAGE_KEYS.APP_TOKEN) || '';
  }

  static saveAppToken(token: string): void {
    safeLS.setItem(STORAGE_KEYS.APP_TOKEN, token);
  }

  static getSavedLineups(): Lineup[] {
    try {
      const data = safeLS.getItem(STORAGE_KEYS.SAVED_LINEUPS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Error reading saved lineups', e);
    }
    return [];
  }

  static saveLineup(lineup: Lineup): void {
    try {
      const current = this.getSavedLineups();
      const existingIdx = current.findIndex(l => l.id === lineup.id || (l.strategy === lineup.strategy && l.gameWeek === lineup.gameWeek));
      if (existingIdx >= 0) {
        current[existingIdx] = lineup;
      } else {
        current.unshift(lineup);
      }
      safeLS.setItem(STORAGE_KEYS.SAVED_LINEUPS, JSON.stringify(current));
    } catch (e) {
      console.error('Error saving lineup', e);
    }
  }

  static deleteLineup(id: string): void {
    try {
      const current = this.getSavedLineups().filter(l => l.id !== id);
      safeLS.setItem(STORAGE_KEYS.SAVED_LINEUPS, JSON.stringify(current));
    } catch (e) {
      console.error('Error deleting lineup', e);
    }
  }

  static getFavorites(): string[] {
    try {
      const data = safeLS.getItem(STORAGE_KEYS.FAVORITES);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return [];
  }

  static toggleFavorite(cardId: string): string[] {
    try {
      const favs = this.getFavorites();
      const next = favs.includes(cardId) ? favs.filter(id => id !== cardId) : [...favs, cardId];
      safeLS.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next));
      return next;
    } catch (e) {
      return [];
    }
  }

  static isFavorite(cardId: string): boolean {
    const favs = this.getFavorites();
    return favs.includes(cardId);
  }

  static getCardTags(): Record<string, string[]> {
    try {
      const data = safeLS.getItem(STORAGE_KEYS.CARD_TAGS);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {};
  }

  static setCardTags(cardId: string, tags: string[]): Record<string, string[]> {
    try {
      const allTags = this.getCardTags();
      if (tags.length === 0) {
        delete allTags[cardId];
      } else {
        allTags[cardId] = Array.from(new Set(tags));
      }
      safeLS.setItem(STORAGE_KEYS.CARD_TAGS, JSON.stringify(allTags));
      return allTags;
    } catch (e) {
      return {};
    }
  }

  static addCardTag(cardId: string, tag: string): Record<string, string[]> {
    const cleanTag = tag.trim();
    if (!cleanTag) return this.getCardTags();
    const current = this.getCardTags()[cardId] || [];
    return this.setCardTags(cardId, [...current, cleanTag]);
  }

  static removeCardTag(cardId: string, tag: string): Record<string, string[]> {
    const current = this.getCardTags()[cardId] || [];
    return this.setCardTags(cardId, current.filter(t => t !== tag));
  }

  static getLastSync(): string | null {
    return safeLS.getItem(STORAGE_KEYS.LAST_SYNC);
  }

  static clearAndReset(): void {
    try {
      memoryCardsCache = [];
      idbSet('gallery_cards', []).catch(() => {});
      safeLS.removeItem(STORAGE_KEYS.CARDS);
      safeLS.removeItem(STORAGE_KEYS.SAVED_LINEUPS);
      safeLS.removeItem(STORAGE_KEYS.LAST_SYNC);
      safeLS.removeItem(STORAGE_KEYS.USER_META);
    } catch (e) {
      console.error('Error resetting storage', e);
    }
  }
}
