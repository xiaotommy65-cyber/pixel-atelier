import { EQUIPMENT_CATALOG } from './RpgRules.ts';
import { SeededRng } from './SeededRng.ts';
import type { DialogDef, DungeonEntityDef, DungeonFloorDef, DungeonModuleDef, GridTileKind } from './TurnGridKernel.ts';

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

interface FloorRecipe {
  id: string;
  name: string;
  westSanctum: boolean;
  monsters: string[];
  npc?: { id: string; name: string; dialogId: string };
  extraLoot: { loot: DungeonEntityDef['loot']; itemId?: string; name: string };
  hasCampfire: boolean;
  hasBoss?: boolean;
  hasMiniBoss?: boolean;
}

const FLOOR_RECIPES: readonly FloorRecipe[] = [
  {
    id: 'floor-1',
    name: 'B1 · 守望前廳',
    westSanctum: false,
    monsters: ['goblin', 'goblin', 'treasure_goblin'],
    npc: { id: 'sage-1', name: '旅法師艾琳', dialogId: 'sage_intro' },
    extraLoot: { loot: 'weapon', itemId: 'iron_blade', name: '鍛造武器箱' },
    hasCampfire: true,
  },
  {
    id: 'floor-2',
    name: 'B2 · 迷霧石廊',
    westSanctum: true,
    monsters: ['goblin', 'skeleton', 'shaman'],
    extraLoot: { loot: 'armor', itemId: 'leather_vest', name: '護甲軍備箱' },
    hasCampfire: true,
  },
  {
    id: 'floor-3',
    name: 'B3 · 黑市營地',
    westSanctum: false,
    monsters: ['skeleton', 'skeleton', 'treasure_goblin'],
    npc: { id: 'merchant-3', name: '地底行商波波', dialogId: 'merchant_shop' },
    extraLoot: { loot: 'relic', itemId: 'sun_lantern', name: '古代遺物箱' },
    hasCampfire: false,
  },
  {
    id: 'floor-4',
    name: 'B4 · 熔岩密庫',
    westSanctum: true,
    monsters: ['skeleton', 'shaman'],
    extraLoot: { loot: 'elixir', name: '熔岩秘藥箱' },
    hasCampfire: true,
    hasMiniBoss: true,
  },
  {
    id: 'floor-5',
    name: 'B5 · 寒霜迴廊',
    westSanctum: false,
    monsters: ['shaman', 'gargoyle', 'treasure_goblin'],
    extraLoot: { loot: 'weapon', itemId: 'ember_sword', name: '熾焰神兵箱' },
    hasCampfire: true,
  },
  {
    id: 'floor-6',
    name: 'B6 · 星辰祭壇',
    westSanctum: true,
    monsters: ['gargoyle', 'shaman', 'skeleton'],
    npc: { id: 'merchant-6', name: '星辰鐵匠索爾', dialogId: 'forge_master' },
    extraLoot: { loot: 'gold', name: '沉重金幣箱' },
    hasCampfire: false,
  },
  {
    id: 'floor-7',
    name: 'B7 · 龍裔前哨',
    westSanctum: false,
    monsters: ['gargoyle', 'gargoyle', 'treasure_goblin'],
    extraLoot: { loot: 'relic', itemId: 'sage_charm', name: '賢者密匣' },
    hasCampfire: true,
  },
  {
    id: 'floor-8',
    name: 'B8 · 終焉餘燼龍殿',
    westSanctum: true,
    monsters: ['gargoyle', 'shaman'],
    extraLoot: { loot: 'elixir', name: '龍騎士秘箱' },
    hasCampfire: true,
    hasBoss: true,
  },
];

