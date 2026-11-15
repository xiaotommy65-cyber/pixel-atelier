import { GAME_H, GAME_W } from '../../gpu/GpuTypes.ts';
import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type {
  BgCloudDesc,
  BgStarDesc,
  DebugRectDesc,
  EntityDesc,
  InputState,
  LightDesc,
  RectBox,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
  TileDesc,
  CartridgeId,
} from '../WorldTypes.ts';
import { ARCHETYPE_CATALOG, type ArchetypeId, type TraitTag } from './Archetypes.ts';
import { InputMap } from './InputMap.ts';
import { JuiceSystem, stepSquashSpring, type SquashSpring } from './JuiceSystem.ts';
import {
  ENTITY_RULE_MATRIX,
  activateSwitchPad,
  destroyFragile,
  igniteFlammable,
  primeExplosive,
  rectsOverlap,
  type RuleEntityLike,
  type RuleWorldActions,
} from './RuleMatrix.ts';
import { SeededRng } from './SeededRng.ts';

export interface WorldEntity extends RuleEntityLike {
  archetype: ArchetypeId;
  sprite: SpriteId;
  minX?: number;
  maxX?: number;
  patrolVx?: number;
  hasGravity: boolean;
  friction: number;
  phase: number;
  flipX?: boolean;
}

interface SparkProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface WorldConfig {
  cartridgeId: CartridgeId;
  worldWidth?: number;
  worldHeight?: number;
  skyTop?: string;
  skyBottom?: string;
  ambientDarkness?: number;
  ambientColor?: string;
  statusBanner?: string;
}

export interface HeroState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingLeft: boolean;
  onGround: boolean;
  coyote: number;
  walkAnim: number;
  invuln: number;
  flash: number;
  squash: SquashSpring;
}

const HERO_HB = { x: 2, y: 2, w: 12, h: 14 };

/**
 * Shared 2D Platformer & Systemic Simulation Kernel.
 * Combines fixed-step kinematics (Coyote Time, Jump Buffer, Apex Hang Time, Corner Correction),
 * InputMap edge tracking, JuiceSystem (Hitstop + Trauma^2 + Flash), and Tag x Tag RuleMatrix.
 */
export class WorldKernel {
  public readonly input = new InputMap();
  public readonly juice = new JuiceSystem();
  public readonly rng = new SeededRng(0x20260001);

  public cartridgeId: CartridgeId;
  public worldW: number;
  public worldH: number;
  public skyTop: string;
  public skyBottom: string;
  public ambientDarkness: number;
  public ambientColor: string;
  public statusBanner: string;

  public hero: HeroState = {
    x: 34,
    y: 120,
    vx: 0,
    vy: 0,
    facingLeft: false,
    onGround: false,
    coyote: 0,
    walkAnim: 0,
    invuln: 0,
    flash: 0,
    squash: { scaleX: 1, scaleY: 1 },
  };

  public hearts = 3;
  public maxHearts = 3;
  public score = 0;
  public gateUnlocked = false;
  public status: 'playing' | 'won' | 'lost' = 'playing';
  public elapsedSec = 0;
  public cameraX = 0;
  public cameraY = 0;
  public debugHitboxes = false;

  public solids: RectBox[] = [];
  public tiles: TileDesc[] = [];
  public entities: WorldEntity[] = [];
  public sparks: SparkProjectile[] = [];
  public bgClouds: BgCloudDesc[] = [];
  public bgStars: BgStarDesc[] = [];

  private nextId = 1;
  private starsTotal = 0;
  private starsCollected = 0;
  private hasGate = false;

  constructor(cfg: WorldConfig) {
    this.cartridgeId = cfg.cartridgeId;
    this.worldW = cfg.worldWidth ?? GAME_W;
    this.worldH = cfg.worldHeight ?? GAME_H;
    this.skyTop = cfg.skyTop ?? '#8fd8ff';
    this.skyBottom = cfg.skyBottom ?? '#fff4df';
    this.ambientDarkness = cfg.ambientDarkness ?? 0;
    this.ambientColor = cfg.ambientColor ?? '#120e24';
    this.statusBanner = cfg.statusBanner ?? '';
  }

