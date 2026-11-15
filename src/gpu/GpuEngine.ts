import type { GpuBackendKind, GpuFrameStats, IGpuBackend, SkyGradient } from './GpuTypes';
import { TextureAtlas, type SpriteId } from './TextureAtlas';
import { WebGl2Backend } from './WebGl2Backend';
import { FLOATS_PER_INSTANCE, MAX_INSTANCES_PER_PASS, WebGpuBackend } from './WebGpuBackend';

export function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(clean.length === 6 ? clean : 'ffffff', 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class GpuEngine {
  public readonly atlas: TextureAtlas;
  private backend: IGpuBackend | null = null;
  private canvas: HTMLCanvasElement;
  private alphaItems = new Float32Array(MAX_INSTANCES_PER_PASS * FLOATS_PER_INSTANCE);
  private addItems = new Float32Array(MAX_INSTANCES_PER_PASS * FLOATS_PER_INSTANCE);
  private alphaCount = 0;
  private addCount = 0;
  private spriteTotal = 0;
  private lightTotal = 0;
  private currentSky: SkyGradient = {
    top: hexToRgb01('#8ed4ff'),
    bottom: hexToRgb01('#fff2df'),
    cozyFilter: true,
  };
  private onBackendChange?: (kind: GpuBackendKind) => void;
  private lastStats: GpuFrameStats = {
    backend: 'initializing',
    drawCalls: 0,
    spriteCount: 0,
    lightCount: 0,
    frameTimeMs: 0,
  };

  constructor(
    canvas: HTMLCanvasElement,
    onBackendChange?: (kind: GpuBackendKind) => void,
    atlas: TextureAtlas = new TextureAtlas(),
  ) {
    this.canvas = canvas;
    this.onBackendChange = onBackendChange;
    this.atlas = atlas;
  }

  public async init(): Promise<GpuBackendKind> {
    const gpu = await WebGpuBackend.tryCreate(
      this.canvas,
      this.atlas.width,
      this.atlas.height,
      this.atlas.pixels,
      () => {
        // Auto-recover to WebGL2 if WebGPU device is lost
        this.backend = null;
        const gl2 = WebGl2Backend.tryCreate(
          this.canvas,
          this.atlas.width,
          this.atlas.height,
          this.atlas.pixels,
        );
        if (gl2) {
          this.backend = gl2;
          this.lastStats.backend = 'webgl2';
          this.onBackendChange?.('webgl2');
        }
      },
    );

    if (gpu) {
      this.backend = gpu;
      this.lastStats.backend = 'webgpu';
      this.onBackendChange?.('webgpu');
      return 'webgpu';
    }

    const gl2 = WebGl2Backend.tryCreate(
      this.canvas,
      this.atlas.width,
      this.atlas.height,
      this.atlas.pixels,
    );
    if (gl2) {
      this.backend = gl2;
      this.lastStats.backend = 'webgl2';
      this.onBackendChange?.('webgl2');
      return 'webgl2';
    }

    return 'initializing';
  }

  public syncAtlasToGpu(): void {
    this.atlas.syncHeroSlots();
    this.backend?.uploadAtlas(this.atlas.width, this.atlas.height, this.atlas.pixels);
  }

  public resize(pixelWidth: number, pixelHeight: number): void {
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = Math.max(1, pixelWidth);
      this.canvas.height = Math.max(1, pixelHeight);
      this.backend?.resize(this.canvas.width, this.canvas.height);
    }
  }

  public beginFrame(topHex: string, bottomHex: string, cozyFilter = true): void {
    this.currentSky = {
      top: hexToRgb01(topHex),
      bottom: hexToRgb01(bottomHex),
      cozyFilter,
    };
    this.alphaCount = 0;
    this.addCount = 0;
    this.spriteTotal = 0;
    this.lightTotal = 0;
  }

  private pushInstance(
    additive: boolean,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r: number,
    g: number,
    b: number,
    a: number,
    rot: number,
    mode: number,
    flash = 0,
    param = 0,
  ): void {
    const arr = additive ? this.addItems : this.alphaItems;
    const count = additive ? this.addCount : this.alphaCount;
    if (count >= MAX_INSTANCES_PER_PASS) return;

    const base = count * FLOATS_PER_INSTANCE;
    arr[base] = x;
    arr[base + 1] = y;
    arr[base + 2] = w;
    arr[base + 3] = h;
    arr[base + 4] = u0;
    arr[base + 5] = v0;
    arr[base + 6] = u1;
    arr[base + 7] = v1;
    arr[base + 8] = r;
    arr[base + 9] = g;
    arr[base + 10] = b;
    arr[base + 11] = a;
    arr[base + 12] = rot;
    arr[base + 13] = mode;
    arr[base + 14] = flash;
    arr[base + 15] = param;

    if (additive) this.addCount++;
    else this.alphaCount++;
  }

  public drawSprite(
    id: SpriteId,
    x: number,
    y: number,
    opts?: {
      w?: number;
      h?: number;
      flipX?: boolean;
      rot?: number;
      tint?: string;
      alpha?: number;
      flash?: number;
      additive?: boolean;
    },
  ): void {
    const rect = this.atlas.getRect(id);
    const w = opts?.w ?? rect.w;
    const h = opts?.h ?? rect.h;
    const u0 = opts?.flipX ? rect.u1 : rect.u0;
    const u1 = opts?.flipX ? rect.u0 : rect.u1;
    const [r, g, b] = opts?.tint ? hexToRgb01(opts.tint) : [1, 1, 1];
    this.spriteTotal++;
    this.pushInstance(
      opts?.additive ?? false,
      x,
      y,
      w,
      h,
      u0,
      rect.v0,
      u1,
      rect.v1,
      r,
      g,
      b,
      opts?.alpha ?? 1,
      opts?.rot ?? 0,
      0,
      opts?.flash ?? 0,
      0,
    );
  }

  public drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    colorHex: string,
    alpha = 1,
    rot = 0,
    additive = false,
    flash = 0,
  ): void {
    const [r, g, b] = hexToRgb01(colorHex);
    this.spriteTotal++;
    this.pushInstance(additive, x, y, w, h, 0, 0, 1, 1, r, g, b, alpha, rot, 2, flash, 0);
  }

  public drawLight(
    x: number,
    y: number,
    radius: number,
    colorHex: string,
    intensity = 0.45,
    falloffPower = 2.0,
  ): void {
    const [r, g, b] = hexToRgb01(colorHex);
    this.lightTotal++;
    this.pushInstance(true, x, y, radius * 2, radius * 2, 0, 0, 1, 1, r, g, b, intensity, 0, 1, 0, falloffPower);
  }

  public flush(timeSec: number): GpuFrameStats {
    if (!this.backend) {
      return this.lastStats;
    }
    const t0 = performance.now();
    const drawCalls = this.backend.renderFrame(
      this.currentSky,
      this.alphaItems,
      this.alphaCount,
      this.addItems,
      this.addCount,
      timeSec,
    );
    const frameTimeMs = performance.now() - t0;
    this.lastStats = {
      backend: this.backend.kind,
      drawCalls,
      spriteCount: this.spriteTotal,
      lightCount: this.lightTotal,
      frameTimeMs,
    };
    return this.lastStats;
  }

  public getStats(): GpuFrameStats {
    return this.lastStats;
  }

  public dispose(): void {
    this.backend?.dispose();
    this.backend = null;
  }
}