export const EMBERKEEP_DIALOGS: Record<string, DialogDef> = {
  sage_intro: {
    speaker: '🧙 旅法師艾琳',
    text: '「餘燼深淵共有八層！每層先尋得鐵鑰匙開啟聖所大門，善用營火與裝備提升戰力！」',
    choices: [
      {
        id: 'rune_lore',
        label: '解讀古代火紋章',
        checkStat: 'int',
        checkDc: 10,
        successText: '看破光源符文！火把視野永久擴大，並獲得治療藥水×1！',
        failText: '符文微光閃爍，獲得基礎補給藥水×1。',
        rewardFlag: 'sage_blessing',
        rewardPotion: 1,
        rewardXp: 35,
      },
      {
        id: 'ask_supply',
        label: '領取冒險補給包',
        successText: '艾琳贈與藥水×1 與 25 枚旅費金幣！',
        rewardPotion: 1,
        rewardGold: 25,
        rewardXp: 20,
      },
    ],
  },
  merchant_shop: {
    speaker: '🎒 地底行商波波',
    text: '「深淵裡什麼都缺，就是金幣最好使！挑一件趁手的兵器或補品吧！」',
    choices: [
      {
        id: 'buy_ember',
        label: `購買 ${EQUIPMENT_CATALOG.ember_sword.name} (+2攻/+3傷·灼燒)`,
        costGold: EQUIPMENT_CATALOG.ember_sword.price,
        rewardItem: 'ember_sword',
        successText: '「好眼光！烈焰長劍會灼燒你的敵人！」',
      },
      {
        id: 'buy_lantern',
        label: `購買 ${EQUIPMENT_CATALOG.sun_lantern.name} (視野+2/+1攻)`,
        costGold: EQUIPMENT_CATALOG.sun_lantern.price,
        rewardItem: 'sun_lantern',
        successText: '「太陽火紋徽會照亮迷宮的每個角落！」',
      },
      {
        id: 'buy_potion',
        label: '購買 治療藥水 ×2',
        costGold: 24,
        rewardPotion: 2,
        successText: '獲得 2 瓶治療藥水！',
      },
      {
        id: 'leave_shop',
        label: '整理行囊繼續前進',
        successText: '「小心深處的熔岩典獄長！」',
      },
    ],
  },
  forge_master: {
    speaker: '⚒️ 星辰鐵匠索爾',
    text: '「前面就是龍裔重兵把守的深淵！需要我替你淬鍊屠龍神兵或修復護甲嗎？」',
    choices: [
      {
        id: 'buy_dragonbane',
        label: `鍛造 ${EQUIPMENT_CATALOG.dragonbane.name} (+3攻/+5傷·灼燒)`,
        costGold: EQUIPMENT_CATALOG.dragonbane.price,
        rewardItem: 'dragonbane',
        successText: '「屠龍聖劍完成！這把劍專門對付餘燼龍王！」',
      },
      {
        id: 'buy_sage_charm',
        label: `購買 ${EQUIPMENT_CATALOG.sage_charm.name} (AC+1/+1傷/視野+1)`,
        costGold: EQUIPMENT_CATALOG.sage_charm.price,
        rewardItem: 'sage_charm',
        successText: '「賢者護符已發動守護之力！」',
      },
      {
        id: 'rest_forge',
        label: '在星辰熔爐旁徹底休整 (全恢復)',
        costGold: 25,
        rewardHpFull: true,
        successText: '體力、魔力完全恢復，並解除所有異常狀態！',
      },
      {
        id: 'leave_forge',
        label: '帶著信心直接挑戰',
        successText: '「祝你屠龍凱旋！」',
      },
    ],
  },
};

const WIDTH = 32;
const HEIGHT = 20;

function carveRect(grid: string[][], x: number, y: number, w: number, h: number, ch = '.'): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (py > 0 && py < HEIGHT - 1 && px > 0 && px < WIDTH - 1) {
        grid[py][px] = ch;
      }
    }
  }
}

function carveCorridor(grid: string[][], x0: number, y0: number, x1: number, y1: number, horizFirst: boolean): void {
  if (horizFirst) {
    const sx = x0 < x1 ? 1 : -1;
    for (let x = x0; x !== x1; x += sx) grid[y0][x] = '.';
    const sy = y0 < y1 ? 1 : -1;
    for (let y = y0; y !== y1; y += sy) grid[y][x1] = '.';
  } else {
    const sy = y0 < y1 ? 1 : -1;
    for (let y = y0; y !== y1; y += sy) grid[y][x0] = '.';
    const sx = x0 < x1 ? 1 : -1;
    for (let x = x0; x !== x1; x += sx) grid[y1][x] = '.';
  }
  grid[y1][x1] = '.';
}

