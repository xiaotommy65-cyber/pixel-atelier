import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type { ParticleDesc } from '../WorldTypes.ts';
import { SeededRng } from './SeededRng.ts';

export interface SquashSpring {
  scaleX: number;
  scaleY: number;
}

/**
 * Shared game-feel / juice orchestrator implementing:
 * - Multi-clock Hitstop (freezes sim step while visual decay & camera shake continue)
 * - Trauma^2 camera shake (Squirrel Eiserloh pattern)
 * - Gentle screen impact flash
 * - Shared particle burst pool & squash-stretch spring
 */
export class JuiceSystem {
  public visualTime = 0;
  public hitstopTimer = 0;
  public trauma = 0;
  public shakeX = 0;
  public shakeY = 0;
  public flashAlpha = 0;
  public flashColor = '#fffaf0';
  public comboCount = 0;
  private comboTimer = 0;

  public readonly particles: ParticleDesc[] = [];
  private readonly rng = new SeededRng(0xcafe1234);

  public triggerHitstop(durationSec: number): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, Math.min(0.14, durationSec));
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  public triggerFlash(colorHex: string, alpha: number): void {
    if (alpha >= this.flashAlpha) {
      this.flashColor = colorHex;
      this.flashAlpha = Math.min(0.4, alpha);
    }
  }

  public registerCombo(): number {
    this.comboCount = Math.min(12, this.comboCount + 1);
    this.comboTimer = 2.0;
    return this.comboCount;
  }

  /**
   * Advances real-time juice clocks (always runs even during Hitstop) and
   * returns the simulation delta time (`0` while Hitstop is active).
   */
  public advanceRealTime(dt: number, shakeScale = 1.0): number {
    this.visualTime += dt;

    // Trauma^2 shake offset (deterministic multi-frequency noise)
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
      const shake = this.trauma * this.trauma * 7.5 * Math.max(0, shakeScale);
      this.shakeX = Math.sin(this.visualTime * 57.3) * shake;
      this.shakeY = Math.cos(this.visualTime * 71.1) * shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.6);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    // Update visual particles smoothly even during hitstop freeze
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.targetX !== undefined && p.targetY !== undefined) {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= (p.convergeSnapRadius ?? 2.8)) {
          this.particles.splice(i, 1);
          continue;
        }
        const pull = p.pull ?? 380;
        p.vx += (dx / dist) * pull * dt;
        p.vy += (dy / dist) * pull * dt;
        if (p.damping && p.damping > 0) {
          const damp = Math.max(0, 1 - p.damping * dt);
          p.vx *= damp;
          p.vy *= damp;
        }
      } else {
        p.vy += (p.gravity ?? 0) * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return 0;
    }
    return dt;
  }

  private trimPool(limit = 180): void {
    if (this.particles.length > limit) {
      this.particles.splice(0, this.particles.length - limit);
    }
  }

  public spawnBurst(
    x: number,
    y: number,
    colors: readonly string[],
    count: number,
    density = 1,
    opts?: {
      speedMin?: number;
      speedMax?: number;
      gravity?: number;
      liftY?: number;
      sprite?: SpriteId;
      additive?: boolean;
      sizeMin?: number;
      sizeMax?: number;
    },
  ): void {
    const actual = Math.max(2, Math.round(count * density));
    const spdMin = opts?.speedMin ?? 28;
    const spdMax = opts?.speedMax ?? 90;
    const grav = opts?.gravity ?? 150;
    const liftY = opts?.liftY ?? -22;

    for (let i = 0; i < actual; i++) {
      const ang = (Math.PI * 2 * i) / actual + this.rng.range(-0.35, 0.35);
      const spd = this.rng.range(spdMin, spdMax);
      const useSprite = opts?.sprite ?? (i % 3 === 0 ? 'sparkle' : undefined);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd + liftY,
        life: 0,
        maxLife: this.rng.range(0.32, 0.68),
        size: useSprite ? this.rng.range(opts?.sizeMin ?? 5, opts?.sizeMax ?? 8) : this.rng.range(2, 4),
        color: colors[i % colors.length],
        rot: this.rng.range(0, Math.PI * 2),
        vRot: (i % 2 === 0 ? 1 : -1) * this.rng.range(3, 7),
        sprite: useSprite,
        additive: opts?.additive ?? Boolean(useSprite),
        gravity: grav,
      });
    }
    this.trimPool();
  }

  /**
   * Spawns inward-spiraling particles pulled toward (targetX, targetY) — ideal for charge skills.
   */
  public spawnConverge(
    targetX: number,
    targetY: number,
    colors: readonly string[],
    count: number,
    density = 1,
    opts?: {
      radiusMin?: number;
      radiusMax?: number;
      pull?: number;
      swirlSpeed?: number;
      maxLife?: number;
      sprite?: SpriteId;
      sizeMin?: number;
      sizeMax?: number;
      snapRadius?: number;
    },
  ): void {
    const actual = Math.max(1, Math.round(count * Math.max(0.35, density)));
    const rMin = opts?.radiusMin ?? 18;
    const rMax = opts?.radiusMax ?? 34;
    const pull = opts?.pull ?? 460;
    const swirl = opts?.swirlSpeed ?? 34;
    const maxLife = opts?.maxLife ?? 0.32;

    for (let i = 0; i < actual; i++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(rMin, rMax);
      const px = targetX + Math.cos(ang) * r;
      const py = targetY + Math.sin(ang) * r;
      const tangentDir = i % 2 === 0 ? 1 : -1;
      const useSprite = opts?.sprite;
      this.particles.push({
        x: px,
        y: py,
        vx: -Math.cos(ang) * 28 - Math.sin(ang) * swirl * tangentDir,
        vy: -Math.sin(ang) * 28 + Math.cos(ang) * swirl * tangentDir,
        life: 0,
        maxLife,
        size: useSprite ? this.rng.range(opts?.sizeMin ?? 4, opts?.sizeMax ?? 7) : this.rng.range(1.6, 3.0),
        color: colors[i % colors.length],
        rot: ang,
        vRot: tangentDir * 5,
        sprite: useSprite,
        additive: true,
        targetX,
        targetY,
        pull,
        damping: 3.2,
        convergeSnapRadius: opts?.snapRadius ?? 3,
      });
    }
    this.trimPool();
  }
}

export function stepSquashSpring(spring: SquashSpring, dt: number, speed = 13): void {
  const blend = Math.min(1, dt * speed);
  spring.scaleX += (1 - spring.scaleX) * blend;
  spring.scaleY += (1 - spring.scaleY) * blend;
}
