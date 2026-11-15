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

interface SectorSpec {
  id: string;
  name: string;
  skyTop: string;
  skyBottom: string;
  bossName: string;
  bossHp: number;
  waveCount: number;
  enemySpeedScale: number;
}

const SECTORS: readonly SectorSpec[] = [
  {
    id: 's1',
    name: 'S1 · 糖霜星雲',
    skyTop: '#243c70',
    skyBottom: '#f7adc4',
    bossName: '棉花糖先鋒艦',
    bossHp: 18,
    waveCount: 4,
    enemySpeedScale: 1.0,
  },
  {
    id: 's2',
    name: 'S2 · 碎星隕石帶',
    skyTop: '#1f2859',
    skyBottom: '#ffab8c',
    bossName: '焦糖隕石要塞',
    bossHp: 24,
    waveCount: 4,
    enemySpeedScale: 1.14,
  },
  {
    id: 's3',
    name: 'S3 · 極光雷射陣',
    skyTop: '#122147',
    skyBottom: '#6fd9cf',
    bossName: '極光指揮母艦',
    bossHp: 30,
    waveCount: 4,
    enemySpeedScale: 1.26,
  },
  {
    id: 's4',
    name: 'S4 · 星核終極殿堂',
    skyTop: '#1a0d38',
    skyBottom: '#f06ea0',
    bossName: '糖霜星皇母艦 BOSS',
    bossHp: 40,
    waveCount: 4,
    enemySpeedScale: 1.38,
  },
];

type EnemyKind = 'jelly' | 'meteor' | 'shooter';

interface EnemyShip {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  phase: number;
  rot: number;
  fireTimer: number;
  flashTimer: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromEnemy: boolean;
  piercing?: boolean;
  damage: number;
  grazed?: boolean;
  color: string;
}

interface PowerStar {
  x: number;
  y: number;
  vx: number;
}

interface ShipState {
  x: number;
  y: number;
  flash: number;
  squash: SquashSpring;
  hearts: number;
  spreadLevel: number;
  hasOptions: boolean;
  chargeSec: number;
  grazeCount: number;
  shootCooldown: number;
  invulnTimer: number;
}

interface BossState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
  flash: number;
}

const MAX_HEARTS = 3;
const CHARGE_READY_SEC = 0.65;

/**
 * PA-02 Sugar Starlight: 4-Sector Horizontal Shmup Campaign.
 * Features Twin Option Orbs, Hold-A Charge Piercing Beam, Graze Shield Recharge, and 4 Sector Bosses.
 */
export class SugarStarlightGame implements CartridgeInstance {
  private readonly input = new InputMap();
  private readonly juice = new JuiceSystem();

  private ship: ShipState = {
    x: 36,
    y: 82,
    flash: 0,
    squash: { scaleX: 1, scaleY: 1 },
    hearts: MAX_HEARTS,
    spreadLevel: 1,
    hasOptions: false,
    chargeSec: 0,
    grazeCount: 0,
    shootCooldown: 0,
    invulnTimer: 0,
  };
  private sectorIdx = 0;
  private boss: BossState | null = null;
  private score = 0;
  private starsCollected = 0;
  private elapsedSec = 0;
  private waveTimer = 0;
  private waveIndex = 0;
  private status: 'playing' | 'won' | 'lost' = 'playing';

  private enemies: EnemyShip[] = [];
  private bullets: Bullet[] = [];
  private powerStars: PowerStar[] = [];
  private bgStars: BgStarDesc[] = [];
  private debugHitboxes = false;
  private noticeText = '';
  private noticeTimer = 0;

  constructor() {
    this.initStarfield();
    this.enterSector(0);
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.debugHitboxes = enabled;
  }

  public getSectorIndex(): number {
    return this.sectorIdx;
  }

  public getSectorCount(): number {
    return SECTORS.length;
  }

  public enterSector(idx: number): void {
    this.sectorIdx = Math.max(0, Math.min(SECTORS.length - 1, idx));
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.boss = null;
    this.enemies = [];
    this.bullets = [];
    this.powerStars = [];
    this.status = 'playing';
    this.noticeText = `🚀 進入 ${SECTORS[this.sectorIdx].name}！`;
    this.noticeTimer = 2.5;
    this.spawnWave();
  }

