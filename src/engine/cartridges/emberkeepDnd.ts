import type { CartridgeInstance, InputState, RenderSceneSnapshot, RuntimeParams, SimEvent } from '../WorldTypes.ts';
import { generateEmberkeepCampaign } from '../core/DungeonGenerator.ts';
import {
  TurnGridKernel,
  parseDungeonModuleJson,
  type DungeonModuleDef,
} from '../core/TurnGridKernel.ts';

export const DEFAULT_DND_MODULE: DungeonModuleDef = generateEmberkeepCampaign(0x2026d808);

export const DEFAULT_DND_MODULE_JSON = JSON.stringify(DEFAULT_DND_MODULE, null, 2);

/**
 * PA-04 Emberkeep D&D: 8-Floor Hybrid BSP + Set-Piece CRPG powered by TurnGridKernel + DungeonGenerator.
 */
export class EmberkeepDndGame implements CartridgeInstance {
  private readonly kernel: TurnGridKernel;
  public scriptError: string | null = null;

  constructor(moduleJson?: string) {
    if (moduleJson) {
      const parsed = parseDungeonModuleJson(moduleJson);
      if (parsed.module) {
        this.kernel = new TurnGridKernel(parsed.module);
        return;
      }
      this.scriptError = parsed.error ?? '無法解析 D&D JSON 劇本';
    }
    this.kernel = new TurnGridKernel(DEFAULT_DND_MODULE);
  }

  public getKernel(): TurnGridKernel {
    return this.kernel;
  }

  public setDebugHitboxes(enabled: boolean): void {
    this.kernel.debugHitboxes = enabled;
  }

  public step(dt: number, input: InputState, params: RuntimeParams): SimEvent[] {
    return this.kernel.step(dt, input, params);
  }

  public dispatchCommand(commandId: string): SimEvent[] {
    return this.kernel.dispatchCommand(commandId);
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    return this.kernel.getStatus();
  }

  public serializeSave(): unknown {
    return this.kernel.serializeSave();
  }

  public hydrateSave(raw: unknown): boolean {
    return this.kernel.hydrateSave(raw);
  }

  public retryStage(): void {
    this.kernel.retryStage();
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    return this.kernel.snapshot(params);
  }
}
