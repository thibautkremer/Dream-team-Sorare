import { SorareCard, Lineup } from '../types';
import { DEFAULT_GALLERY_THIB8 } from '../data/mockGallery';

const STORAGE_KEYS = {
  CARDS: 'team_sorare_cards_v5_1019_real',
  USERNAME: 'team_sorare_username_v5',
  USER_META: 'team_sorare_meta_v5',
  API_KEY: 'team_sorare_api_key_v5',
  SAVED_LINEUPS: 'team_sorare_saved_lineups_v5',
  ACTIVE_STRATEGY: 'team_sorare_strategy_v5',
  FAVORITES: 'team_sorare_favorites_v5',
  LAST_SYNC: 'team_sorare_last_sync_v5',
};

export interface SorareUserMeta {
  slug: string;
  nickname: string;
  clubName: string;
  totalCards: number;
}

export class StorageService {
  static getCards(): SorareCard[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CARDS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          if (parsed.length >= 1000) {
            return parsed;
          } else if (parsed.length > 0) {
            // Merge with default gallery to ensure 1019+ cards are present
            const map = new Map<string, SorareCard>();
            DEFAULT_GALLERY_THIB8.forEach(c => map.set(c.id, c));
            parsed.forEach(c => map.set(c.id, c));
            return Array.from(map.values());
          }
        }
      }
    } catch (e) {
      console.warn('Storage read error, using default gallery', e);
    }
    // Initialise avec le jeu complet de 1019 vraies cartes de Thib 8
    this.saveCards(DEFAULT_GALLERY_THIB8);
    return DEFAULT_GALLERY_THIB8;
  }

  static saveCards(cards: SorareCard[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(cards));
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {
      console.error('Storage write error', e);
    }
  }

  static clearCards(): void {
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
      localStorage.removeItem(STORAGE_KEYS.CARDS);
      localStorage.removeItem(STORAGE_KEYS.SAVED_LINEUPS);
      localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
      localStorage.removeItem(STORAGE_KEYS.USER_META);
      this.saveCards(DEFAULT_GALLERY_THIB8);
    } catch (e) {
      console.error('Error resetting storage', e);
    }
  }
}
