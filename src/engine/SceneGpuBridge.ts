import { GAME_W } from '../gpu/GpuTypes';
import type { GpuEngine } from '../gpu/GpuEngine';
import type { GpuFrameStats } from '../gpu/GpuTypes';
import type { BenchmarkSprite } from './CartridgeRunner';
import type { RenderSceneSnapshot } from './WorldTypes';

export class SceneGpuBridge {
  public render(
    gpu: GpuEngine,
    snap: RenderSceneSnapshot,
    benchmarkSprites: readonly BenchmarkSprite[] | null,
  ): GpuFrameStats {
    gpu.beginFrame(snap.skyTop, snap.skyBottom, snap.cozyFilter);

    const camX = Math.round(snap.cameraX);
    const camY = Math.round(snap.cameraY);

    // 1. Twinkling parallax background starfield (mode 2 solid pixels + glow stars)
    for (const s of snap.bgStars) {
      const pulse = 0.55 + 0.45 * Math.sin(snap.timeSec * 4 + s.phase);
      gpu.drawRect(Math.round(s.x), Math.round(s.y), s.size, s.size, s.color, pulse);
    }

    // 2. Soft sky backdrop clouds (parallax 0.45x)
    for (const c of snap.bgClouds) {
      const cx = Math.round(c.x - camX * 0.45);
      const cy = Math.round(c.y);
      const segW = Math.round(16 * c.scale);
      const segH = Math.round(16 * c.scale);
      const halfH = segH * 0.5;
      if (cx > -segW * 3 && cx < GAME_W + segW * 2) {
        gpu.drawSprite('cloud_l', cx + segW * 0.5, cy + halfH, { w: segW, h: segH, tint: c.tint, alpha: c.alpha });
        gpu.drawSprite('cloud_m', cx + segW * 1.5, cy + halfH, { w: segW, h: segH, tint: c.tint, alpha: c.alpha });
        gpu.drawSprite('cloud_r', cx + segW * 2.5, cy + halfH, { w: segW, h: segH, tint: c.tint, alpha: c.alpha });
      }
    }

    // 3. World Tiles (top-left physics coord -> center quad coord)
    for (const t of snap.tiles) {
      const sx = Math.round(t.x - camX);
      const sy = Math.round(t.y - camY);
      if (sx + t.w < -16 || sx > GAME_W + 16) continue;
      gpu.drawSprite(t.sprite, sx + t.w * 0.5, sy + t.h * 0.5, { w: t.w, h: t.h, tint: t.tint });
    }

    // 4. Entities (center-anchored)
    for (const e of snap.entities) {
      const sx = Math.round(e.x - camX + e.w * 0.5);
      const sy = Math.round(e.y - camY + e.h * 0.5);
      if (sx < -32 || sx > GAME_W + 32) continue;
      gpu.drawSprite(e.sprite, sx, sy, {
        w: e.w,
        h: e.h,
        flipX: e.flipX,
        rot: e.rot,
        tint: e.tint,
        alpha: e.alpha,
        additive: e.additive,
      });
    }

    // 5. Additive Radial GPU Lights (smooth radial gradient)
    for (const l of snap.lights) {
      const lx = l.x - camX;
      const ly = l.y - camY;
      if (lx < -64 || lx > GAME_W + 64) continue;
      gpu.drawLight(lx, ly, l.radius, l.color, l.intensity);
    }

    // 6. Gameplay Sparkles & Confetti Particles
    for (const p of snap.particles) {
      const px = p.x - camX;
      const py = p.y - camY;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.sprite) {
        gpu.drawSprite(p.sprite, px, py, {
          w: p.size,
          h: p.size,
          rot: p.rot,
          tint: p.color,
          alpha,
          additive: p.additive ?? true,
        });
      } else {
        gpu.drawRect(px, py, p.size, p.size, p.color, alpha, p.rot, p.additive ?? false);
      }
    }

    // 7. Optional 1,150+ Instanced GPU Sparkle Party Benchmark
    if (benchmarkSprites) {
      for (let i = 0; i < benchmarkSprites.length; i++) {
        const b = benchmarkSprites[i];
        gpu.drawSprite(b.sprite, b.x, b.y, {
          w: b.size,
          h: b.size,
          rot: b.rot,
          tint: b.tint,
          alpha: 0.9,
          additive: b.sprite === 'sparkle',
        });
      }
    }

    // 8. In-Screen Pixel HUD (Hearts top-left, Key/Stars top-right, Boss Bar top-center)
    for (let i = 0; i < snap.maxHearts; i++) {
      gpu.drawSprite(i < snap.hearts ? 'heart_full' : 'heart_empty', 12 + i * 13, 11, {
        w: 11,
        h: 11,
      });
    }

    if (snap.hasKey) {
      gpu.drawSprite('key', GAME_W - 14, 11, { w: 12, h: 12 });
    }

    for (let i = 0; i < snap.starsTotal; i++) {
      const collected = i < snap.starsCollected;
      const baseOffset = snap.hasKey ? 28 : 14;
      gpu.drawSprite('star_a', GAME_W - baseOffset - i * 11, 11, {
        w: 9,
        h: 9,
        tint: collected ? '#ffd447' : '#8c9ab5',
        alpha: collected ? 1 : 0.45,
      });
    }

    if (snap.bossMaxHp > 0 && snap.bossHp > 0) {
      const barW = 90;
      const ratio = snap.bossHp / snap.bossMaxHp;
      gpu.drawRect(GAME_W * 0.5, 11, barW + 4, 8, '#382820', 0.85);
      gpu.drawRect(GAME_W * 0.5 - barW * 0.5 * (1 - ratio), 11, barW * ratio, 4, '#ff708d', 1);
    }

    return gpu.flush(snap.timeSec);
  }
}