function buildFloorCandidate(rng: SeededRng, recipe: FloorRecipe, floorIndex: number): DungeonFloorDef {
  const grid: string[][] = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => '#'));

  // Partition map into Main Exploration Zone and Isolated Sanctum Room separated by a 1-tile wall divider.
  // This guarantees `spawn -> key` NEVER passes through the locked sanctum door!
  const sanctumOnWest = recipe.westSanctum;
  const dividerX = sanctumOnWest ? 9 : 22;
  const mainMinX = sanctumOnWest ? 10 : 1;
  const mainMaxX = sanctumOnWest ? WIDTH - 2 : 21;

  // Subdivide Main Exploration Zone into 6 deterministic BSP-style sectors (3 columns × 2 rows)
  const colW = Math.floor((mainMaxX - mainMinX + 1) / 3);
  const rooms: RoomRect[] = [];
  const colOrder = sanctumOnWest ? [2, 1, 0] : [0, 1, 2];

  for (const col of colOrder) {
    for (let row = 0; row < 2; row++) {
      const cellX = mainMinX + col * colW;
      const cellY = row === 0 ? 1 : 10;
      const cellW = col === 2 ? mainMaxX - cellX + 1 : colW;
      const cellH = row === 0 ? 9 : 9;

      const rw = rng.int(4, Math.max(4, cellW - 2));
      const rh = rng.int(4, Math.max(4, cellH - 2));
      const rx = cellX + rng.int(0, Math.max(0, cellW - rw));
      const ry = cellY + rng.int(0, Math.max(0, cellH - rh));
      carveRect(grid, rx, ry, rw, rh, '.');
      rooms.push({
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: rx + Math.floor(rw / 2),
        cy: ry + Math.floor(rh / 2),
      });
    }
  }

  // Connect rooms inside Main Zone via spanning tree + 1 tactical loop
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(grid, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy, rng.next() < 0.5);
  }
  if (rooms.length >= 4) {
    carveCorridor(grid, rooms[0].cx, rooms[0].cy, rooms[3].cx, rooms[3].cy, true);
  }

  // Carve Sanctum Room behind dividerX
  const sX = sanctumOnWest ? 2 : 24;
  const sW = sanctumOnWest ? 6 : 6;
  const sY = rng.int(4, 9);
  const sH = 6;
  carveRect(grid, sX, sY, sW, sH, '.');
  const sanctum: RoomRect = {
    x: sX,
    y: sY,
    w: sW,
    h: sH,
    cx: sX + Math.floor(sW / 2),
    cy: sY + Math.floor(sH / 2),
  };

  // Connect last Main Room (nearest to divider) to Sanctum through a single locked_door chokepoint at dividerX
  const bridgeRoom = rooms[rooms.length - 1];
  const doorY = sanctum.cy;
  const bridgeApproachX = sanctumOnWest ? dividerX + 1 : dividerX - 1;
  const sanctumEntryX = sanctumOnWest ? dividerX - 1 : dividerX + 1;
  carveCorridor(grid, bridgeRoom.cx, bridgeRoom.cy, bridgeApproachX, doorY, false);
  carveCorridor(grid, sanctumEntryX, doorY, sanctum.cx, sanctum.cy, true);
  grid[doorY][dividerX] = 'L';

  // Ensure Sanctum wall divider remains sealed except at doorY
  for (let y = 1; y < HEIGHT - 1; y++) {
    if (y !== doorY) grid[y][dividerX] = '#';
  }

  const spawn = { x: rooms[0].cx, y: rooms[0].cy };
  const occupied = new Set<string>([`${spawn.x},${spawn.y}`]);

  const placeProp = (room: RoomRect, dx = 0, dy = 0): { x: number; y: number } => {
    const minX = room.w >= 4 ? room.x + 1 : room.x;
    const maxX = room.w >= 4 ? room.x + room.w - 2 : room.x + room.w - 1;
    const minY = room.h >= 4 ? room.y + 1 : room.y;
    const maxY = room.h >= 4 ? room.y + room.h - 2 : room.y + room.h - 1;
    for (let r = 0; r < 18; r++) {
      const px = r === 0 ? Math.max(minX, Math.min(maxX, room.cx + dx)) : rng.int(minX, maxX);
      const py = r === 0 ? Math.max(minY, Math.min(maxY, room.cy + dy)) : rng.int(minY, maxY);
      const k = `${px},${py}`;
      if (grid[py][px] === '.' && !occupied.has(k)) {
        occupied.add(k);
        return { x: px, y: py };
      }
    }
    for (let py = room.y; py < room.y + room.h; py++) {
      for (let px = room.x; px < room.x + room.w; px++) {
        const k = `${px},${py}`;
        if (grid[py][px] === '.' && !occupied.has(k)) {
          occupied.add(k);
          return { x: px, y: py };
        }
      }
    }
    return { x: room.cx, y: room.cy };
  };

  // Place torches for atmospheric 2D dynamic lighting in each room
  for (const r of rooms) {
    if (grid[r.y][r.x] === '.' && !occupied.has(`${r.x},${r.y}`)) {
      grid[r.y][r.x] = 'T';
      occupied.add(`${r.x},${r.y}`);
    }
  }
  grid[sanctum.y][sanctum.x] = 'T';
  occupied.add(`${sanctum.x},${sanctum.y}`);

  // Place 1–2 traps cleanly inside middle rooms (off room centers so corridors stay smooth)
  const trapRoom = rooms[Math.min(rooms.length - 1, 2)];
  const trapPos = placeProp(trapRoom, 1, 1);
  grid[trapPos.y][trapPos.x] = '^';

  // Optional Campfire before the locked Sanctum
  if (recipe.hasCampfire) {
    const campPos = placeProp(bridgeRoom, -1, 0);
    grid[campPos.y][campPos.x] = 'C';
  }

  const entities: DungeonEntityDef[] = [];

  // Optional NPC (Sage / Merchants) in Entrance Room 0
  if (recipe.npc) {
    const npcPos = placeProp(rooms[0], sanctumOnWest ? -1 : 1, -1);
    entities.push({
      id: recipe.npc.id,
      kind: 'npc',
      name: recipe.npc.name,
      x: npcPos.x,
      y: npcPos.y,
      dialogId: recipe.npc.dialogId,
    });
  }

  // Key Chest placed in middle/far room of Main Zone (guaranteed reachable without passing locked_door)
  const keyRoom = rooms[Math.min(rooms.length - 2, 3)];
  const keyPos = placeProp(keyRoom, 0, 0);
  entities.push({
    id: `key-${floorIndex}`,
    kind: 'chest',
    name: '銀鎖鑰匙箱',
    x: keyPos.x,
    y: keyPos.y,
    loot: 'key',
  });

  // Extra Equipment / Elixir / Gold chest in Room 1 or 4
  const lootRoom = rooms[Math.min(rooms.length - 1, 4)];
  const lootPos = placeProp(lootRoom, 0, 0);
  entities.push({
    id: `loot-${floorIndex}`,
    kind: 'chest',
    name: recipe.extraLoot.name,
    x: lootPos.x,
    y: lootPos.y,
    loot: recipe.extraLoot.loot,
    itemId: recipe.extraLoot.itemId,
  });

  // Supply potion chest in Room 1
  const supPos = placeProp(rooms[1], 0, 0);
  entities.push({
    id: `potion-${floorIndex}`,
    kind: 'chest',
    name: '旅人補給箱',
    x: supPos.x,
    y: supPos.y,
    loot: 'potion',
  });

  // Monsters distributed in middle rooms (1..N-1)
  recipe.monsters.forEach((arch, mIdx) => {
    const r = rooms[1 + (mIdx % (rooms.length - 1))];
    const mPos = placeProp(r, 0, 0);
    entities.push({
      id: `m-${floorIndex}-${mIdx}`,
      kind: 'monster',
      archetype: arch,
      x: mPos.x,
      y: mPos.y,
    });
  });

  // Sanctum occupants: Stairs Down (B1..B7) + MiniBoss (B4) + Final Dragon Boss (B8)
  if (recipe.hasMiniBoss) {
    const mbPos = placeProp(sanctum, sanctumOnWest ? 1 : -1, 0);
    entities.push({
      id: `miniboss-${floorIndex}`,
      kind: 'monster',
      archetype: 'miniboss_warden',
      x: mbPos.x,
      y: mbPos.y,
    });
  }

  if (recipe.hasBoss) {
    const bossPos = placeProp(sanctum, 0, 0);
    entities.push({
      id: 'dragon-boss',
      kind: 'monster',
      archetype: 'dragon',
      x: bossPos.x,
      y: bossPos.y,
    });
  } else {
    const stairsPos = placeProp(sanctum, sanctumOnWest ? -1 : 1, 0);
    grid[stairsPos.y][stairsPos.x] = '>';
  }

  return {
    id: recipe.id,
    name: recipe.name,
    map: grid.map((row) => row.join('')),
    spawn,
    entities,
  };
}

