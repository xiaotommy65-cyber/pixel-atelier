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
    bossHp: 26,
    waveCount: 4,
    enemySpeedScale: 1.14,
  },
  {
    id: 's3',
    name: 'S3 · 極光雷射陣',
    skyTop: '#122147',
    skyBottom: '#6fd9cf',
    bossName: '極光指揮母艦',
    bossHp: 34,
    waveCount: 4,
    enemySpeedScale: 1.26,
  },
  {
    id: 's4',
    name: 'S4 · 星核終極殿堂',
    skyTop: '#1a0d38',
    skyBottom: '#f06ea0',
    bossName: '糖霜星皇母艦 BOSS',
    bossHp: 44,
    waveCount: 4,
    enemySpeedScale: 1.38,
  },
];

type EnemyKind = 'jelly' | 'meteor' | 'shooter';
export type ChargeTier = 0 | 1 | 2;

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
  clearsBullets?: boolean;
  damage: number;
  grazed?: boolean;
  color: string;
  width?: number;
  height?: number;
  hitIds?: Set<string>;
}

interface FunnelUnit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  fireTimer: number;
}

interface PowerStar {
  x: number;
  y: number;
  vx: number;
}

interface ShipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  flash: number;
  squash: SquashSpring;
  hearts: number;
  spreadLevel: number;
  funnelCount: number;
  chargeSec: number;
  funnelOverdriveTimer: number;
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
const CHARGE_VFX_START_SEC = 0.08;
const CHARGE_TIER1_SEC = 0.48; // Tier 1 (Base): 貫穿砲 Piercing Rail Cannon
const CHARGE_TIER2_SEC = 1.05; // Tier 2 (Evolved): 浮游併發 Floating Funnel Salvo
const FUNNEL_OVERDRIVE_SEC = 4.8;

const SHIP_MIN_X = 8;
const SHIP_MAX_X = GAME_W - 26;
const SHIP_MIN_Y = 14;
const SHIP_MAX_Y = GAME_H - 18;
const CORE_BULLET_HIT_RADIUS = 5.5;
const CORE_ENEMY_HIT_RADIUS = 10;
const GRAZE_RADIUS = 21;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * PA-02 Sugar Starlight: 4-Sector Horizontal Shmup Campaign.
 * Features responsive velocity-eased flight, tight core hurtbox + generous graze ring,
 * Hold-A converging particle charge (Tier 1: Piercing Rail Cannon -> Tier 2: Floating Funnel Salvo),
 * and autonomous tracking Wing Funnels.
 */
export class SugarStarlightGame implements CartridgeInstance {
  private readonly input = new InputMap();
  private readonly juice = new JuiceSystem();

  private ship: ShipState = {
    x: 34,
    y: 84,
    vx: 0,
    vy: 0,
    rot: 0,
    flash: 0,
    squash: { scaleX: 1, scaleY: 1 },
    hearts: MAX_HEARTS,
    spreadLevel: 1,
    funnelCount: 0,
    chargeSec: 0,
    funnelOverdriveTimer: 0,
    grazeCount: 0,
    shootCooldown: 0,
    invulnTimer: 0,
  };
  private funnels: FunnelUnit[] = [];
  private sectorIdx = 0;
  private boss: BossState | null = null;
  private score = 0;
  private starsCollected = 0;
  private elapsedSec = 0;
  private waveTimer = 0;
  private waveIndex = 0;
  private thrusterTimer = 0;
  private chargeParticleTimer = 0;
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

  public getChargeTier(): ChargeTier {
    if (this.ship.chargeSec >= CHARGE_TIER2_SEC) return 2;
    if (this.ship.chargeSec >= CHARGE_TIER1_SEC) return 1;
    return 0;
  }

  public getActiveFunnelCount(): number {
    return this.funnels.length;
  }

