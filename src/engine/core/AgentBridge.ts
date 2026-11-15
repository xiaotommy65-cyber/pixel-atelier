import type { CartridgeRunner } from '../CartridgeRunner.ts';
import type { CartridgeId, RenderSceneSnapshot, RpgMenuOption } from '../WorldTypes.ts';
import type { TurnGridKernel } from './TurnGridKernel.ts';

export interface PixelAtelierAgentApi {
  readonly backendMode: 'static-client-no-server';
  listCartridges(): CartridgeId[];
  getActiveCartridge(): CartridgeId;
  switchCartridge(id: CartridgeId): void;
  getObservation(): unknown;
  getLegalActions(): RpgMenuOption[];
  stepAction(actionId: string): RenderSceneSnapshot;
  autoPlaySteps(steps: number): { stepsExecuted: number; snapshot: RenderSceneSnapshot };
  loadDndModuleJson(jsonSource: string): string | null;
}

/**
 * Exposes structured Observation + Legal-Action + Auto-Play + JSON Dungeon loading
 * to both browser DevTools / external AI Agents (`window.__PIXEL_ATELIER_AGENT__`) and Node headless tests.
 */
export function createAgentBridge(runner: CartridgeRunner): PixelAtelierAgentApi {
  const getTurnKernel = (): TurnGridKernel | null => {
    const inst = runner.getInstance() as { getKernel?: () => TurnGridKernel };
    return inst.getKernel ? inst.getKernel() : null;
  };

  return {
    backendMode: 'static-client-no-server',
    listCartridges: () => ['cloudberry-hop', 'sugar-starlight', 'sandbox-toybox', 'emberkeep-dnd'],
    getActiveCartridge: () => runner.getCartridgeId(),
    switchCartridge: (id) => runner.switchCartridge(id),
    getObservation: () => {
      const k = getTurnKernel();
      if (k) return k.getObservation();
      const snap = runner.getSnapshot();
      return {
        cartridgeId: snap.cartridgeId,
        status: snap.status,
        score: snap.score,
        hearts: snap.hearts,
        starsCollected: snap.starsCollected,
        starsTotal: snap.starsTotal,
        hasKey: snap.hasKey,
        entityCount: snap.entities.length,
        banner: snap.statusBanner,
      };
    },
    getLegalActions: () => {
      const k = getTurnKernel();
      return k ? k.getLegalActions() : [];
    },
    stepAction: (actionId) => {
      runner.dispatchCommand(actionId);
      return runner.getSnapshot();
    },
    autoPlaySteps: (steps) => {
      const k = getTurnKernel();
      if (!k) return { stepsExecuted: 0, snapshot: runner.getSnapshot() };
      let executed = 0;
      const limit = Math.max(1, Math.min(2500, Math.round(steps)));
      for (let i = 0; i < limit; i++) {
        if (k.getStatus() !== 'playing') break;
        const obs = k.getObservation();
        if (obs.combat?.turnOwner === 'enemy') {
          const blank = { left: false, right: false, up: false, down: false, jump: false, action: false, restart: false };
          for (let sub = 0; sub < 6 && k.getObservation().combat?.turnOwner === 'enemy'; sub++) {
            runner.stepFixed(0.15, blank);
          }
          executed++;
          continue;
        }
        const next = k.suggestAgentAction();
        if (!next) break;
        runner.dispatchCommand(next);
        executed++;
      }
      return { stepsExecuted: executed, snapshot: runner.getSnapshot() };
    },
    loadDndModuleJson: (jsonSource) => runner.applyDndModuleJson(jsonSource),
  };
}
