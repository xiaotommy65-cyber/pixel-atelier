import { GAME_W } from '../../gpu/GpuTypes.ts';
import type {
  BgCloudDesc,
  CartridgeInstance,
  EntityDesc,
  InputState,
  LightDesc,
  ParticleDesc,
  RectBox,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
  TileDesc,
} from '../WorldTypes.ts';

export const DEFAULT_SANDBOX_SCRIPT = `// 積木秘密基地：修改下方積木並點「套用執行」！
api.setSky('#8fd8ff', '#fff4df');
api.setHeroSpawn(34, 120);

// 擺放漂浮雲朵跳台
api.addCloud(78, 124, 3);
api.addCloud(190, 96, 3);

// 灑滿黃金星星
api.addStar(94, 102);
api.addStar(132, 102);
api.addStar(206, 74);
api.addStar(238, 74);
api.addStar(276, 120);

// 放入守護果凍史萊姆
api.addSlime(152, 134);
api.addSlime(246, 134);
`;

export interface SandboxScriptApi {
  setSky(topHex: string, bottomHex: string): void;
  setHeroSpawn(x: number, y: number): void;
  addCloud(x: number, y: number, tilesWide?: number): void;
  addStar(x: number, y: number): void;
  addSlime(x: number, y: number): void;
}

interface SandboxStar {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  phase: number;
}

interface SandboxSlime {
  id: string;
  x: number;
  y: number;
  vx: number;
  minX: number;
  maxX: number;
  alive: boolean;
}

export class SandboxToyboxGame implements CartridgeInstance {
  private skyTop = '#8fd8ff';
  private skyBottom = '#fff4df';
  private heroX = 34;
  private heroY = 120;
  private heroVx = 0;
  private heroVy = 0;
  private facingLeft = false;
  private onGround = false;
  private prevJump = false;
  private walkAnim = 0;
  private timeSec = 0;
  private elapsedSec = 0;
  private score = 0;
  private hearts = 3;
  private status: 'playing' | 'won' | 'lost' = 'playing';

  private solids: RectBox[] = [];
  private tiles: TileDesc[] = [];
  private stars: SandboxStar[] = [];
  private slimes: SandboxSlime[] = [];
  private particles: ParticleDesc[] = [];
  private bgClouds: BgCloudDesc[] = [
    { x: 32, y: 28, scale: 1.0, speed: 5, tint: '#ffffff', alpha: 0.78 },
    { x: 210, y: 38, scale: 1.15, speed: 6, tint: '#fffaf0', alpha: 0.72 },
  ];
  public scriptError: string | null = null;

  constructor(scriptSource?: string, params?: RuntimeParams) {
    this.buildFromScript(scriptSource ?? DEFAULT_SANDBOX_SCRIPT, params);
  }

