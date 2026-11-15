import type { CartridgeId } from '../engine/WorldTypes.ts';
import { ATLAS_SIZE, type SpriteId, type TextureAtlas } from '../gpu/TextureAtlas.ts';

interface ArtSpec {
  top: string;
  bottom: string;
  sprites: { id: SpriteId; x: number; y: number; scale: number; flip?: boolean }[];
  ground?: SpriteId;
}

const ART: Record<CartridgeId, ArtSpec> = {
  'cloudberry-hop': {
    top: '#76c7ff',
    bottom: '#fff3df',
    ground: 'grass',
    sprites: [
      { id: 'cloud_l', x: 6, y: 6, scale: 1 },
      { id: 'cloud_r', x: 22, y: 6, scale: 1 },
      { id: 'star_a', x: 58, y: 8, scale: 1.25 },
      { id: 'slime_a', x: 60, y: 30, scale: 1.25, flip: true },
      { id: 'hero_a', x: 16, y: 18, scale: 1.9 },
    ],
  },
  'sugar-starlight': {
    top: '#243c70',
    bottom: '#f7adc4',
    sprites: [
      { id: 'sparkle', x: 46, y: 4, scale: 0.75 },
      { id: 'sparkle', x: 10, y: 34, scale: 0.6 },
      { id: 'jelly_ufo', x: 58, y: 22, scale: 1.25 },
      { id: 'bolt', x: 36, y: 16, scale: 1 },
      { id: 'ship_a', x: 8, y: 12, scale: 1.9 },
    ],
  },
  'sandbox-toybox': {
    top: '#8fd8ff',
    bottom: '#fff4df',
    ground: 'grass',
    sprites: [
      { id: 'cloud_l', x: 44, y: 8, scale: 1 },
      { id: 'cloud_m', x: 60, y: 8, scale: 1 },
      { id: 'star_b', x: 50, y: 0, scale: 0.9 },
      { id: 'slime_b', x: 58, y: 30, scale: 1.25 },
      { id: 'momo_idle', x: 12, y: 18, scale: 1.9 },
    ],
  },
};

const W = 80;
const H = 50;

function spriteCanvas(atlas: TextureAtlas, id: SpriteId): HTMLCanvasElement {
  const rect = atlas.getRect(id);
  const sx = Math.floor(rect.u0 * ATLAS_SIZE);
  const sy = Math.floor(rect.v0 * ATLAS_SIZE);
  const c = document.createElement('canvas');
  c.width = rect.w;
  c.height = rect.h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(rect.w, rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const s = ((sy + y) * ATLAS_SIZE + (sx + x)) * 4;
      const d = (y * rect.w + x) * 4;
      img.data[d] = atlas.pixels[s];
      img.data[d + 1] = atlas.pixels[s + 1];
      img.data[d + 2] = atlas.pixels[s + 2];
      img.data[d + 3] = atlas.pixels[s + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paints a tiny pixel-art cartridge label from live atlas sprites (so the painted hero shows up). */
export function renderCardArt(atlas: TextureAtlas, id: CartridgeId): string {
  const spec = ART[id];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, spec.top);
  grad.addColorStop(1, spec.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (spec.ground) {
    const g = spriteCanvas(atlas, spec.ground);
    for (let x = 0; x < W; x += 16) ctx.drawImage(g, x, H - 8, 16, 16);
  } else {
    ctx.fillStyle = '#fffaf0';
    for (let i = 0; i < 14; i++) {
      ctx.fillRect((i * 29 + 7) % W, (i * 17 + 3) % H, 1, 1);
    }
  }

  for (const s of spec.sprites) {
    const sc = spriteCanvas(atlas, s.id);
    const w = Math.round(sc.width * s.scale);
    const h = Math.round(sc.height * s.scale);
    ctx.save();
    if (s.flip) {
      ctx.translate(s.x + w, s.y);
      ctx.scale(-1, 1);
      ctx.drawImage(sc, 0, 0, w, h);
    } else {
      ctx.drawImage(sc, s.x, s.y, w, h);
    }
    ctx.restore();
  }
  return c.toDataURL('image/png');
}