  public enterSector(idx: number): void {
    this.sectorIdx = clamp(idx, 0, SECTORS.length - 1);
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.boss = null;
    this.enemies = [];
    this.bullets = [];
    this.powerStars = [];
    this.status = 'playing';
    this.noticeText = `🚀 進入 ${SECTORS[this.sectorIdx].name}！`;
    this.noticeTimer = 2.5;
    this.syncFunnelPool(0);
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
        y: 76,
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
        y: 22 + ((this.waveIndex * 31 + i * 34) % (GAME_H - 48)),
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
    this.ship.invulnTimer = 1.25;
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

  private spawnPlayerBolt(x: number, y: number, vx: number, vy: number, color = '#ffd447'): void {
    this.bullets.push({
      x,
      y,
      vx,
      vy,
      fromEnemy: false,
      damage: 1,
      color,
    });
  }

  private fireBolts(events: SimEvent[]): void {
    this.ship.shootCooldown = 0.15;
    this.ship.squash = { scaleX: 0.88, scaleY: 1.12 };
    events.push('laser');
    this.spawnPlayerBolt(this.ship.x + 15, this.ship.y + 8, 248, 0);
    if (this.ship.spreadLevel >= 2) {
      this.spawnPlayerBolt(this.ship.x + 14, this.ship.y + 7, 238, -42);
      this.spawnPlayerBolt(this.ship.x + 14, this.ship.y + 9, 238, 42);
    }
    for (const f of this.funnels) {
      this.spawnPlayerBolt(f.x + 10, f.y + 6, 255, 0, '#5ec2f7');
    }
  }

  private spawnPiercingBeamChain(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    color: string,
    segments: number,
    beamWidth: number,
    beamHeight: number,
  ): void {
    const hitIds = new Set<string>();
    for (let s = 0; s < segments; s++) {
      this.bullets.push({
        x: x - s * 18,
        y: y - vy * s * 0.045,
        vx,
        vy,
        fromEnemy: false,
        piercing: true,
        clearsBullets: true,
        damage,
        color,
        width: beamWidth,
        height: beamHeight,
        hitIds,
      });
    }
  }

  private findNearestTarget(fromX: number, fromY: number): { x: number; y: number } | null {
    let bestDist = Infinity;
    let best: { x: number; y: number } | null = null;
    for (const e of this.enemies) {
      const tx = e.x + 8;
      const ty = e.y + 8;
      const d = Math.hypot(tx - fromX, ty - fromY);
      if (d < bestDist) {
        bestDist = d;
        best = { x: tx, y: ty };
      }
    }
    if (this.boss) {
      const bx = this.boss.x + 16;
      const by = this.boss.y + 8;
      const d = Math.hypot(bx - fromX, by - fromY);
      if (d < bestDist) best = { x: bx, y: by };
    }
    return best;
  }

  private firePiercingCannon(events: SimEvent[], params: RuntimeParams): void {
    const muzzleX = this.ship.x + 22;
    const muzzleY = this.ship.y + 8;
    this.spawnPiercingBeamChain(muzzleX, muzzleY, 380, 0, 5, '#5ec2f7', 3, 22, 10);
    this.ship.squash = { scaleX: 1.3, scaleY: 0.76 };
    this.ship.shootCooldown = 0.16;
    events.push('rail');
    this.juice.triggerHitstop(0.03);
    this.juice.addTrauma(0.24);
    this.juice.triggerFlash('#8ce8ff', 0.08);
    this.juice.spawnBurst(
      muzzleX,
      muzzleY,
      ['#5ec2f7', '#fffaf0', '#ffd447'],
      10,
      params.sparkleDensity,
      { gravity: 0, liftY: 0, speedMin: 35, speedMax: 105 },
    );
  }

  private fireFunnelSalvo(events: SimEvent[], params: RuntimeParams): void {
    const activeCount = Math.max(2, this.ship.funnelCount);
    this.ship.funnelOverdriveTimer = FUNNEL_OVERDRIVE_SEC;
    this.syncFunnelPool(0);

    const muzzleX = this.ship.x + 22;
    const muzzleY = this.ship.y + 8;
    // Central Hyper Rail
    this.spawnPiercingBeamChain(muzzleX, muzzleY, 400, 0, 5, '#ffd447', 3, 22, 11);

    // Synchronized Funnel Beams aiming cleanly toward right-side targets or fanning out
    const target = this.findNearestTarget(muzzleX + 40, muzzleY);
    for (let i = 0; i < this.funnels.length; i++) {
      const f = this.funnels[i];
      const fx = f.x + 14;
      const fy = f.y + 5.5;
      const fanVy =
        this.funnels.length <= 2
          ? i === 0
            ? -22
            : 22
          : [-36, -14, 14, 36][i % 4];
      const aimVy = target ? clamp(((target.y - fy) / Math.max(48, target.x - fx)) * 280, -56, 56) * 0.55 + fanVy * 0.45 : fanVy;
      this.spawnPiercingBeamChain(fx, fy, 370, aimVy, 3, i % 2 === 0 ? '#5ec2f7' : '#ff8ec6', 2, 18, 8);
      this.juice.spawnBurst(fx, fy, ['#ffd447', '#5ec2f7', '#fffaf0'], 5, params.sparkleDensity, {
        gravity: 0,
        liftY: 0,
        speedMin: 24,
        speedMax: 70,
      });
    }

    this.ship.squash = { scaleX: 1.36, scaleY: 0.72 };
    this.ship.shootCooldown = 0.2;
    this.noticeText = `💠 浮游併發齊射！(${activeCount} 機自主追擊啟動)`;
    this.noticeTimer = 2.0;
    events.push('rail');
    events.push('ignite');
    this.juice.triggerHitstop(0.045);
    this.juice.addTrauma(0.34);
    this.juice.triggerFlash('#ffd447', 0.09);
    this.juice.spawnBurst(
      muzzleX,
      muzzleY,
      ['#ffd447', '#ff8ec6', '#5ec2f7', '#fffaf0'],
      14,
      params.sparkleDensity,
      { gravity: 0, liftY: 0, speedMin: 42, speedMax: 120 },
    );
  }

  private updateShipMovement(simDt: number, params: RuntimeParams): void {
    let mx = this.input.axisX();
    let my = this.input.axisY();
    if (mx !== 0 && my !== 0) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }

    const speed = params.moveSpeed * 1.18;
    const blend = Math.min(1, simDt * 18);
    this.ship.vx += (mx * speed - this.ship.vx) * blend;
    this.ship.vy += (my * speed - this.ship.vy) * blend;
    this.ship.x = clamp(this.ship.x + this.ship.vx * simDt, SHIP_MIN_X, SHIP_MAX_X);
    this.ship.y = clamp(this.ship.y + this.ship.vy * simDt, SHIP_MIN_Y, SHIP_MAX_Y);
    this.ship.rot = clamp(this.ship.vy * 0.0022, -0.22, 0.22);

    this.thrusterTimer -= simDt;
    if (this.thrusterTimer <= 0) {
      this.thrusterTimer = this.ship.chargeSec >= CHARGE_TIER1_SEC ? 0.032 : 0.052;
      const tier = this.getChargeTier();
      this.juice.particles.push({
        x: this.ship.x - 1,
        y: this.ship.y + 8 + ((Math.sin(this.juice.visualTime * 29) * 1.5)),
        vx: -74 - Math.max(0, this.ship.vx) * 0.35,
        vy: this.ship.vy * 0.1,
        life: 0,
        maxLife: 0.2,
        size: tier >= 2 ? 3.2 : 2.3,
        color: tier === 2 ? '#ffd447' : tier === 1 ? '#5ec2f7' : '#ff9ec2',
        rot: 0,
        vRot: 0,
        additive: true,
        gravity: 0,
      });
    }
  }