  public buildFromScript(scriptSource: string, params?: RuntimeParams): void {
    this.solids = [];
    this.tiles = [];
    this.stars = [];
    this.slimes = [];
    this.particles = [];
    this.scriptError = null;

    // Floor ground across 320px atelier room
    this.solids.push({ x: 0, y: 150, w: GAME_W, h: 30, kind: 'solid' });
    for (let x = 0; x < GAME_W; x += 16) {
      this.tiles.push({ sprite: 'grass', x, y: 150, w: 16, h: 16 });
      this.tiles.push({ sprite: 'dirt', x, y: 166, w: 16, h: 16 });
    }

    const addCloudInternal = (x: number, y: number, tilesWide = 3) => {
      const count = Math.max(2, Math.min(8, Math.round(tilesWide)));
      this.solids.push({ x, y, w: count * 16, h: 10, kind: 'cloud' });
      this.tiles.push({ sprite: 'cloud_l', x, y, w: 16, h: 16 });
      for (let i = 1; i < count - 1; i++) {
        this.tiles.push({ sprite: 'cloud_m', x: x + i * 16, y, w: 16, h: 16 });
      }
      this.tiles.push({ sprite: 'cloud_r', x: x + (count - 1) * 16, y, w: 16, h: 16 });
    };

    const api: SandboxScriptApi = {
      setSky: (topHex: string, bottomHex: string) => {
        if (/^#[0-9a-fA-F]{6}$/.test(topHex)) this.skyTop = topHex;
        if (/^#[0-9a-fA-F]{6}$/.test(bottomHex)) this.skyBottom = bottomHex;
      },
      setHeroSpawn: (x: number, y: number) => {
        this.heroX = Math.max(8, Math.min(GAME_W - 24, Number(x) || 34));
        this.heroY = Math.max(16, Math.min(130, Number(y) || 120));
      },
      addCloud: (x: number, y: number, tilesWide = 3) => {
        addCloudInternal(Number(x) || 80, Number(y) || 120, tilesWide);
      },
      addStar: (x: number, y: number) => {
        this.stars.push({
          id: `sb-star-${this.stars.length}`,
          x: Math.max(8, Math.min(GAME_W - 20, Number(x) || 100)),
          y: Math.max(16, Math.min(132, Number(y) || 100)),
          collected: false,
          phase: this.stars.length * 0.9,
        });
      },
      addSlime: (x: number, y: number) => {
        const sx = Math.max(16, Math.min(GAME_W - 32, Number(x) || 140));
        this.slimes.push({
          id: `sb-slime-${this.slimes.length}`,
          x: sx,
          y: Number(y) || 134,
          vx: this.slimes.length % 2 === 0 ? 28 : -28,
          minX: Math.max(8, sx - 36),
          maxX: Math.min(GAME_W - 24, sx + 36),
          alive: true,
        });
      },
    };

    try {
      const fn = new Function('api', scriptSource);
      fn(api);
    } catch (err) {
      this.scriptError = err instanceof Error ? err.message : String(err);
      // Fallback safe starter items so scene stays playable
      if (this.stars.length === 0) {
        api.addCloud(90, 120, 3);
        api.addStar(106, 98);
      }
    }

    // Apply enemyCount param from sliders cleanly if user wants more/less
    if (params) {
      const desired = Math.max(0, Math.min(8, Math.round(params.enemyCount)));
      while (this.slimes.length > desired) {
        this.slimes.pop();
      }
      while (this.slimes.length < desired) {
        const idx = this.slimes.length;
        const sx = 86 + idx * 34;
        api.addSlime(Math.min(GAME_W - 28, sx), 134);
      }
    }
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.timeSec += dt;
    for (const c of this.bgClouds) {
      c.x -= c.speed * dt;
      if (c.x < -48) c.x = GAME_W + 32;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 150 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    if (this.status !== 'playing') return events;
    this.elapsedSec += dt;

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.facingLeft = dir < 0;
      this.heroVx = dir * params.moveSpeed;
      this.walkAnim += dt * 9;
    } else {
      this.heroVx *= 0.8;
    }

    const wantJump = (input.jump || input.up) && !this.prevJump;
    this.prevJump = input.jump || input.up;
    if (wantJump && this.onGround) {
      this.heroVy = -params.jumpPower;
      this.onGround = false;
      events.push('jump');
    }

    // Action button spawns a celebratory fountain of stars right from hero!
    if (input.action && Math.floor(this.timeSec * 12) !== Math.floor((this.timeSec - dt) * 12)) {
      events.push('bounce');
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          x: this.heroX + 8,
          y: this.heroY + 6,
          vx: (i - 1.5) * 32,
          vy: -100 - i * 15,
          life: 0,
          maxLife: 0.55,
          size: 7,
          color: '#ffd447',
          rot: 0,
          vRot: 5,
          sprite: 'sparkle',
          additive: true,
        });
      }
    }

    this.heroVy = Math.min(340, this.heroVy + 580 * params.gravityScale * dt);
    this.heroX = Math.max(0, Math.min(GAME_W - 16, this.heroX + this.heroVx * dt));

    const prevBottom = this.heroY + 16;
    this.heroY += this.heroVy * dt;
    this.onGround = false;

    for (const s of this.solids) {
      if (this.heroX + 14 <= s.x || this.heroX + 2 >= s.x + s.w) continue;
      if (s.kind === 'cloud') {
        if (this.heroVy >= 0 && prevBottom <= s.y + 4 && this.heroY + 16 >= s.y) {
          this.heroY = s.y - 16;
          this.heroVy = 0;
          this.onGround = true;
        }
      } else if (this.heroY + 16 >= s.y) {
        this.heroY = s.y - 16;
        this.heroVy = 0;
        this.onGround = true;
      }
    }

