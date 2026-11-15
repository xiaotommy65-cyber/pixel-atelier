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

interface IslandDef {
  startTile: number;
  countTiles: number;
  topY: number;
}

interface CloudDef {
  x: number;
  y: number;
  tilesWide: number;
}

interface MovingPlatDef {
  x: number;
  y: number;
  tilesWide: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  vx?: number;
  vy?: number;
}

interface SlimeDef {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  vx: number;
}

interface CloudberryStageSpec {
  id: string;
  name: string;
  worldWidth: number;
  skyTop: string;
  skyBottom: string;
  ambientDarkness: number;
  groundTop: SpriteId;
  groundFill: SpriteId;
  bgmTheme: BgmTheme;
  spawn: { x: number; y: number };
  islands: IslandDef[];
  clouds: CloudDef[];
  movingPlats?: MovingPlatDef[];
  slimes: SlimeDef[];
  springs?: { x: number; y: number }[];
  torches?: { x: number; y: number }[];
  checkpoints?: { x: number; y: number }[];
  stars: { x: number; y: number }[];
  coins?: { x: number; y: number }[];
  relic?: { id: 'feather' | 'dash_badge'; x: number; y: number };
  keyPos?: { x: number; y: number };
  bossPos?: { x: number; y: number; minX: number; maxX: number };
  gatePos: { x: number; y: number };
  hint: string;
}

const WORLD_H = 180;