  private updateChargeAndFire(simDt: number, events: SimEvent[], params: RuntimeParams): void {
    const actionHeld = this.input.held('action');
    const jumpHeld = this.input.held('jump');

    if (this.input.justPressed('action') && this.ship.shootCooldown <= 0) {
      this.fireBolts(events);
    }

    if (actionHeld) {
      const prevTier = this.getChargeTier();
      const overdriveBoost = this.ship.funnelOverdriveTimer > 0 ? 1.15 : 1.0;
      this.ship.chargeSec += simDt * overdriveBoost;
      const nextTier = this.getChargeTier();

      if (nextTier === 1 && prevTier === 0) {
        events.push('charge');
        this.juice.spawnBurst(
          this.ship.x + 15,
          this.ship.y + 8,
          ['#5ec2f7', '#fffaf0'],
          8,
          params.sparkleDensity,
          { gravity: 0, liftY: 0, speedMin: 20, speedMax: 55 },
        );
      } else if (nextTier === 2 && prevTier < 2) {
        events.push('star');
        this.juice.addTrauma(0.14);
        this.juice.spawnBurst(
          this.ship.x + 8,
          this.ship.y + 8,
          ['#ffd447', '#ff8ec6', '#5ec2f7'],
          12,
          params.sparkleDensity,
          { gravity: 0, liftY: 0, speedMin: 28, speedMax: 74 },
        );
      }

      if (this.ship.chargeSec >= CHARGE_VFX_START_SEC) {
        this.chargeParticleTimer -= simDt;
        if (this.chargeParticleTimer <= 0) {
          this.chargeParticleTimer = nextTier === 2 ? 0.036 : 0.048;
          const noseX = this.ship.x + 15;
          const noseY = this.ship.y + 8;
          const colors =
            nextTier === 2
              ? ['#ffd447', '#ff8ec6', '#8ce8ff', '#fffaf0']
              : nextTier === 1
                ? ['#5ec2f7', '#ffd447', '#fffaf0']
                : ['#5ec2f7', '#8ce8ff', '#fffaf0'];
          this.juice.spawnConverge(
            noseX,
            noseY,
            colors,
            nextTier === 2 ? 4 : nextTier === 1 ? 3 : 2,
            params.sparkleDensity,
            {
              radiusMin: 18,
              radiusMax: nextTier === 2 ? 36 : 29,
              pull: nextTier === 2 ? 620 : nextTier === 1 ? 520 : 420,
              swirlSpeed: nextTier === 2 ? 48 : 30,
              maxLife: 0.28,
              sprite: nextTier >= 1 ? 'sparkle' : undefined,
              sizeMin: 4,
              sizeMax: 6.5,
            },
          );
          if (nextTier === 2) {
            for (const f of this.funnels) {
              this.juice.spawnConverge(f.x + 6, f.y + 6, ['#ffd447', '#5ec2f7', '#fffaf0'], 2, params.sparkleDensity, {
                radiusMin: 10,
                radiusMax: 20,
                pull: 460,
                swirlSpeed: 40,
                maxLife: 0.24,
              });
            }
          }
        }
      }
    } else if (this.ship.chargeSec > 0) {
      const releaseTier = this.getChargeTier();
      if (releaseTier === 2) {
        this.fireFunnelSalvo(events, params);
      } else if (releaseTier === 1) {
        this.firePiercingCannon(events, params);
      }
      this.ship.chargeSec = 0;
      this.chargeParticleTimer = 0;
    }

    if (jumpHeld && this.ship.shootCooldown <= 0) {
      this.fireBolts(events);
    }
  }