  private initStarfield(): void {
    const palette = ['#fffaf0', '#ffd447', '#ff9ec2', '#8ce8ff'];
    for (let i = 0; i < 48; i++) {
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
    const sector = SECTORS[this.sectorIdx];
    this.waveIndex++;
    if (this.waveIndex > sector.waveCount) {
      this.boss = {
        x: 340,
        y: 74,
        hp: sector.bossHp,
        maxHp: sector.bossHp,
        fireTimer: 0.75,
        flash: 0,
      };
      this.noticeText = `⚠️ ${sector.bossName} 接近中！`;
      this.noticeTimer = 2.8;
      return;
    }

    const count = 4 + Math.min(2, this.sectorIdx);
    const spd = sector.enemySpeedScale;
    for (let i = 0; i < count; i++) {
      const kind: EnemyKind =
        this.sectorIdx >= 1 && i === count - 1
          ? 'shooter'
          : i % 3 === 2
            ? 'meteor'
            : 'jelly';
      this.enemies.push({
        id: `s${this.sectorIdx}-w${this.waveIndex}-${i}`,
        kind,
        x: GAME_W + 18 + i * 36,
        y: 22 + ((this.waveIndex * 31 + i * 34) % (GAME_H - 52)),
        vx: (kind === 'meteor' ? -76 : kind === 'shooter' ? -44 : -54) * spd,
        vy: 0,
        hp: kind === 'meteor' ? 2 : kind === 'shooter' ? 2 + Math.floor(this.sectorIdx / 2) : 1,
        phase: i * 1.1,
        rot: 0,
        fireTimer: 1.1 + i * 0.3,
        flashTimer: 0,
      });
    }
  }

  private damageShip(
    events: SimEvent[],
    trauma: number,
    flashAlpha: number,
    burstColors: readonly string[],
    burstCount: number,
    params: RuntimeParams,
  ): void {
    this.ship.hearts--;
    this.ship.invulnTimer = 1.2;
    this.ship.flash = 0.35;
    events.push('hurt');
    this.juice.triggerHitstop(0.06);
    this.juice.addTrauma(trauma);
    this.juice.triggerFlash('#ff708d', flashAlpha);
    this.juice.spawnBurst(
      this.ship.x + 8,
      this.ship.y + 8,
      burstColors,
      burstCount,
      params.sparkleDensity,
      { gravity: 0, liftY: 0 },
    );
    if (this.ship.hearts <= 0) this.status = 'lost';
  }

  private fireBolts(events: SimEvent[]): void {
    this.ship.shootCooldown = 0.16;
    this.ship.squash = { scaleX: 0.86, scaleY: 1.14 };
    events.push('laser');
    const spawnBolt = (x: number, y: number, vy: number, color = '#ffd447') => {
      this.bullets.push({
        x,
        y,
        vx: 235,
        vy,
        fromEnemy: false,
        damage: 1,
        color,
      });
    };
    spawnBolt(this.ship.x + 14, this.ship.y + 7, 0);
    if (this.ship.spreadLevel >= 2) {
      spawnBolt(this.ship.x + 14, this.ship.y + 7, -44);
      spawnBolt(this.ship.x + 14, this.ship.y + 7, 44);
    }
    if (this.ship.hasOptions) {
      spawnBolt(this.ship.x + 8, Math.max(8, this.ship.y - 12), 0, '#5ec2f7');
      spawnBolt(this.ship.x + 8, Math.min(GAME_H - 12, this.ship.y + 22), 0, '#5ec2f7');
    }
  }

  public step(dt: number, rawInput: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.input.update(rawInput, dt);
    const simDt = this.juice.advanceRealTime(dt, params.shakeScale);
    if (this.noticeTimer > 0) this.noticeTimer = Math.max(0, this.noticeTimer - dt);

    // Scroll starfield even during hitstop freeze
    for (const s of this.bgStars) {
      s.x -= (s.size > 1 ? 36 : 19) * (1 + this.sectorIdx * 0.15) * dt;
      if (s.x < 0) s.x += GAME_W;
    }

    if (this.ship.flash > 0) this.ship.flash = Math.max(0, this.ship.flash - dt * 6);
    if (this.boss && this.boss.flash > 0) this.boss.flash = Math.max(0, this.boss.flash - dt * 7);
    for (const e of this.enemies) {
      if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt * 7);
    }
    stepSquashSpring(this.ship.squash, dt, 14);

    if (simDt <= 0 || this.status !== 'playing') return events;
    this.elapsedSec += simDt;

    if (this.ship.invulnTimer > 0) this.ship.invulnTimer = Math.max(0, this.ship.invulnTimer - simDt);
    if (this.ship.shootCooldown > 0) this.ship.shootCooldown = Math.max(0, this.ship.shootCooldown - simDt);

    // 2D Flight Movement
    const mx = this.input.axisX();
    const my = this.input.axisY();
    const speed = params.moveSpeed * 1.12;
    this.ship.x = Math.max(8, Math.min(GAME_W - 24, this.ship.x + mx * speed * simDt));
    this.ship.y = Math.max(12, Math.min(GAME_H - 26, this.ship.y + my * speed * simDt));

    // Rapid fire on B (jump), or Hold A (action) to charge piercing Starlight Laser!
    if (this.input.held('action')) {
      this.ship.chargeSec += simDt;
      if (this.ship.shootCooldown <= 0 && this.ship.chargeSec < 0.22) {
        this.fireBolts(events);
      }
    } else if (this.ship.chargeSec > 0) {
      if (this.ship.chargeSec >= CHARGE_READY_SEC) {
        this.bullets.push({
          x: this.ship.x + 16,
          y: this.ship.y + 7,
          vx: 310,
          vy: 0,
          fromEnemy: false,
          piercing: true,
          damage: 4,
          color: '#5ec2f7',
        });
        this.ship.squash = { scaleX: 1.28, scaleY: 0.78 };
        events.push('ignite');
        this.juice.addTrauma(0.24);
        this.juice.spawnBurst(this.ship.x + 14, this.ship.y + 8, ['#5ec2f7', '#fffaf0', '#ffd447'], 12, params.sparkleDensity, { gravity: 0, liftY: 0 });
      }
      this.ship.chargeSec = 0;
    }

    if (this.input.held('jump') && this.ship.shootCooldown <= 0) {
      this.fireBolts(events);
    }

    // Wave spawner before Boss, or Boss attack pattern
    if (!this.boss) {
      this.waveTimer += simDt;
      if (this.waveTimer > 4.0 || this.enemies.length === 0) {
        this.waveTimer = 0;
        this.spawnWave();
      }
    } else {
      if (this.boss.x > 250) {
        this.boss.x -= 48 * simDt;
      }
      this.boss.y = 76 + Math.sin(this.juice.visualTime * (1.7 + this.sectorIdx * 0.25)) * 46;

      this.boss.fireTimer -= simDt;
      if (this.boss.fireTimer <= 0) {
        this.boss.fireTimer = Math.max(0.68, 1.05 - this.sectorIdx * 0.1);
        const spread = this.sectorIdx >= 2 ? [-38, -14, 14, 38] : [-28, 0, 28];
        for (const dy of spread) {
          this.bullets.push({
            x: this.boss.x,
            y: this.boss.y + 6,
            vx: -(118 + this.sectorIdx * 14),
            vy: dy,
            fromEnemy: true,
            damage: 1,
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
      } else if (e.kind === 'shooter') {
        e.fireTimer -= simDt;
        if (e.fireTimer <= 0 && e.x < GAME_W - 12 && e.x > 40) {
          e.fireTimer = 1.65;
          this.bullets.push({
            x: e.x,
            y: e.y + 8,
            vx: -125,
            vy: (this.ship.y - e.y) * 0.45,
            fromEnemy: true,
            damage: 1,
            color: '#ff9048',
          });
        }
      } else {
        e.rot += 3.5 * simDt;
      }
      e.y = Math.max(12, Math.min(GAME_H - 22, e.y));

      if (e.x < -24) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (
        this.ship.invulnTimer <= 0 &&
        Math.hypot(this.ship.x + 8 - (e.x + 8), this.ship.y + 8 - (e.y + 8)) < 13
      ) {
        this.damageShip(events, 0.55, 0.28, ['#ff708d', '#fffaf0'], 10, params);
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
      if (Math.hypot(this.ship.x + 8 - (ps.x + 8), this.ship.y + 8 - (ps.y + 8)) < 14) {
        this.powerStars.splice(i, 1);
        this.starsCollected++;
        this.juice.registerCombo();
        if (this.ship.spreadLevel < 2) {
          this.ship.spreadLevel = 2;
          this.noticeText = '⭐ 火力進化：三向星糖散射砲！';
        } else if (!this.ship.hasOptions) {
          this.ship.hasOptions = true;
          this.noticeText = '💠 解鎖【雙子子機護衛】！';
        } else {
          this.score += 50;
          this.noticeText = '✨ 星能過載 +125 分！';
        }
        this.noticeTimer = 2.4;
        this.score += 75;
        events.push('star');
        this.juice.spawnBurst(ps.x + 8, ps.y + 8, ['#ffd447', '#fffaf0', '#56d39c'], 9, params.sparkleDensity, { gravity: 0, liftY: 0 });
      }
    }

    // Update bullets & Graze Shield Recharge
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * simDt;
      b.y += b.vy * simDt;
      if (b.x < -16 || b.x > GAME_W + 24 || b.y < -12 || b.y > GAME_H + 12) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.fromEnemy) {
        const dist = Math.hypot(this.ship.x + 8 - b.x, this.ship.y + 8 - b.y);
        if (this.ship.invulnTimer <= 0 && dist < 8.5) {
          this.bullets.splice(i, 1);
          this.damageShip(events, 0.5, 0.25, ['#ff708d', '#ffd447'], 8, params);
        } else if (!b.grazed && dist < 18) {
          b.grazed = true;
          this.ship.grazeCount++;
          this.score += 15;
          events.push('snap');
          this.juice.spawnBurst(this.ship.x + 8, this.ship.y + 8, ['#5ec2f7', '#fffaf0'], 4, params.sparkleDensity, { gravity: 0, liftY: 0 });
          if (this.ship.grazeCount % 10 === 0) {
            if (this.ship.hearts < MAX_HEARTS) {
              this.ship.hearts++;
              this.noticeText = '🛡️ 擦彈能量滿載！護盾回復 +1 ❤️！';
            } else {
              this.score += 100;
              this.noticeText = '⚡ 擦彈連擊Bonus +100！';
            }
            this.noticeTimer = 2.0;
          }
        }
        continue;
      }

      // Hero bullet / piercing beam vs enemies
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (Math.hypot(b.x - (e.x + 8), b.y - (e.y + 8)) < (b.piercing ? 16 : 12)) {
          hit = true;
          e.hp -= b.damage;
          e.flashTimer = 0.16;
          if (e.hp <= 0) {
            this.enemies.splice(j, 1);
            this.score += 65;
            this.juice.registerCombo();
            this.juice.addTrauma(0.2);
            events.push('stomp');
            this.juice.spawnBurst(e.x + 8, e.y + 8, ['#e0aaff', '#ffd447', '#fffaf0'], 10, params.sparkleDensity, { gravity: 0, liftY: 0 });
            if (j % 2 === 0 || this.starsCollected === 0) {
              this.powerStars.push({ x: e.x, y: e.y, vx: -42 });
            }
          }
          if (!b.piercing) break;
        }
      }

      const boss = this.boss;
      if ((!hit || b.piercing) && boss && b.x > boss.x - 4 && b.x < boss.x + 34 && Math.abs(b.y - (boss.y + 8)) < 15) {
        hit = true;
        boss.hp -= b.damage;
        boss.flash = 0.14;
        this.score += 25;
        this.juice.addTrauma(0.14);
        this.juice.spawnBurst(b.x, b.y, ['#ff708d', '#ffd447', '#fffaf0'], 5, params.sparkleDensity, { gravity: 0, liftY: 0 });
        if (boss.hp <= 0) {
          this.score += 500 + this.sectorIdx * 150;
          this.juice.triggerHitstop(0.08);
          this.juice.addTrauma(0.75);
          this.juice.triggerFlash('#fffaf0', 0.35);
          this.juice.spawnBurst(boss.x + 16, boss.y + 8, ['#ffd447', '#56d39c', '#ff708d', '#5ec2f7'], 28, params.sparkleDensity, { gravity: 0, liftY: 0 });
          this.boss = null;
          if (this.sectorIdx + 1 < SECTORS.length) {
            this.ship.hearts = Math.min(MAX_HEARTS, this.ship.hearts + 1);
            events.push('key');
            this.enterSector(this.sectorIdx + 1);
            return events;
          } else {
            this.status = 'won';
            events.push('win');
            return events;
          }
        }
      }

      if (hit && !b.piercing) this.bullets.splice(i, 1);
    }

    return events;
  }

  public retryStage(): void {
    this.ship.hearts = MAX_HEARTS;
    this.ship.invulnTimer = 1.2;
    this.enterSector(this.sectorIdx);
  }

  public serializeSave(): unknown {
    return {
      v: 1,
      sectorIdx: this.sectorIdx,
      score: this.score,
      starsCollected: this.starsCollected,
      hearts: this.ship.hearts,
      spreadLevel: this.ship.spreadLevel,
      hasOptions: this.ship.hasOptions,
      grazeCount: this.ship.grazeCount,
    };
  }

  public hydrateSave(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as {
      v?: number;
      sectorIdx?: number;
      score?: number;
      starsCollected?: number;
      hearts?: number;
      spreadLevel?: number;
      hasOptions?: boolean;
      grazeCount?: number;
    };
    if (s.v !== 1 || typeof s.sectorIdx !== 'number') return false;
    this.score = Number(s.score ?? 0);
    this.starsCollected = Number(s.starsCollected ?? 0);
    this.ship.hearts = Math.max(1, Math.min(MAX_HEARTS, Number(s.hearts ?? 3)));
    this.ship.spreadLevel = Math.max(1, Math.min(2, Number(s.spreadLevel ?? 1)));
    this.ship.hasOptions = Boolean(s.hasOptions);
    this.ship.grazeCount = Number(s.grazeCount ?? 0);
    this.enterSector(s.sectorIdx);
    this.noticeText = `💾 已從 ${SECTORS[this.sectorIdx].name} 續航！`;
    this.noticeTimer = 3.0;
    return true;
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.status;
  }

  public getComboCount(): number {
    return this.juice.comboCount;
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const sector = SECTORS[this.sectorIdx];
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
        sprite: e.kind === 'meteor' ? 'meteor' : 'jelly_ufo',
        tint: e.kind === 'shooter' ? '#ffae42' : undefined,
        x: e.x,
        y: e.y,
        w: 16,
        h: 16,
        rot: e.rot,
        flash: Math.min(1, e.flashTimer * 5),
      });
      if (e.kind !== 'meteor' && glow > 0.05) {
        lights.push({ x: e.x + 8, y: e.y + 8, radius: 22, color: e.kind === 'shooter' ? '#ff9048' : '#e0aaff', intensity: 0.25 * glow });
      }
    }

    if (this.boss) {
      entities.push({
        id: 'boss-ufo',
        sprite: 'boss_ufo',
        tint: this.sectorIdx === 1 ? '#ffb36b' : this.sectorIdx === 2 ? '#6fffe9' : undefined,
        x: this.boss.x,
        y: this.boss.y,
        w: 32,
        h: 16,
        flash: Math.min(1, this.boss.flash * 6),
      });
      if (glow > 0.05) {
        lights.push({
          x: this.boss.x + 16,
          y: this.boss.y + 8,
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
        sprite: b.piercing ? 'laser_beam' : b.fromEnemy ? 'sparkle' : 'bolt',
        x: b.piercing ? b.x - 10 : b.x - 6,
        y: b.piercing ? b.y - 6 : b.y - 6,
        w: b.piercing ? 22 : b.fromEnemy ? 10 : 12,
        h: b.piercing ? 12 : b.fromEnemy ? 10 : 12,
        tint: b.color,
        additive: b.fromEnemy || b.piercing,
      });
      if (glow > 0.05) {
        lights.push({
          x: b.x,
          y: b.y,
          radius: b.piercing ? 28 : b.fromEnemy ? 14 : 18,
          color: b.color,
          intensity: (b.piercing ? 0.55 : 0.35) * glow,
        });
      }
    }

    // Twin Option Orbs
    if (this.ship.hasOptions) {
      for (const dy of [-14, 20]) {
        const oy = Math.max(4, Math.min(GAME_H - 16, this.ship.y + dy + Math.sin(t * 6) * 2));
        entities.push({
          id: `opt-${dy}`,
          sprite: 'option_orb',
          x: this.ship.x + 2,
          y: oy,
          w: 12,
          h: 12,
        });
      }
    }

    const blink = this.ship.invulnTimer > 0 && Math.floor(this.ship.invulnTimer * 16) % 2 === 1;
    if (!blink || this.ship.flash > 0) {
      entities.push({
        id: 'ship',
        sprite: Math.floor(t * 12) % 2 === 0 ? 'ship_a' : 'ship_b',
        x: this.ship.x,
        y: this.ship.y,
        w: 16,
        h: 16,
        scaleX: this.ship.squash.scaleX,
        scaleY: this.ship.squash.scaleY,
        flash: Math.min(1, this.ship.flash * 4),
      });
    }
    if (glow > 0.05) {
      lights.push({
        x: this.ship.x + 2,
        y: this.ship.y + 8,
        radius: this.ship.chargeSec >= CHARGE_READY_SEC ? 34 : 22,
        color: this.ship.chargeSec >= CHARGE_READY_SEC ? '#ffd447' : '#5ec2f7',
        intensity: (this.ship.chargeSec >= CHARGE_READY_SEC ? 0.65 : 0.42) * glow,
      });
    }

    let debugRects: DebugRectDesc[] | undefined;
    if (this.debugHitboxes) {
      debugRects = [{ x: this.ship.x + 2, y: this.ship.y + 2, w: 12, h: 12, color: '#ffd447' }];
      for (const e of this.enemies) {
        debugRects.push({ x: e.x, y: e.y, w: 16, h: 16, color: '#ff708d' });
      }
      if (this.boss) {
        debugRects.push({ x: this.boss.x, y: this.boss.y, w: 32, h: 16, color: '#e0aaff' });
      }
    }

    const chargeNote = this.ship.chargeSec >= CHARGE_READY_SEC ? '⚡ 蓄力完成放開 A 發射貫穿光炮！' : '';
    const defaultBanner = this.boss
      ? `${sector.bossName} 體力 ${this.boss.hp}/${this.boss.maxHp}｜擦彈 ${this.ship.grazeCount} 次`
      : `長按 B 連射・長按 A 蓄力光炮・擦彈 (${this.ship.grazeCount % 10}/10) 護盾回血！`;

    return {
      cartridgeId: 'sugar-starlight',
      skyTop: sector.skyTop,
      skyBottom: sector.skyBottom,
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: t,
      elapsedSec: this.elapsedSec,
      status: this.status,
      score: this.score,
      comboCount: this.juice.comboCount,
      starsCollected: this.starsCollected,
      starsTotal: 12,
      hasKey: this.ship.spreadLevel >= 2,
      hearts: Math.max(0, this.ship.hearts),
      maxHearts: MAX_HEARTS,
      bossHp: this.boss?.hp ?? 0,
      bossMaxHp: this.boss?.maxHp ?? 0,
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
      statusBanner: this.noticeTimer > 0 ? this.noticeText : chargeNote || defaultBanner,
      stage: {
        index: this.sectorIdx + 1,
        total: SECTORS.length,
        name: sector.name,
      },
      bgmTheme: this.boss ? 'boss' : 'starlight',
    };
  }
}