export const CLOUDBERRY_STAGES: readonly CloudberryStageSpec[] = [
  {
    id: 'w1-1',
    name: 'W1-1 · 晴空草坪',
    worldWidth: 736,
    skyTop: '#76c7ff',
    skyBottom: '#fff3df',
    ambientDarkness: 0,
    groundTop: 'grass',
    groundFill: 'dirt',
    bgmTheme: 'meadow',
    spawn: { x: 26, y: 122 },
    islands: [
      { startTile: 0, countTiles: 9, topY: 148 },
      { startTile: 15, countTiles: 7, topY: 136 },
      { startTile: 26, countTiles: 8, topY: 140 },
      { startTile: 39, countTiles: 7, topY: 136 },
    ],
    clouds: [
      { x: 164, y: 126, tilesWide: 4 },
      { x: 368, y: 108, tilesWide: 4 },
      { x: 442, y: 74, tilesWide: 4 },
      { x: 562, y: 118, tilesWide: 3 },
    ],
    slimes: [
      { x: 100, y: 132, minX: 74, maxX: 128, vx: 26 },
      { x: 274, y: 120, minX: 244, maxX: 334, vx: -30 },
      { x: 454, y: 124, minX: 422, maxX: 526, vx: 32 },
    ],
    springs: [{ x: 426, y: 124 }],
    checkpoints: [{ x: 264, y: 120 }],
    stars: [
      { x: 188, y: 104 },
      { x: 390, y: 86 },
      { x: 580, y: 94 },
    ],
    coins: [
      { x: 286, y: 112 },
      { x: 500, y: 118 },
    ],
    keyPos: { x: 466, y: 52 },
    gatePos: { x: 676, y: 120 },
    hint: 'W1-1：踩扁史萊姆、彈簧飛躍拾取金鑰匙打開大門！',
  },
  {
    id: 'w1-2',
    name: 'W1-2 · 彩虹高塔',
    worldWidth: 768,
    skyTop: '#6abcf7',
    skyBottom: '#ffe6d8',
    ambientDarkness: 0,
    groundTop: 'grass',
    groundFill: 'dirt',
    bgmTheme: 'meadow',
    spawn: { x: 24, y: 124 },
    islands: [
      { startTile: 0, countTiles: 8, topY: 148 },
      { startTile: 12, countTiles: 6, topY: 134 },
      { startTile: 22, countTiles: 7, topY: 144 },
      { startTile: 33, countTiles: 6, topY: 128 },
      { startTile: 42, countTiles: 6, topY: 136 },
    ],
    clouds: [
      { x: 142, y: 118, tilesWide: 3 },
      { x: 294, y: 104, tilesWide: 4 },
      { x: 386, y: 74, tilesWide: 3 },
      { x: 618, y: 104, tilesWide: 3 },
    ],
    movingPlats: [{ x: 470, y: 116, tilesWide: 3, minX: 462, maxX: 526, vx: 38 }],
    slimes: [
      { x: 220, y: 118, minX: 196, maxX: 272, vx: 30 },
      { x: 392, y: 128, minX: 356, maxX: 446, vx: -34 },
      { x: 560, y: 112, minX: 530, maxX: 604, vx: 32 },
    ],
    springs: [
      { x: 104, y: 132 },
      { x: 356, y: 128 },
    ],
    checkpoints: [{ x: 372, y: 128 }],
    stars: [
      { x: 156, y: 94 },
      { x: 398, y: 50 },
      { x: 634, y: 80 },
    ],
    coins: [
      { x: 318, y: 82 },
      { x: 500, y: 94 },
    ],
    keyPos: { x: 400, y: 52 },
    gatePos: { x: 716, y: 120 },
    hint: 'W1-2：搭乘移動浮雲踏板，攀上彩虹塔頂拿鑰匙！',
  },
  {
    id: 'w2-1',
    name: 'W2-1 · 風車雲海',
    worldWidth: 800,
    skyTop: '#5cb2f2',
    skyBottom: '#fff0d6',
    ambientDarkness: 0,
    groundTop: 'crate',
    groundFill: 'stone',
    bgmTheme: 'meadow',
    spawn: { x: 24, y: 122 },
    islands: [
      { startTile: 0, countTiles: 9, topY: 146 },
      { startTile: 13, countTiles: 6, topY: 142 },
      { startTile: 24, countTiles: 7, topY: 138 },
      { startTile: 36, countTiles: 6, topY: 142 },
      { startTile: 44, countTiles: 6, topY: 132 },
    ],
    clouds: [
      { x: 156, y: 112, tilesWide: 3 },
      { x: 312, y: 110, tilesWide: 3 },
      { x: 420, y: 80, tilesWide: 4 },
      { x: 526, y: 110, tilesWide: 3 },
    ],
    movingPlats: [{ x: 620, y: 122, tilesWide: 3, minY: 96, maxY: 132, vy: -30 }],
    slimes: [
      { x: 244, y: 126, minX: 212, maxX: 288, vx: 34 },
      { x: 416, y: 122, minX: 388, maxX: 482, vx: -36 },
      { x: 604, y: 126, minX: 578, maxX: 654, vx: 34 },
    ],
    springs: [{ x: 118, y: 130 }],
    relic: { id: 'feather', x: 170, y: 88 },
    checkpoints: [{ x: 396, y: 122 }],
    stars: [
      { x: 326, y: 86 },
      { x: 446, y: 56 },
      { x: 634, y: 74 },
    ],
    coins: [
      { x: 236, y: 120 },
      { x: 540, y: 86 },
    ],
    keyPos: { x: 454, y: 56 },
    gatePos: { x: 748, y: 116 },
    hint: 'W2-1：拾取「雲海羽毛」解鎖【二段跳】飛越高空！',
  },
  {
    id: 'w2-2',
    name: 'W2-2 · 羽毛試煉',
    worldWidth: 832,
    skyTop: '#5694e8',
    skyBottom: '#ffd6e6',
    ambientDarkness: 0,
    groundTop: 'crate',
    groundFill: 'stone',
    bgmTheme: 'meadow',
    spawn: { x: 24, y: 122 },
    islands: [
      { startTile: 0, countTiles: 7, topY: 146 },
      { startTile: 12, countTiles: 5, topY: 136 },
      { startTile: 22, countTiles: 6, topY: 142 },
      { startTile: 33, countTiles: 5, topY: 128 },
      { startTile: 45, countTiles: 7, topY: 132 },
    ],
    clouds: [
      { x: 124, y: 118, tilesWide: 3 },
      { x: 282, y: 102, tilesWide: 3 },
      { x: 462, y: 100, tilesWide: 3 },
      { x: 632, y: 92, tilesWide: 4 },
    ],
    movingPlats: [
      { x: 382, y: 124, tilesWide: 3, minX: 368, maxX: 432, vx: 42 },
      { x: 556, y: 118, tilesWide: 3, minX: 546, maxX: 604, vx: -40 },
    ],
    slimes: [
      { x: 220, y: 120, minX: 194, maxX: 256, vx: 34 },
      { x: 386, y: 126, minX: 356, maxX: 432, vx: -36 },
      { x: 544, y: 112, minX: 530, maxX: 592, vx: 38 },
      { x: 754, y: 116, minX: 724, maxX: 800, vx: -36 },
    ],
    checkpoints: [{ x: 368, y: 126 }],
    stars: [
      { x: 138, y: 92 },
      { x: 478, y: 74 },
      { x: 660, y: 66 },
    ],
    coins: [
      { x: 296, y: 78 },
      { x: 570, y: 94 },
    ],
    keyPos: { x: 660, y: 66 },
    gatePos: { x: 788, y: 116 },
    hint: 'W2-2：善用空中二段跳跨越斷崖與移動浮台！',
  },
  {
    id: 'w3-1',
    name: 'W3-1 · 星光暗洞',
    worldWidth: 800,
    skyTop: '#16112b',
    skyBottom: '#2d2152',
    ambientDarkness: 0.68,
    groundTop: 'stone',
    groundFill: 'stone',
    bgmTheme: 'dungeon',
    spawn: { x: 24, y: 122 },
    islands: [
      { startTile: 0, countTiles: 9, topY: 148 },
      { startTile: 13, countTiles: 7, topY: 140 },
      { startTile: 24, countTiles: 8, topY: 142 },
      { startTile: 36, countTiles: 7, topY: 134 },
      { startTile: 45, countTiles: 5, topY: 138 },
    ],
    clouds: [
      { x: 156, y: 116, tilesWide: 3 },
      { x: 330, y: 108, tilesWide: 3 },
      { x: 512, y: 102, tilesWide: 3 },
    ],
    slimes: [
      { x: 240, y: 124, minX: 212, maxX: 304, vx: 36 },
      { x: 420, y: 126, minX: 388, maxX: 492, vx: -38 },
      { x: 608, y: 118, minX: 580, maxX: 668, vx: 38 },
    ],
    torches: [
      { x: 58, y: 132 },
      { x: 256, y: 124 },
      { x: 432, y: 126 },
      { x: 624, y: 118 },
      { x: 742, y: 122 },
    ],
    relic: { id: 'dash_badge', x: 170, y: 92 },
    checkpoints: [{ x: 404, y: 126 }],
    stars: [
      { x: 344, y: 84 },
      { x: 526, y: 78 },
      { x: 626, y: 110 },
    ],
    coins: [
      { x: 274, y: 120 },
      { x: 690, y: 110 },
    ],
    keyPos: { x: 526, y: 78 },
    gatePos: { x: 752, y: 122 },
    hint: 'W3-1：取得「流星徽章」！空中按 A 施展【空中衝刺】！',
  },
  {
    id: 'w3-2',
    name: 'W3-2 · 幽影秘道',
    worldWidth: 832,
    skyTop: '#120d26',
    skyBottom: '#2b1847',
    ambientDarkness: 0.72,
    groundTop: 'stone',
    groundFill: 'stone',
    bgmTheme: 'dungeon',
    spawn: { x: 24, y: 122 },
    islands: [
      { startTile: 0, countTiles: 7, topY: 146 },
      { startTile: 12, countTiles: 6, topY: 136 },
      { startTile: 22, countTiles: 6, topY: 142 },
      { startTile: 33, countTiles: 6, topY: 132 },
      { startTile: 44, countTiles: 8, topY: 136 },
    ],
    clouds: [
      { x: 124, y: 114, tilesWide: 3 },
      { x: 300, y: 98, tilesWide: 3 },
      { x: 470, y: 94, tilesWide: 3 },
    ],
    movingPlats: [{ x: 628, y: 118, tilesWide: 3, minX: 616, maxX: 680, vx: 44 }],
    slimes: [
      { x: 220, y: 120, minX: 194, maxX: 272, vx: 38 },
      { x: 390, y: 126, minX: 356, maxX: 432, vx: -40 },
      { x: 560, y: 116, minX: 530, maxX: 608, vx: 40 },
      { x: 740, y: 120, minX: 708, maxX: 800, vx: -40 },
    ],
    torches: [
      { x: 54, y: 130 },
      { x: 230, y: 120 },
      { x: 386, y: 126 },
      { x: 564, y: 116 },
      { x: 760, y: 120 },
    ],
    checkpoints: [{ x: 368, y: 126 }],
    stars: [
      { x: 140, y: 88 },
      { x: 314, y: 74 },
      { x: 484, y: 70 },
    ],
    coins: [
      { x: 650, y: 94 },
      { x: 726, y: 114 },
    ],
    keyPos: { x: 484, y: 70 },
    gatePos: { x: 792, y: 120 },
    hint: 'W3-2：結合二段跳與空中衝刺突破黑暗峽谷！',
  },
  {
    id: 'w4-1',
    name: 'W4-1 · 天空浮城',
    worldWidth: 864,
    skyTop: '#ff96b8',
    skyBottom: '#fff0d8',
    ambientDarkness: 0,
    groundTop: 'grass',
    groundFill: 'stone',
    bgmTheme: 'meadow',
    spawn: { x: 24, y: 122 },
    islands: [
      { startTile: 0, countTiles: 7, topY: 146 },
      { startTile: 12, countTiles: 5, topY: 134 },
      { startTile: 22, countTiles: 5, topY: 138 },
      { startTile: 32, countTiles: 6, topY: 126 },
      { startTile: 46, countTiles: 8, topY: 136 },
    ],
    clouds: [
      { x: 130, y: 112, tilesWide: 3 },
      { x: 288, y: 96, tilesWide: 3 },
      { x: 454, y: 96, tilesWide: 3 },
    ],
    movingPlats: [
      { x: 620, y: 122, tilesWide: 3, minX: 608, maxX: 694, vx: 50 },
      { x: 696, y: 98, tilesWide: 3, minY: 82, maxY: 120, vy: 34 },
    ],
    slimes: [
      { x: 214, y: 118, minX: 194, maxX: 254, vx: 42 },
      { x: 380, y: 122, minX: 354, maxX: 416, vx: -42 },
      { x: 542, y: 110, minX: 514, maxX: 590, vx: 44 },
      { x: 760, y: 120, minX: 738, maxX: 828, vx: -42 },
    ],
    springs: [{ x: 400, y: 122 }],
    checkpoints: [{ x: 526, y: 110 }],
    stars: [
      { x: 146, y: 88 },
      { x: 304, y: 72 },
      { x: 660, y: 74 },
    ],
    coins: [
      { x: 468, y: 74 },
      { x: 768, y: 116 },
    ],
    keyPos: { x: 468, y: 74 },
    gatePos: { x: 826, y: 120 },
    hint: 'W4-1：彩虹浮城終盤挑戰，準備迎接王座殿堂！',
  },
  {
    id: 'w4-2',
    name: 'W4-2 · 史萊姆王殿',
    worldWidth: 640,
    skyTop: '#4a2b69',
    skyBottom: '#ff96b8',
    ambientDarkness: 0.16,
    groundTop: 'stone',
    groundFill: 'stone',
    bgmTheme: 'boss',
    spawn: { x: 28, y: 122 },
    islands: [
      { startTile: 0, countTiles: 10, topY: 148 },
      { startTile: 11, countTiles: 29, topY: 148 },
    ],
    clouds: [
      { x: 224, y: 108, tilesWide: 3 },
      { x: 356, y: 92, tilesWide: 4 },
      { x: 486, y: 108, tilesWide: 3 },
    ],
    slimes: [
      { x: 180, y: 132, minX: 164, maxX: 256, vx: 40 },
      { x: 510, y: 132, minX: 460, maxX: 556, vx: -40 },
    ],
    springs: [
      { x: 188, y: 132 },
      { x: 544, y: 132 },
    ],
    checkpoints: [{ x: 120, y: 132 }],
    stars: [
      { x: 240, y: 82 },
      { x: 382, y: 66 },
      { x: 500, y: 82 },
    ],
    bossPos: { x: 380, y: 132, minX: 240, maxX: 520 },
    gatePos: { x: 596, y: 132 },
    hint: 'W4-2 Boss 戰：連續踩踏「巨大史萊姆王」5 次奪取勝利！',
  },
];

