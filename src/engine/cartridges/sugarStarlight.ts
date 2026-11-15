import { GAME_H, GAME_W } from '../../gpu/GpuTypes.ts';
import type {
  BgStarDesc,
  CartridgeInstance,
  DebugRectDesc,
  EntityDesc,
  InputState,
  LightDesc,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
} from '../WorldTypes.ts';
import { InputMap } from '../core/InputMap.ts';
import { JuiceSystem, stepSquashSpring, type SquashSpring } from '../core/JuiceSystem.ts';

interface EnemyShip {
  id: string;
  kind: 'jelly' | 'meteor';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  phase: number;
  rot: number;
  flashTimer: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromEnemy: boolean;
  color: string;
}

interface PowerStar {
  x: number;
  y: number;
  vx: number;
}

/**
 * PA-02 Sugar Starlight: upgraded with InputMap, JuiceSystem (Hitstop + Trauma^2 Shake + Screen Flash + Shared ParticlePool),
 * and GPU white hit-flash on meteor/Boss/ship hits!
 */
export class SugarStarlightGame implements CartridgeInstance {
  private readonly input = new InputMap();
  private readonly juice = new JuiceSystem();

  private shipX = 36;
  private shipY = 82;
  private shipFlash = 0;
  private shipSquash: SquashSpring = { scaleX: 1, scaleY: 1 };
  private hearts = 3;
  private readonly maxHearts = 3;
  private score = 0;
  private starsCollected = 0;
  private spreadLevel = 1;
  private shootCooldown = 0;
  private invulnTimer = 0;
  private elapsedSec = 0;
  private waveTimer = 0;
  private waveIndex = 0;
  private status: 'playing' | 'won' | 'lost' = 'playing';

  private bossActive = false;
  private bossX = 340;
  private bossY = 74;
  private bossHp = 22;
  private readonly bossMaxHp = 22;
  private bossFireTimer = 0.8;
  private bossFlash = 0;

  private enemies: EnemyShip[] = [];
  private bullets: Bullet[] = [];
  private powerStars: PowerStar[] = [];
  private bgStars: BgStarDesc[] = [];
  private debugHitboxes = false;

  constructor() {
    this.initStarfield();
    this.spawnWave();
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.debugHitboxes = enabled;
  }

  private initStarfield(): void {
    const palette = ['#fffaf0', '#ffd447', '#ff9ec2', '#8ce8ff'];
    for (let i = 0; i < 42; i++) {
      this.bgStars.push({
        x: (i * 59 + 17) % GAME_W,
        y: (i * 37 + 11) % GAME_H,
        size: i % 4 === 0 ? 2 : 1,
        phase: i * 0.7,
        color: palette[i % palette.length],
      });
    }
  }

  private spawnWave(): void {
    this.waveIndex++;
    if (this.score >= 300 || this.waveIndex >= 4) {
      this.bossActive = true;
      return;
    }

    for (let i = 0; i < 4; i++) {
      const kind = i % 3 === 2 ? 'meteor' : 'jelly';
      this.enemies.push({
        id: `wave-${this.waveIndex}-${i}`,
        kind,
        x: GAME_W + 20 + i * 38,
        y: 26 + ((this.waveIndex * 31 + i * 36) % (GAME_H - 56)),
        vx: kind === 'meteor' ? -72 : -52,
        vy: 0,
        hp: kind === 'meteor' ? 2 : 1,
        phase: i * 1.1,
        rot: 0,
        flashTimer: 0,
      });
    }
  }

  public step(dt: number, rawInput: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.input.update(rawInput, dt);
    const simDt = this.juice.advanceRealTime(dt, params.shakeScale);

    // Scroll starfield even during hitstop freeze
    for (const s of this.bgStars) {
      s.x -= (s.size > 1 ? 34 : 18) * dt;
      if (s.x < 0) s.x += GAME_W;
    }

    if (this.shipFlash > 0) this.shipFlash = Math.max(0, this.shipFlash - dt * 6);
    if (this.bossFlash > 0) this.bossFlash = Math.max(0, this.bossFlash - dt * 7);
    for (const e of this.enemies) {
      if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt * 7);
    }
    stepSquashSpring(this.shipSquash, dt, 14);