  public addSolidTileRect(x: number, y: number, w: number, h: number, sprite: SpriteId = 'stone', tint?: string): void {
    this.solids.push({ x, y, w, h, kind: 'solid' });
    for (let tx = x; tx < x + w; tx += 16) {
      for (let ty = y; ty < y + h; ty += 16) {
        this.tiles.push({
          sprite,
          x: tx,
          y: ty,
          w: Math.min(16, x + w - tx),
          h: Math.min(16, y + h - ty),
          tint,
        });
      }
    }
  }

  public addCloudPlatform(x: number, y: number, tilesWide = 3): void {
    const count = Math.max(2, Math.min(10, Math.round(tilesWide)));
    this.solids.push({ x, y, w: count * 16, h: 10, kind: 'cloud' });
    this.tiles.push({ sprite: 'cloud_l', x, y, w: 16, h: 16 });
    for (let i = 1; i < count - 1; i++) {
      this.tiles.push({ sprite: 'cloud_m', x: x + i * 16, y, w: 16, h: 16 });
    }
    this.tiles.push({ sprite: 'cloud_r', x: x + (count - 1) * 16, y, w: 16, h: 16 });
  }

  public spawn(
    archetypeId: ArchetypeId,
    x: number,
    y: number,
    overrides?: { minX?: number; maxX?: number; vx?: number },
  ): WorldEntity {
    const def = ARCHETYPE_CATALOG[archetypeId];
    const ent: WorldEntity = {
      id: `${archetypeId}-${this.nextId++}`,
      archetype: archetypeId,
      sprite: def.sprite,
      tags: new Set<TraitTag>(def.tags),
      x,
      y,
      vx: overrides?.vx ?? (def.patrolSpeed ? (this.nextId % 2 === 0 ? def.patrolSpeed : -def.patrolSpeed) : 0),
      vy: 0,
      w: def.w,
      h: def.h,
      minX: overrides?.minX,
      maxX: overrides?.maxX,
      patrolVx: def.patrolSpeed,
      hasGravity: def.hasGravity,
      friction: def.friction,
      alive: true,
      active: false,
      flashTimer: 0,
      scaleX: 1,
      scaleY: 1,
      phase: this.nextId * 0.85,
      lightRadius: def.lightRadius,
      lightColor: def.lightColor,
      lightIntensity: def.lightIntensity,
    };
    this.entities.push(ent);
    if (archetypeId === 'star') this.starsTotal++;
    if (archetypeId === 'gate') this.hasGate = true;
    return ent;
  }

  private detonate(
    cx: number,
    cy: number,
    radius: number,
    sourceId: string,
    actions: RuleWorldActions,
  ): void {
    actions.emit('explode');
    actions.triggerJuice(0.055, 0.65, '#fff4cc', 0.3);
    actions.spawnBurst(cx, cy, ['#ffd447', '#ff708d', '#fffaf0', '#f59b23'], 18);

    for (const other of this.entities) {
      if (!other.alive || other.id === sourceId) continue;
      const dx = other.x + other.w * 0.5 - cx;
      const dy = other.y + other.h * 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      if (other.tags.has('explosive') && primeExplosive(other, actions, 0.14)) continue;
      if (other.tags.has('switch') && activateSwitchPad(other, actions, 8)) continue;
      if (other.tags.has('fragile')) {
        destroyFragile(other, actions, 10);
      } else if (other.tags.has('pushable')) {
        const inv = dist > 1 ? 1 / dist : 1;
        other.vx += dx * inv * 140;
        other.vy -= 140;
      }
    }

    // Gentle playful knockback on hero without cheap insta-death
    const hdx = this.hero.x + 8 - cx;
    const hdy = this.hero.y + 8 - cy;
    const hdist = Math.hypot(hdx, hdy);
    if (hdist < radius * 0.85) {
      const inv = hdist > 1 ? 1 / hdist : 1;
      this.hero.vx = hdx * inv * 140;
      this.hero.vy = Math.min(this.hero.vy, -155);
      this.hero.squash = { scaleX: 1.25, scaleY: 0.78 };
    }
  }

  public step(dt: number, rawInput: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.input.update(rawInput, dt);

    const simDt = this.juice.advanceRealTime(dt, params.shakeScale);

    // Drift background clouds cleanly on visual clock
    for (const c of this.bgClouds) {
      c.x -= c.speed * dt;
      if (c.x < -64) c.x = this.worldW + 48;
    }

    if (this.hero.flash > 0) this.hero.flash = Math.max(0, this.hero.flash - dt * 6);
    stepSquashSpring(this.hero.squash, dt, 14);
    for (const e of this.entities) {
      if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt * 5.5);
      stepSquashSpring(e, dt, 13);
    }