/**
 * PA-01 Cloudberry Hop: 4 Worlds x 2 Stages = 8-Stage Platformer Campaign (24 Stars Total).
 * Clean data-driven StageSpec[] powering WorldKernel with Double-Jump & Air-Dash Relics, Checkpoints & Boss Battle.
 */
export class CloudberryHopGame implements CartridgeInstance {
  private readonly world: WorldKernel;
  private stageIdx = 0;
  private bestStarsByStage: number[] = CLOUDBERRY_STAGES.map(() => 0);

  constructor(initialStage = 0) {
    this.world = new WorldKernel({
      cartridgeId: 'cloudberry-hop',
      worldWidth: 736,
      worldHeight: WORLD_H,
    });
    this.loadStage(initialStage);
  }

  public getStageCount(): number {
    return CLOUDBERRY_STAGES.length;
  }

  public getStageIndex(): number {
    return this.stageIdx;
  }

  public loadStage(idx: number): void {
    this.stageIdx = Math.max(0, Math.min(CLOUDBERRY_STAGES.length - 1, idx));
    const spec = CLOUDBERRY_STAGES[this.stageIdx];
    this.world.resetStage({
      worldWidth: spec.worldWidth,
      worldHeight: WORLD_H,
      skyTop: spec.skyTop,
      skyBottom: spec.skyBottom,
      ambientDarkness: spec.ambientDarkness,
      statusBanner: spec.hint,
      spawnX: spec.spawn.x,
      spawnY: spec.spawn.y,
      stage: {
        index: this.stageIdx + 1,
        total: CLOUDBERRY_STAGES.length,
        name: spec.name,
      },
      bgmTheme: spec.bgmTheme,
    });

    for (const isl of spec.islands) {
      const startX = isl.startTile * 16;
      const width = isl.countTiles * 16;
      this.world.solids.push({ x: startX, y: isl.topY, w: width, h: WORLD_H - isl.topY, kind: 'solid' });
      for (let i = 0; i < isl.countTiles; i++) {
        const x = startX + i * 16;
        this.world.tiles.push({ sprite: spec.groundTop, x, y: isl.topY, w: 16, h: 16 });
        for (let y = isl.topY + 16; y < WORLD_H; y += 16) {
          this.world.tiles.push({ sprite: spec.groundFill, x, y, w: 16, h: 16 });
        }
      }
    }

    for (const c of spec.clouds) {
      this.world.addCloudPlatform(c.x, c.y, c.tilesWide);
    }
    for (const mp of spec.movingPlats ?? []) {
      this.world.addMovingPlatform(mp.x, mp.y, mp.tilesWide, mp);
    }
    for (const sp of spec.springs ?? []) {
      this.world.spawn('spring', sp.x, sp.y);
    }
    for (const tr of spec.torches ?? []) {
      this.world.spawn('torch', tr.x, tr.y);
    }
    for (const cp of spec.checkpoints ?? []) {
      this.world.spawn('checkpoint_flag', cp.x, cp.y);
    }
    for (const s of spec.slimes) {
      this.world.spawn('slime', s.x, s.y, { minX: s.minX, maxX: s.maxX, vx: s.vx });
    }
    for (const st of spec.stars) {
      this.world.spawn('star', st.x, st.y);
    }
    for (const cn of spec.coins ?? []) {
      this.world.spawn('coin', cn.x, cn.y);
    }
    if (spec.relic) {
      this.world.spawn(spec.relic.id, spec.relic.x, spec.relic.y);
    }
    if (spec.keyPos) {
      this.world.spawn('key', spec.keyPos.x, spec.keyPos.y);
    }
    if (spec.bossPos) {
      this.world.spawn('slime_king', spec.bossPos.x, spec.bossPos.y, {
        minX: spec.bossPos.minX,
        maxX: spec.bossPos.maxX,
        vx: 44,
        hp: 5,
      });
    }
    this.world.spawn('gate', spec.gatePos.x, spec.gatePos.y);

    this.world.bgClouds = spec.ambientDarkness > 0.3
      ? []
      : [
          { x: 40, y: 34, scale: 1.1, speed: 6, tint: '#ffffff', alpha: 0.78 },
          { x: 190, y: 24, scale: 0.9, speed: 4, tint: '#fffaf0', alpha: 0.68 },
          { x: 350, y: 46, scale: 1.25, speed: 7, tint: '#ffffff', alpha: 0.72 },
          { x: 540, y: 28, scale: 1.0, speed: 5, tint: '#fffaf0', alpha: 0.76 },
        ];
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.world.debugHitboxes = enabled;
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events = this.world.step(dt, input, params);
    const curStars = this.world.getStageStars().collected;
    if (curStars > this.bestStarsByStage[this.stageIdx]) {
      this.bestStarsByStage[this.stageIdx] = curStars;
    }

    const spec = CLOUDBERRY_STAGES[this.stageIdx];
    const boss = this.world.entities.find((e) => e.alive && e.tags.has('boss'));
    if (boss) {
      this.world.statusBanner = `👑 巨大史萊姆王 HP ${boss.hp}/${boss.maxHp}｜踩踏 5 次擊敗！`;
    } else if (this.world.gateUnlocked) {
      this.world.statusBanner = `${spec.name}｜門已開啟！踏入傳送門前往下一關！`;
    } else {
      this.world.statusBanner = spec.hint;
    }

    if (this.world.status === 'won' && this.stageIdx + 1 < CLOUDBERRY_STAGES.length) {
      this.world.hearts = Math.min(this.world.maxHearts, this.world.hearts + 1);
      this.loadStage(this.stageIdx + 1);
      this.world.juice.triggerFlash('#fffaf0', 0.25);
      events.push('key');
    }
    return events;
  }

