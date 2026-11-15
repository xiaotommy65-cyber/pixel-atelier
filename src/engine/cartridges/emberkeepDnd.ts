import type { CartridgeInstance, InputState, RenderSceneSnapshot, RuntimeParams, SimEvent } from '../WorldTypes.ts';
import {
  TurnGridKernel,
  parseDungeonModuleJson,
  type DungeonModuleDef,
} from '../core/TurnGridKernel.ts';

export const DEFAULT_DND_MODULE: DungeonModuleDef = {
  title: '龍與地城：餘燼迷宮',
  ambientDarkness: 0.72,
  dialogs: {
    sage_intro: {
      speaker: '🧙 旅法師艾琳',
      text: '「冒險者！餘燼幼龍甦醒於下層聖殿，鎖門的鐵鑰匙就在東南石室的骸骨後方。」',
      choices: [
        {
          id: 'rune_lore',
          label: '解讀壁畫古代火紋章',
          checkStat: 'int',
          checkDc: 11,
          successText: '看破古代光源符文！火把視野大幅擴大，並獲得聖泉藥水 ×1！',
          failText: '符文太晦澀了，稍微頭暈但仍記下方向 (-1 HP)。',
          rewardFlag: 'sage_blessing',
          rewardPotion: 1,
          rewardXp: 35,
          failDamage: 1,
        },
        {
          id: 'ask_supply',
          label: '索取應急補給',
          successText: '艾琳遞給你一瓶紅寶石治療藥水與祝福。',
          rewardPotion: 1,
          rewardXp: 15,
        },
      ],
    },
  },
  floors: [
    {
      id: 'floor-1',
      name: 'B1 · 守望前廳',
      spawn: { x: 2, y: 2 },
      map: [
        '####################',
        '#T....#....#......T#',
        '#.....D....L.....>.#',
        '#.....#....#.......#',
        '###D################',
        '#.....#............#',
        '#.T...D............#',
        '#.....#......^.....#',
        '#..................#',
        '#T................T#',
        '####################',
      ],
      entities: [
        { id: 'sage-1', kind: 'npc', name: '旅法師艾琳', x: 4, y: 1, dialogId: 'sage_intro' },
        { id: 'goblin-1', kind: 'monster', archetype: 'goblin', x: 8, y: 2 },
        { id: 'chest-potion-1', kind: 'chest', name: '補給木箱', x: 2, y: 8, loot: 'potion' },
        { id: 'skeleton-1', kind: 'monster', archetype: 'skeleton', x: 15, y: 7 },
        { id: 'chest-key-1', kind: 'chest', name: '銀鎖寶箱', x: 17, y: 8, loot: 'key' },
      ],
    },
    {
      id: 'floor-2',
      name: 'B2 · 餘燼龍巢',
      spawn: { x: 2, y: 2 },
      map: [
        '####################',
        '#T......#..........#',
        '#.......D.....T....#',
        '#.......#..........#',
        '####D####....^.....#',
        '#.......#..........#',
        '#.......D......T...#',
        '#..T....#..........#',
        '#.......#..........#',
        '#.......#.........T#',
        '####################',
      ],
      entities: [
        { id: 'goblin-2', kind: 'monster', archetype: 'goblin', x: 5, y: 6 },
        { id: 'chest-potion-2', kind: 'chest', name: '秘寶箱', x: 2, y: 8, loot: 'potion' },
        { id: 'dragon-boss', kind: 'monster', archetype: 'dragon', x: 16, y: 5 },
      ],
    },
  ],
};

export const DEFAULT_DND_MODULE_JSON = JSON.stringify(DEFAULT_DND_MODULE, null, 2);

/**
 * PA-04 Emberkeep D&D: Turn-Based Grid Dungeon Crawler powered by TurnGridKernel + RpgRules + GridPathfinder.
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

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    return this.kernel.snapshot(params);
  }
}
