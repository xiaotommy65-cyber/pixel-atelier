import { GAME_H, GAME_W } from '../gpu/GpuTypes.ts';
import { createCartridgeInstance, SANDBOX_DEFAULT_SCRIPT } from './CartridgeRegistry.ts';
import { SandboxToyboxGame } from './cartridges/sandboxToybox.ts';
import type {
  CartridgeId,
  CartridgeInstance,
  InputState,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
  SimEventDetail,
} from './WorldTypes.ts';
import { DEFAULT_RUNTIME_PARAMS } from './WorldTypes.ts';

export const STEP_DT = 1 / 60;
const BENCHMARK_COLORS = ['#ffd447', '#ff708d', '#56d39c', '#5ec2f7', '#e0aaff', '#fffaf0'];

export interface BenchmarkSprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  sprite: 'star_a' | 'sparkle' | 'heart_full';
  tint: string;
  size: number;
}

export class CartridgeRunner {
  private cartridgeId: CartridgeId = 'cloudberry-hop';
  private instance: CartridgeInstance;
  private params: RuntimeParams = { ...DEFAULT_RUNTIME_PARAMS };
  private sandboxScript = SANDBOX_DEFAULT_SCRIPT;
  private accumulator = 0;
  private eventListener?: (ev: SimEvent, detail: SimEventDetail) => void;
  private prevRestart = false;
  private debugHitboxes = false;

  public sparkleBenchmark = false;
  public benchmarkSprites: BenchmarkSprite[] = [];

  constructor(initialId: CartridgeId = 'cloudberry-hop') {
    this.cartridgeId = initialId;
    this.instance = this.createInstance(initialId);
  }

  private createInstance(id: CartridgeId): CartridgeInstance {
    const inst = createCartridgeInstance(id, {
      sandboxScript: this.sandboxScript,
      params: this.params,
    });
    const maybeDebug = inst as CartridgeInstance & { setDebugHitboxes?: (b: boolean) => void };
    maybeDebug.setDebugHitboxes?.(this.debugHitboxes);
    return inst;
  }

  public setEventListener(listener: (ev: SimEvent, detail: SimEventDetail) => void): void {
    this.eventListener = listener;
  }

  public getCartridgeId(): CartridgeId {
    return this.cartridgeId;
  }

  public toggleDebugHitboxes(force?: boolean): boolean {
    this.debugHitboxes = force ?? !this.debugHitboxes;
    const maybeDebug = this.instance as CartridgeInstance & { setDebugHitboxes?: (b: boolean) => void };
    maybeDebug.setDebugHitboxes?.(this.debugHitboxes);
    return this.debugHitboxes;
  }

  public switchCartridge(id: CartridgeId): void {
    this.cartridgeId = id;
    this.accumulator = 0;
    this.instance = this.createInstance(id);
  }

  public restart(): void {
    this.accumulator = 0;
    this.instance = this.createInstance(this.cartridgeId);
  }

  public getParams(): RuntimeParams {
    return this.params;
  }

  public setParam<K extends keyof RuntimeParams>(key: K, value: RuntimeParams[K]): void {
    this.params[key] = value;
    if (key === 'enemyCount' && this.cartridgeId === 'sandbox-toybox') {
      this.instance = this.createInstance('sandbox-toybox');
    }
  }

  public getSandboxScript(): string {
    return this.sandboxScript;
  }

  public getSandboxError(): string | null {
    if (this.instance instanceof SandboxToyboxGame) {
      return this.instance.scriptError;
    }
    return null;
  }

  public applySandboxScript(code: string): string | null {
    this.sandboxScript = code;
    this.cartridgeId = 'sandbox-toybox';
    const sb = this.createInstance('sandbox-toybox') as SandboxToyboxGame;
    this.instance = sb;
    this.accumulator = 0;
    return sb.scriptError ?? null;
  }

  public toggleBenchmark(force?: boolean): boolean {
    const next = force ?? !this.sparkleBenchmark;
    this.sparkleBenchmark = next;
    if (next && this.benchmarkSprites.length === 0) {
      const kinds: ('star_a' | 'sparkle' | 'heart_full')[] = ['sparkle', 'star_a', 'heart_full'];
      for (let i = 0; i < 1150; i++) {
        const ang = (i * 2.39996) % (Math.PI * 2);
        const speed = 28 + ((i * 13) % 75);
        this.benchmarkSprites.push({
          x: (i * 47) % GAME_W,
          y: (i * 29) % GAME_H,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          rot: (i * 0.4) % (Math.PI * 2),
          vRot: (i % 2 === 0 ? 1 : -1) * (2 + (i % 4)),
          sprite: kinds[i % 11 === 0 ? 2 : i % 3 === 0 ? 1 : 0],
          tint: BENCHMARK_COLORS[i % BENCHMARK_COLORS.length],
          size: 5 + (i % 5),
        });
      }
    }
    return this.sparkleBenchmark;
  }

  public update(deltaSec: number, input: InputState): void {
    if (input.restart && !this.prevRestart) {
      this.restart();
    }
    this.prevRestart = input.restart;

    const clamped = Math.min(0.1, Math.max(0, deltaSec));
    this.accumulator += clamped;

    while (this.accumulator >= STEP_DT) {
      this.stepFixed(STEP_DT, input);
      this.accumulator -= STEP_DT;
    }
  }

  public stepFixed(dt: number, input: InputState): SimEvent[] {
    const events = this.instance.step(dt, input, this.params);
    const maybeCombo = this.instance as CartridgeInstance & { getComboCount?: () => number };
    const combo = maybeCombo.getComboCount?.() ?? 0;

    for (const ev of events) {
      this.eventListener?.(ev, { kind: ev, combo });
    }

    if (this.sparkleBenchmark) {
      for (let i = 0; i < this.benchmarkSprites.length; i++) {
        const b = this.benchmarkSprites[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vRot * dt;
        if (b.x < 4) {
          b.x = 4;
          b.vx = Math.abs(b.vx);
        } else if (b.x > GAME_W - 4) {
          b.x = GAME_W - 4;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < 14) {
          b.y = 14;
          b.vy = Math.abs(b.vy);
        } else if (b.y > GAME_H - 4) {
          b.y = GAME_H - 4;
          b.vy = -Math.abs(b.vy);
        }
      }
    }
    return events;
  }

  public getSnapshot(): RenderSceneSnapshot {
    return this.instance.snapshot(this.params);
  }
}