  public retryStage(): void {
    this.world.hearts = this.world.maxHearts;
    this.loadStage(this.stageIdx);
  }

  public serializeSave(): unknown {
    return {
      v: 1,
      stageIdx: this.stageIdx,
      score: this.world.score,
      hearts: this.world.hearts,
      relics: { ...this.world.relics },
      bestStarsByStage: [...this.bestStarsByStage],
    };
  }

  public hydrateSave(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as {
      v?: number;
      stageIdx?: number;
      score?: number;
      hearts?: number;
      relics?: { doubleJump?: boolean; airDash?: boolean };
      bestStarsByStage?: number[];
    };
    if (s.v !== 1 || typeof s.stageIdx !== 'number') return false;
    this.world.score = Number(s.score ?? 0);
    this.world.hearts = Math.max(1, Math.min(this.world.maxHearts, Number(s.hearts ?? 3)));
    this.world.relics = {
      doubleJump: Boolean(s.relics?.doubleJump),
      airDash: Boolean(s.relics?.airDash),
    };
    if (Array.isArray(s.bestStarsByStage)) {
      this.bestStarsByStage = CLOUDBERRY_STAGES.map((_, i) => Number(s.bestStarsByStage?.[i] ?? 0));
    }
    this.loadStage(s.stageIdx);
    this.world.noticeBanner = `💾 已從 ${CLOUDBERRY_STAGES[this.stageIdx].name} 續關！`;
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
    const totalStars = CLOUDBERRY_STAGES.length * 3;
    const curCollected = this.world.getStageStars().collected;
    let totalCollected = 0;
    for (let i = 0; i < CLOUDBERRY_STAGES.length; i++) {
      totalCollected += i === this.stageIdx ? Math.max(this.bestStarsByStage[i], curCollected) : this.bestStarsByStage[i];
    }
    snap.starsCollected = totalCollected;
    snap.starsTotal = totalStars;
    return snap;
  }
}
