import type { CartridgeId, RenderSceneSnapshot } from './WorldTypes.ts';

export interface CardRecord {
  bestScore: number;
  bestStars: number;
  starsTotal: number;
}

const RECORDS_KEY = 'pixel-atelier-records-v1';
const SHELL_KEY = 'pixel-atelier-shell-v1';

/**
 * Persistence boundary for player records and console preferences.
 */
export class SaveService {
  private records: Partial<Record<CartridgeId, CardRecord>>;

  constructor() {
    this.records = this.loadRecordsFromStorage();
  }

  private loadRecordsFromStorage(): Partial<Record<CartridgeId, CardRecord>> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      return raw ? (JSON.parse(raw) as Partial<Record<CartridgeId, CardRecord>>) : {};
    } catch {
      return {};
    }
  }

  public getRecord(id: CartridgeId): CardRecord | undefined {
    return this.records[id];
  }

  public getAllRecords(): Partial<Record<CartridgeId, CardRecord>> {
    return { ...this.records };
  }

  /**
   * Updates stored high score / star count when beaten; returns true if changed.
   */
  public recordProgress(id: CartridgeId, snap: RenderSceneSnapshot): boolean {
    const prev = this.records[id];
    const next: CardRecord = {
      bestScore: Math.max(prev?.bestScore ?? 0, snap.score),
      bestStars: Math.max(prev?.bestStars ?? 0, snap.starsCollected),
      starsTotal: Math.max(prev?.starsTotal ?? 0, snap.starsTotal),
    };
    if (
      prev &&
      next.bestScore === prev.bestScore &&
      next.bestStars === prev.bestStars &&
      next.starsTotal === prev.starsTotal
    ) {
      return false;
    }
    this.records[id] = next;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
      } catch {
        // Ignore quota errors
      }
    }
    return true;
  }

  public getShellTheme(fallback = 'mint'): string {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      return localStorage.getItem(SHELL_KEY) ?? fallback;
    } catch {
      return fallback;
    }
  }

  public saveShellTheme(theme: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SHELL_KEY, theme);
    } catch {
      // Ignore quota errors
    }
  }
}
