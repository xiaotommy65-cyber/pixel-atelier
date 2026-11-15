import { GAME_H, GAME_W } from '../../gpu/GpuTypes.ts';
import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type {
  CartridgeInstance,
  InputState,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
} from '../WorldTypes.ts';
import { WorldKernel } from '../core/WorldKernel.ts';

export const DEFAULT_SANDBOX_SCRIPT = `// 積木秘密基地：支援彈簧、木箱、連鎖炸彈與火炬機關！
api.setSky('#8fd8ff', '#fff4df');
api.setHeroSpawn(24, 120);

// 擺放漂浮雲朵跳台
api.addCloud(78, 124, 3);
api.addCloud(190, 96, 3);

// 互動積木玩具（木箱可推動/點燃，炸彈按 A 引爆連鎖！）
api.addSpring(60, 134);
api.addCrate(116, 134);
api.addBomb(136, 134);

// 灑滿黃金星星
api.addStar(94, 102);
api.addStar(132, 102);
api.addStar(206, 74);
api.addStar(238, 74);
api.addStar(276, 120);

// 放入守護果凍史萊姆
api.addSlime(182, 134);
api.addSlime(246, 134);
`;

export interface SandboxScriptApi {
  setSky(topHex: string, bottomHex: string): void;
  setDarkness(alpha: number, tintHex?: string): void;
  setHeroSpawn(x: number, y: number): void;
  addCloud(x: number, y: number, tilesWide?: number): void;
  addWall(x: number, y: number, w: number, h: number, sprite?: SpriteId): void;
  addStar(x: number, y: number): void;
  addSlime(x: number, y: number): void;
  addSpring(x: number, y: number): void;
  addCrate(x: number, y: number): void;
  addBomb(x: number, y: number): void;
  addTorch(x: number, y: number): void;
  addSwitch(x: number, y: number): void;
  addKey(x: number, y: number): void;
  addGate(x: number, y: number): void;
}

/**
 * PA-03 Sandbox Toybox: driven by WorldKernel + Type Objects + Tag x Tag RuleMatrix.
 * Supports pushable crates, chain-reaction bombs, spring pads, floor switches, and torchlit dungeons!
 */
export class SandboxToyboxGame implements CartridgeInstance {
  private readonly world: WorldKernel;
  public scriptError: string | null = null;

  constructor(scriptSource?: string, params?: RuntimeParams) {
    this.world = new WorldKernel({
      cartridgeId: 'sandbox-toybox',
      worldWidth: GAME_W,
      worldHeight: GAME_H,
      skyTop: '#8fd8ff',
      skyBottom: '#fff4df',
      statusBanner: '方向鍵推木箱、按 A 射火花引爆炸彈與火炬，或進積木工房改關卡！',
    });
    this.buildFromScript(scriptSource ?? DEFAULT_SANDBOX_SCRIPT, params);
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.world.debugHitboxes = enabled;
  }

