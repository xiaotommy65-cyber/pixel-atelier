import type { SoundPreset, ToySynth } from '../audio/ToySynth.ts';
import type { CartridgeRunner } from './CartridgeRunner.ts';
import type { CardRecord, SaveService } from './SaveService.ts';
import type { CartridgeId, InputState, RenderSceneSnapshot, SimEvent } from './WorldTypes.ts';

/**
 * Clean facade bridging simulation, audio event-queue, persistence, and mascot feedback,
 * keeping ConsoleView & WorkshopView completely decoupled from ToySynth / localStorage internals.
 */
export class EngineHost {
  public readonly runner: CartridgeRunner;
  private readonly synth: ToySynth;
  private readonly save: SaveService;
  private onMomoReact?: () => void;
  private lastSavedStageIdx = -1;
  private sramAutoSaveTimer = 0;

  constructor(runner: CartridgeRunner, synth: ToySynth, save: SaveService, onMomoReact?: () => void) {
    this.runner = runner;
    this.synth = synth;
    this.save = save;
    this.onMomoReact = onMomoReact;

    this.runner.setEventListener((ev: SimEvent, detail) => {
      this.synth.queueEvent(ev, detail.combo ?? 0);
      if (ev === 'star' || ev === 'key' || ev === 'win' || ev === 'explode') {
        this.onMomoReact?.();
      }
      if (ev === 'key') {
        this.saveActiveSram();
      }
    });
  }

  public unlockAudio(): void {
    this.synth.unlock();
  }

  public playUiSound(preset: SoundPreset): void {
    this.synth.unlock();
    this.synth.playPreset(preset);
  }

  public stopBgm(): void {
    this.synth.setBgmTheme(null);
  }

  public insertWithSram(id: CartridgeId): boolean {
    const sram = this.save.getCartridgeSram(id);
    const resumed = this.runner.switchCartridge(id, sram?.data);
    this.lastSavedStageIdx = -1;
    this.sramAutoSaveTimer = 0;
    return resumed;
  }

  public hasSram(id: CartridgeId): boolean {
    return this.save.hasCartridgeSram(id);
  }

  public clearSram(id: CartridgeId): void {
    this.save.clearCartridgeSram(id);
    this.lastSavedStageIdx = -1;
  }

  public restartFresh(): void {
    const id = this.runner.getCartridgeId();
    this.save.clearCartridgeSram(id);
    this.runner.restart();
    this.lastSavedStageIdx = -1;
    this.sramAutoSaveTimer = 0;
  }

  public retryStage(): void {
    this.runner.retryStage();
  }

  public saveActiveSram(): void {
    const id = this.runner.getCartridgeId();
    const status = this.runner.getInstance().getStatus();
    if (status === 'won') {
      this.save.clearCartridgeSram(id);
      return;
    }
    const data = this.runner.serializeSave();
    if (data !== null && data !== undefined) {
      const snap = this.runner.getSnapshot();
      this.save.saveCartridgeSram(id, data, snap.stage?.name);
    }
  }

  public stepFrame(dt: number, input: InputState): void {
    this.runner.update(dt, input);
    this.synth.flushQueue();

    const snap = this.runner.getSnapshot();
    this.synth.setBgmTheme(snap.status === 'playing' ? (snap.bgmTheme ?? null) : null);
    this.synth.tickBgm(dt);

    if (snap.status === 'won') {
      this.save.clearCartridgeSram(this.runner.getCartridgeId());
      return;
    }

    const stageIdx = snap.stage?.index ?? 1;
    this.sramAutoSaveTimer += dt;
    if (stageIdx !== this.lastSavedStageIdx || this.sramAutoSaveTimer >= 4.0) {
      this.lastSavedStageIdx = stageIdx;
      this.sramAutoSaveTimer = 0;
      this.saveActiveSram();
    }
  }

  public getRecord(id: CartridgeId): CardRecord | undefined {
    return this.save.getRecord(id);
  }

  public saveRecord(id: CartridgeId, snap: RenderSceneSnapshot): boolean {
    return this.save.recordProgress(id, snap);
  }

  public reactMomo(): void {
    this.onMomoReact?.();
  }
}
