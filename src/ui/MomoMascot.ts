import { ATLAS_SIZE, PALETTE_RGB, TILE_PX, type SpriteId, type TextureAtlas } from '../gpu/TextureAtlas.ts';

export function atlasSpriteToCanvas(atlas: TextureAtlas, spriteId: SpriteId): HTMLCanvasElement {
  const rect = atlas.getRect(spriteId);
  const srcX = Math.floor(rect.u0 * ATLAS_SIZE);
  const srcY = Math.floor(rect.v0 * ATLAS_SIZE);
  const off = document.createElement('canvas');
  off.width = rect.w;
  off.height = rect.h;
  const octx = off.getContext('2d');
  if (!octx) return off;

  const img = octx.createImageData(rect.w, rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const s = ((srcY + y) * ATLAS_SIZE + (srcX + x)) * 4;
      const d = (y * rect.w + x) * 4;
      img.data[d] = atlas.pixels[s];
      img.data[d + 1] = atlas.pixels[s + 1];
      img.data[d + 2] = atlas.pixels[s + 2];
      img.data[d + 3] = atlas.pixels[s + 3];
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

export function drawAtlasSpriteToCanvas(
  atlas: TextureAtlas,
  spriteId: SpriteId,
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasSpriteToCanvas(atlas, spriteId), 0, 0, canvas.width, canvas.height);
}

export function drawIndexBufferToCanvas(
  buf: Uint8Array,
  canvas: HTMLCanvasElement,
  w = TILE_PX,
  h = TILE_PX,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = PALETTE_RGB[buf[i]] ?? [0, 0, 0, 0];
    const p = i * 4;
    img.data[p] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}
