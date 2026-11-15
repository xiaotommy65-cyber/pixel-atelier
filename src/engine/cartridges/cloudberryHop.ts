import type {
  CartridgeInstance,
  InputState,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
} from '../WorldTypes.ts';
import { WorldKernel } from '../core/WorldKernel.ts';

const WORLD_W = 736;
const WORLD_H = 180;

/**
 * PA-01 Cloudberry Hop: powered by WorldKernel (Coyote Time, Jump Buffer, Apex Hang Time,
 * Corner Correction, Foot-pivot Squash/Stretch, Hitstop, Trauma^2 Shake & GPU Hit-Flash).
 */
export class CloudberryHopGame implements CartridgeInstance {
  private readonly world: WorldKernel;

  constructor() {
    this.world = new WorldKernel({
      cartridgeId: 'cloudberry-hop',
      worldWidth: WORLD_W,
      worldHeight: WORLD_H,
      skyTop: '#76c7ff',
      skyBottom: '#fff3df',
      statusBanner: '踩扁果凍史萊姆、收集天空鑰匙與星星！',
    });
    this.world.hero.x = 28;
    this.world.hero.y = 122;
    this.buildLevel();
  }

  private buildLevel(): void {
    const addGroundIsland = (startTile: number, countTiles: number, topY: number) => {
      const startX = startTile * 16;
      const width = countTiles * 16;
      this.world.solids.push({ x: startX, y: topY, w: width, h: WORLD_H - topY, kind: 'solid' });
      for (let i = 0; i < countTiles; i++) {
        const x = startX + i * 16;
        this.world.tiles.push({ sprite: 'grass', x, y: topY, w: 16, h: 16 });
        for (let y = topY + 16; y < WORLD_H; y += 16) {
          this.world.tiles.push({ sprite: 'dirt', x, y, w: 16, h: 16 });
        }
      }
    };

    // Main sky island course (gentle, fair, bouncy jumps)
    addGroundIsland(0, 9, 148);
    this.world.addCloudPlatform(164, 126, 4);
    addGroundIsland(15, 7, 136);
    this.world.addCloudPlatform(368, 108, 4);
    this.world.addCloudPlatform(442, 74, 4); // Sky spire where the winged Key lives!
    addGroundIsland(26, 8, 140);
    this.world.addCloudPlatform(562, 118, 3);
    addGroundIsland(39, 7, 136);

    // Extra bouncy spring below the key spire for joyful upward reach!
    this.world.spawn('spring', 426, 124);

    // Patrol Slimes
    this.world.spawn('slime', 100, 132, { minX: 74, maxX: 128, vx: 26 });
    this.world.spawn('slime', 274, 120, { minX: 244, maxX: 334, vx: -30 });
    this.world.spawn('slime', 454, 124, { minX: 422, maxX: 526, vx: 32 });

    // Stars
    this.world.spawn('star', 188, 104);
    this.world.spawn('star', 286, 112);
    this.world.spawn('star', 390, 86);
    this.world.spawn('star', 500, 118);
    this.world.spawn('star', 580, 94);

    // Golden Key & Rainbow Gate
    this.world.spawn('key', 466, 52);
    this.world.spawn('gate', 676, 120);

    this.world.bgClouds = [
      { x: 40, y: 34, scale: 1.1, speed: 6, tint: '#ffffff', alpha: 0.78 },
      { x: 170, y: 24, scale: 0.9, speed: 4, tint: '#fffaf0', alpha: 0.68 },
      { x: 310, y: 46, scale: 1.25, speed: 7, tint: '#ffffff', alpha: 0.72 },
      { x: 490, y: 28, scale: 1.0, speed: 5, tint: '#fffaf0', alpha: 0.76 },
      { x: 640, y: 40, scale: 1.15, speed: 6, tint: '#ffffff', alpha: 0.72 },
    ];
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.world.debugHitboxes = enabled;
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events = this.world.step(dt, input, params);
    this.world.statusBanner = this.world.gateUnlocked
      ? '鑰匙已入手！快跳往彩虹傳送門！'
      : '踩扁果凍史萊姆、踏彈簧拿天空鑰匙與星星！';
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
