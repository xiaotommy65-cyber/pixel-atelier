import type { TraitTag } from './Archetypes.ts';
import type { SimEvent } from '../WorldTypes.ts';

export interface RuleEntityLike {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  alive: boolean;
  tags: Set<TraitTag>;
  active?: boolean;
  fuseTimer?: number;
  flashTimer: number;
  scaleX: number;
  scaleY: number;
  sprite: string;
  lightRadius?: number;
  lightColor?: string;
  lightIntensity?: number;
}

export interface RuleWorldActions {
  emit(ev: SimEvent): void;
  addScore(points: number): void;
  unlockGates(): void;
  spawnBurst(x: number, y: number, colors: readonly string[], count: number): void;
  triggerJuice(hitstop: number, trauma: number, flashHex?: string, flashAlpha?: number): void;
  detonateAt(x: number, y: number, radius: number, sourceId: string): void;
}

export interface TagInteractionRule {
  id: string;
  sourceTag: TraitTag;
  targetTag: TraitTag;
  onOverlap(source: RuleEntityLike, target: RuleEntityLike, world: RuleWorldActions, dt: number): void;
}

export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  pad = 0,
): boolean {
  return (
    ax + aw > bx - pad &&
    ax < bx + bw + pad &&
    ay + ah > by - pad &&
    ay < by + bh + pad
  );
}

export function igniteFlammable(target: RuleEntityLike, world: RuleWorldActions, fuseSec = 1.45): boolean {
  if (target.tags.has('burning')) return false;
  target.tags.add('burning');
  target.fuseTimer = fuseSec;
  target.flashTimer = 0.16;
  target.lightRadius = 32;
  target.lightColor = '#ff9048';
  target.lightIntensity = 0.5;
  world.emit('ignite');
  world.spawnBurst(target.x + 8, target.y + 4, ['#ffd447', '#ff708d'], 5);
  return true;
}

export function primeExplosive(target: RuleEntityLike, world: RuleWorldActions, fuseSec = 0.65): boolean {
  if (target.active) return false;
  target.active = true;
  target.fuseTimer = fuseSec;
  target.flashTimer = 0.18;
  target.tags.add('burning');
  world.emit('ignite');
  world.spawnBurst(target.x + 8, target.y + 2, ['#ffd447', '#fffaf0'], 6);
  return true;
}

export function activateSwitchPad(pad: RuleEntityLike, world: RuleWorldActions, burstCount = 8): boolean {
  if (pad.active) return false;
  pad.active = true;
  pad.sprite = 'switch_on';
  pad.lightColor = '#56d39c';
  pad.lightIntensity = 0.58;
  pad.flashTimer = 0.14;
  world.unlockGates();
  world.addScore(100);
  world.emit('bounce');
  world.spawnBurst(pad.x + 8, pad.y + 8, ['#56d39c', '#ffd447'], burstCount);
  return true;
}

export function destroyFragile(target: RuleEntityLike, world: RuleWorldActions, burstCount = 10): void {
  target.alive = false;
  target.flashTimer = 0.14;
  world.addScore(target.tags.has('enemy') ? 150 : 60);
  world.spawnBurst(target.x + 8, target.y + 8, ['#ff708d', '#ffd447', '#fffaf0'], burstCount);
}

/**
 * Data-driven Tag x Tag interaction matrix (no entity-kind if/else chains).
 * New emergent interactions are added cleanly as declarative rules.
 */
export const ENTITY_RULE_MATRIX: readonly TagInteractionRule[] = [
  {
    id: 'bouncy-launches-movers',
    sourceTag: 'bouncy',
    targetTag: 'pushable',
    onOverlap(spring, target, world) {
      if (target.vy >= -20) {
        target.vy = -275;
        spring.scaleX = 1.38;
        spring.scaleY = 0.62;
        spring.flashTimer = 0.08;
        world.emit('bounce');
        world.spawnBurst(spring.x + 8, spring.y + 4, ['#ffd447', '#ff708d'], 5);
      }
    },
  },
  {
    id: 'bouncy-launches-enemies',
    sourceTag: 'bouncy',
    targetTag: 'enemy',
    onOverlap(spring, target, world) {
      if (target.vy >= -20) {
        target.vy = -255;
        spring.scaleX = 1.35;
        spring.scaleY = 0.65;
        world.emit('bounce');
        world.spawnBurst(spring.x + 8, spring.y + 4, ['#56d39c', '#fffaf0'], 4);
      }
    },
  },
  {
    id: 'fire-ignites-flammable',
    sourceTag: 'burning',
    targetTag: 'flammable',
    onOverlap(_fire, target, world) {
      igniteFlammable(target, world, 1.45);
    },
  },
  {
    id: 'fire-primes-explosive',
    sourceTag: 'burning',
    targetTag: 'explosive',
    onOverlap(_fire, target, world) {
      primeExplosive(target, world, 0.65);
    },
  },
  {
    id: 'pushable-presses-switch',
    sourceTag: 'pushable',
    targetTag: 'switch',
    onOverlap(_mover, pad, world) {
      activateSwitchPad(pad, world, 8);
    },
  },
  {
    id: 'heavy-pushable-crushes-stompable',
    sourceTag: 'pushable',
    targetTag: 'stompable',
    onOverlap(mover, foe, world) {
      if (Math.abs(mover.vx) > 45 || mover.vy > 70) {
        destroyFragile(foe, world, 10);
        world.emit('stomp');
        world.triggerJuice(0.035, 0.25);
      }
    },
  },
];
