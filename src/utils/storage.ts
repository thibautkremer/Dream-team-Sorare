import { SorareCard, Lineup } from '../types';

const STORAGE_KEYS = {
  CARDS: 'team_sorare_cards_v5_1019_real',
  USERNAME: 'team_sorare_username_v5',
  USER_META: 'team_sorare_meta_v5',
  API_KEY: 'team_sorare_api_key_v5',
  SAVED_LINEUPS: 'team_sorare_saved_lineups_v5',
  ACTIVE_STRATEGY: 'team_sorare_strategy_v5',
  FAVORITES: 'team_sorare_favorites_v5',
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

export class StorageService {
  /**
   * Synchronous getCards: returns memory cache immediately if available,
   * or attempts to read from localStorage.
   */
  static getCards(): SorareCard[] {
    if (memoryCardsCache && memoryCardsCache.length > 0) {
      return memoryCardsCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CARDS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryCardsCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignored
    }
    return memoryCardsCache || [];
  }

  /**
   * Asynchronous getCards with IndexedDB support for 1,000+ full cards
   */
  static async getCardsAsync(): Promise<SorareCard[]> {
    if (memoryCardsCache && memoryCardsCache.length > 0) {
      return memoryCardsCache;
    }
    // Try IndexedDB first
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
    
    // Save to IndexedDB asynchronously
    idbSet('gallery_cards', cards).catch(() => {});

    try {
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      
      // For localStorage, if collection is very large (> 200 cards), save a lightweight version to prevent 5MB quota errors
      if (cards.length > 250) {
        const compactCards = cards.map(c => ({
          ...c,
          scores: {
            ...c.scores,
            last40Scores: c.scores?.last40Scores?.slice(0, 15),
            recentMatches: c.scores?.recentMatches?.slice(0, 5)
          }
        }));
        try {
          localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(compactCards));
        } catch {
          // If even compact version fails, save only top 200 cards into localStorage
          try {
            localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(compactCards.slice(0, 200)));
          } catch {
            // Memory & IndexedDB have it, so no catastrophic loss
          }
        }
      } else {
        localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(cards));
      }
    } catch {
      // Quota exceeded handled silently since IndexedDB and memoryCache hold full cards
    }
  }

  static clearCards(): void {
    memoryCardsCache = [];
    idbSet('gallery_cards', []).catch(() => {});
    try {
      localStorage.removeItem(STORAGE_KEYS.CARDS);
      localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
    } catch (e) {
      console.error('Failed to clear cards', e);
    }
  }

  static getUsername(): string {
    return localStorage.getItem(STORAGE_KEYS.USERNAME) || 'Thib 8';
  }

  static saveUsername(username: string): void {
    localStorage.setItem(STORAGE_KEYS.USERNAME, username);
  }

  static getUserMeta(): SorareUserMeta {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER_META);
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
      localStorage.setItem(STORAGE_KEYS.USER_META, JSON.stringify(meta));
    } catch (e) {}
  }

  static getApiKey(): string {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  }

  static saveApiKey(apiKey: string): void {
    localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
  }

  static getSavedLineups(): Lineup[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAVED_LINEUPS);
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
      localStorage.setItem(STORAGE_KEYS.SAVED_LINEUPS, JSON.stringify(current));
    } catch (e) {
      console.error('Error saving lineup', e);
    }
  }

  static deleteLineup(id: string): void {
    try {
      const current = this.getSavedLineups().filter(l => l.id !== id);
      localStorage.setItem(STORAGE_KEYS.SAVED_LINEUPS, JSON.stringify(current));
    } catch (e) {
      console.error('Error deleting lineup', e);
    }
  }

  static getLastSync(): string | null {
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
  }

  static clearAndReset(): void {
    try {
      memoryCardsCache = [];
      idbSet('gallery_cards', []).catch(() => {});
      localStorage.removeItem(STORAGE_KEYS.CARDS);
      localStorage.removeItem(STORAGE_KEYS.SAVED_LINEUPS);
      localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
      localStorage.removeItem(STORAGE_KEYS.USER_META);
    } catch (e) {
      console.error('Error resetting storage', e);
    }
  }
}
