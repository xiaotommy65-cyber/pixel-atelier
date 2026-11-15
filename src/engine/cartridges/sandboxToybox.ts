import { GAME_H, GAME_W } from '../../gpu/GpuTypes.ts';
import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type {
  BgmTheme,
  CartridgeInstance,
  InputState,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
} from '../WorldTypes.ts';
import { WorldKernel } from '../core/WorldKernel.ts';

export const DEFAULT_SANDBOX_SCRIPT = `// 積木秘密基地：支援彈簧、木箱、連鎖炸彈、傳送門、移動平台與感應閘門！
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
  addSwitchWall(x: number, y: number, w: number, h: number, sprite?: SpriteId): void;
  addMovingPlatform(
    x: number,
    y: number,
    tilesWide: number,
    opts?: { minX?: number; maxX?: number; minY?: number; maxY?: number; vx?: number; vy?: number },
  ): void;
  addStar(x: number, y: number): void;
  addSlime(x: number, y: number): void;
  addSpring(x: number, y: number): void;
  addCrate(x: number, y: number): void;
  addBomb(x: number, y: number): void;
  addTorch(x: number, y: number): void;
  addSwitch(x: number, y: number): void;
  addPortal(x: number, y: number, group?: string): void;
  addKey(x: number, y: number): void;
  addGate(x: number, y: number): void;
}

interface PuzzleSpec {
  id: string;
  name: string;
  bgmTheme: BgmTheme;
  hint: string;
  build: (api: SandboxScriptApi) => void;
}

export const SANDBOX_PUZZLES: readonly PuzzleSpec[] = [
  {
    id: 'p1',
    name: 'P1 · 彈簧炸藥初試',
    bgmTheme: 'meadow',
    hint: 'P1：推木箱、按 A 發射火花引爆炸彈，拾取鑰匙開啟傳送門！',
    build: (api) => {
      api.setSky('#8fd8ff', '#fff4df');
      api.setHeroSpawn(20, 124);
      api.addCloud(78, 122, 3);
      api.addCloud(182, 94, 3);
      api.addSpring(56, 134);
      api.addCrate(116, 134);
      api.addBomb(136, 134);
      api.addStar(94, 98);
      api.addStar(202, 70);
      api.addSlime(172, 134);
      api.addKey(224, 70);
      api.addGate(286, 134);
    },
  },
  {
    id: 'p2',
    name: 'P2 · 感應開關牆',
    bgmTheme: 'meadow',
    hint: 'P2：將木箱推上紫色水晶踏板，解除封印石牆！',
    build: (api) => {
      api.setSky('#7ac8f5', '#ffe8cf');
      api.setHeroSpawn(20, 124);
      api.addCrate(70, 134);
      api.addSwitch(144, 134);
      api.addSwitchWall(212, 86, 16, 64, 'stone');
      api.addCloud(114, 108, 3);
      api.addStar(132, 84);
      api.addStar(254, 118);
      api.addGate(284, 134);
    },
  },
  {
    id: 'p3',
    name: 'P3 · 雙向傳送門',
    bgmTheme: 'meadow',
    hint: 'P3：踏入紫色傳送陣瞬間穿越石壁，別忘了右方鑰匙！',
    build: (api) => {
      api.setSky('#90c7ff', '#ffdff2');
      api.setHeroSpawn(20, 124);
      api.addWall(148, 32, 16, 118, 'stone');
      api.addPortal(94, 134, 'a');
      api.addPortal(190, 134, 'a');
      api.addCloud(52, 108, 3);
      api.addStar(68, 84);
      api.addStar(234, 114);
      api.addKey(234, 134);
      api.addGate(284, 134);
    },
  },
  {
    id: 'p4',
    name: 'P4 · 火炬暗影地牢',
    bgmTheme: 'dungeon',
    hint: 'P4：靠火炬光影照明，用火花 A 點燃炸彈炸開箱子並踩踏板！',
    build: (api) => {
      api.setSky('#141026', '#2a1d42');
      api.setDarkness(0.72, '#0d091c');
      api.setHeroSpawn(20, 124);
      api.addTorch(54, 134);
      api.addTorch(194, 134);
      api.addTorch(266, 134);
      api.addCrate(86, 134);
      api.addBomb(114, 134);
      api.addSwitch(210, 134);
      api.addSwitchWall(242, 84, 16, 66, 'stone');
      api.addStar(146, 114);
      api.addStar(256, 108);
      api.addSlime(166, 134);
      api.addGate(286, 134);
    },
  },
  {
    id: 'p5',
    name: 'P5 · 空中移動浮橋',
    bgmTheme: 'meadow',
    hint: 'P5：搭乘移動浮橋橫越空中獲取鑰匙與高空星徽！',
    build: (api) => {
      api.setSky('#66b5f5', '#fff2d8');
      api.setHeroSpawn(20, 124);
      api.addWall(112, 92, 32, 58, 'crate');
      api.addMovingPlatform(152, 96, 3, { minX: 150, maxX: 214, vx: 38 });
      api.addCloud(260, 86, 3);
      api.addSpring(84, 134);
      api.addStar(120, 68);
      api.addStar(274, 62);
      api.addKey(280, 66);
      api.addGate(286, 134);
    },
  },
  {
    id: 'p6',
    name: 'P6 · 連鎖爆破迷庫',
    bgmTheme: 'dungeon',
    hint: 'P6：點燃一顆炸彈引爆整排火藥桶，清空守護史萊姆！',
    build: (api) => {
      api.setSky('#282147', '#593b6b');
      api.setDarkness(0.35, '#120e24');
      api.setHeroSpawn(20, 124);
      api.addTorch(46, 134);
      api.addBomb(92, 134);
      api.addCrate(112, 134);
      api.addBomb(132, 134);
      api.addCrate(152, 134);
      api.addBomb(172, 134);
      api.addSlime(198, 134);
      api.addSlime(232, 134);
      api.addSwitch(248, 134);
      api.addStar(118, 96);
      api.addStar(202, 96);
      api.addGate(288, 134);
    },
  },
  {
    id: 'p7',
    name: 'P7 · 雙傳送升降陣',
    bgmTheme: 'meadow',
    hint: 'P7：善用雙組傳送陣與垂直電梯抵達藏寶密室！',
    build: (api) => {
      api.setSky('#6ec4db', '#ffe8f0');
      api.setHeroSpawn(20, 124);
      api.addWall(128, 36, 16, 114, 'stone');
      api.addWall(224, 36, 16, 114, 'stone');
      api.addPortal(82, 134, 'a');
      api.addPortal(162, 134, 'a');
      api.addMovingPlatform(178, 120, 2, { minY: 64, maxY: 126, vy: -32 });
      api.addPortal(176, 48, 'b');
      api.addPortal(254, 134, 'b');
      api.addStar(182, 94);
      api.addStar(268, 110);
      api.addKey(196, 48);
      api.addGate(288, 134);
    },
  },
  {
    id: 'p8',
    name: 'P8 · 幽影壓板迷室',
    bgmTheme: 'dungeon',
    hint: 'P8：幽暗地宮內兩道石牆！尋找隱藏踏板並小心史萊姆！',
    build: (api) => {
      api.setSky('#100c20', '#23173b');
      api.setDarkness(0.76, '#0a0714');
      api.setHeroSpawn(20, 124);
      api.addTorch(44, 134);
      api.addTorch(138, 134);
      api.addTorch(238, 134);
      api.addCrate(76, 134);
      api.addSwitch(104, 134);
      api.addSwitchWall(164, 68, 16, 82, 'stone');
      api.addSlime(198, 134);
      api.addBomb(188, 134);
      api.addCloud(190, 96, 3);
      api.addStar(202, 72);
      api.addStar(258, 110);
      api.addGate(288, 134);
    },
  },
  {
    id: 'p9',
    name: 'P9 · 浮空彈簧迴廊',
    bgmTheme: 'meadow',
    hint: 'P9：彈簧、雲橋與傳送門的節奏跳躍挑戰！',
    build: (api) => {
      api.setSky('#7eb0f7', '#fff2df');
      api.setHeroSpawn(20, 124);
      api.addSpring(56, 134);
      api.addCloud(82, 96, 3);
      api.addMovingPlatform(142, 86, 3, { minX: 138, maxX: 204, vx: 44 });
      api.addWall(236, 44, 16, 106, 'crate');
      api.addPortal(214, 66, 'a');
      api.addPortal(260, 134, 'a');
      api.addStar(96, 72);
      api.addStar(188, 56);
      api.addKey(148, 134);
      api.addSlime(174, 134);
      api.addGate(288, 134);
    },
  },
  {
    id: 'p10',
    name: 'P10 · 積木大師終極試煉',
    bgmTheme: 'boss',
    hint: 'P10 最終關：結合連鎖火藥、傳送陣、移動平台與開關牆征服密室！',
    build: (api) => {
      api.setSky('#1b1236', '#4a2159');
      api.setDarkness(0.58, '#0f0921');
      api.setHeroSpawn(18, 124);
      api.addTorch(44, 134);
      api.addTorch(178, 134);
      api.addTorch(264, 134);
      api.addSpring(58, 134);
      api.addCloud(82, 96, 3);
      api.addPortal(94, 78, 'z');
      api.addPortal(150, 134, 'z');
      api.addWall(126, 40, 16, 110, 'stone');
      api.addBomb(170, 134);
      api.addCrate(190, 134);
      api.addSwitch(212, 134);
      api.addSwitchWall(246, 72, 16, 78, 'stone');
      api.addMovingPlatform(188, 86, 3, { minX: 184, maxX: 230, vx: 42 });
      api.addStar(98, 54);
      api.addStar(208, 60);
      api.addStar(268, 108);
      api.addSlime(208, 134);
      api.addGate(288, 134);
    },
  },
];

/**
 * PA-03 Sandbox Toybox: Supports BOTH 10-Stage Zelda-Style Puzzle Campaign
 * AND Free Live-Scriptable Workshop Mode powered by WorldKernel + RuleMatrix!
 */
export class SandboxToyboxGame implements CartridgeInstance {
  private readonly world: WorldKernel;
  private readonly campaignMode: boolean;
  private puzzleIdx = 0;
  private bestStarsByStage: number[] = SANDBOX_PUZZLES.map(() => 0);
  public scriptError: string | null = null;

  constructor(scriptSource?: string, params?: RuntimeParams) {
    this.world = new WorldKernel({
      cartridgeId: 'sandbox-toybox',
      worldWidth: GAME_W,
      worldHeight: GAME_H,
      skyTop: '#8fd8ff',
      skyBottom: '#fff4df',
    });
    const isCustomScript = Boolean(scriptSource && scriptSource.trim() !== DEFAULT_SANDBOX_SCRIPT.trim());
    this.campaignMode = !isCustomScript;
    if (this.campaignMode) {
      this.loadPuzzle(0, params);
    } else {
      this.buildFromScript(scriptSource ?? DEFAULT_SANDBOX_SCRIPT, params);
    }
  }

  public isCampaignMode(): boolean {
    return this.campaignMode;
  }

  public getPuzzleIndex(): number {
    return this.puzzleIdx;
  }

  public getPuzzleCount(): number {
    return SANDBOX_PUZZLES.length;
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.world.debugHitboxes = enabled;
  }

  private createScriptApi(applyGroundSprite = true): SandboxScriptApi {
    let slimeCount = 0;
    this.world.solids.push({ x: 0, y: 150, w: GAME_W, h: 30, kind: 'solid' });
    if (applyGroundSprite) {
      for (let x = 0; x < GAME_W; x += 16) {
        this.world.tiles.push({ sprite: 'grass', x, y: 150, w: 16, h: 16 });
        this.world.tiles.push({ sprite: 'dirt', x, y: 166, w: 16, h: 16 });
      }
    }

    return {
      setSky: (topHex: string, bottomHex: string) => {
        if (/^#[0-9a-fA-F]{6}$/.test(topHex)) this.world.skyTop = topHex;
        if (/^#[0-9a-fA-F]{6}$/.test(bottomHex)) this.world.skyBottom = bottomHex;
      },
      setDarkness: (alpha: number, tintHex = '#120e24') => {
        this.world.ambientDarkness = Math.max(0, Math.min(0.88, Number(alpha) || 0));
        if (/^#[0-9a-fA-F]{6}$/.test(tintHex)) this.world.ambientColor = tintHex;
      },
      setHeroSpawn: (x: number, y: number) => {
        const sx = Math.max(8, Math.min(GAME_W - 24, Number(x) || 34));
        const sy = Math.max(16, Math.min(134, Number(y) || 120));
        this.world.hero.x = sx;
        this.world.hero.y = sy;
        this.world.hero.checkpoint = { x: sx, y: sy };
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
      addSwitchWall: (x: number, y: number, w: number, h: number, sprite: SpriteId = 'stone') => {
        this.world.addSolidTileRect(
          Number(x) || 0,
          Number(y) || 0,
          Math.max(8, Number(w) || 16),
          Math.max(8, Number(h) || 16),
          sprite,
          '#e0aaff',
          true,
        );
      },
      addMovingPlatform: (x: number, y: number, tilesWide = 3, opts = {}) => {
        this.world.addMovingPlatform(Number(x) || 120, Number(y) || 110, tilesWide, opts);
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
      addPortal: (x: number, y: number, group = 'main') => {
        this.world.spawn('portal', Number(x) || 100, Number(y) || 134, { portalGroup: group });
      },
      addKey: (x: number, y: number) => {
        this.world.spawn('key', Number(x) || 200, Number(y) || 96);
      },
      addGate: (x: number, y: number) => {
        this.world.spawn('gate', Number(x) || 288, Number(y) || 134);
      },
    };
  }

  public loadPuzzle(idx: number, _params?: RuntimeParams): void {
    this.puzzleIdx = Math.max(0, Math.min(SANDBOX_PUZZLES.length - 1, idx));
    const spec = SANDBOX_PUZZLES[this.puzzleIdx];
    this.world.resetStage({
      worldWidth: GAME_W,
      worldHeight: GAME_H,
      skyTop: '#8fd8ff',
      skyBottom: '#fff4df',
      ambientDarkness: 0,
      statusBanner: spec.hint,
      stage: {
        index: this.puzzleIdx + 1,
        total: SANDBOX_PUZZLES.length,
        name: spec.name,
      },
      bgmTheme: spec.bgmTheme,
    });
    this.world.bgClouds = [
      { x: 32, y: 28, scale: 1.0, speed: 5, tint: '#ffffff', alpha: 0.78 },
      { x: 210, y: 38, scale: 1.15, speed: 6, tint: '#fffaf0', alpha: 0.72 },
    ];
    this.scriptError = null;
    const api = this.createScriptApi(true);
    spec.build(api);
    if (this.world.ambientDarkness > 0.25) {
      for (const t of this.world.tiles) {
        if (t.sprite === 'grass' || t.sprite === 'dirt') t.sprite = 'stone';
      }
      this.world.bgClouds = [];
    }
  }

  public buildFromScript(scriptSource: string, params?: RuntimeParams): void {
    this.world.resetStage({
      worldWidth: GAME_W,
      worldHeight: GAME_H,
      skyTop: '#8fd8ff',
      skyBottom: '#fff4df',
      ambientDarkness: 0,
      bgmTheme: 'meadow',
    });
    this.world.bgClouds = [
      { x: 32, y: 28, scale: 1.0, speed: 5, tint: '#ffffff', alpha: 0.78 },
      { x: 210, y: 38, scale: 1.15, speed: 6, tint: '#fffaf0', alpha: 0.72 },
    ];
    this.scriptError = null;

    const api = this.createScriptApi(true);
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

    // Apply enemyCount slider cleanly in Workshop mode
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

    if (this.world.ambientDarkness > 0.25) {
      for (const t of this.world.tiles) {
        if (t.sprite === 'grass' || t.sprite === 'dirt') t.sprite = 'stone';
      }
      this.world.bgClouds = [];
    }
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events = this.world.step(dt, input, params);
    if (this.campaignMode) {
      const curStars = this.world.getStageStars().collected;
      if (curStars > this.bestStarsByStage[this.puzzleIdx]) {
        this.bestStarsByStage[this.puzzleIdx] = curStars;
      }
      const spec = SANDBOX_PUZZLES[this.puzzleIdx];
      this.world.statusBanner = this.world.gateUnlocked
        ? `${spec.name}｜機關已解鎖！踏入彩虹傳送門前往下一關！`
        : spec.hint;

      if (this.world.status === 'won' && this.puzzleIdx + 1 < SANDBOX_PUZZLES.length) {
        this.world.hearts = Math.min(this.world.maxHearts, this.world.hearts + 1);
        this.loadPuzzle(this.puzzleIdx + 1);
        this.world.juice.triggerFlash('#fffaf0', 0.24);
        events.push('key');
      }
      return events;
    }

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

  public retryStage(): void {
    if (!this.campaignMode) return;
    this.world.hearts = this.world.maxHearts;
    this.loadPuzzle(this.puzzleIdx);
  }

  public serializeSave(): unknown {
    if (!this.campaignMode) return null;
    return {
      v: 1,
      puzzleIdx: this.puzzleIdx,
      score: this.world.score,
      hearts: this.world.hearts,
      bestStarsByStage: [...this.bestStarsByStage],
    };
  }

  public hydrateSave(raw: unknown): boolean {
    if (!this.campaignMode || !raw || typeof raw !== 'object') return false;
    const s = raw as { v?: number; puzzleIdx?: number; score?: number; hearts?: number; bestStarsByStage?: number[] };
    if (s.v !== 1 || typeof s.puzzleIdx !== 'number') return false;
    this.world.score = Number(s.score ?? 0);
    this.world.hearts = Math.max(1, Math.min(this.world.maxHearts, Number(s.hearts ?? 3)));
    if (Array.isArray(s.bestStarsByStage)) {
      this.bestStarsByStage = SANDBOX_PUZZLES.map((_, i) => Number(s.bestStarsByStage?.[i] ?? 0));
    }
    this.loadPuzzle(s.puzzleIdx);
    this.world.noticeBanner = `💾 已從 ${SANDBOX_PUZZLES[this.puzzleIdx].name} 續關！`;
    this.world.noticeTimer = 3.0;
    return true;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.world.status;
  }

  public getComboCount(): number {
    return this.world.juice.comboCount;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const snap = this.world.snapshot(params);
    if (this.campaignMode) {
      const curCollected = this.world.getStageStars().collected;
      let totalCollected = 0;
      for (let i = 0; i < SANDBOX_PUZZLES.length; i++) {
        totalCollected += i === this.puzzleIdx ? Math.max(this.bestStarsByStage[i], curCollected) : this.bestStarsByStage[i];
      }
      snap.starsCollected = totalCollected;
      snap.starsTotal = 21;
    }
    return snap;
  }
}
