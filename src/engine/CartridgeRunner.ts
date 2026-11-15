import { GAME_H, GAME_W } from '../gpu/GpuTypes.ts';
import { CloudberryHopGame } from './cartridges/cloudberryHop.ts';
import { DEFAULT_SANDBOX_SCRIPT, SandboxToyboxGame } from './cartridges/sandboxToybox.ts';
import { SugarStarlightGame } from './cartridges/sugarStarlight.ts';
import type {
  CartridgeId,
  CartridgeInstance,
  InputState,
  RenderSceneSnapshot,
  RuntimeParams,
  SimEvent,
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
  private sandboxScript = DEFAULT_SANDBOX_SCRIPT;
  private accumulator = 0;
  private eventListener?: (ev: SimEvent) => void;
  private prevRestart = false;

  public sparkleBenchmark = false;
  public benchmarkSprites: BenchmarkSprite[] = [];

  constructor(initialId: CartridgeId = 'cloudberry-hop') {
    this.cartridgeId = initialId;
    this.instance = this.createInstance(initialId);
  }

  private createInstance(id: CartridgeId): CartridgeInstance {
    switch (id) {
      case 'cloudberry-hop':
        return new CloudberryHopGame();
      case 'sugar-starlight':
        return new SugarStarlightGame();
      case 'sandbox-toybox':
        return new SandboxToyboxGame(this.sandboxScript, this.params);
    }
  }

  public setEventListener(listener: (ev: SimEvent) => void): void {
    this.eventListener = listener;
  }

  public getCartridgeId(): CartridgeId {
    return this.cartridgeId;
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
    const sb = new SandboxToyboxGame(this.sandboxScript, this.params);
    this.instance = sb;
    this.accumulator = 0;
    return sb.scriptError;
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
    for (const ev of events) {
      this.eventListener?.(ev);
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
