const fs = require('fs');
let code = fs.readFileSync('src/utils/storage.ts', 'utf8');

const regexSaveCards = /static saveCards\(cards: SorareCard\[\]\): void \{[\s\S]*?\}\n  \}/m;
const newSaveCards = `static saveCards(cards: SorareCard[]): void {
    if (!Array.isArray(cards)) return;
    memoryCardsCache = cards;
    
    // Save to IndexedDB asynchronously
    idbSet('gallery_cards', cards).catch(() => {});

    try {
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      // Removed localStorage save for cards completely to prevent 5MB QuotaExceededError
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }`;
code = code.replace(regexSaveCards, newSaveCards);

fs.writeFileSync('src/utils/storage.ts', code);
console.log('Patched storage');