    if (simDt <= 0 || this.status !== 'playing') {
      return events;
    }

    this.elapsedSec += simDt;
    if (this.hero.invuln > 0) this.hero.invuln = Math.max(0, this.hero.invuln - simDt);

    const actions: RuleWorldActions = {
      emit: (ev) => events.push(ev),
      addScore: (pts) => {
        this.score += pts;
      },
      unlockGates: () => {
        this.gateUnlocked = true;
        for (const e of this.entities) {
          if (e.tags.has('gate')) {
            e.sprite = 'gate_open';
            e.lightRadius = 38;
            e.lightColor = '#56d39c';
            e.lightIntensity = 0.55;
          }
        }
      },
      spawnBurst: (x, y, colors, count) => {
        this.juice.spawnBurst(x, y, colors, count, params.sparkleDensity);
      },
      triggerJuice: (hitstop, trauma, flashHex, flashAlpha) => {
        if (hitstop > 0) this.juice.triggerHitstop(hitstop);
        if (trauma > 0) this.juice.addTrauma(trauma);
        if (flashHex && flashAlpha) this.juice.triggerFlash(flashHex, flashAlpha);
      },
      detonateAt: (x, y, radius, sourceId) => {
        this.detonate(x, y, radius, sourceId, actions);
      },
    };

    this.stepHero(simDt, params, actions);
    this.stepSparks(simDt, actions);
    this.stepEntities(simDt, params, actions);

    // Check star-only win condition when room has stars and no gate
    if (!this.hasGate && this.starsTotal > 0 && this.starsCollected >= this.starsTotal) {
      this.status = 'won';
      actions.emit('win');
      actions.triggerJuice(0.06, 0.35, '#fffaf0', 0.25);
    }

    // Smooth camera follow + lookahead + Trauma^2 shake offset
    const lookAhead = this.hero.facingLeft ? -16 : 16;
    const targetCamX = Math.max(
      0,
      Math.min(this.worldW - GAME_W, this.hero.x + lookAhead - GAME_W * 0.44),
    );
    this.cameraX += (targetCamX - this.cameraX) * Math.min(1, simDt * 8.5);

