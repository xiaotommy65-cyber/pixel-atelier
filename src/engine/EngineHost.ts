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
    });
  }

  public unlockAudio(): void {
    this.synth.unlock();
  }

  public playUiSound(preset: SoundPreset): void {
    this.synth.unlock();
    this.synth.playPreset(preset);
  }

  public stepFrame(dt: number, input: InputState): void {
    this.runner.update(dt, input);
    this.synth.flushQueue();
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
