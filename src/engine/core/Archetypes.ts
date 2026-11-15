import type { SpriteId } from '../../gpu/TextureAtlas.ts';

/**
 * Composable behavioral Trait Tags — replaces hardcoded entity subclasses / giant if-chains.
 * Any entity can combine tags (e.g., bomb = pushable + explosive + fragile).
 */
export type TraitTag =
  | 'solid'
  | 'hero'
  | 'enemy'
  | 'stompable'
  | 'hazard'
  | 'pushable'
  | 'bouncy'
  | 'explosive'
  | 'flammable'
  | 'burning'
  | 'fragile'
  | 'collectible'
  | 'key'
  | 'gate'
  | 'switch'
  | 'lightSource';

export type ArchetypeId =
  | 'star'
  | 'key'
  | 'gate'
  | 'slime'
  | 'spring'
  | 'crate'
  | 'bomb'
  | 'torch'
  | 'switch_pad';

export interface ArchetypeDef {
  id: ArchetypeId;
  label: string;
  sprite: SpriteId;
  w: number;
  h: number;
  tags: readonly TraitTag[];
  hasGravity: boolean;
  friction: number;
  lightRadius?: number;
  lightColor?: string;
  lightIntensity?: number;
  patrolSpeed?: number;
}

/**
 * Type Object Catalog: defines entity templates declaratively by composition rather than inheritance.
 */
export const ARCHETYPE_CATALOG: Record<ArchetypeId, ArchetypeDef> = {
  star: {
    id: 'star',
    label: '黃金星星',
    sprite: 'star_a',
    w: 16,
    h: 16,
    tags: ['collectible', 'lightSource'],
    hasGravity: false,
    friction: 0,
    lightRadius: 24,
    lightColor: '#ffd447',
    lightIntensity: 0.42,
  },
  key: {
    id: 'key',
    label: '金鑰匙',
    sprite: 'key',
    w: 16,
    h: 16,
    tags: ['key', 'lightSource'],
    hasGravity: false,
    friction: 0,
    lightRadius: 28,
    lightColor: '#ffd447',
    lightIntensity: 0.48,
  },
  gate: {
    id: 'gate',
    label: '彩虹傳送門',
    sprite: 'gate_closed',
    w: 16,
    h: 16,
    tags: ['gate'],
    hasGravity: false,
    friction: 0,
  },
  slime: {
    id: 'slime',
    label: '果凍史萊姆',
    sprite: 'slime_a',
    w: 16,
    h: 16,
    tags: ['enemy', 'stompable', 'hazard', 'fragile'],
    hasGravity: true,
    friction: 140,
    patrolSpeed: 28,
  },
  spring: {
    id: 'spring',
    label: '彈性蘑菇跳台',
    sprite: 'spring',
    w: 16,
    h: 16,
    tags: ['bouncy'],
    hasGravity: false,
    friction: 0,
    lightRadius: 16,
    lightColor: '#ff708d',
    lightIntensity: 0.22,
  },
  crate: {
    id: 'crate',
    label: '積木木箱',
    sprite: 'crate',
    w: 16,
    h: 16,
    tags: ['solid', 'pushable', 'flammable', 'fragile'],
    hasGravity: true,
    friction: 520,
  },
  bomb: {
    id: 'bomb',
    label: '糖果炸彈',
    sprite: 'bomb',
    w: 16,
    h: 16,
    tags: ['pushable', 'explosive', 'fragile'],
    hasGravity: true,
    friction: 380,
    lightRadius: 16,
    lightColor: '#ff9048',
    lightIntensity: 0.24,
  },
  torch: {
    id: 'torch',
    label: '地牢火炬',
    sprite: 'torch',
    w: 16,
    h: 16,
    tags: ['lightSource', 'burning'],
    hasGravity: false,
    friction: 0,
    lightRadius: 58,
    lightColor: '#ffae42',
    lightIntensity: 0.72,
  },
  switch_pad: {
    id: 'switch_pad',
    label: '機關水晶踏板',
    sprite: 'switch_off',
    w: 16,
    h: 16,
    tags: ['switch'],
    hasGravity: false,
    friction: 0,
    lightRadius: 18,
    lightColor: '#ff708d',
    lightIntensity: 0.3,
  },
};