function bfsReachable(
  map: string[],
  start: { x: number; y: number },
  passLocked: boolean,
): Set<string> {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const visited = new Set<string>();
  const q: { x: number; y: number }[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (q.length > 0) {
    const cur = q.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ch = map[ny][nx];
      if (ch === '#') continue;
      if (!passLocked && ch === 'L') continue;
      const key = `${nx},${ny}`;
      if (!visited.has(key)) {
        visited.add(key);
        q.push({ x: nx, y: ny });
      }
    }
  }
  return visited;
}

/**
 * Verifies every floor in a DungeonModuleDef guarantees:
 * 1. All key chests are reachable from `spawn` WITHOUT crossing any locked door `'L'`.
 * 2. Stairs `>` (or the final Boss entity) are reachable once keys unlock `'L'`.
 */
export function verifyModuleSolvability(mod: DungeonModuleDef): boolean {
  if (!mod.floors.length) return false;
  for (const f of mod.floors) {
    const preLock = bfsReachable(f.map, f.spawn, false);
    const keys = f.entities.filter((e) => e.kind === 'chest' && e.loot === 'key');
    for (const k of keys) {
      if (!preLock.has(`${k.x},${k.y}`)) return false;
    }

    const postLock = bfsReachable(f.map, f.spawn, true);
    let foundStairs = false;
    for (let y = 0; y < f.map.length; y++) {
      for (let x = 0; x < f.map[y].length; x++) {
        if (f.map[y][x] === '>' && postLock.has(`${x},${y}`)) {
          foundStairs = true;
        }
      }
    }
    const hasBoss = f.entities.some((e) => e.archetype === 'dragon' && postLock.has(`${e.x},${e.y}`));
    if (!foundStairs && !hasBoss) return false;
  }
  return true;
}

/**
 * Generates a deterministic 8-floor hybrid BSP + set-piece campaign for PA-04 Emberkeep D&D.
 */
export function generateEmberkeepCampaign(seed = 0x2026d808): DungeonModuleDef {
  const floors: DungeonFloorDef[] = [];

  for (let i = 0; i < FLOOR_RECIPES.length; i++) {
    const recipe = FLOOR_RECIPES[i];
    let floorDef: DungeonFloorDef | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const rng = new SeededRng((seed ^ ((i + 1) * 0x9e3779b1) ^ (attempt * 131)) >>> 0);
      const candidate = buildFloorCandidate(rng, recipe, i + 1);
      if (verifyModuleSolvability({ title: 'check', floors: [candidate], dialogs: {} })) {
        floorDef = candidate;
        break;
      }
    }
    if (!floorDef) {
      floorDef = buildFloorCandidate(new SeededRng((seed + i) >>> 0), recipe, i + 1);
    }
    floors.push(floorDef);
  }

  return {
    title: '龍與地城：餘燼深淵八層戰記',
    ambientDarkness: 0.72,
    dialogs: EMBERKEEP_DIALOGS,
    floors,
  };
}

export type { GridTileKind };