    // Collect sandbox stars
    let remaining = 0;
    for (const st of this.stars) {
      if (st.collected) continue;
      if (Math.hypot(this.heroX - st.x, this.heroY - st.y) < 13) {
        st.collected = true;
        this.score += 100;
        events.push('star');
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI * 2 * i) / 6;
          this.particles.push({
            x: st.x + 8,
            y: st.y + 8,
            vx: Math.cos(ang) * 45,
            vy: Math.sin(ang) * 45 - 20,
            life: 0,
            maxLife: 0.45,
            size: 6,
            color: '#ffd447',
            rot: 0,
            vRot: 6,
            sprite: 'sparkle',
            additive: true,
          });
        }
      } else {
        remaining++;
      }
    }

    for (const sl of this.slimes) {
      if (!sl.alive) continue;
      sl.x += sl.vx * dt;
      if (sl.x < sl.minX) {
        sl.x = sl.minX;
        sl.vx = Math.abs(sl.vx);
      } else if (sl.x > sl.maxX) {
        sl.x = sl.maxX;
        sl.vx = -Math.abs(sl.vx);
      }
      if (Math.hypot(this.heroX - sl.x, this.heroY - sl.y) < 12 && this.heroVy > 8) {
        sl.alive = false;
        this.heroVy = -params.jumpPower * 0.85;
        this.score += 120;
        events.push('stomp');
      }
    }

    if (this.stars.length > 0 && remaining === 0) {
      this.status = 'won';
      events.push('win');
    }

    return events;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.status;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const entities: EntityDesc[] = [];
    const lights: LightDesc[] = [];
    const glow = params.glowIntensity;
    let starsCollected = 0;

    for (const st of this.stars) {
      if (st.collected) {
        starsCollected++;
        continue;
      }
      const bob = Math.sin(this.timeSec * 4 + st.phase) * 2;
      entities.push({
        id: st.id,
        sprite: Math.floor(this.timeSec * 5 + st.phase) % 2 === 0 ? 'star_a' : 'star_b',
        x: st.x,
        y: st.y + bob,
        w: 16,
        h: 16,
      });
      if (glow > 0.05) {
        lights.push({ x: st.x + 8, y: st.y + 8 + bob, radius: 22, color: '#ffd447', intensity: 0.36 * glow });
      }
    }

    for (const sl of this.slimes) {
      if (!sl.alive) continue;
      entities.push({
        id: sl.id,
        sprite: Math.floor(this.timeSec * 4) % 2 === 0 ? 'slime_a' : 'slime_b',
        x: sl.x,
        y: sl.y,
        w: 16,
        h: 16,
        flipX: sl.vx < 0,
      });
    }

    const moving = Math.abs(this.heroVx) > 8 || !this.onGround;
    entities.push({
      id: 'hero',
      sprite: moving && Math.floor(this.walkAnim) % 2 === 1 ? 'hero_b' : 'hero_a',
      x: this.heroX,
      y: this.heroY,
      w: 16,
      h: 16,
      flipX: this.facingLeft,
    });

    if (glow > 0.05) {
      lights.push({ x: this.heroX + 8, y: this.heroY + 8, radius: 28, color: '#fff3d0', intensity: 0.3 * glow });
    }

    return {
      cartridgeId: 'sandbox-toybox',
      skyTop: this.skyTop,
      skyBottom: this.skyBottom,
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: this.timeSec,
      elapsedSec: this.elapsedSec,
      status: this.status,
      score: this.score,
      starsCollected,
      starsTotal: this.stars.length,
      hasKey: false,
      hearts: this.hearts,
      maxHearts: 3,
      bossHp: 0,
      bossMaxHp: 0,
      cameraX: 0,
      cameraY: 0,
      bgStars: [],
      bgClouds: this.bgClouds,
      tiles: this.tiles,
      entities,
      particles: this.particles,
      lights,
      statusBanner: this.scriptError
        ? `積木語法提醒：${this.scriptError}`
        : '按 A 噴出星光煙火，到「積木工房」還能自己改關卡！',
    };
  }
}
