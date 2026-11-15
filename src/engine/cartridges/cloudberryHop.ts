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

interface PatrolSlime {
  id: string;
  x: number;
  y: number;
  vx: number;
  minX: number;
  maxX: number;
  alive: boolean;
  phase: number;
}

interface StarItem {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  phase: number;
}

const WORLD_W = 736;
const WORLD_H = 180;

export class CloudberryHopGame implements CartridgeInstance {
  private heroX = 28;
  private heroY = 122;
  private heroVx = 0;
  private heroVy = 0;
  private facingLeft = false;
  private onGround = false;
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private prevJumpHeld = false;
  private invulnTimer = 0;
  private walkAnim = 0;
  private squashTimer = 0;

  private hearts = 3;
  private readonly maxHearts = 3;
  private score = 0;
  private hasKey = false;
  private status: 'playing' | 'won' | 'lost' = 'playing';
  private timeSec = 0;
  private elapsedSec = 0;
  private cameraX = 0;

  private solids: RectBox[] = [];
  private tiles: TileDesc[] = [];
  private slimes: PatrolSlime[] = [];
  private stars: StarItem[] = [];
  private keyBox = { x: 472, y: 40, collected: false };
  private gatePos = { x: 676, y: 120 };
  private particles: ParticleDesc[] = [];
  private bgClouds: BgCloudDesc[] = [];

  constructor() {
    this.buildLevel();
  }

  private buildLevel(): void {
    this.solids = [];
    this.tiles = [];
    this.particles = [];

    const addGroundIsland = (startTile: number, countTiles: number, topY: number) => {
      const startX = startTile * 16;
      const width = countTiles * 16;
      this.solids.push({ x: startX, y: topY, w: width, h: WORLD_H - topY, kind: 'solid' });
      for (let i = 0; i < countTiles; i++) {
        const x = startX + i * 16;
        this.tiles.push({ sprite: 'grass', x, y: topY, w: 16, h: 16 });
        for (let y = topY + 16; y < WORLD_H; y += 16) {
          this.tiles.push({ sprite: 'dirt', x, y, w: 16, h: 16 });
        }
      }
    };

    const addCloudBridge = (startX: number, midCount: number, y: number) => {
      const totalTiles = midCount + 2;
      this.solids.push({ x: startX, y, w: totalTiles * 16, h: 10, kind: 'cloud' });
      this.tiles.push({ sprite: 'cloud_l', x: startX, y, w: 16, h: 16 });
      for (let i = 0; i < midCount; i++) {
        this.tiles.push({ sprite: 'cloud_m', x: startX + (i + 1) * 16, y, w: 16, h: 16 });
      }
      this.tiles.push({ sprite: 'cloud_r', x: startX + (midCount + 1) * 16, y, w: 16, h: 16 });
    };

    // Main sky island course (gentle, fair, bouncy jumps)
    addGroundIsland(0, 9, 148);
    addCloudBridge(164, 2, 126);
    addGroundIsland(15, 7, 136);
    addCloudBridge(368, 2, 108);
    addCloudBridge(442, 2, 74); // Sky spire where the winged Key lives!
    addGroundIsland(26, 8, 140);
    addCloudBridge(562, 1, 118);
    addGroundIsland(39, 7, 136);

    this.slimes = [
      { id: 'slime-1', x: 100, y: 132, vx: 26, minX: 74, maxX: 128, alive: true, phase: 0.4 },
      { id: 'slime-2', x: 274, y: 120, vx: -30, minX: 244, maxX: 334, alive: true, phase: 1.5 },
      { id: 'slime-3', x: 454, y: 124, vx: 32, minX: 422, maxX: 526, alive: true, phase: 2.3 },
    ];

    this.stars = [
      { id: 'star-1', x: 188, y: 104, collected: false, phase: 0 },
      { id: 'star-2', x: 286, y: 112, collected: false, phase: 0.9 },
      { id: 'star-3', x: 390, y: 86, collected: false, phase: 1.8 },
      { id: 'star-4', x: 500, y: 118, collected: false, phase: 2.6 },
      { id: 'star-5', x: 580, y: 94, collected: false, phase: 3.4 },
    ];

    this.keyBox = { x: 466, y: 52, collected: false };
    this.gatePos = { x: 676, y: 120 };

    this.bgClouds = [
      { x: 40, y: 34, scale: 1.1, speed: 6, tint: '#ffffff', alpha: 0.78 },
      { x: 170, y: 24, scale: 0.9, speed: 4, tint: '#fffaf0', alpha: 0.68 },
      { x: 310, y: 46, scale: 1.25, speed: 7, tint: '#ffffff', alpha: 0.72 },
      { x: 490, y: 28, scale: 1.0, speed: 5, tint: '#fffaf0', alpha: 0.76 },
      { x: 640, y: 40, scale: 1.15, speed: 6, tint: '#ffffff', alpha: 0.72 },
    ];
  }