  public buildFromScript(scriptSource: string, params?: RuntimeParams): void {
    this.world.solids = [];
    this.world.tiles = [];
    this.world.entities = [];
    this.world.juice.particles.length = 0;
    this.world.bgClouds = [
      { x: 32, y: 28, scale: 1.0, speed: 5, tint: '#ffffff', alpha: 0.78 },
      { x: 210, y: 38, scale: 1.15, speed: 6, tint: '#fffaf0', alpha: 0.72 },
    ];
    this.scriptError = null;

    // Floor ground across 320px atelier room
    this.world.solids.push({ x: 0, y: 150, w: GAME_W, h: 30, kind: 'solid' });
    for (let x = 0; x < GAME_W; x += 16) {
      this.world.tiles.push({ sprite: 'grass', x, y: 150, w: 16, h: 16 });
      this.world.tiles.push({ sprite: 'dirt', x, y: 166, w: 16, h: 16 });
    }

    let slimeCount = 0;

    const api: SandboxScriptApi = {
      setSky: (topHex: string, bottomHex: string) => {
        if (/^#[0-9a-fA-F]{6}$/.test(topHex)) this.world.skyTop = topHex;
        if (/^#[0-9a-fA-F]{6}$/.test(bottomHex)) this.world.skyBottom = bottomHex;
      },
      setDarkness: (alpha: number, tintHex = '#120e24') => {
        this.world.ambientDarkness = Math.max(0, Math.min(0.88, Number(alpha) || 0));
        if (/^#[0-9a-fA-F]{6}$/.test(tintHex)) this.world.ambientColor = tintHex;
      },
      setHeroSpawn: (x: number, y: number) => {
        this.world.hero.x = Math.max(8, Math.min(GAME_W - 24, Number(x) || 34));
        this.world.hero.y = Math.max(16, Math.min(134, Number(y) || 120));
      },
      addCloud: (x: number, y: number, tilesWide = 3) => {
        this.world.addCloudPlatform(Number(x) || 80, Number(y) || 120, tilesWide);
      },
      addWall: (x: number, y: number, w: number, h: number, sprite: SpriteId = 'stone') => {
        this.world.addSolidTileRect(
          Number(x) || 0,
          Number(y) || 0,
          Math.max(8, Number(w) || 16),
          Math.max(8, Number(h) || 16),
          sprite,
        );
      },
      addStar: (x: number, y: number) => {
        this.world.spawn(
          'star',
          Math.max(8, Math.min(GAME_W - 20, Number(x) || 100)),
          Math.max(16, Math.min(134, Number(y) || 100)),
        );
      },
      addSlime: (x: number, y: number) => {
        const sx = Math.max(16, Math.min(GAME_W - 32, Number(x) || 140));
        this.world.spawn('slime', sx, Number(y) || 134, {
          minX: Math.max(8, sx - 36),
          maxX: Math.min(GAME_W - 24, sx + 36),
          vx: slimeCount++ % 2 === 0 ? 28 : -28,
        });
      },
      addSpring: (x: number, y: number) => {
        this.world.spawn('spring', Number(x) || 80, Number(y) || 134);
      },
      addCrate: (x: number, y: number) => {
        this.world.spawn('crate', Number(x) || 110, Number(y) || 134);
      },
      addBomb: (x: number, y: number) => {
        this.world.spawn('bomb', Number(x) || 140, Number(y) || 134);
      },
      addTorch: (x: number, y: number) => {
        this.world.spawn('torch', Number(x) || 80, Number(y) || 134);
      },
      addSwitch: (x: number, y: number) => {
        this.world.spawn('switch_pad', Number(x) || 160, Number(y) || 134);
      },
      addKey: (x: number, y: number) => {
        this.world.spawn('key', Number(x) || 200, Number(y) || 96);
      },
      addGate: (x: number, y: number) => {
        this.world.spawn('gate', Number(x) || 288, Number(y) || 134);
      },
    };

    try {
      const fn = new Function('api', scriptSource);
      fn(api);
    } catch (err) {
      this.scriptError = err instanceof Error ? err.message : String(err);
      if (this.world.entities.every((e) => e.archetype !== 'star')) {
        api.addCloud(90, 120, 3);
        api.addStar(106, 98);
      }
    }

    // Apply enemyCount slider cleanly
    if (params) {
      const desired = Math.max(0, Math.min(8, Math.round(params.enemyCount)));
      const currentSlimes = this.world.entities.filter((e) => e.archetype === 'slime');
      if (currentSlimes.length > desired) {
        let toRemove = currentSlimes.length - desired;
        for (let i = this.world.entities.length - 1; i >= 0 && toRemove > 0; i--) {
          if (this.world.entities[i].archetype === 'slime') {
            this.world.entities.splice(i, 1);
            toRemove--;
          }
        }
      } else {
        for (let idx = currentSlimes.length; idx < desired; idx++) {
          const sx = Math.min(GAME_W - 28, 86 + idx * 34);
          api.addSlime(sx, 134);
        }
      }
    }

    // In dark dungeon rooms, swap grass/dirt visual tiles to stone bricks if darkness is set!
    if (this.world.ambientDarkness > 0.25) {
      for (const t of this.world.tiles) {
        if (t.sprite === 'grass' || t.sprite === 'dirt') {
          t.sprite = 'stone';
        }
      }
      this.world.bgClouds = [];
    }
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events = this.world.step(dt, input, params);
    if (this.scriptError) {
      this.world.statusBanner = `積木語法提醒：${this.scriptError}`;
    } else if (this.world.ambientDarkness > 0.25) {
      this.world.statusBanner = this.world.gateUnlocked
        ? '機關門開啟！踏入傳送門破關！'
        : '暗影地牢：推箱壓開關、用火炬或火花 A 引爆炸彈！';
    } else {
      this.world.statusBanner = '按 A 發射火花點燃木箱炸彈・F3 可切換碰撞除錯框！';
    }
    return events;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.world.status;
  }

  public getComboCount(): number {
    return this.world.juice.comboCount;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    return this.world.snapshot(params);
  }
}
