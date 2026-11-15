import type { SpriteRect } from './GpuTypes';

export const ATLAS_SIZE = 256;
export const TILE_PX = 16;

// Curated Cozy Toybox 16-Color Master Palette (0 = transparent)
export const TOYBOX_PALETTE: readonly string[] = [
  'transparent', // 0: Empty
  '#382820', // 1: Espresso outline
  '#fffaf0', // 2: Warm cream highlight
  '#ffd6ba', // 3: Peach skin / cream
  '#ff708d', // 4: Strawberry coral
  '#d93b60', // 5: Berry shade
  '#56d39c', // 6: Matcha mint
  '#239b69', // 7: Deep emerald
  '#ffd447', // 8: Honey butter yellow
  '#f59b23', // 9: Warm tangerine
  '#5ec2f7', // 10: Sky blueberry
  '#2a7cd4', // 11: Ocean azure
  '#e0aaff', // 12: Pastel lilac
  '#9e73d4', // 13: Plum soft
  '#c7d4e6', // 14: Cloud mist
  '#8c9ab5', // 15: Cool slate
];

export const PALETTE_RGB: readonly [number, number, number, number][] = TOYBOX_PALETTE.map((hex, i) => {
  if (i === 0) return [0, 0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
});

export type SpriteId =
  | 'solid'
  | 'hero_a'
  | 'hero_b'
  | 'slime_a'
  | 'slime_b'
  | 'cloud_l'
  | 'cloud_m'
  | 'cloud_r'
  | 'grass'
  | 'dirt'
  | 'star_a'
  | 'star_b'
  | 'key'
  | 'gate_closed'
  | 'gate_open'
  | 'heart_full'
  | 'heart_empty'
  | 'ship_a'
  | 'ship_b'
  | 'jelly_ufo'
  | 'meteor'
  | 'boss_ufo'
  | 'bolt'
  | 'sparkle'
  | 'momo_idle'
  | 'momo_happy';

const CHAR_MAP: Record<string, number> = {
  '.': 0,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, a: 10, b: 11, c: 12, d: 13, e: 14, f: 15,
};

// Default Hero Sprout Knight (16x16 palette-indexed grids, editable live in Sprite Atelier!)
export const DEFAULT_HERO_FRAME_A: string[] = [
  '......1111......',
  '....11666611....',
  '...1666226661...',
  '..166666666661..',
  '..166333333661..',
  '..163313313361..',
  '..163334433361..',
  '...1133333311...',
  '....14488441....',
  '...1444884441...',
  '...1664444661...',
  '....16444461....',
  '....11777711....',
  '....177..771....',
  '...111....111...',
  '................',
];

export const DEFAULT_HERO_FRAME_B: string[] = [
  '................',
  '......1111......',
  '....11666611....',
  '...1666226661...',
  '..166666666661..',
  '..166333333661..',
  '..163313313361..',
  '..163334433361..',
  '...1133333311...',
  '...1444884441...',
  '..166448844661..',
  '....16444461....',
  '....11777711....',
  '...177....771...',
  '..111......111..',
  '................',
];

const BUILTIN_SPRITE_GRIDS: Partial<Record<SpriteId, string[]>> = {
  slime_a: [
    '................',
    '.......66.......',
    '......6776......',
    '....11111111....',
    '...1444224441...',
    '..144444444441..',
    '..144114411441..',
    '..144114411441..',
    '..144433334441..',
    '..154444444451..',
    '..155444444551..',
    '...1555555551...',
    '....11111111....',
    '................',
    '................',
    '................',
  ],
  slime_b: [
    '................',
    '................',
    '.......66.......',
    '......6776......',
    '...1111111111...',
    '..144422444441..',
    '.14441144114441.',
    '.14441144114441.',
    '.14444333344441.',
    '.15544444444551.',
    '..155555555551..',
    '...1111111111...',
    '................',
    '................',
    '................',
    '................',
  ],
  cloud_l: [
    '......1111111111',
    '....112222222222',
    '..11222222222222',
    '.122222222222222',
    '1222222222222222',
    '1222eeeeeeeeeeee',
    '1eeeeefffffffffe',
    '.111111111111111',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  cloud_m: [
    '1111111111111111',
    '2222222222222222',
    '2222222222222222',
    '2222222222222222',
    'eeeeeeeeeeeeeeee',
    'eeeeeeeeeeeeeeee',
    'ffffffffffffffff',
    '1111111111111111',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  cloud_r: [
    '1111111111......',
    '222222222211....',
    '22222222222211..',
    '222222222222221.',
    '2222222222222221',
    'eeeeeeeeeeee2221',
    'efffffffffeeeee1',
    '111111111111111.',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  grass: [
    '1111111111111111',
    '6626666626666666',
    '6666666666666266',
    '7666776667666676',
    '7777777777777777',
    '1117711177111771',
    '3331133311333113',
    '3333333933333333',
    '3933333333393333',
    '3333333333333333',
    '3333933333333933',
    '3333333393333333',
    '9333333333333339',
    '3339333333393333',
    '3333333333333333',
    '3333333333333333',
  ],
  dirt: [
    '3333333333333333',
    '3933333333393333',
    '3333339333333333',
    '3333333333333393',
    '3339333333933333',
    '3333333333333333',
    '9333333933333333',
    '3333333333339333',
    '3333933333333333',
    '3333333393333393',
    '3393333333333333',
    '3333333333393333',
    '3333393333333333',
    '9333333333333933',
    '3333333933333333',
    '3333333333333333',
  ],
  star_a: [
    '.......11.......',
    '......1881......',
    '......1281......',
    '....11828811....',
    '..118822888811..',
    '.18822888888881.',
    '..118888181811..',
    '....188888881...',
    '....188889881...',
    '...18889919881..',
    '..1889911.11981.',
    '..18911.....1181',
    '...11.........11',
    '................',
    '................',
    '................',
  ],
  star_b: [
    '.......11.......',
    '......1881......',
    '......1281......',
    '.....182881.....',
    '....18228881....',
    '....18288881....',
    '.....188881.....',
    '.....188881.....',
    '.....188981.....',
    '.....189981.....',
    '.....189181.....',
    '......1111......',
    '................',
    '................',
    '................',
    '................',
  ],
  key: [
    '...1111.........',
    '..182281........',
    '.18211281.......',
    '.18811881111111.',
    '..18888888888881',
    '...1111111118181',
    '............181.',
    '............111.',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  gate_closed: [
    '...1111111111...',
    '..1ccc2222ccc1..',
    '.1cc11111111cc1.',
    '.1c1eeeeeeee1c1.',
    '.1c1effffffe1c1.',
    '.1c1ef1111fe1c1.',
    '.1c1ef1881fe1c1.',
    '.1c1ef1891fe1c1.',
    '.1c1ef1111fe1c1.',
    '.1c1effffffe1c1.',
    '.1c1eeeeeeee1c1.',
    '.1c1effffffe1c1.',
    '.1c1effffffe1c1.',
    '.1c1effffffe1c1.',
    '.1c1eeeeeeee1c1.',
    '.11111111111111.',
  ],
  gate_open: [
    '...1111111111...',
    '..188822228881..',
    '.18811111111881.',
    '.181aaaaaaaa181.',
    '.181a226622a181.',
    '.181a266662a181.',
    '.181a662266a181.',
    '.181a622226a181.',
    '.181a622226a181.',
    '.181a662266a181.',
    '.181a266662a181.',
    '.181a226622a181.',
    '.181aaaaaaaa181.',
    '.181aaaaaaaa181.',
    '.181aaaaaaaa181.',
    '.11111111111111.',
  ],
  heart_full: [
    '................',
    '..1111....1111..',
    '.144441..144441.',
    '1422444114444441',
    '1424444444444441',
    '1444444444444451',
    '1444444444444551',
    '.14444444444551.',
    '..144444444551..',
    '...1444444551...',
    '....14444551....',
    '.....144551.....',
    '......1551......',
    '.......11.......',
    '................',
    '................',
  ],
  heart_empty: [
    '................',
    '..1111....1111..',
    '.1eeee1..1eeee1.',
    '1effff111ffffff1',
    '1efffffffffffff1',
    '1efffffffffffff1',
    '1ffffffffffffff1',
    '.1ffffffffffff1.',
    '..1ffffffffff1..',
    '...1ffffffff1...',
    '....1ffffff1....',
    '.....1ffff1.....',
    '......1ff1......',
    '.......11.......',
    '................',
    '................',
  ],
  ship_a: [
    '................',
    '.....1111.......',
    '....1aaaa1......',
    '..111a22a111....',
    '.1881aaaaaaa11..',
    '19821aaaa22aaa11',
    '19821aaa2aa2aaa1',
    '19821aaaa22aaaa1',
    '.1881aaaaaaa11..',
    '..111abbb111....',
    '....1bbbb1......',
    '.....1111.......',
    '................',
    '................',
    '................',
    '................',
  ],
  ship_b: [
    '................',
    '.....1111.......',
    '....1aaaa1......',
    '..111a22a111....',
    '18881aaaaaaa11..',
    '12821aaaa22aaa11',
    '22821aaa2aa2aaa1',
    '12821aaaa22aaaa1',
    '18881aaaaaaa11..',
    '..111abbb111....',
    '....1bbbb1......',
    '.....1111.......',
    '................',
    '................',
    '................',
    '................',
  ],
  jelly_ufo: [
    '....11111111....',
    '..11cccccccc11..',
    '.1ccc22ccccccd1.',
    '.1cc22cccccccc1.',
    '1111111111111111',
    '1444488884444451',
    '1114411441144111',
    '..111..11..111..',
    '..1c1..1c1..1c1.',
    '.1c1...1c1...1c1',
    '.11....11.....11',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  meteor: [
    '....111111......',
    '..1199889911....',
    '.199889999331...',
    '19989911999991..',
    '19999911993991..',
    '19399999999951..',
    '.199995599951...',
    '..1195555511....',
    '....111111......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  bolt: [
    '................',
    '................',
    '................',
    '................',
    '......111111....',
    '..111122228811..',
    '.18822222222281.',
    '.18822222222281.',
    '..111122228811..',
    '......111111....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  sparkle: [
    '.......2........',
    '.......2........',
    '......282.......',
    '.....28282......',
    '..22822222822...',
    '228222222222822.',
    '..22822222822...',
    '.....28282......',
    '......282.......',
    '.......2........',
    '.......2........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  momo_idle: [
    '..11........11..',
    '.1441......1441.',
    '.14311111111341.',
    '.14444444444441.',
    '1442244444422441',
    '1441144334411441',
    '1444443553444441',
    '.14433333333441.',
    '..111666666111..',
    '..166622226661..',
    '..166666666661..',
    '...1177777711...',
    '....177..771....',
    '...111....111...',
    '................',
    '................',
  ],
  momo_happy: [
    '..11........11..',
    '.1441......1441.',
    '.14311111111341.',
    '.14444444444441.',
    '1441144444411441',
    '1444444334444441',
    '1442243883422441',
    '.14433333333441.',
    '.11116666661111.',
    '166.16222261.661',
    '.11.16666661.11.',
    '....11777711....',
    '...177....771...',
    '..111......111..',
    '................',
    '................',
  ],
};

// 32x16 Giant Marshmallow UFO Boss (spans 2x1 tile block in atlas)
const BOSS_UFO_GRID_32: string[] = [
  '...........1111111111...........',
  '........1112222222222111........',
  '......11222aaaaaaaaaa22211......',
  '.....122aaaaaaaaaaaaaaaa221.....',
  '....12aa22aaaaaaaaaaaaaaa221....',
  '...12aa22aaaaaaaaaaaaaaaaaa21...',
  '...1aa11aaaaaaaaaaaa11aaaaa21...',
  '..12aa11aaaaaaaaaaaa11aaaaaa21..',
  '..12aaaaaaaa4444aaaaaaaaaaaa21..',
  '.111111111111111111111111111111.',
  '14444488844442222444488844444451',
  '14422482844422222244482844444551',
  '15555555555555555555555555555551',
  '.111c1111c1111c1111c1111c111c11.',
  '...1cc1..1cc1..1cc1..1cc1..1cc1.',
  '....11....11....11....11....11..',
];

export class TextureAtlas {
  public readonly width = ATLAS_SIZE;
  public readonly height = ATLAS_SIZE;
  public readonly pixels = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  public readonly rects = new Map<SpriteId, SpriteRect>();
  public readonly heroPixelsA = new Uint8Array(TILE_PX * TILE_PX);
  public readonly heroPixelsB = new Uint8Array(TILE_PX * TILE_PX);

  constructor() {
    this.buildInitialAtlas();
  }

  private slotUv(col: number, row: number, spanCols = 1, spanRows = 1): SpriteRect {
    const pad = 0.0002;
    const x0 = col * TILE_PX;
    const y0 = row * TILE_PX;
    const w = spanCols * TILE_PX;
    const h = spanRows * TILE_PX;
    return {
      u0: x0 / ATLAS_SIZE + pad,
      v0: y0 / ATLAS_SIZE + pad,
      u1: (x0 + w) / ATLAS_SIZE - pad,
      v1: (y0 + h) / ATLAS_SIZE - pad,
      w,
      h,
    };
  }

  private writeIndexedGrid(col: number, row: number, grid: string[]) {
    const startX = col * TILE_PX;
    const startY = row * TILE_PX;
    for (let y = 0; y < grid.length; y++) {
      const line = grid[y];
      for (let x = 0; x < line.length; x++) {
        const idx = CHAR_MAP[line[x]] ?? 0;
        const [r, g, b, a] = PALETTE_RGB[idx] ?? [0, 0, 0, 0];
        const px = ((startY + y) * ATLAS_SIZE + (startX + x)) * 4;
        this.pixels[px] = r;
        this.pixels[px + 1] = g;
        this.pixels[px + 2] = b;
        this.pixels[px + 3] = a;
      }
    }
  }

  private buildInitialAtlas() {
    // Slot (0,0): solid white pixel tile
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const px = (y * ATLAS_SIZE + x) * 4;
        this.pixels[px] = 255;
        this.pixels[px + 1] = 255;
        this.pixels[px + 2] = 255;
        this.pixels[px + 3] = 255;
      }
    }
    this.rects.set('solid', this.slotUv(0, 0));

    // Load default hero frames into mutable index buffers
    this.loadHeroIndices(DEFAULT_HERO_FRAME_A, this.heroPixelsA);
    this.loadHeroIndices(DEFAULT_HERO_FRAME_B, this.heroPixelsB);
    this.syncHeroSlots();

    const orderedIds: SpriteId[] = [
      'slime_a', 'slime_b', 'cloud_l', 'cloud_m', 'cloud_r',
      'grass', 'dirt', 'star_a', 'star_b', 'key',
      'gate_closed', 'gate_open', 'heart_full', 'heart_empty',
      'ship_a', 'ship_b', 'jelly_ufo', 'meteor', 'bolt', 'sparkle',
      'momo_idle', 'momo_happy',
    ];

    let slot = 3; // 0 = solid, 1 = hero_a, 2 = hero_b
    for (const id of orderedIds) {
      const col = slot % 16;
      const row = Math.floor(slot / 16);
      const grid = BUILTIN_SPRITE_GRIDS[id];
      if (grid) {
        this.writeIndexedGrid(col, row, grid);
      }
      this.rects.set(id, this.slotUv(col, row));
      slot++;
    }

    // 32x16 wide boss UFO at row 2, col 0..1
    this.writeIndexedGrid(0, 2, BOSS_UFO_GRID_32);
    this.rects.set('boss_ufo', this.slotUv(0, 2, 2, 1));
  }

  private loadHeroIndices(grid: string[], out: Uint8Array) {
    for (let y = 0; y < TILE_PX; y++) {
      const rowStr = grid[y] ?? '';
      for (let x = 0; x < TILE_PX; x++) {
        out[y * TILE_PX + x] = CHAR_MAP[rowStr[x] ?? '.'] ?? 0;
      }
    }
  }

  public syncHeroSlots() {
    this.writeIndexedBuffer(1, 0, this.heroPixelsA);
    this.writeIndexedBuffer(2, 0, this.heroPixelsB);
    this.rects.set('hero_a', this.slotUv(1, 0));
    this.rects.set('hero_b', this.slotUv(2, 0));
  }

  private writeIndexedBuffer(col: number, row: number, buf: Uint8Array) {
    const startX = col * TILE_PX;
    const startY = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const idx = buf[y * TILE_PX + x] ?? 0;
        const [r, g, b, a] = PALETTE_RGB[idx] ?? [0, 0, 0, 0];
        const px = ((startY + y) * ATLAS_SIZE + (startX + x)) * 4;
        this.pixels[px] = r;
        this.pixels[px + 1] = g;
        this.pixels[px + 2] = b;
        this.pixels[px + 3] = a;
      }
    }
  }

  public getRect(id: SpriteId): SpriteRect {
    return this.rects.get(id) ?? this.rects.get('solid')!;
  }
}
