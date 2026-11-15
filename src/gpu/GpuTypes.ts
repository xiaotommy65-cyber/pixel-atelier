export const GAME_W = 320;
export const GAME_H = 180;

export type GpuBackendKind = 'webgpu' | 'webgl2' | 'initializing';

export type DrawMode = 'sprite' | 'light' | 'solid';

export interface SpriteRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
}

export interface BatchDrawItem {
  x: number;
  y: number;
  w: number;
  h: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  rot: number;
  mode: number; // 0 = sprite, 1 = radial light, 2 = solid quad
  additive: boolean;
}

export interface SkyGradient {
  top: [number, number, number];
  bottom: [number, number, number];
  cozyFilter: boolean;
}

export interface GpuFrameStats {
  backend: GpuBackendKind;
  drawCalls: number;
  spriteCount: number;
  lightCount: number;
  frameTimeMs: number;
}

export interface IGpuBackend {
  readonly kind: Exclude<GpuBackendKind, 'initializing'>;
  uploadAtlas(width: number, height: number, pixels: Uint8Array): void;
  renderFrame(
    sky: SkyGradient,
    alphaItems: Float32Array,
    alphaCount: number,
    additiveItems: Float32Array,
    additiveCount: number,
    timeSec: number,
  ): number; // returns draw calls executed
  resize(pixelWidth: number, pixelHeight: number): void;
  dispose(): void;
}