    if (simDt <= 0 || this.status !== 'playing') return events;
    this.elapsedSec += simDt;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - simDt);
    if (this.shootCooldown > 0) this.shootCooldown = Math.max(0, this.shootCooldown - simDt);

    // 2D Flight Movement
    const mx = this.input.axisX();
    const my = this.input.axisY();
    const speed = params.moveSpeed * 1.12;
    this.shipX = Math.max(8, Math.min(GAME_W - 24, this.shipX + mx * speed * simDt));
    this.shipY = Math.max(12, Math.min(GAME_H - 26, this.shipY + my * speed * simDt));

    // Fire star-candy bolts (A, B, or Space)
    const firing = this.input.held('jump') || this.input.held('action');
    if (firing && this.shootCooldown <= 0) {
      this.shootCooldown = 0.16;
      this.shipSquash = { scaleX: 0.86, scaleY: 1.14 };
      events.push('laser');
      const spawnBolt = (vy: number) => {
        this.bullets.push({
          x: this.shipX + 14,
          y: this.shipY + 5,
          vx: 230,
          vy,
          fromEnemy: false,
          color: '#ffd447',
        });
      };
      spawnBolt(0);
      if (this.spreadLevel >= 2) {
        spawnBolt(-44);
        spawnBolt(44);
      }
    }

    // Wave spawner before Boss
    if (!this.bossActive) {
      this.waveTimer += simDt;
      if (this.waveTimer > 4.2 || this.enemies.length === 0) {
        this.waveTimer = 0;
        this.spawnWave();
      }
    } else {
      if (this.bossX > 250) {
        this.bossX -= 48 * simDt;
      }
      this.bossY = 76 + Math.sin(this.juice.visualTime * 1.7) * 44;

      this.bossFireTimer -= simDt;
      if (this.bossFireTimer <= 0) {
        this.bossFireTimer = 1.05;
        for (const dy of [-28, 0, 28]) {
          this.bullets.push({
            x: this.bossX,
            y: this.bossY + 6,
            vx: -118,
            vy: dy,
            fromEnemy: true,
            color: '#ff708d',
          });
        }
      }
    }

    // Update enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.x += e.vx * simDt;
      if (e.kind === 'jelly') {
        e.y += Math.sin(this.juice.visualTime * 3.5 + e.phase) * 42 * simDt;
      } else {
        e.rot += 3.5 * simDt;
      }
      e.y = Math.max(12, Math.min(GAME_H - 22, e.y));

      if (e.x < -24) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (
        this.invulnTimer <= 0 &&
        Math.hypot(this.shipX + 8 - (e.x + 8), this.shipY + 8 - (e.y + 8)) < 13
      ) {
        this.hearts--;
        this.invulnTimer = 1.2;
        this.shipFlash = 0.35;
        events.push('hurt');
        this.juice.triggerHitstop(0.06);
        this.juice.addTrauma(0.55);
        this.juice.triggerFlash('#ff708d', 0.28);
        this.juice.spawnBurst(this.shipX + 8, this.shipY + 8, ['#ff708d', '#fffaf0'], 10, params.sparkleDensity, { gravity: 0, liftY: 0 });
        if (this.hearts <= 0) this.status = 'lost';
      }
    }

    // Power-up stars
    for (let i = this.powerStars.length - 1; i >= 0; i--) {
      const ps = this.powerStars[i];
      ps.x += ps.vx * simDt;
      if (ps.x < -16) {
        this.powerStars.splice(i, 1);
        continue;
      }
      if (Math.hypot(this.shipX + 8 - (ps.x + 8), this.shipY + 8 - (ps.y + 8)) < 14) {
        this.powerStars.splice(i, 1);
        this.starsCollected++;
        this.juice.registerCombo();
        this.spreadLevel = Math.min(2, this.spreadLevel + 1);
        this.score += 75;
        events.push('star');
        this.juice.spawnBurst(ps.x + 8, ps.y + 8, ['#ffd447', '#fffaf0', '#56d39c'], 9, params.sparkleDensity, { gravity: 0, liftY: 0 });
      }
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * simDt;
      b.y += b.vy * simDt;
      if (b.x < -16 || b.x > GAME_W + 24 || b.y < -12 || b.y > GAME_H + 12) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.fromEnemy) {
        if (
          this.invulnTimer <= 0 &&
          Math.hypot(this.shipX + 8 - b.x, this.shipY + 8 - b.y) < 9
        ) {
          this.bullets.splice(i, 1);
          this.hearts--;
          this.invulnTimer = 1.2;
          this.shipFlash = 0.35;
          events.push('hurt');
          this.juice.triggerHitstop(0.06);
          this.juice.addTrauma(0.5);
          this.juice.triggerFlash('#ff708d', 0.25);
          this.juice.spawnBurst(this.shipX + 8, this.shipY + 8, ['#ff708d', '#ffd447'], 8, params.sparkleDensity, { gravity: 0, liftY: 0 });
          if (this.hearts <= 0) this.status = 'lost';
        }
        continue;
      }

      // Hero bullet vs enemies
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (Math.hypot(b.x - (e.x + 8), b.y - (e.y + 8)) < 12) {
          hit = true;
          e.hp--;
          e.flashTimer = 0.16;
          if (e.hp <= 0) {
            this.enemies.splice(j, 1);
            this.score += 60;
            this.juice.registerCombo();
            this.juice.addTrauma(0.2);
            events.push('stomp');
            this.juice.spawnBurst(e.x + 8, e.y + 8, ['#e0aaff', '#ffd447', '#fffaf0'], 10, params.sparkleDensity, { gravity: 0, liftY: 0 });
            if (j % 2 === 0 || this.starsCollected === 0) {
              this.powerStars.push({ x: e.x, y: e.y, vx: -42 });
            }
          }
          break;
        }
      }

      if (!hit && this.bossActive && b.x > this.bossX - 4 && b.x < this.bossX + 34 && Math.abs(b.y - (this.bossY + 8)) < 14) {
        hit = true;
        this.bossHp--;
        this.bossFlash = 0.14;
        this.score += 25;
        this.juice.addTrauma(0.14);
        this.juice.spawnBurst(b.x, b.y, ['#ff708d', '#ffd447', '#fffaf0'], 5, params.sparkleDensity, { gravity: 0, liftY: 0 });
        if (this.bossHp <= 0) {
          this.bossActive = false;
          this.status = 'won';
          this.score += 500;
          events.push('win');
          this.juice.triggerHitstop(0.08);
          this.juice.addTrauma(0.75);
          this.juice.triggerFlash('#fffaf0', 0.35);
          this.juice.spawnBurst(this.bossX + 16, this.bossY + 8, ['#ffd447', '#56d39c', '#ff708d', '#5ec2f7'], 28, params.sparkleDensity, { gravity: 0, liftY: 0 });
        }
      }

      if (hit) this.bullets.splice(i, 1);
    }

    return events;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.status;
  }

  public getComboCount(): number {
    return this.juice.comboCount;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const entities: EntityDesc[] = [];
    const lights: LightDesc[] = [];
    const glow = params.glowIntensity;
    const t = this.juice.visualTime;

    for (const ps of this.powerStars) {
      entities.push({
        id: 'pstar',
        sprite: Math.floor(t * 8) % 2 === 0 ? 'star_a' : 'star_b',
        x: ps.x,
        y: ps.y,
        w: 14,
        h: 14,
      });
      if (glow > 0.05) {
        lights.push({ x: ps.x + 7, y: ps.y + 7, radius: 20, color: '#ffd447', intensity: 0.38 * glow });
      }
    }

    for (const e of this.enemies) {
      entities.push({
        id: e.id,
        sprite: e.kind === 'jelly' ? 'jelly_ufo' : 'meteor',
        x: e.x,
        y: e.y,
        w: 16,
        h: 16,
        rot: e.rot,
        flash: Math.min(1, e.flashTimer * 5),
      });
      if (e.kind === 'jelly' && glow > 0.05) {
        lights.push({ x: e.x + 8, y: e.y + 8, radius: 22, color: '#e0aaff', intensity: 0.25 * glow });
      }
    }

    if (this.bossActive) {
      entities.push({
        id: 'boss-ufo',
        sprite: 'boss_ufo',
        x: this.bossX,
        y: this.bossY,
        w: 32,
        h: 16,
        flash: Math.min(1, this.bossFlash * 6),
      });
      if (glow > 0.05) {
        lights.push({
          x: this.bossX + 16,
          y: this.bossY + 8,
          radius: 44,
          color: '#ff708d',
          intensity: 0.55 * glow,
        });
      }
    }

    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      entities.push({
        id: `b-${i}`,
        sprite: b.fromEnemy ? 'sparkle' : 'bolt',
        x: b.x - 6,
        y: b.y - 6,
        w: b.fromEnemy ? 10 : 12,
        h: b.fromEnemy ? 10 : 12,
        tint: b.fromEnemy ? '#ff708d' : '#ffd447',
        additive: b.fromEnemy,
      });
      if (glow > 0.05) {
        lights.push({
          x: b.x,
          y: b.y,
          radius: b.fromEnemy ? 14 : 18,
          color: b.color,
          intensity: 0.35 * glow,
        });
      }
    }

    const blink = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 16) % 2 === 1;
    if (!blink || this.shipFlash > 0) {
      entities.push({
        id: 'ship',
        sprite: Math.floor(t * 12) % 2 === 0 ? 'ship_a' : 'ship_b',
        x: this.shipX,
        y: this.shipY,
        w: 16,
        h: 16,
        scaleX: this.shipSquash.scaleX,
        scaleY: this.shipSquash.scaleY,
        flash: Math.min(1, this.shipFlash * 4),
      });
    }
    if (glow > 0.05) {
      lights.push({
        x: this.shipX + 2,
        y: this.shipY + 8,
        radius: 22,
        color: '#5ec2f7',
        intensity: 0.42 * glow,
      });
    }

    let debugRects: DebugRectDesc[] | undefined;
    if (this.debugHitboxes) {
      debugRects = [{ x: this.shipX + 2, y: this.shipY + 2, w: 12, h: 12, color: '#ffd447' }];
      for (const e of this.enemies) {
        debugRects.push({ x: e.x, y: e.y, w: 16, h: 16, color: '#ff708d' });
      }
      if (this.bossActive) {
        debugRects.push({ x: this.bossX, y: this.bossY, w: 32, h: 16, color: '#e0aaff' });
      }
    }

    return {
      cartridgeId: 'sugar-starlight',
      skyTop: '#243c70',
      skyBottom: '#f7adc4',
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: t,
      elapsedSec: this.elapsedSec,
      status: this.status,
      score: this.score,
      comboCount: this.juice.comboCount,
      starsCollected: this.starsCollected,
      starsTotal: 5,
      hasKey: this.spreadLevel >= 2,
      hearts: Math.max(0, this.hearts),
      maxHearts: this.maxHearts,
      bossHp: this.bossActive ? this.bossHp : 0,
      bossMaxHp: this.bossActive ? this.bossMaxHp : 0,
      cameraX: this.juice.shakeX,
      cameraY: this.juice.shakeY,
      screenFlashAlpha: this.juice.flashAlpha,
      screenFlashColor: this.juice.flashColor,
      bgStars: this.bgStars,
      bgClouds: [],
      tiles: [],
      entities,
      particles: this.juice.particles,
      lights,
      debugRects,
      statusBanner: this.bossActive
        ? `巨大棉花糖飛碟現身！剩餘體力 ${this.bossHp}/${this.bossMaxHp}`
        : '方向鍵飛行・按 B/A 發射星糖光束・F3 除錯框！',
    };
  }
}