    return events;
  }

  private getSolidBoxes(includeEntitySolids = true): RectBox[] {
    if (!includeEntitySolids) return this.solids;
    const boxes = this.solids.slice();
    for (const e of this.entities) {
      if (e.alive && e.tags.has('solid')) {
        boxes.push({ x: e.x, y: e.y, w: e.w, h: e.h, kind: 'solid' });
      }
    }
    return boxes;
  }

  private stepHero(dt: number, params: RuntimeParams, actions: RuleWorldActions): void {
    this.stepHeroControls(dt, params, actions);
    this.resolveHeroMotion(dt, actions);
    this.rescueHeroFromAbyss(actions);
    this.handleHeroEntityInteractions(params, actions);
  }

  private stepHeroControls(dt: number, params: RuntimeParams, actions: RuleWorldActions): void {
    const h = this.hero;
    const dir = this.input.axisX();
    if (dir !== 0) {
      h.facingLeft = dir < 0;
      const targetVx = dir * params.moveSpeed;
      const accel = h.onGround ? 960 : 640;
      h.vx =
        h.vx < targetVx
          ? Math.min(targetVx, h.vx + accel * dt)
          : Math.max(targetVx, h.vx - accel * dt);
      h.walkAnim += dt * 9;
    } else {
      const decel = h.onGround ? 880 : 300;
      h.vx =
        h.vx > 0
          ? Math.max(0, h.vx - decel * dt)
          : Math.min(0, h.vx + decel * dt);
    }

    if (this.input.justPressed('jump') || this.input.justPressed('up')) {
      this.input.primeBuffer('jump', 0.13);
    }
    h.coyote = h.onGround ? 0.11 : Math.max(0, h.coyote - dt);

    if (this.input.hasBuffered('jump') && h.coyote > 0) {
      this.input.consumeBuffer('jump');
      h.vy = -params.jumpPower;
      h.onGround = false;
      h.coyote = 0;
      h.squash = { scaleX: 0.78, scaleY: 1.24 };
      actions.emit('jump');
      actions.spawnBurst(h.x + 8, h.y + 15, ['#fffaf0', '#56d39c'], 4);
    }

    if (!this.input.held('jump') && !this.input.held('up') && h.vy < -60) {
      h.vy *= 0.86;
    }

    const apexBoost = !h.onGround && Math.abs(h.vy) < 38 ? 0.56 : 1.0;
    h.vy = Math.min(340, h.vy + 590 * params.gravityScale * apexBoost * dt);

    if (this.input.justPressed('action')) {
      const sign = h.facingLeft ? -1 : 1;
      this.sparks.push({
        x: h.x + 8 + sign * 7,
        y: h.y + 7,
        vx: sign * 155,
        vy: -22,
        life: 0.42,
      });
      h.squash = { scaleX: 1.15, scaleY: 0.88 };
      actions.emit('ignite');
      actions.spawnBurst(h.x + 8 + sign * 8, h.y + 7, ['#ffd447', '#fffaf0'], 4);
    }
  }

  private resolveHeroMotion(dt: number, actions: RuleWorldActions): void {
    const h = this.hero;
    const { x: hbX, y: hbY, w: hbW, h: hbH } = HERO_HB;
    const wasOnGround = h.onGround;

    h.x = Math.max(0, Math.min(this.worldW - 16, h.x + h.vx * dt));
    for (const e of this.entities) {
      if (!e.alive || !e.tags.has('pushable')) continue;
      if (!rectsOverlap(h.x + hbX, h.y + hbY, hbW, hbH, e.x, e.y + 3, e.w, e.h - 5)) continue;
      if (h.vx > 0 && h.x < e.x) {
        e.vx = Math.max(e.vx, Math.min(82, h.vx * 0.92));
        h.x = e.x - hbX - hbW;
      } else if (h.vx < 0 && h.x > e.x) {
        e.vx = Math.min(e.vx, Math.max(-82, h.vx * 0.92));
        h.x = e.x + e.w - hbX;
      }
    }

    for (const s of this.solids) {
      if (s.kind === 'cloud') continue;
      if (!rectsOverlap(h.x + hbX, h.y + hbY, hbW, hbH, s.x, s.y, s.w, s.h)) continue;
      if (h.vx > 0) h.x = s.x - hbX - hbW;
      else if (h.vx < 0) h.x = s.x + s.w - hbX;
      h.vx = 0;
    }

    const prevBottom = h.y + hbY + hbH;
    const preLandVy = h.vy;
    h.y += h.vy * dt;
    h.onGround = false;

    for (const s of this.getSolidBoxes(true)) {
      if (h.x + hbX + hbW <= s.x || h.x + hbX >= s.x + s.w) continue;
      if (s.kind === 'cloud') {
        if (h.vy >= 0 && prevBottom <= s.y + 5 && h.y + hbY + hbH >= s.y) {
          h.y = s.y - hbY - hbH;
          h.vy = 0;
          h.onGround = true;
        }
        continue;
      }
      if (h.y + hbY + hbH > s.y && h.y + hbY < s.y + s.h) {
        if (h.vy >= 0 && prevBottom <= s.y + 8) {
          h.y = s.y - hbY - hbH;
          h.vy = 0;
          h.onGround = true;
        } else if (h.vy < 0) {
          // 4px ceiling corner correction
          const leftClip = h.x + hbX + hbW - s.x;
          const rightClip = s.x + s.w - (h.x + hbX);
          if (leftClip > 0 && leftClip <= 4) h.x -= leftClip;
          else if (rightClip > 0 && rightClip <= 4) h.x += rightClip;
          else {
            h.y = s.y + s.h - hbY;
            h.vy = 0;
          }
        }
      }
    }

    if (!wasOnGround && h.onGround && preLandVy > 95) {
      const amt = Math.min(0.28, (preLandVy / 320) * 0.28);
      h.squash = { scaleX: 1 + amt, scaleY: 1 - amt * 0.9 };
      actions.spawnBurst(h.x + 8, h.y + 15, ['#fffaf0', '#c7d4e6'], 3);
    }
  }

  private rescueHeroFromAbyss(actions: RuleWorldActions): void {
    const h = this.hero;
    if (h.y <= this.worldH + 18) return;
    this.hearts--;
    actions.emit('hurt');
    actions.triggerJuice(0.06, 0.5, '#ff708d', 0.28);
    if (this.hearts <= 0) {
      this.status = 'lost';
      return;
    }
    h.x = Math.max(24, Math.min(h.x - 36, this.worldW - 40));
    h.y = 48;
    h.vx = 0;
    h.vy = 0;
    h.invuln = 1.25;
  }

  private handleHeroEntityInteractions(params: RuntimeParams, actions: RuleWorldActions): void {
    const h = this.hero;
    const hcx = h.x + 8;
    const hcy = h.y + 8;

    for (const e of this.entities) {
      if (!e.alive) continue;
      const ecx = e.x + e.w * 0.5;
      const ecy = e.y + e.h * 0.5;
      const dist = Math.hypot(hcx - ecx, hcy - ecy);

      if (e.tags.has('collectible') && dist < 13) {
        e.alive = false;
        this.starsCollected++;
        this.juice.registerCombo();
        actions.addScore(100);
        actions.emit('star');
        actions.spawnBurst(ecx, ecy, ['#ffd447', '#fffaf0', '#ff708d'], 9);
      } else if (e.tags.has('key') && dist < 14) {
        e.alive = false;
        actions.unlockGates();
        actions.addScore(200);
        actions.emit('key');
        actions.triggerJuice(0.04, 0.22, '#ffd447', 0.22);
        actions.spawnBurst(ecx, ecy, ['#ffd447', '#56d39c', '#fffaf0'], 14);
      } else if (e.tags.has('bouncy') && Math.abs(hcx - ecx) < 12 && Math.abs(hcy - ecy) < 12) {
        h.vy = -params.jumpPower * 1.42;
        h.onGround = false;
        h.squash = { scaleX: 0.72, scaleY: 1.32 };
        e.scaleX = 1.38;
        e.scaleY = 0.62;
        e.flashTimer = 0.1;
        actions.emit('bounce');
        actions.triggerJuice(0.02, 0.22);
        actions.spawnBurst(ecx, e.y + 4, ['#ff708d', '#ffd447', '#fffaf0'], 8);
      } else if (e.tags.has('switch') && dist < 13) {
        if (activateSwitchPad(e, actions, 10)) {
          actions.triggerJuice(0.03, 0.25);
        }
      } else if (e.tags.has('gate') && this.gateUnlocked && dist < 15) {
        this.status = 'won';
        actions.addScore(300);
        actions.emit('win');
        actions.triggerJuice(0.06, 0.4, '#fffaf0', 0.28);
        actions.spawnBurst(ecx, ecy, ['#ffd447', '#56d39c', '#ff708d', '#5ec2f7'], 24);
      } else if (e.tags.has('stompable') && Math.abs(hcx - ecx) < 12 && Math.abs(hcy - ecy) < 12) {
        if (h.vy > 8 && hcy - ecy < 5) {
          destroyFragile(e, actions, 12);
          h.vy = -params.jumpPower * 0.85;
          h.squash = { scaleX: 1.24, scaleY: 0.76 };
          this.juice.registerCombo();
          actions.emit('stomp');
          actions.triggerJuice(0.04, 0.3, '#fffaf0', 0.14);
        } else if (h.invuln <= 0) {
          this.hearts--;
          h.invuln = 1.25;
          h.flash = 0.26;
          h.vy = -145;
          h.vx = hcx < ecx ? -95 : 95;
          h.squash = { scaleX: 1.3, scaleY: 0.74 };
          actions.emit('hurt');
          actions.triggerJuice(0.065, 0.58, '#ff708d', 0.3);
          actions.spawnBurst(hcx, hcy, ['#ff708d', '#fffaf0'], 9);
          if (this.hearts <= 0) this.status = 'lost';
        }
      }
    }
  }

  private stepSparks(dt: number, actions: RuleWorldActions): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life -= dt;
      sp.vy += 120 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      if (sp.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const e of this.entities) {
        if (!e.alive || Math.hypot(sp.x - (e.x + 8), sp.y - (e.y + 8)) >= 11) continue;
        if (e.tags.has('explosive') && primeExplosive(e, actions, 0.45)) {
          hit = true;
          break;
        }
        if (e.tags.has('flammable') && igniteFlammable(e, actions, 1.35)) {
          hit = true;
          break;
        }
        if (e.tags.has('stompable')) {
          e.flashTimer = 0.16;
          e.vx = sp.vx > 0 ? 75 : -75;
          e.vy = -120;
          actions.emit('bounce');
          actions.spawnBurst(e.x + 8, e.y + 8, ['#ffd447', '#fffaf0'], 6);
          hit = true;
          break;
        }
      }
      if (hit) this.sparks.splice(i, 1);
    }
  }

  private stepEntities(dt: number, params: RuntimeParams, actions: RuleWorldActions): void {
    for (const e of this.entities) {
      if (!e.alive) continue;

      if (e.fuseTimer !== undefined) {
        e.fuseTimer -= dt;
        if (e.fuseTimer < 0.45 && Math.floor(this.juice.visualTime * 18) % 2 === 0) {
          e.flashTimer = Math.max(e.flashTimer, 0.45);
        }
        if (e.fuseTimer <= 0) {
          if (e.tags.has('explosive')) {
            e.alive = false;
            actions.detonateAt(e.x + 8, e.y + 8, 42, e.id);
            continue;
          }
          if (e.tags.has('burning')) {
            e.alive = false;
            actions.addScore(40);
            actions.spawnBurst(e.x + 8, e.y + 8, ['#ff9048', '#ffd447', '#382820'], 10);
            continue;
          }
        }
      }

      if (e.patrolVx && e.minX !== undefined && e.maxX !== undefined) {
        e.x += e.vx * dt;
        if (e.x < e.minX) {
          e.x = e.minX;
          e.vx = Math.abs(e.vx);
        } else if (e.x > e.maxX) {
          e.x = e.maxX;
          e.vx = -Math.abs(e.vx);
        }
        e.flipX = e.vx < 0;
      } else if (e.tags.has('pushable')) {
        e.x = Math.max(0, Math.min(this.worldW - e.w, e.x + e.vx * dt));
        if (e.friction > 0) {
          e.vx = e.vx > 0 ? Math.max(0, e.vx - e.friction * dt) : Math.min(0, e.vx + e.friction * dt);
        }
      }

      if (e.hasGravity) {
        e.vy = Math.min(320, e.vy + 540 * params.gravityScale * dt);
        const prevBottom = e.y + e.h;
        e.y += e.vy * dt;

        for (const s of this.solids) {
          if (e.x + e.w - 2 <= s.x || e.x + 2 >= s.x + s.w) continue;
          const topHit = s.kind === 'cloud' ? prevBottom <= s.y + 5 : e.y < s.y + s.h;
          if (e.vy >= 0 && topHit && e.y + e.h >= s.y) {
            e.y = s.y - e.h;
            e.vy = 0;
          }
        }
        for (const other of this.entities) {
          if (!other.alive || other.id === e.id || !other.tags.has('solid')) continue;
          if (e.x + e.w - 2 <= other.x || e.x + 2 >= other.x + other.w) continue;
          if (e.vy >= 0 && prevBottom <= other.y + 6 && e.y + e.h >= other.y) {
            e.y = other.y - e.h;
            e.vy = 0;
          }
        }
      }
    }

    for (let i = 0; i < this.entities.length; i++) {
      const a = this.entities[i];
      if (!a.alive) continue;
      for (let j = 0; j < this.entities.length; j++) {
        if (i === j) continue;
        const b = this.entities[j];
        if (!b.alive || !rectsOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, 1)) continue;
        for (const rule of ENTITY_RULE_MATRIX) {
          if (a.tags.has(rule.sourceTag) && b.tags.has(rule.targetTag)) {
            rule.onOverlap(a, b, actions, dt);
          }
        }
      }
    }
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const outEntities: EntityDesc[] = [];
    const lights: LightDesc[] = [];
    const glow = params.glowIntensity;
    const t = this.juice.visualTime;

    for (const e of this.entities) {
      if (!e.alive) continue;
      let sprite = e.sprite;
      let yOffset = 0;
      if (e.archetype === 'star') {
        sprite = Math.floor((t * 5 + e.phase) % 2) === 0 ? 'star_a' : 'star_b';
        yOffset = Math.sin(t * 4 + e.phase) * 2;
      } else if (e.archetype === 'slime') {
        sprite = Math.floor((t * 4 + e.phase) % 2) === 0 ? 'slime_a' : 'slime_b';
      } else if (e.archetype === 'key') {
        yOffset = Math.sin(t * 3.5) * 2.5;
      }

      outEntities.push({
        id: e.id,
        sprite,
        x: e.x,
        y: e.y + yOffset,
        w: e.w,
        h: e.h,
        scaleX: e.scaleX,
        scaleY: e.scaleY,
        anchorY: 1,
        flash: Math.min(1, e.flashTimer),
        flipX: e.flipX,
        tint: e.tags.has('burning') ? '#ffd447' : undefined,
      });

      if (e.lightRadius && glow > 0.05) {
        const flicker = e.archetype === 'torch' ? 1 + Math.sin(t * 11 + e.phase) * 0.1 : 1;
        lights.push({
          x: e.x + e.w * 0.5,
          y: e.y + e.h * 0.5 + yOffset,
          radius: e.lightRadius * flicker,
          color: e.lightColor ?? '#ffd447',
          intensity: (e.lightIntensity ?? 0.4) * glow,
          falloffPower: e.archetype === 'torch' ? 1.65 : 2.0,
        });
      }
    }

    // Active igniting spark projectiles
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i];
      outEntities.push({
        id: `spark-${i}`,
        sprite: 'sparkle',
        x: sp.x - 4,
        y: sp.y - 4,
        w: 9,
        h: 9,
        rot: t * 12,
        tint: '#ffd447',
        additive: true,
      });
      if (glow > 0.05) {
        lights.push({ x: sp.x, y: sp.y, radius: 22, color: '#ffd447', intensity: 0.5 * glow });
      }
    }

    // Hero sprite (foot-anchored squash/stretch + white hit-flash)
    const h = this.hero;
    const blink = h.invuln > 0 && Math.floor(h.invuln * 16) % 2 === 1;
    if (!blink || h.flash > 0) {
      const moving = Math.abs(h.vx) > 8 || !h.onGround;
      const heroSprite: SpriteId = moving && Math.floor(h.walkAnim) % 2 === 1 ? 'hero_b' : 'hero_a';
      outEntities.push({
        id: 'hero',
        sprite: heroSprite,
        x: h.x,
        y: h.y,
        w: 16,
        h: 16,
        scaleX: h.squash.scaleX,
        scaleY: h.squash.scaleY,
        anchorY: 1,
        flash: Math.min(1, h.flash),
        flipX: h.facingLeft,
      });
    }
    if (glow > 0.05) {
      lights.push({
        x: h.x + 8,
        y: h.y + 8,
        radius: this.ambientDarkness > 0.2 ? 46 : 30,
        color: this.ambientDarkness > 0.2 ? '#ffe6a3' : '#fff3d0',
        intensity: (this.ambientDarkness > 0.2 ? 0.56 : 0.3) * glow,
        falloffPower: this.ambientDarkness > 0.2 ? 1.65 : 2.0,
      });
    }

    let debugRects: DebugRectDesc[] | undefined;
    if (this.debugHitboxes) {
      debugRects = [];
      for (const s of this.solids) {
        debugRects.push({
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          color: s.kind === 'cloud' ? '#5ec2f7' : '#56d39c',
        });
      }
      debugRects.push({ x: h.x + 2, y: h.y + 2, w: 12, h: 14, color: '#ffd447' });
      for (const e of this.entities) {
        if (!e.alive) continue;
        debugRects.push({
          x: e.x,
          y: e.y,
          w: e.w,
          h: e.h,
          color: e.tags.has('hazard') ? '#ff708d' : '#e0aaff',
        });
      }
    }

    return {
      cartridgeId: this.cartridgeId,
      skyTop: this.skyTop,
      skyBottom: this.skyBottom,
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: t,
      elapsedSec: this.elapsedSec,
      status: this.status,
      score: this.score,
      comboCount: this.juice.comboCount,
      starsCollected: this.starsCollected,
      starsTotal: this.starsTotal,
      hasKey: this.gateUnlocked,
      hearts: Math.max(0, this.hearts),
      maxHearts: this.maxHearts,
      bossHp: 0,
      bossMaxHp: 0,
      cameraX: this.cameraX + this.juice.shakeX,
      cameraY: this.cameraY + this.juice.shakeY,
      ambientDarkness: this.ambientDarkness,
      ambientColor: this.ambientColor,
      screenFlashAlpha: this.juice.flashAlpha,
      screenFlashColor: this.juice.flashColor,
      bgStars: this.bgStars,
      bgClouds: this.bgClouds,
      tiles: this.tiles,
      entities: outEntities,
      particles: this.juice.particles,
      lights,
      debugRects,
      statusBanner: this.statusBanner,
    };
  }
}