  private syncFunnelPool(simDt: number): void {
    const chargeTier = this.getChargeTier();
    const desiredCount =
      this.ship.funnelOverdriveTimer > 0 || chargeTier === 2
        ? Math.max(2, this.ship.funnelCount)
        : this.ship.funnelCount;

    while (this.funnels.length < desiredCount) {
      this.funnels.push({
        x: this.ship.x + 4,
        y: this.ship.y + 4,
        vx: 0,
        vy: 0,
        rot: 0,
        fireTimer: 0.14 + this.funnels.length * 0.08,
      });
    }
    if (this.funnels.length > desiredCount) {
      this.funnels.length = desiredCount;
    }
    if (simDt <= 0 || this.funnels.length === 0) return;

    const total = this.funnels.length;
    const t = this.juice.visualTime;
    const isOrbitCharge = chargeTier === 2;
    const isOverdrive = this.ship.funnelOverdriveTimer > 0;

    for (let i = 0; i < total; i++) {
      const f = this.funnels[i];
      let targetX = this.ship.x - 2;
      let targetY = this.ship.y + 2;

      if (isOrbitCharge) {
        const ang = t * 5.2 + (Math.PI * 2 * i) / total;
        targetX = this.ship.x + 2 + Math.cos(ang) * 24;
        targetY = this.ship.y + 2 + Math.sin(ang) * 24;
        f.rot = ang;
      } else if (isOverdrive) {
        const offsets = total <= 2 ? [-22, 26] : [-28, -14, 18, 32];
        const forward = total <= 2 ? 22 : i % 2 === 0 ? 26 : 16;
        targetX = this.ship.x + forward;
        targetY = this.ship.y + offsets[i % offsets.length] + Math.sin(t * 7 + i * 1.4) * 3;
        f.rot += simDt * 6.5;
      } else {
        const offsets = total <= 2 ? [-18, 22] : [-24, -12, 16, 28];
        const xShift = total <= 2 ? 0 : i === 1 || i === 2 ? 6 : -4;
        targetX = this.ship.x + xShift;
        targetY = this.ship.y + offsets[i % offsets.length] + Math.sin(t * 5.5 + i * 1.6) * 2.2;
        f.rot += simDt * 2.5;
      }

      targetX = clamp(targetX, 4, GAME_W - 16);
      targetY = clamp(targetY, 10, GAME_H - 16);

      const spring = isOrbitCharge ? 18 : 13;
      const blend = Math.min(1, simDt * spring);
      f.x += (targetX - f.x) * blend;
      f.y += (targetY - f.y) * blend;

      // Autonomous tracking fire during Overdrive, or cover fire while holding A charge!
      const autoFireActive = isOverdrive || (this.input.held('action') && !isOrbitCharge && this.ship.funnelCount > 0);
      if (autoFireActive) {
        f.fireTimer -= simDt;
        if (f.fireTimer <= 0) {
          f.fireTimer = isOverdrive ? 0.26 : 0.34;
          const aimTarget = isOverdrive ? this.findNearestTarget(f.x + 6, f.y + 6) : null;
          let bvx = 250;
          let bvy = 0;
          if (aimTarget && aimTarget.x > f.x + 8) {
            const dx = aimTarget.x - (f.x + 6);
            const dy = aimTarget.y - (f.y + 6);
            const len = Math.max(1, Math.hypot(dx, dy));
            bvx = (dx / len) * 260;
            bvy = (dy / len) * 260;
          }
          this.spawnPlayerBolt(f.x + 8, f.y + 6, bvx, bvy, isOverdrive ? '#ff8ec6' : '#5ec2f7');
        }
      }
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
    if (this.ship.funnelOverdriveTimer > 0) {
      this.ship.funnelOverdriveTimer = Math.max(0, this.ship.funnelOverdriveTimer - simDt);
    }

    this.updateShipMovement(simDt, params);
    this.updateChargeAndFire(simDt, events, params);
    this.syncFunnelPool(simDt);

    // Wave spawner before Boss, or Boss attack pattern
    if (!this.boss) {
      this.waveTimer += simDt;
      if (this.waveTimer > 4.2 || this.enemies.length === 0) {
        this.waveTimer = 0;
        this.spawnWave();
      }
    } else {
      if (this.boss.x > 256) {
        this.boss.x -= 48 * simDt;
      }
      this.boss.y = 76 + Math.sin(this.juice.visualTime * (1.65 + this.sectorIdx * 0.22)) * 46;

      this.boss.fireTimer -= simDt;
      if (this.boss.fireTimer <= 0) {
        this.boss.fireTimer = Math.max(0.7, 1.08 - this.sectorIdx * 0.1);
        const spread = this.sectorIdx >= 2 ? [-38, -14, 14, 38] : [-28, 0, 28];
        for (const dy of spread) {
          this.bullets.push({
            x: this.boss.x,
            y: this.boss.y + 6,
            vx: -(116 + this.sectorIdx * 13),
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
        e.y += Math.sin(this.juice.visualTime * 3.5 + e.phase) * 40 * simDt;
      } else if (e.kind === 'shooter') {
        e.fireTimer -= simDt;
        if (e.fireTimer <= 0 && e.x < GAME_W - 12 && e.x > 46) {
          e.fireTimer = 1.65;
          this.bullets.push({
            x: e.x,
            y: e.y + 8,
            vx: -122,
            vy: clamp((this.ship.y - e.y) * 0.42, -55, 55),
            fromEnemy: true,
            damage: 1,
            color: '#ff9048',
          });
        }
      } else {
        e.rot += 3.5 * simDt;
      }
      e.y = clamp(e.y, 12, GAME_H - 22);

      if (e.x < -24) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (
        this.ship.invulnTimer <= 0 &&
        Math.hypot(this.ship.x + 8 - (e.x + 8), this.ship.y + 8 - (e.y + 8)) < CORE_ENEMY_HIT_RADIUS
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
      if (Math.hypot(this.ship.x + 8 - (ps.x + 8), this.ship.y + 8 - (ps.y + 8)) < 16) {
        this.powerStars.splice(i, 1);
        this.starsCollected++;
        this.juice.registerCombo();
        if (this.ship.spreadLevel < 2) {
          this.ship.spreadLevel = 2;
          this.noticeText = '⭐ 火力進化：三向星糖散射砲！';
        } else if (this.ship.funnelCount < 2) {
          this.ship.funnelCount = 2;
          this.noticeText = '💠 解鎖【雙子浮游機常駐護衛】！';
        } else if (this.ship.funnelCount < 4 && this.starsCollected >= 4) {
          this.ship.funnelCount = 4;
          this.noticeText = '🌟 陣列進化：【四連星光浮游矩陣】！';
        } else {
          this.score += 60;
          this.ship.funnelOverdriveTimer = Math.max(this.ship.funnelOverdriveTimer, 3.0);
          this.noticeText = '✨ 星能過載：浮游機追擊延長 +135 分！';
        }
        this.noticeTimer = 2.4;
        this.score += 75;
        events.push('star');
        this.juice.spawnBurst(ps.x + 8, ps.y + 8, ['#ffd447', '#fffaf0', '#56d39c'], 9, params.sparkleDensity, { gravity: 0, liftY: 0 });
      }
    }

    // Update bullets, beam bullet-clearing, & Graze Shield/Charge synergy
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.x += b.vx * simDt;
      b.y += b.vy * simDt;
      if (b.x < -28 || b.x > GAME_W + 32 || b.y < -18 || b.y > GAME_H + 18) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.fromEnemy) {
        const dist = Math.hypot(this.ship.x + 8 - b.x, this.ship.y + 8 - b.y);
        if (this.ship.invulnTimer <= 0 && dist < CORE_BULLET_HIT_RADIUS) {
          this.bullets.splice(i, 1);
          this.damageShip(events, 0.5, 0.25, ['#ff708d', '#ffd447'], 8, params);
        } else if (!b.grazed && dist < GRAZE_RADIUS) {
          b.grazed = true;
          this.ship.grazeCount++;
          this.score += 20;
          if (this.input.held('action')) {
            this.ship.chargeSec += 0.08;
          }
          events.push('snap');
          this.juice.spawnBurst(this.ship.x + 8, this.ship.y + 8, ['#5ec2f7', '#fffaf0'], 4, params.sparkleDensity, { gravity: 0, liftY: 0 });
          if (this.ship.grazeCount % 10 === 0) {
            if (this.ship.hearts < MAX_HEARTS) {
              this.ship.hearts++;
              this.noticeText = '🛡️ 擦彈能量滿載！護盾回復 +1 ❤️！';
            } else {
              this.score += 120;
              this.noticeText = '⚡ 擦彈連擊 Bonus +120！';
            }
            this.noticeTimer = 2.0;
          }
        }
        continue;
      }

      // Piercing beam defensive clear: vaporize enemy projectiles in beam path
      if (b.clearsBullets) {
        for (let k = this.bullets.length - 1; k >= 0; k--) {
          if (k === i) continue;
          const eb = this.bullets[k];
          if (!eb.fromEnemy) continue;
          if (Math.abs(eb.x - b.x) < 14 && Math.abs(eb.y - b.y) < 11) {
            this.bullets.splice(k, 1);
            if (k < i) i--;
            this.score += 10;
            this.juice.spawnBurst(eb.x, eb.y, ['#8ce8ff', '#fffaf0'], 3, params.sparkleDensity, {
              gravity: 0,
              liftY: 0,
              speedMin: 14,
              speedMax: 42,
            });
          }
        }
      }

      // Hero bullet / piercing beam vs enemies
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hitIds?.has(e.id)) continue;
        if (Math.hypot(b.x - (e.x + 8), b.y - (e.y + 8)) < (b.piercing ? 16 : 12)) {
          hit = true;
          b.hitIds?.add(e.id);
          e.hp -= b.damage;
          e.flashTimer = 0.16;
          if (e.hp <= 0) {
            this.enemies.splice(j, 1);
            this.score += b.piercing ? 80 : 65;
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
      const bossKey = `boss-${this.sectorIdx}`;
      if (
        (!hit || b.piercing) &&
        boss &&
        !b.hitIds?.has(bossKey) &&
        b.x > boss.x - 4 &&
        b.x < boss.x + 34 &&
        Math.abs(b.y - (boss.y + 8)) < 15
      ) {
        hit = true;
        b.hitIds?.add(bossKey);
        boss.hp -= b.damage;
        boss.flash = 0.14;
        this.score += b.piercing ? 40 : 25;
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
    this.ship.invulnTimer = 1.25;
    this.ship.chargeSec = 0;
    this.ship.funnelOverdriveTimer = 0;
    this.enterSector(this.sectorIdx);
  }

  public serializeSave(): unknown {
    return {
      v: 2,
      sectorIdx: this.sectorIdx,
      score: this.score,
      starsCollected: this.starsCollected,
      hearts: this.ship.hearts,
      spreadLevel: this.ship.spreadLevel,
      funnelCount: this.ship.funnelCount,
      hasOptions: this.ship.funnelCount >= 2,
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
      funnelCount?: number;
      hasOptions?: boolean;
      grazeCount?: number;
    };
    if ((s.v !== 1 && s.v !== 2) || typeof s.sectorIdx !== 'number') return false;
    this.score = Number(s.score ?? 0);
    this.starsCollected = Number(s.starsCollected ?? 0);
    this.ship.hearts = clamp(Number(s.hearts ?? 3), 1, MAX_HEARTS);
    this.ship.spreadLevel = clamp(Number(s.spreadLevel ?? 1), 1, 2);
    this.ship.funnelCount =
      typeof s.funnelCount === 'number' ? clamp(s.funnelCount, 0, 4) : s.hasOptions ? 2 : 0;
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
    const chargeTier = this.getChargeTier();

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
      const bw = b.width ?? (b.piercing ? 22 : b.fromEnemy ? 10 : 12);
      const bh = b.height ?? (b.piercing ? 10 : b.fromEnemy ? 10 : 12);
      entities.push({
        id: `b-${i}`,
        sprite: b.piercing ? 'laser_beam' : b.fromEnemy ? 'sparkle' : 'bolt',
        x: b.x - bw * 0.5,
        y: b.y - bh * 0.5,
        w: bw,
        h: bh,
        rot: b.piercing && b.vy !== 0 ? Math.atan2(b.vy, b.vx) : undefined,
        tint: b.color,
        additive: b.fromEnemy,
      });
      if (glow > 0.05) {
        lights.push({
          x: b.x,
          y: b.y,
          radius: b.piercing ? 18 : b.fromEnemy ? 14 : 16,
          color: b.color,
          intensity: (b.piercing ? 0.28 : 0.3) * glow,
        });
      }
    }

    // Floating Funnels (Option Orbs)
    for (let i = 0; i < this.funnels.length; i++) {
      const f = this.funnels[i];
      const over = this.ship.funnelOverdriveTimer > 0 || chargeTier === 2;
      entities.push({
        id: `funnel-${i}`,
        sprite: 'option_orb',
        x: f.x,
        y: f.y,
        w: 11,
        h: 11,
        rot: f.rot,
        tint: over ? (i % 2 === 0 ? '#ffd447' : '#ff8ec6') : undefined,
      });
      if (glow > 0.05) {
        lights.push({
          x: f.x + 5.5,
          y: f.y + 5.5,
          radius: over ? 18 : 14,
          color: over ? '#ffd447' : '#5ec2f7',
          intensity: (over ? 0.34 : 0.22) * glow,
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
        rot: this.ship.rot,
        scaleX: this.ship.squash.scaleX,
        scaleY: this.ship.squash.scaleY,
        flash: Math.min(1, this.ship.flash * 4),
      });
    }

    // Converging Charge Core Orb at Ship Nose + Micro-Hurtbox Core Marker
    if (this.ship.chargeSec >= CHARGE_VFX_START_SEC) {
      const ratio = clamp(this.ship.chargeSec / CHARGE_TIER2_SEC, 0.2, 1.0);
      const orbSize = 5 + ratio * 6 + Math.sin(t * 28) * 1.2;
      entities.push({
        id: 'charge-core',
        sprite: 'sparkle',
        x: this.ship.x + 15 - orbSize * 0.5,
        y: this.ship.y + 8 - orbSize * 0.5,
        w: orbSize,
        h: orbSize,
        rot: t * 8,
        tint: chargeTier === 2 ? '#ffd447' : chargeTier === 1 ? '#5ec2f7' : '#fffaf0',
        additive: true,
      });
    }

    if (glow > 0.05) {
      lights.push({
        x: this.ship.x + 10,
        y: this.ship.y + 8,
        radius: chargeTier === 2 ? 32 : chargeTier === 1 ? 26 : 20,
        color: chargeTier === 2 ? '#ffd447' : chargeTier === 1 ? '#5ec2f7' : '#8ce8ff',
        intensity: (chargeTier === 2 ? 0.46 : chargeTier === 1 ? 0.42 : 0.32) * glow,
      });
    }

    let debugRects: DebugRectDesc[] | undefined;
    if (this.debugHitboxes) {
      debugRects = [
        { x: this.ship.x + 8 - CORE_BULLET_HIT_RADIUS, y: this.ship.y + 8 - CORE_BULLET_HIT_RADIUS, w: CORE_BULLET_HIT_RADIUS * 2, h: CORE_BULLET_HIT_RADIUS * 2, color: '#ffd447' },
      ];
      for (const e of this.enemies) {
        debugRects.push({ x: e.x, y: e.y, w: 16, h: 16, color: '#ff708d' });
      }
      if (this.boss) {
        debugRects.push({ x: this.boss.x, y: this.boss.y, w: 32, h: 16, color: '#e0aaff' });
      }
    }

    const chargeNote =
      chargeTier === 2
        ? '💠 LV.2 浮游併發滿載！放開 A 齊射貫穿矩陣＋浮游追擊！'
        : chargeTier === 1
          ? '⚡ LV.1 貫穿砲就緒！放開 A 發射，或續按凝聚【浮游併發】…'
          : this.ship.chargeSec >= CHARGE_VFX_START_SEC
            ? '✨ 粒子凝聚中… 持續按住 A 蓄力貫穿砲！'
            : '';

    const overdriveNote =
      this.ship.funnelOverdriveTimer > 0
        ? `💠 浮游機自主追擊 ${this.ship.funnelOverdriveTimer.toFixed(1)}s`
        : '';

    const defaultBanner = this.boss
      ? `${sector.bossName} ${this.boss.hp}/${this.boss.maxHp}｜${overdriveNote || `擦彈 ${this.ship.grazeCount} 次`}`
      : overdriveNote
        ? `${overdriveNote}｜長按 A 凝聚貫穿砲 / 浮游併發`
        : `按住 A 凝聚粒子：1段貫穿砲 → 2段浮游併發｜擦彈 (${this.ship.grazeCount % 10}/10) 回血`;

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
      hasKey: this.ship.funnelCount >= 2,
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
      statusBanner: chargeNote || (this.noticeTimer > 0 ? this.noticeText : defaultBanner),
      stage: {
        index: this.sectorIdx + 1,
        total: SECTORS.length,
        name: sector.name,
      },
      bgmTheme: this.boss ? 'boss' : 'starlight',
    };
  }
}