  private spawnBurst(x: number, y: number, colors: string[], count: number, density: number): void {
    const actual = Math.max(2, Math.round(count * density));
    for (let i = 0; i < actual; i++) {
      const ang = (Math.PI * 2 * i) / actual + Math.sin(this.timeSec * 13 + i) * 0.3;
      const spd = 32 + ((i * 23) % 58);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 24,
        life: 0,
        maxLife: 0.45 + ((i * 7) % 5) * 0.06,
        size: i % 2 === 0 ? 7 : 3,
        color: colors[i % colors.length],
        rot: 0,
        vRot: (i % 2 === 0 ? 1 : -1) * 5,
        sprite: i % 3 === 0 ? 'sparkle' : undefined,
        additive: i % 3 === 0,
        gravity: 160,
      });
    }
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.timeSec += dt;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.squashTimer > 0) this.squashTimer = Math.max(0, this.squashTimer - dt);

    // Update drifting background clouds even on win screen
    for (const c of this.bgClouds) {
      c.x -= c.speed * dt;
      if (c.x < -64) c.x = WORLD_W + 48;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
    }

    if (this.status !== 'playing') {
      return events;
    }
    this.elapsedSec += dt;

    // Horizontal controls with crisp acceleration & deceleration
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const maxSpd = params.moveSpeed;
    if (dir !== 0) {
      this.facingLeft = dir < 0;
      const targetVx = dir * maxSpd;
      const accel = this.onGround ? 920 : 620;
      if (this.heroVx < targetVx) this.heroVx = Math.min(targetVx, this.heroVx + accel * dt);
      else if (this.heroVx > targetVx) this.heroVx = Math.max(targetVx, this.heroVx - accel * dt);
      this.walkAnim += dt * 9;
    } else {
      const decel = this.onGround ? 860 : 280;
      if (this.heroVx > 0) this.heroVx = Math.max(0, this.heroVx - decel * dt);
      else if (this.heroVx < 0) this.heroVx = Math.min(0, this.heroVx + decel * dt);
    }

    // Coyote time & jump buffer
    const jumpPressed = (input.jump || input.up) && !this.prevJumpHeld;
    this.prevJumpHeld = input.jump || input.up;
    if (jumpPressed) {
      this.jumpBuffer = 0.12;
    } else {
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    }

    if (this.onGround) this.coyoteTimer = 0.11;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      this.heroVy = -params.jumpPower;
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.squashTimer = 0.14;
      events.push('jump');
      this.spawnBurst(this.heroX + 8, this.heroY + 15, ['#fffaf0', '#56d39c'], 4, params.sparkleDensity);
    }

    // Variable jump height cut when released early
    if (!input.jump && !input.up && this.heroVy < -60) {
      this.heroVy *= 0.86;
    }

    // Gravity
    const gravity = 590 * params.gravityScale;
    this.heroVy = Math.min(340, this.heroVy + gravity * dt);

    // Move & resolve X against solid tiles (cloud platforms are one-way pass-through)
    this.heroX = Math.max(0, Math.min(WORLD_W - 14, this.heroX + this.heroVx * dt));
    const hbW = 12;
    const hbH = 14;
    const hbOffsetX = 2;
    const hbOffsetY = 2;

    for (const s of this.solids) {
      if (s.kind === 'cloud') continue;
      if (
        this.heroX + hbOffsetX + hbW > s.x &&
        this.heroX + hbOffsetX < s.x + s.w &&
        this.heroY + hbOffsetY + hbH > s.y &&
        this.heroY + hbOffsetY < s.y + s.h
      ) {
        if (this.heroVx > 0) this.heroX = s.x - hbOffsetX - hbW;
        else if (this.heroVx < 0) this.heroX = s.x + s.w - hbOffsetX;
        this.heroVx = 0;
      }
    }

    // Move & resolve Y
    const prevBottom = this.heroY + hbOffsetY + hbH;
    this.heroY += this.heroVy * dt;
    this.onGround = false;

    for (const s of this.solids) {
      const overlapX =
        this.heroX + hbOffsetX + hbW > s.x && this.heroX + hbOffsetX < s.x + s.w;
      if (!overlapX) continue;

      if (s.kind === 'cloud') {
        if (
          this.heroVy >= 0 &&
          prevBottom <= s.y + 4 &&
          this.heroY + hbOffsetY + hbH >= s.y
        ) {
          this.heroY = s.y - hbOffsetY - hbH;
          this.heroVy = 0;
          this.onGround = true;
        }
        continue;
      }

      if (
        this.heroY + hbOffsetY + hbH > s.y &&
        this.heroY + hbOffsetY < s.y + s.h
      ) {
        if (this.heroVy >= 0) {
          this.heroY = s.y - hbOffsetY - hbH;
          this.heroVy = 0;
          this.onGround = true;
        } else {
          this.heroY = s.y + s.h - hbOffsetY;
          this.heroVy = 0;
        }
      }
    }

    // Fall into cloud abyss -> gentle rescue back to safe island or hurt
    if (this.heroY > WORLD_H + 16) {
      this.hearts--;
      events.push('hurt');
      if (this.hearts <= 0) {
        this.status = 'lost';
      } else {
        this.heroX = Math.max(24, Math.min(this.heroX - 40, 260));
        this.heroY = 72;
        this.heroVx = 0;
        this.heroVy = 0;
        this.invulnTimer = 1.2;
      }
    }

    // Collect stars
    const heroCx = this.heroX + 8;
    const heroCy = this.heroY + 8;
    for (const st of this.stars) {
      if (st.collected) continue;
      if (Math.hypot(heroCx - (st.x + 8), heroCy - (st.y + 8)) < 13) {
        st.collected = true;
        this.score += 100;
        events.push('star');
        this.spawnBurst(st.x + 8, st.y + 8, ['#ffd447', '#fffaf0', '#ff708d'], 9, params.sparkleDensity);
      }
    }

    // Collect key
    if (!this.keyBox.collected && Math.hypot(heroCx - (this.keyBox.x + 8), heroCy - (this.keyBox.y + 8)) < 14) {
      this.keyBox.collected = true;
      this.hasKey = true;
      this.score += 200;
      events.push('key');
      this.spawnBurst(this.keyBox.x + 8, this.keyBox.y + 8, ['#ffd447', '#56d39c', '#fffaf0'], 14, params.sparkleDensity);
    }

    // Slimes patrol & hero stomp vs hurt
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

      const dx = Math.abs(heroCx - (sl.x + 8));
      const dy = heroCy - (sl.y + 8);
      if (dx < 12 && Math.abs(dy) < 12) {
        if (this.heroVy > 10 && dy < 4) {
          // Stomp!
          sl.alive = false;
          this.heroVy = -params.jumpPower * 0.82;
          this.score += 150;
          events.push('stomp');
          this.spawnBurst(sl.x + 8, sl.y + 8, ['#ff708d', '#ffd447', '#fffaf0'], 12, params.sparkleDensity);
        } else if (this.invulnTimer <= 0) {
          this.hearts--;
          this.invulnTimer = 1.25;
          this.heroVy = -145;
          this.heroVx = heroCx < sl.x + 8 ? -90 : 90;
          events.push('hurt');
          this.spawnBurst(heroCx, heroCy, ['#ff708d', '#fffaf0'], 8, params.sparkleDensity);
          if (this.hearts <= 0) {
            this.status = 'lost';
          }
        }
      }
    }

    // Reach Rainbow Gate
    if (this.hasKey && Math.hypot(heroCx - (this.gatePos.x + 8), heroCy - (this.gatePos.y + 8)) < 15) {
      this.status = 'won';
      this.score += 300;
      events.push('win');
      this.spawnBurst(this.gatePos.x + 8, this.gatePos.y + 6, ['#ffd447', '#56d39c', '#ff708d', '#5ec2f7'], 24, params.sparkleDensity);
    }

    // Smooth camera follow
    const targetCamX = Math.max(0, Math.min(WORLD_W - GAME_W, this.heroX - GAME_W * 0.42));
    this.cameraX += (targetCamX - this.cameraX) * Math.min(1, dt * 8);

    return events;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.status;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const entities: EntityDesc[] = [];
    const lights: LightDesc[] = [];
    const glow = params.glowIntensity;

    // Gate entity
    entities.push({
      id: 'gate',
      sprite: this.hasKey ? 'gate_open' : 'gate_closed',
      x: this.gatePos.x,
      y: this.gatePos.y,
      w: 16,
      h: 16,
    });
    if (this.hasKey && glow > 0.05) {
      lights.push({
        x: this.gatePos.x + 8,
        y: this.gatePos.y + 8,
        radius: 36,
        color: '#56d39c',
        intensity: 0.48 * glow,
      });
    }

    // Floating stars
    let starsCollected = 0;
    for (const st of this.stars) {
      if (st.collected) {
        starsCollected++;
        continue;
      }
      const bob = Math.sin(this.timeSec * 4 + st.phase) * 2.5;
      const frame = Math.floor((this.timeSec * 5 + st.phase) % 2) === 0 ? 'star_a' : 'star_b';
      entities.push({
        id: st.id,
        sprite: frame,
        x: st.x,
        y: st.y + bob,
        w: 16,
        h: 16,
      });
      if (glow > 0.05) {
        lights.push({
          x: st.x + 8,
          y: st.y + 8 + bob,
          radius: 22,
          color: '#ffd447',
          intensity: 0.35 * glow,
        });
      }
    }

    // Golden Key
    if (!this.keyBox.collected) {
      const bob = Math.sin(this.timeSec * 3.5) * 3;
      entities.push({
        id: 'key',
        sprite: 'key',
        x: this.keyBox.x,
        y: this.keyBox.y + bob,
        w: 16,
        h: 16,
      });
      if (glow > 0.05) {
        lights.push({
          x: this.keyBox.x + 8,
          y: this.keyBox.y + 8 + bob,
          radius: 28,
          color: '#ffd447',
          intensity: 0.45 * glow,
        });
      }
    }

    // Slimes
    for (const sl of this.slimes) {
      if (!sl.alive) continue;
      const squish = Math.floor((this.timeSec * 4 + sl.phase) % 2) === 0 ? 'slime_a' : 'slime_b';
      entities.push({
        id: sl.id,
        sprite: squish,
        x: sl.x,
        y: sl.y,
        w: 16,
        h: 16,
        flipX: sl.vx < 0,
      });
    }

    // Hero sprite (reflects live Sprite Atelier painting!)
    const heroBlink = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 16) % 2 === 1;
    if (!heroBlink) {
      const isMoving = Math.abs(this.heroVx) > 8 || !this.onGround;
      const heroSprite = isMoving && Math.floor(this.walkAnim) % 2 === 1 ? 'hero_b' : 'hero_a';
      const squashW = this.squashTimer > 0 ? 14 : 16;
      const squashH = this.squashTimer > 0 ? 18 : 16;
      entities.push({
        id: 'hero',
        sprite: heroSprite,
        x: this.heroX + (16 - squashW) * 0.5,
        y: this.heroY + (16 - squashH),
        w: squashW,
        h: squashH,
        flipX: this.facingLeft,
      });
    }
    if (glow > 0.05) {
      lights.push({
        x: this.heroX + 8,
        y: this.heroY + 8,
        radius: 30,
        color: '#fff2cc',
        intensity: 0.28 * glow,
      });
    }

    return {
      cartridgeId: 'cloudberry-hop',
      skyTop: '#76c7ff',
      skyBottom: '#fff3df',
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: this.timeSec,
      elapsedSec: this.elapsedSec,
      status: this.status,
      score: this.score,
      starsCollected,
      starsTotal: this.stars.length,
      hasKey: this.hasKey,
      hearts: Math.max(0, this.hearts),
      maxHearts: this.maxHearts,
      bossHp: 0,
      bossMaxHp: 0,
      cameraX: this.cameraX,
      cameraY: 0,
      bgStars: [],
      bgClouds: this.bgClouds,
      tiles: this.tiles,
      entities,
      particles: this.particles,
      lights,
      statusBanner: this.hasKey
        ? '鑰匙已入手！快跳往彩虹傳送門！'
        : '踩扁果凍史萊姆、收集天空鑰匙與星星！',
    };
  }
}
