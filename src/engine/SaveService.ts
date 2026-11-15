import type { CartridgeId, RenderSceneSnapshot } from './WorldTypes.ts';

export interface CardRecord {
  bestScore: number;
  bestStars: number;
  starsTotal: number;
}

const RECORDS_KEY = 'pixel-atelier-records-v1';
const SRAM_KEY = 'pixel-atelier-sram-v1';
const SHELL_KEY = 'pixel-atelier-shell-v1';
const HERO_KEY = 'pixel-atelier-hero-v1';

export interface CartridgeSramEnvelope {
  version: 1;
  updatedAt: number;
  stageName?: string;
  data: unknown;
}

export interface HeroSpriteSave {
  a?: number[];
  b?: number[];
}

/**
 * Persistence boundary for player records, per-cartridge SRAM checkpoints, custom hero frames, and console preferences.
 */
export class SaveService {
  private records: Partial<Record<CartridgeId, CardRecord>>;
  private sram: Partial<Record<CartridgeId, CartridgeSramEnvelope>>;

  constructor() {
    this.records = this.readJson<Partial<Record<CartridgeId, CardRecord>>>(RECORDS_KEY) ?? {};
    this.sram = this.readJson<Partial<Record<CartridgeId, CartridgeSramEnvelope>>>(SRAM_KEY) ?? {};
  }

  private readRaw(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeRaw(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore quota errors
    }
  }

  private readJson<T>(key: string): T | null {
    const raw = this.readRaw(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  public getRecord(id: CartridgeId): CardRecord | undefined {
    return this.records[id];
  }

  public getAllRecords(): Partial<Record<CartridgeId, CardRecord>> {
    return { ...this.records };
  }

  public hasCartridgeSram(id: CartridgeId): boolean {
    const entry = this.sram[id];
    return Boolean(entry && entry.version === 1 && entry.data !== undefined);
  }

  public getCartridgeSram(id: CartridgeId): CartridgeSramEnvelope | undefined {
    const entry = this.sram[id];
    if (!entry || entry.version !== 1) return undefined;
    return entry;
  }

  public saveCartridgeSram(id: CartridgeId, data: unknown, stageName?: string): void {
    if (data === undefined || data === null) return;
    this.sram[id] = {
      version: 1,
      updatedAt: Date.now(),
      stageName,
      data,
    };
    this.writeRaw(SRAM_KEY, JSON.stringify(this.sram));
  }

  public clearCartridgeSram(id: CartridgeId): void {
    if (!this.sram[id]) return;
    delete this.sram[id];
    this.writeRaw(SRAM_KEY, JSON.stringify(this.sram));
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
    this.writeRaw(RECORDS_KEY, JSON.stringify(this.records));
    return true;
  }

  public getShellTheme(fallback = 'mint'): string {
    return this.readRaw(SHELL_KEY) ?? fallback;
  }

  public saveShellTheme(theme: string): void {
    this.writeRaw(SHELL_KEY, theme);
  }

  public getHeroSprites(): HeroSpriteSave | null {
    return this.readJson<HeroSpriteSave>(HERO_KEY);
  }

  public saveHeroSprites(a: Uint8Array, b: Uint8Array): void {
    this.writeRaw(HERO_KEY, JSON.stringify({ a: Array.from(a), b: Array.from(b) }));
  }
}
