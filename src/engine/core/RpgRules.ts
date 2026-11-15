import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type { SeededRng } from './SeededRng.ts';

export type StatKey = 'str' | 'dex' | 'int';
export type EquipSlot = 'weapon' | 'armor' | 'relic';
export type StatusEffectKind = 'poison' | 'burn' | 'shield' | 'stun';

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipSlot;
  atkBonus?: number;
  dmgBonus?: number;
  acBonus?: number;
  maxHpBonus?: number;
  visionBonus?: number;
  burnOnHit?: boolean;
  price: number;
}

export const EQUIPMENT_CATALOG: Record<string, EquipmentItem> = {
  iron_blade: { id: 'iron_blade', name: '精鐵長劍', slot: 'weapon', atkBonus: 1, dmgBonus: 2, price: 35 },
  ember_sword: { id: 'ember_sword', name: '烈焰長劍', slot: 'weapon', atkBonus: 2, dmgBonus: 3, burnOnHit: true, price: 75 },
  dragonbane: { id: 'dragonbane', name: '屠龍聖劍', slot: 'weapon', atkBonus: 3, dmgBonus: 5, burnOnHit: true, price: 140 },
  leather_vest: { id: 'leather_vest', name: '游俠皮甲', slot: 'armor', acBonus: 1, maxHpBonus: 4, price: 30 },
  mithril_mail: { id: 'mithril_mail', name: '秘銀鎖甲', slot: 'armor', acBonus: 2, maxHpBonus: 8, price: 80 },
  sun_lantern: { id: 'sun_lantern', name: '太陽火紋徽', slot: 'relic', visionBonus: 2, atkBonus: 1, price: 60 },
  sage_charm: { id: 'sage_charm', name: '賢者護符', slot: 'relic', acBonus: 1, dmgBonus: 1, visionBonus: 1, price: 90 },
};

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
  gold: number;
  weapon?: EquipmentItem;
  armor?: EquipmentItem;
  relic?: EquipmentItem;
  statuses: Partial<Record<StatusEffectKind, number>>;
}

export interface MonsterArchetype {
  id: string;
  name: string;
  sprite: SpriteId;
  tint?: string;
  maxHp: number;
  ac: number;
  atkMod: number;
  damageCount: number;
  damageSides: number;
  damageBonus: number;
  xpReward: number;
  goldReward?: number;
  isBoss?: boolean;
  isMiniBoss?: boolean;
  inflictStatus?: StatusEffectKind;
  specialName?: string;
  lootDrop?: 'potion' | 'weapon' | 'armor' | 'relic';
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
    goldReward: 12,
  },
  treasure_goblin: {
    id: 'treasure_goblin',
    name: '黃金盜寶哥布林',
    sprite: 'goblin',
    tint: '#ffd447',
    maxHp: 14,
    ac: 13,
    atkMod: 2,
    damageCount: 1,
    damageSides: 4,
    damageBonus: 1,
    xpReward: 55,
    goldReward: 45,
    lootDrop: 'potion',
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
    goldReward: 18,
  },
  shaman: {
    id: 'shaman',
    name: '毒霧薩滿',
    sprite: 'shaman',
    maxHp: 21,
    ac: 13,
    atkMod: 4,
    damageCount: 1,
    damageSides: 6,
    damageBonus: 2,
    xpReward: 85,
    goldReward: 26,
    inflictStatus: 'poison',
    specialName: '劇毒詛咒',
  },
  gargoyle: {
    id: 'gargoyle',
    name: '寒冰石像鬼',
    sprite: 'gargoyle',
    maxHp: 28,
    ac: 15,
    atkMod: 5,
    damageCount: 1,
    damageSides: 8,
    damageBonus: 2,
    xpReward: 110,
    goldReward: 34,
    inflictStatus: 'stun',
    specialName: '霜凍震擊',
  },
  miniboss_warden: {
    id: 'miniboss_warden',
    name: '熔岩典獄長',
    sprite: 'skeleton',
    tint: '#ff708d',
    maxHp: 42,
    ac: 15,
    atkMod: 6,
    damageCount: 2,
    damageSides: 5,
    damageBonus: 2,
    xpReward: 180,
    goldReward: 65,
    isMiniBoss: true,
    inflictStatus: 'burn',
    specialName: '熔岩重錘',
    lootDrop: 'armor',
  },
  dragon: {
    id: 'dragon',
    name: '餘燼龍王 BOSS',
    sprite: 'dragon',
    maxHp: 64,
    ac: 15,
    atkMod: 6,
    damageCount: 2,
    damageSides: 6,
    damageBonus: 3,
    xpReward: 300,
    goldReward: 150,
    isBoss: true,
    inflictStatus: 'burn',
    specialName: '終焉餘燼吐息',
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
