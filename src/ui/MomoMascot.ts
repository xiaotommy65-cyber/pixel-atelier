import { ATLAS_SIZE, TILE_PX, type SpriteId, type TextureAtlas } from '../gpu/TextureAtlas.ts';

export function drawAtlasSpriteToCanvas(
  atlas: TextureAtlas,
  spriteId: SpriteId,
  canvas: HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = atlas.getRect(spriteId);
  const srcX = Math.floor(rect.u0 * ATLAS_SIZE);
  const srcY = Math.floor(rect.v0 * ATLAS_SIZE);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const img = new ImageData(TILE_PX, TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const s = ((srcY + y) * ATLAS_SIZE + (srcX + x)) * 4;
      const d = (y * TILE_PX + x) * 4;
      img.data[d] = atlas.pixels[s];
      img.data[d + 1] = atlas.pixels[s + 1];
      img.data[d + 2] = atlas.pixels[s + 2];
      img.data[d + 3] = atlas.pixels[s + 3];
    }
  }

  const off = document.createElement('canvas');
  off.width = TILE_PX;
  off.height = TILE_PX;
  off.getContext('2d')?.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}
