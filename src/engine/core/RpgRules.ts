import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type { SeededRng } from './SeededRng.ts';

export type StatKey = 'str' | 'dex' | 'int';

export interface CharacterStats {
  name: string;
  level: number;
  xp: number;
  nextXp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ac: number;
  str: number;
  dex: number;
  int: number;
  potions: number;
  keys: number;
}

export interface MonsterArchetype {
  id: string;
  name: string;
  sprite: SpriteId;
  maxHp: number;
  ac: number;
  atkMod: number;
  damageCount: number;
  damageSides: number;
  damageBonus: number;
  xpReward: number;
  isBoss?: boolean;
  specialName?: string;
}

export interface DiceRollResult {
  rolls: number[];
  mod: number;
  total: number;
  natural: number;
  isCrit: boolean;
  isFumble: boolean;
  text: string;
}

export const MONSTER_CATALOG: Record<string, MonsterArchetype> = {
  goblin: {
    id: 'goblin',
    name: '地牢哥布林',
    sprite: 'goblin',
    maxHp: 11,
    ac: 12,
    atkMod: 3,
    damageCount: 1,
    damageSides: 6,
    damageBonus: 1,
    xpReward: 40,
  },
  skeleton: {
    id: 'skeleton',
    name: '古墓骸骨衛士',
    sprite: 'skeleton',
    maxHp: 18,
    ac: 13,
    atkMod: 4,
    damageCount: 1,
    damageSides: 8,
    damageBonus: 1,
    xpReward: 65,
  },
  dragon: {
    id: 'dragon',
    name: '餘燼幼龍 BOSS',
    sprite: 'dragon',
    maxHp: 34,
    ac: 14,
    atkMod: 5,
    damageCount: 2,
    damageSides: 6,
    damageBonus: 2,
    xpReward: 200,
    isBoss: true,
    specialName: '餘燼吐息',
  },
};

export function statMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function rollDice(rng: SeededRng, count: number, sides: number, mod = 0): DiceRollResult {
  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = rng.int(1, sides);
    rolls.push(r);
    sum += r;
  }
  const natural = rolls[0] ?? 0;
  const total = sum + mod;
  const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '';
  return {
    rolls,
    mod,
    total,
    natural,
    isCrit: count === 1 && sides === 20 && natural === 20,
    isFumble: count === 1 && sides === 20 && natural === 1,
    text: `${count}d${sides}${modStr}=${total}`,
  };
}

export function skillCheck(
  rng: SeededRng,
  stats: CharacterStats,
  stat: StatKey,
  dc: number,
): { passed: boolean; roll: DiceRollResult; mod: number } {
  const mod = statMod(stats[stat]);
  const roll = rollDice(rng, 1, 20, mod);
  const passed = roll.isCrit || (!roll.isFumble && roll.total >= dc);
  return { passed, roll, mod };
}

export function resolveWeaponAttack(
  rng: SeededRng,
  atkMod: number,
  targetAc: number,
  dmgCount: number,
  dmgSides: number,
  dmgBonus: number,
): { hit: boolean; crit: boolean; fumble: boolean; damage: number; summary: string } {
  const atk = rollDice(rng, 1, 20, atkMod);
  if (atk.isFumble || (!atk.isCrit && atk.total < targetAc)) {
    return {
      hit: false,
      crit: false,
      fumble: atk.isFumble,
      damage: 0,
      summary: `🎲 1d20+${atkMod}=${atk.total} vs AC${targetAc} → 未命中${atk.isFumble ? ' (大失敗!)' : ''}`,
    };
  }
  const diceCount = atk.isCrit ? dmgCount * 2 : dmgCount;
  const dmg = rollDice(rng, diceCount, dmgSides, dmgBonus);
  const finalDmg = Math.max(1, dmg.total);
  return {
    hit: true,
    crit: atk.isCrit,
    fumble: false,
    damage: finalDmg,
    summary: `🎲 ${atk.isCrit ? '💥暴擊! ' : ''}命中 AC${targetAc} (${atk.total}) → 造成 ${finalDmg} 傷害!`,
  };
}
