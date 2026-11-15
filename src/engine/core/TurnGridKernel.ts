import { GAME_H, GAME_W } from '../../gpu/GpuTypes.ts';
import type { SpriteId } from '../../gpu/TextureAtlas.ts';
import type {
  DebugRectDesc,
  EntityDesc,
  InputState,
  LightDesc,
  RenderSceneSnapshot,
  RpgHudSnapshot,
  RpgMenuOption,
  RuntimeParams,
  SimEvent,
  TileDesc,
} from '../WorldTypes.ts';
import { computeVisibility, findNextStep, hasLineOfSight, type GridPos } from './GridPathfinder.ts';
import { InputMap } from './InputMap.ts';
import { JuiceSystem, stepSquashSpring, type SquashSpring } from './JuiceSystem.ts';
import {
  MONSTER_CATALOG,
  resolveWeaponAttack,
  rollDice,
  skillCheck,
  statMod,
  type CharacterStats,
  type StatKey,
} from './RpgRules.ts';
import { SeededRng } from './SeededRng.ts';

export type GridTileKind = 'wall' | 'floor' | 'door' | 'locked_door' | 'stairs_down' | 'trap' | 'torch';

export interface DungeonEntityDef {
  id: string;
  kind: 'monster' | 'chest' | 'npc';
  archetype?: string;
  name?: string;
  x: number;
  y: number;
  dialogId?: string;
  loot?: 'key' | 'potion' | 'elixir';
}

export interface DialogChoiceDef {
  id: string;
  label: string;
  checkStat?: StatKey;
  checkDc?: number;
  successText: string;
  failText?: string;
  rewardFlag?: string;
  rewardPotion?: number;
  rewardXp?: number;
  failDamage?: number;
}

export interface DialogDef {
  speaker: string;
  text: string;
  choices: DialogChoiceDef[];
}

export interface DungeonFloorDef {
  id: string;
  name: string;
  map: string[];
  spawn: GridPos;
  entities: DungeonEntityDef[];
}

export interface DungeonModuleDef {
  title: string;
  ambientDarkness?: number;
  floors: DungeonFloorDef[];
  dialogs: Record<string, DialogDef>;
}

interface ActiveEntity {
  id: string;
  kind: 'monster' | 'chest' | 'npc';
  name: string;
  sprite: SpriteId;
  x: number;
  y: number;
  alive: boolean;
  opened?: boolean;
  talked?: boolean;
  hp: number;
  maxHp: number;
  ac: number;
  atkMod: number;
  damageCount: number;
  damageSides: number;
  damageBonus: number;
  xpReward: number;
  isBoss?: boolean;
  specialName?: string;
  dialogId?: string;
  loot?: 'key' | 'potion' | 'elixir';
  flash: number;
  squash: SquashSpring;
}

interface FloorRuntime {
  def: DungeonFloorDef;
  width: number;
  height: number;
  grid: GridTileKind[][];
  explored: Set<number>;
  visible: Set<number>;
  entities: ActiveEntity[];
}

type TurnPhase =
  | { kind: 'explore'; menuIdx: number }
  | { kind: 'dialog'; entityId: string; dialogId: string; selectedIdx: number }
  | { kind: 'combat'; entityId: string; turnOwner: 'player' | 'enemy'; round: number; enemyTimer: number; selectedIdx: number }
  | { kind: 'won' }
  | { kind: 'lost' };

export interface AgentObservation {
  moduleTitle: string;
  phase: TurnPhase['kind'];
  floorId: string;
  floorName: string;
  turnCount: number;
  hero: CharacterStats & GridPos;
  blackboard: Record<string, boolean | number | string>;
  visibleEntities: { id: string; kind: string; name: string; x: number; y: number; hp?: number }[];
  combat?: RpgHudSnapshot['combat'];
  dialog?: RpgHudSnapshot['dialog'];
  combatLog: string[];
}

const TILE_PX = 16;
const EXPLORE_ACTIONS: readonly RpgMenuOption[] = [
  { id: 'wait', label: '⌛ 待命回氣', enabled: true },
  { id: 'potion', label: '🧪 喝治療藥水', enabled: true },
  { id: 'agent_step', label: '🤖 AI 單步代駕', enabled: true },
];

const CHAR_TO_TILE: Record<string, GridTileKind> = {
  '#': 'wall',
  '.': 'floor',
  'D': 'door',
  'L': 'locked_door',
  '>': 'stairs_down',
  '^': 'trap',
  'T': 'torch',
};

export function parseDungeonModuleJson(raw: string): { module?: DungeonModuleDef; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: `JSON 語法錯誤：${err instanceof Error ? err.message : String(err)}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'D&D 模組根節點必須是 JSON 物件' };
  }
  const mod = parsed as Partial<DungeonModuleDef>;
  if (!Array.isArray(mod.floors) || mod.floors.length === 0) {
    return { error: '必須包含至少一個 floors 樓層陣列' };
  }
  for (let i = 0; i < mod.floors.length; i++) {
    const f = mod.floors[i];
    if (!f || !Array.isArray(f.map) || f.map.length < 3 || !f.spawn) {
      return { error: `第 ${i + 1} 層缺少有效 map 或 spawn 座標` };
    }
  }
  return {
    module: {
      title: typeof mod.title === 'string' ? mod.title : '自訂地牢',
      ambientDarkness: typeof mod.ambientDarkness === 'number' ? mod.ambientDarkness : 0.72,
      floors: mod.floors,
      dialogs: mod.dialogs ?? {},
    },
  };
}

/**
 * Turn-Based Grid CRPG / D&D Engine Kernel.
 * Implements FOV + Fog-of-War, BFS Monster & Agent Pathfinding, d20 Dice Checks,
 * Turn-Based Combat Menu, Branching Dialog Skill Checks, and Multi-Floor Progression.
 */
export class TurnGridKernel {
  public readonly input = new InputMap();
  public readonly juice = new JuiceSystem();
  public readonly rng = new SeededRng(0x2026d200);

  public readonly moduleDef: DungeonModuleDef;
  public hero: CharacterStats & GridPos & { visualX: number; visualY: number; facingLeft: boolean; flash: number; squash: SquashSpring };
  public blackboard: Record<string, boolean | number | string> = {};
  public turnCount = 0;
  public score = 0;
  public chestsCollected = 0;
  public totalChests = 0;
  public agentAuto = false;
  public debugHitboxes = false;

  private floors: FloorRuntime[] = [];
  private floorIdx = 0;
  private phase: TurnPhase = { kind: 'explore', menuIdx: 0 };
  private combatLog: string[] = [];
  private autoCooldown = 0;
  private holdRepeatTimer = 0;
  private cameraX = 0;
  private cameraY = 0;

  constructor(moduleDef: DungeonModuleDef) {
    this.moduleDef = moduleDef;
    this.hero = {
      name: '小豆芽騎士',
      level: 1,
      xp: 0,
      nextXp: 80,
      hp: 26,
      maxHp: 26,
      mp: 10,
      maxMp: 10,
      ac: 14,
      str: 15, // +2
      dex: 14, // +2
      int: 13, // +1
      potions: 2,
      keys: 0,
      x: 1,
      y: 1,
      visualX: 1 * TILE_PX,
      visualY: 1 * TILE_PX,
      facingLeft: false,
      flash: 0,
      squash: { scaleX: 1, scaleY: 1 },
    };

    for (const fDef of moduleDef.floors) {
      const h = fDef.map.length;
      const w = Math.max(...fDef.map.map((r) => r.length));
      const grid: GridTileKind[][] = [];
      for (let y = 0; y < h; y++) {
        const row: GridTileKind[] = [];
        const line = fDef.map[y] ?? '';
        for (let x = 0; x < w; x++) {
          row.push(CHAR_TO_TILE[line[x] ?? '#'] ?? 'wall');
        }
        grid.push(row);
      }
      const entities: ActiveEntity[] = (fDef.entities ?? []).map((ed) => {
        if (ed.kind === 'monster') {
          const arch = MONSTER_CATALOG[ed.archetype ?? 'goblin'] ?? MONSTER_CATALOG.goblin;
          return {
            id: ed.id,
            kind: 'monster',
            name: ed.name ?? arch.name,
            sprite: arch.sprite,
            x: ed.x,
            y: ed.y,
            alive: true,
            hp: arch.maxHp,
            maxHp: arch.maxHp,
            ac: arch.ac,
            atkMod: arch.atkMod,
            damageCount: arch.damageCount,
            damageSides: arch.damageSides,
            damageBonus: arch.damageBonus,
            xpReward: arch.xpReward,
            isBoss: arch.isBoss,
            specialName: arch.specialName,
            flash: 0,
            squash: { scaleX: 1, scaleY: 1 },
          };
        }
        if (ed.kind === 'chest') {
          this.totalChests++;
          return {
            id: ed.id,
            kind: 'chest',
            name: ed.name ?? '鐵鎖寶箱',
            sprite: 'chest_closed',
            x: ed.x,
            y: ed.y,
            alive: true,
            opened: false,
            loot: ed.loot ?? 'potion',
            hp: 1,
            maxHp: 1,
            ac: 10,
            atkMod: 0,
            damageCount: 0,
            damageSides: 0,
            damageBonus: 0,
            xpReward: 0,
            flash: 0,
            squash: { scaleX: 1, scaleY: 1 },
          };
        }
        return {
          id: ed.id,
          kind: 'npc',
          name: ed.name ?? '旅法師艾琳',
          sprite: 'npc_sage',
          x: ed.x,
          y: ed.y,
          alive: true,
          dialogId: ed.dialogId,
          hp: 10,
          maxHp: 10,
          ac: 10,
          atkMod: 0,
          damageCount: 0,
          damageSides: 0,
          damageBonus: 0,
          xpReward: 0,
          flash: 0,
          squash: { scaleX: 1, scaleY: 1 },
        };
      });

      this.floors.push({
        def: fDef,
        width: w,
        height: h,
        grid,
        explored: new Set(),
        visible: new Set(),
        entities,
      });
    }

    this.enterFloor(0);
    this.pushLog(`📜 進入「${moduleDef.title}」— 方向鍵移動，遇敵進入 d20 回合戰！`);
  }

  private get floor(): FloorRuntime {
    return this.floors[this.floorIdx];
  }

  private enterFloor(idx: number): void {
    this.floorIdx = Math.max(0, Math.min(this.floors.length - 1, idx));
    const f = this.floor;
    this.hero.x = f.def.spawn.x;
    this.hero.y = f.def.spawn.y;
    this.hero.visualX = this.hero.x * TILE_PX;
    this.hero.visualY = this.hero.y * TILE_PX;
    this.updateFov();
    this.snapCameraImmediate();
  }

  private pushLog(msg: string): void {
    this.combatLog.unshift(msg);
    if (this.combatLog.length > 4) this.combatLog.length = 4;
  }

  private isOpaque(x: number, y: number): boolean {
    const f = this.floor;
    if (x < 0 || y < 0 || x >= f.width || y >= f.height) return true;
    const t = f.grid[y][x];
    return t === 'wall' || t === 'door' || t === 'locked_door';
  }

  private isWalkableFor(x: number, y: number, allowDoors = true): boolean {
    const f = this.floor;
    if (x < 0 || y < 0 || x >= f.width || y >= f.height) return false;
    const t = f.grid[y][x];
    if (t === 'wall') return false;
    if (!allowDoors && (t === 'door' || t === 'locked_door')) return false;
    return true;
  }

  private entityAt(x: number, y: number): ActiveEntity | undefined {
    return this.floor.entities.find((e) => e.alive && e.x === x && e.y === y);
  }

  private updateFov(): void {
    const f = this.floor;
    const radius = this.blackboard.sage_blessing ? 7 : 5;
    f.visible = computeVisibility(f.width, f.height, { x: this.hero.x, y: this.hero.y }, radius, (x, y) =>
      this.isOpaque(x, y),
    );
    for (const k of f.visible) f.explored.add(k);
  }

  private snapCameraImmediate(): void {
    const worldW = this.floor.width * TILE_PX;
    const worldH = this.floor.height * TILE_PX;
    this.cameraX = Math.max(0, Math.min(Math.max(0, worldW - GAME_W), this.hero.x * TILE_PX - GAME_W * 0.45));
    this.cameraY = Math.max(0, Math.min(Math.max(0, worldH - GAME_H), this.hero.y * TILE_PX - GAME_H * 0.4));
  }

  public getStatus(): 'playing' | 'won' | 'lost' {
    if (this.phase.kind === 'won') return 'won';
    if (this.phase.kind === 'lost') return 'lost';
    return 'playing';
  }

  public getObservation(): AgentObservation {
    const f = this.floor;
    const visibleEntities: AgentObservation['visibleEntities'] = [];
    for (const e of f.entities) {
      if (!e.alive) continue;
      if (f.visible.has(e.y * f.width + e.x)) {
        visibleEntities.push({
          id: e.id,
          kind: e.kind,
          name: e.name,
          x: e.x,
          y: e.y,
          hp: e.kind === 'monster' ? e.hp : undefined,
        });
      }
    }
    const hud = this.buildHudSnapshot();
    return {
      moduleTitle: this.moduleDef.title,
      phase: this.phase.kind,
      floorId: f.def.id,
      floorName: f.def.name,
      turnCount: this.turnCount,
      hero: { ...this.hero },
      blackboard: { ...this.blackboard },
      visibleEntities,
      combat: hud.combat,
      dialog: hud.dialog,
      combatLog: [...this.combatLog],
    };
  }

  public getLegalActions(): RpgMenuOption[] {
    if (this.phase.kind === 'won' || this.phase.kind === 'lost') return [];
    if (this.phase.kind === 'dialog') {
      const dlg = this.moduleDef.dialogs[this.phase.dialogId];
      if (!dlg) return [];
      return dlg.choices.map((c, i) => ({ id: `dialog_${i}`, label: c.label, enabled: true }));
    }
    if (this.phase.kind === 'combat') {
      if (this.phase.turnOwner !== 'player') return [];
      return this.buildCombatMenu();
    }
    const opts: RpgMenuOption[] = [];
    const dirs: { id: string; label: string; dx: number; dy: number }[] = [
      { id: 'move_n', label: '▲ 北移', dx: 0, dy: -1 },
      { id: 'move_s', label: '▼ 南移', dx: 0, dy: 1 },
      { id: 'move_w', label: '◀ 西移', dx: -1, dy: 0 },
      { id: 'move_e', label: '▶ 東移', dx: 1, dy: 0 },
    ];
    for (const d of dirs) {
      const nx = this.hero.x + d.dx;
      const ny = this.hero.y + d.dy;
      if (this.isWalkableFor(nx, ny, true)) {
        opts.push({ id: d.id, label: d.label, enabled: true });
      }
    }
    if (this.hero.potions > 0 && this.hero.hp < this.hero.maxHp) {
      opts.push({ id: 'potion', label: '🧪 喝藥水', enabled: true });
    }
    opts.push({ id: 'wait', label: '⌛ 待命', enabled: true });
    return opts;
  }

  /**
   * Built-in Goal-Driven Explorer & Tactical Combat Agent.
   * Uses BFS navigation over explored tiles, line-of-sight targeting, and combat utility heuristics.
   */
  public suggestAgentAction(): string | null {
    const legal = this.getLegalActions();
    if (legal.length === 0) return null;

    if (this.phase.kind === 'dialog') {
      return legal[0]?.id ?? null;
    }

    if (this.phase.kind === 'combat') {
      const enemy = this.floor.entities.find((e) => e.id === (this.phase as { entityId: string }).entityId);
      if (this.hero.hp <= Math.ceil(this.hero.maxHp * 0.38)) {
        if (legal.find((a) => a.id === 'potion' && a.enabled)) return 'potion';
        if (legal.find((a) => a.id === 'heal' && a.enabled)) return 'heal';
      }
      if (enemy && (enemy.ac >= 13 || enemy.isBoss) && legal.find((a) => a.id === 'firebolt' && a.enabled)) {
        return 'firebolt';
      }
      return 'attack';
    }

    if (this.hero.hp <= Math.ceil(this.hero.maxHp * 0.45) && legal.find((a) => a.id === 'potion')) {
      return 'potion';
    }

    const f = this.floor;
    const targets: GridPos[] = [];
    // Priority 1: Unopened chests, untouched NPCs, live monsters in visible/explored space
    for (const e of f.entities) {
      if (!e.alive) continue;
      if (e.kind === 'chest' && e.opened) continue;
      if (e.kind === 'npc' && e.talked) continue;
      if (f.explored.has(e.y * f.width + e.x)) {
        targets.push({ x: e.x, y: e.y });
      }
    }
    // Priority 2: Doors (closed or locked if key owned)
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        if (!f.explored.has(y * f.width + x)) continue;
        const t = f.grid[y][x];
        if (t === 'door' || (t === 'locked_door' && this.hero.keys > 0)) {
          targets.push({ x, y });
        }
      }
    }
    // Priority 3: Frontier explored tiles adjacent to unseen floor
    if (targets.length === 0) {
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          if (!f.explored.has(y * f.width + x) || !this.isWalkableFor(x, y, true)) continue;
          if (f.grid[y][x] === 'locked_door' && this.hero.keys <= 0) continue;
          const adjUnseen = [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ].some(([ax, ay]) => ax >= 0 && ay >= 0 && ax < f.width && ay < f.height && !f.explored.has(ay * f.width + ax));
          if (adjUnseen) targets.push({ x, y });
        }
      }
    }
    // Priority 4: Stairs down when floor cleared
    if (targets.length === 0) {
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          if (f.grid[y][x] === 'stairs_down') targets.push({ x, y });
        }
      }
    }

    let bestStep: GridPos | null = null;
    for (const goal of targets) {
      const step = findNextStep(f.width, f.height, { x: this.hero.x, y: this.hero.y }, goal, (x, y) => {
        if (!this.isWalkableFor(x, y, true)) return false;
        if (f.grid[y][x] === 'locked_door' && this.hero.keys <= 0) return false;
        if (this.entityAt(x, y)) return false;
        return true;
      });
      if (step) {
        bestStep = step;
        break;
      }
    }

    if (bestStep) {
      if (bestStep.y < this.hero.y) return 'move_n';
      if (bestStep.y > this.hero.y) return 'move_s';
      if (bestStep.x < this.hero.x) return 'move_w';
      if (bestStep.x > this.hero.x) return 'move_e';
    }
    return legal[0]?.id ?? null;
  }

  public dispatchCommand(commandId: string): SimEvent[] {
    const events: SimEvent[] = [];
    if (commandId === 'toggle_agent') {
      this.agentAuto = !this.agentAuto;
      this.autoCooldown = 0.08;
      events.push('snap');
      return events;
    }
    if (commandId === 'agent_step') {
      const next = this.suggestAgentAction();
      if (next) return this.dispatchCommand(next);
      return events;
    }
    this.executeAction(commandId, events);
    return events;
  }

  public step(dt: number, rawInput: InputState, params: RuntimeParams): SimEvent[] {
    const events: SimEvent[] = [];
    this.input.update(rawInput, dt);
    const simDt = this.juice.advanceRealTime(dt, params.shakeScale);

    // Smooth visual sprite slide & spring
    const followRate = Math.min(1, dt * 18);
    this.hero.visualX += (this.hero.x * TILE_PX - this.hero.visualX) * followRate;
    this.hero.visualY += (this.hero.y * TILE_PX - this.hero.visualY) * followRate;
    if (this.hero.flash > 0) this.hero.flash = Math.max(0, this.hero.flash - dt * 5);
    stepSquashSpring(this.hero.squash, dt, 15);
    for (const e of this.floor.entities) {
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
      stepSquashSpring(e.squash, dt, 14);
    }

    // Smooth camera follow
    const worldW = this.floor.width * TILE_PX;
    const worldH = this.floor.height * TILE_PX;
    const targetCamX = Math.max(0, Math.min(Math.max(0, worldW - GAME_W), this.hero.visualX - GAME_W * 0.45));
    const targetCamY = Math.max(0, Math.min(Math.max(0, worldH - GAME_H), this.hero.visualY - GAME_H * 0.4));
    this.cameraX += (targetCamX - this.cameraX) * Math.min(1, dt * 10);
    this.cameraY += (targetCamY - this.cameraY) * Math.min(1, dt * 10);

    if (simDt <= 0 || this.phase.kind === 'won' || this.phase.kind === 'lost') return events;

    // Enemy turn delay timer in combat
    if (this.phase.kind === 'combat' && this.phase.turnOwner === 'enemy') {
      this.phase.enemyTimer -= simDt;
      if (this.phase.enemyTimer <= 0) {
        this.runEnemyCombatTurn(events);
      }
      return events;
    }

    // Optional autonomous Agent playback
    if (this.agentAuto) {
      this.autoCooldown -= simDt;
      if (this.autoCooldown <= 0) {
        this.autoCooldown = 0.24;
        const act = this.suggestAgentAction();
        if (act) this.executeAction(act, events);
      }
      return events;
    }

    // Human turn-based input (edge-triggered or comfortable hold-repeat)
    const heldMove =
      this.input.held('left') || this.input.held('right') || this.input.held('up') || this.input.held('down');
    let dirPress =
      this.input.justPressed('left') ||
      this.input.justPressed('right') ||
      this.input.justPressed('up') ||
      this.input.justPressed('down');

    if (this.phase.kind === 'explore' && heldMove) {
      if (dirPress) {
        this.holdRepeatTimer = 0.24;
      } else {
        this.holdRepeatTimer -= simDt;
        if (this.holdRepeatTimer <= 0) {
          this.holdRepeatTimer = 0.14;
          dirPress = true;
        }
      }
    } else {
      this.holdRepeatTimer = 0;
    }

    if (this.phase.kind === 'explore') {
      if (dirPress) {
        if (this.input.held('up')) this.executeAction('move_n', events);
        else if (this.input.held('down')) this.executeAction('move_s', events);
        else if (this.input.held('left')) this.executeAction('move_w', events);
        else if (this.input.held('right')) this.executeAction('move_e', events);
      } else if (this.input.justPressed('action')) {
        const opts = this.getExploreMenu();
        const opt = opts[this.phase.menuIdx];
        if (opt?.enabled) this.executeAction(opt.id, events);
      } else if (this.input.justPressed('jump')) {
        const opts = this.getExploreMenu();
        this.phase.menuIdx = (this.phase.menuIdx + 1) % opts.length;
      }
    } else if (this.phase.kind === 'combat') {
      const menu = this.buildCombatMenu();
      if (this.input.justPressed('up') || this.input.justPressed('left')) {
        this.phase.selectedIdx = (this.phase.selectedIdx - 1 + menu.length) % menu.length;
      } else if (this.input.justPressed('down') || this.input.justPressed('right')) {
        this.phase.selectedIdx = (this.phase.selectedIdx + 1) % menu.length;
      } else if (this.input.justPressed('action') || this.input.justPressed('jump')) {
        const opt = menu[this.phase.selectedIdx];
        if (opt?.enabled) this.executeAction(opt.id, events);
      }
    } else if (this.phase.kind === 'dialog') {
      const dlg = this.moduleDef.dialogs[this.phase.dialogId];
      const len = dlg?.choices.length ?? 1;
      if (this.input.justPressed('up') || this.input.justPressed('left')) {
        this.phase.selectedIdx = (this.phase.selectedIdx - 1 + len) % len;
      } else if (this.input.justPressed('down') || this.input.justPressed('right')) {
        this.phase.selectedIdx = (this.phase.selectedIdx + 1) % len;
      } else if (this.input.justPressed('action') || this.input.justPressed('jump')) {
        this.executeAction(`dialog_${this.phase.selectedIdx}`, events);
      }
    }

    return events;
  }

  private executeAction(actionId: string, events: SimEvent[]): void {
    if (this.phase.kind === 'won' || this.phase.kind === 'lost') return;

    if (this.phase.kind === 'dialog') {
      const idx = Number(actionId.replace('dialog_', ''));
      this.resolveDialogChoice(Number.isFinite(idx) ? idx : 0, events);
      return;
    }

    if (this.phase.kind === 'combat') {
      if (this.phase.turnOwner !== 'player') return;
      this.resolvePlayerCombatAction(actionId, events);
      return;
    }

    // Explore phase actions
    if (actionId === 'wait') {
      this.turnCount++;
      this.hero.mp = Math.min(this.hero.maxMp, this.hero.mp + 1);
      this.pushLog('⌛ 稍作調息，恢復 1 MP。');
      this.stepOverworldMonsters(events);
      return;
    }
    if (actionId === 'potion') {
      if (this.hero.potions <= 0) return;
      this.hero.potions--;
      const heal = rollDice(this.rng, 2, 4, 2).total;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      this.turnCount++;
      events.push('star');
      this.juice.spawnBurst(this.hero.visualX + 8, this.hero.visualY + 8, ['#56d39c', '#fffaf0'], 10);
      this.pushLog(`🧪 飲用治療藥水！恢復 ${heal} HP。`);
      this.stepOverworldMonsters(events);
      return;
    }

    const deltaMap: Record<string, GridPos> = {
      move_n: { x: 0, y: -1 },
      move_s: { x: 0, y: 1 },
      move_w: { x: -1, y: 0 },
      move_e: { x: 1, y: 0 },
    };
    const delta = deltaMap[actionId];
    if (!delta) return;

    if (delta.x < 0) this.hero.facingLeft = true;
    if (delta.x > 0) this.hero.facingLeft = false;
    this.tryStepGrid(this.hero.x + delta.x, this.hero.y + delta.y, events);
  }

  private tryStepGrid(nx: number, ny: number, events: SimEvent[]): void {
    const f = this.floor;
    if (nx < 0 || ny < 0 || nx >= f.width || ny >= f.height || f.grid[ny][nx] === 'wall') {
      this.hero.squash = { scaleX: 1.18, scaleY: 0.86 };
      return;
    }

    const ent = this.entityAt(nx, ny);
    if (ent) {
      if (ent.kind === 'monster') {
        this.phase = { kind: 'combat', entityId: ent.id, turnOwner: 'player', round: 1, enemyTimer: 0, selectedIdx: 0 };
        events.push('bounce');
        this.juice.addTrauma(0.25);
        this.pushLog(`⚔️ 遭遇 ${ent.name} (AC${ent.ac} · HP${ent.hp})！`);
        return;
      }
      if (ent.kind === 'chest') {
        if (!ent.opened) {
          ent.opened = true;
          ent.sprite = 'chest_open';
          ent.flash = 0.25;
          this.chestsCollected++;
          this.score += 120;
          if (ent.loot === 'key') {
            this.hero.keys++;
            events.push('key');
            this.pushLog('🗝️ 打開寶箱獲得「古代鐵鑰匙」！');
          } else {
            this.hero.potions++;
            events.push('star');
            this.pushLog('🧪 打開寶箱獲得「治療藥水 ×1」！');
          }
          this.juice.spawnBurst(nx * TILE_PX + 8, ny * TILE_PX + 8, ['#ffd447', '#fffaf0'], 12);
        }
        this.turnCount++;
        return;
      }
      if (ent.kind === 'npc' && ent.dialogId && this.moduleDef.dialogs[ent.dialogId]) {
        if (ent.talked) {
          events.push('snap');
          this.pushLog(`🧙 ${ent.name}：「願火焰護佑你，勇敢前進吧！」`);
          return;
        }
        ent.talked = true;
        this.phase = { kind: 'dialog', entityId: ent.id, dialogId: ent.dialogId, selectedIdx: 0 };
        events.push('star');
        return;
      }
    }

    const tile = f.grid[ny][nx];
    if (tile === 'door') {
      f.grid[ny][nx] = 'floor';
      this.blackboard[`door_${this.floorIdx}_${nx}_${ny}`] = true;
      this.turnCount++;
      events.push('bounce');
      this.updateFov();
      this.pushLog('🚪 推開了沉重的地牢木門。');
      return;
    }
    if (tile === 'locked_door') {
      if (this.hero.keys > 0) {
        this.hero.keys--;
        f.grid[ny][nx] = 'floor';
        this.turnCount++;
        events.push('key');
        this.juice.triggerFlash('#ffd447', 0.2);
        this.updateFov();
        this.pushLog('🔓 使用鐵鑰匙解開了古代鐵門！');
      } else {
        events.push('hurt');
        this.pushLog('🔒 門已上鎖！需要鐵鑰匙（去寶箱找找）。');
      }
      return;
    }

    // Step onto tile cleanly
    this.hero.x = nx;
    this.hero.y = ny;
    this.hero.squash = { scaleX: 0.88, scaleY: 1.14 };
    this.turnCount++;
    this.updateFov();

    if (tile === 'trap') {
      f.grid[ny][nx] = 'floor';
      const chk = skillCheck(this.rng, this.hero, 'dex', 12);
      if (chk.passed) {
        this.score += 50;
        events.push('bounce');
        this.pushLog(`⚡ DEX 檢定 ${chk.roll.text} ≥ 12！敏捷閃過了地刺陷阱！`);
      } else {
        const dmg = rollDice(this.rng, 1, 6, 0).total;
        this.hero.hp -= dmg;
        this.hero.flash = 0.35;
        events.push('hurt');
        this.juice.addTrauma(0.45);
        this.juice.triggerFlash('#ff708d', 0.25);
        this.pushLog(`💥 觸發陷阱 (${chk.roll.text} < 12)！受到 ${dmg} 穿刺傷害！`);
        if (this.hero.hp <= 0) {
          this.phase = { kind: 'lost' };
          return;
        }
      }
    } else if (tile === 'stairs_down') {
      if (this.floorIdx + 1 < this.floors.length) {
        this.enterFloor(this.floorIdx + 1);
        events.push('key');
        this.score += 200;
        this.juice.triggerFlash('#e0aaff', 0.24);
        this.pushLog(`🪜 踏下石階，進入「${this.floor.def.name}」！`);
        return;
      }
    }

    this.stepOverworldMonsters(events);
  }

  private stepOverworldMonsters(events: SimEvent[]): void {
    const f = this.floor;
    for (const m of f.entities) {
      if (!m.alive || m.kind !== 'monster' || m.isBoss) continue;
      if (!f.visible.has(m.y * f.width + m.x)) continue;
      const dist = Math.abs(m.x - this.hero.x) + Math.abs(m.y - this.hero.y);
      if (dist <= 1) {
        this.phase = { kind: 'combat', entityId: m.id, turnOwner: 'player', round: 1, enemyTimer: 0, selectedIdx: 0 };
        events.push('bounce');
        this.pushLog(`⚔️ ${m.name} 搶先攔截！進入回合戰！`);
        return;
      }
      if (dist <= 5 && hasLineOfSight({ x: m.x, y: m.y }, { x: this.hero.x, y: this.hero.y }, (x, y) => this.isOpaque(x, y))) {
        const next = findNextStep(f.width, f.height, { x: m.x, y: m.y }, { x: this.hero.x, y: this.hero.y }, (x, y) => {
          if (!this.isWalkableFor(x, y, false)) return false;
          const occ = this.entityAt(x, y);
          return !occ;
        });
        if (next) {
          if (next.x === this.hero.x && next.y === this.hero.y) {
            this.phase = { kind: 'combat', entityId: m.id, turnOwner: 'player', round: 1, enemyTimer: 0, selectedIdx: 0 };
            events.push('bounce');
            this.pushLog(`⚔️ ${m.name} 衝上來開戰！`);
            return;
          }
          m.x = next.x;
          m.y = next.y;
        }
      }
    }
  }

  private resolveDialogChoice(idx: number, events: SimEvent[]): void {
    if (this.phase.kind !== 'dialog') return;
    const dlg = this.moduleDef.dialogs[this.phase.dialogId];
    const choice = dlg?.choices[idx] ?? dlg?.choices[0];
    if (!choice) {
      this.phase = { kind: 'explore', menuIdx: 0 };
      return;
    }

    let ok = true;
    let rollPrefix = '';
    if (choice.checkStat && choice.checkDc) {
      const chk = skillCheck(this.rng, this.hero, choice.checkStat, choice.checkDc);
      ok = chk.passed;
      rollPrefix = `🎲 ${choice.checkStat.toUpperCase()} ${chk.roll.text} vs DC${choice.checkDc}：`;
    }

    if (ok) {
      if (choice.rewardFlag) this.blackboard[choice.rewardFlag] = true;
      if (choice.rewardPotion) this.hero.potions += choice.rewardPotion;
      if (choice.rewardXp) this.grantXp(choice.rewardXp, events);
      this.updateFov();
      events.push('star');
      this.pushLog(`${rollPrefix}${choice.successText}`);
    } else {
      if (choice.failDamage) {
        this.hero.hp -= choice.failDamage;
        this.hero.flash = 0.3;
        events.push('hurt');
      } else {
        events.push('bounce');
      }
      this.pushLog(`${rollPrefix}${choice.failText ?? '未能順利說服對方。'}`);
    }

    if (this.hero.hp <= 0) {
      this.phase = { kind: 'lost' };
    } else {
      this.phase = { kind: 'explore', menuIdx: 0 };
    }
  }

  private resolvePlayerCombatAction(actionId: string, events: SimEvent[]): void {
    if (this.phase.kind !== 'combat') return;
    const combatEnemyId = this.phase.entityId;
    const enemy = this.floor.entities.find((e) => e.id === combatEnemyId && e.alive);
    if (!enemy) {
      this.phase = { kind: 'explore', menuIdx: 0 };
      return;
    }

    this.turnCount++;
    if (actionId === 'attack') {
      const atkMod = statMod(this.hero.str) + Math.floor(this.hero.level / 2) + 1;
      const res = resolveWeaponAttack(this.rng, atkMod, enemy.ac, 1, 8, statMod(this.hero.str));
      this.pushLog(`⚔️ 長劍斬擊 ${enemy.name}：${res.summary}`);
      if (res.hit) {
        enemy.hp -= res.damage;
        enemy.flash = 0.35;
        enemy.squash = { scaleX: 1.25, scaleY: 0.75 };
        events.push('stomp');
        this.juice.triggerHitstop(0.045);
        this.juice.addTrauma(res.crit ? 0.55 : 0.24);
        this.juice.spawnBurst(enemy.x * TILE_PX + 8, enemy.y * TILE_PX + 8, ['#ffd447', '#ff708d'], 10);
      } else {
        events.push('bounce');
      }
    } else if (actionId === 'firebolt') {
      if (this.hero.mp < 3) {
        this.pushLog('✨ MP 不足 (需 3 MP)！');
        return;
      }
      this.hero.mp -= 3;
      const spellMod = statMod(this.hero.int) + 2;
      const dmg = rollDice(this.rng, 2, 6, spellMod).total;
      enemy.hp -= dmg;
      enemy.flash = 0.4;
      enemy.squash = { scaleX: 0.78, scaleY: 1.25 };
      events.push('ignite');
      this.juice.triggerHitstop(0.05);
      this.juice.addTrauma(0.32);
      this.juice.triggerFlash('#ff9048', 0.18);
      this.juice.spawnBurst(enemy.x * TILE_PX + 8, enemy.y * TILE_PX + 8, ['#ff9048', '#ffd447', '#fffaf0'], 14);
      this.pushLog(`🔥 施放火焰箭！(必中) 造成 ${dmg} 熾焰傷害！`);
    } else if (actionId === 'heal') {
      if (this.hero.mp < 4) {
        this.pushLog('✨ MP 不足 (需 4 MP)！');
        return;
      }
      this.hero.mp -= 4;
      const heal = rollDice(this.rng, 1, 8, statMod(this.hero.int) + 4).total;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      events.push('star');
      this.juice.spawnBurst(this.hero.visualX + 8, this.hero.visualY + 8, ['#56d39c', '#fffaf0'], 10);
      this.pushLog(`💚 聖光治癒術！恢復 ${heal} HP。`);
    } else if (actionId === 'potion') {
      if (this.hero.potions <= 0) return;
      this.hero.potions--;
      const heal = rollDice(this.rng, 2, 4, 3).total;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
      events.push('star');
      this.pushLog(`🧪 喝下治療藥水！恢復 ${heal} HP。`);
    }

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.score += enemy.xpReward * 3;
      this.pushLog(`🏆 擊敗 ${enemy.name}！獲得 ${enemy.xpReward} XP！`);
      this.grantXp(enemy.xpReward, events);
      if (enemy.isBoss) {
        this.score += 600;
        this.phase = { kind: 'won' };
        events.push('win');
        this.juice.triggerFlash('#fffaf0', 0.35);
        this.juice.spawnBurst(enemy.x * TILE_PX + 8, enemy.y * TILE_PX + 8, ['#ffd447', '#56d39c', '#ff708d'], 28);
      } else {
        this.hero.x = enemy.x;
        this.hero.y = enemy.y;
        this.updateFov();
        this.phase = { kind: 'explore', menuIdx: 0 };
        events.push('explode');
      }
      return;
    }

    this.phase.turnOwner = 'enemy';
    this.phase.enemyTimer = 0.28;
  }

  private runEnemyCombatTurn(events: SimEvent[]): void {
    if (this.phase.kind !== 'combat') return;
    const combatEnemyId = this.phase.entityId;
    const enemy = this.floor.entities.find((e) => e.id === combatEnemyId && e.alive);
    if (!enemy) {
      this.phase = { kind: 'explore', menuIdx: 0 };
      return;
    }

    if (enemy.isBoss && this.phase.round % 3 === 0) {
      const breath = rollDice(this.rng, 2, 5, 1).total;
      this.hero.hp -= breath;
      this.hero.flash = 0.38;
      events.push('hurt');
      this.juice.addTrauma(0.5);
      this.juice.triggerFlash('#ff708d', 0.25);
      this.pushLog(`🐉 ${enemy.name} 噴吐「${enemy.specialName}」！受到 ${breath} 火焰傷害！`);
    } else {
      const res = resolveWeaponAttack(
        this.rng,
        enemy.atkMod,
        this.hero.ac,
        enemy.damageCount,
        enemy.damageSides,
        enemy.damageBonus,
      );
      this.pushLog(`🐾 ${enemy.name} 反擊：${res.summary}`);
      if (res.hit) {
        this.hero.hp -= res.damage;
        this.hero.flash = 0.32;
        this.hero.squash = { scaleX: 1.24, scaleY: 0.78 };
        events.push('hurt');
        this.juice.addTrauma(0.36);
        this.juice.triggerFlash('#ff708d', 0.2);
      } else {
        events.push('snap');
      }
    }

    if (this.hero.hp <= 0) {
      this.hero.hp = 0;
      this.phase = { kind: 'lost' };
      return;
    }

    this.phase.round++;
    this.phase.turnOwner = 'player';
  }

  private grantXp(amount: number, events: SimEvent[]): void {
    this.hero.xp += amount;
    while (this.hero.xp >= this.hero.nextXp) {
      this.hero.xp -= this.hero.nextXp;
      this.hero.level++;
      this.hero.nextXp = Math.round(this.hero.nextXp * 1.5);
      this.hero.maxHp += 6;
      this.hero.hp = this.hero.maxHp;
      this.hero.maxMp += 3;
      this.hero.mp = this.hero.maxMp;
      this.hero.str += 1;
      events.push('key');
      this.juice.triggerFlash('#ffd447', 0.22);
      this.pushLog(`🌟 升級到 Lv.${this.hero.level}！MaxHP+6 / STR+1 / 狀態全滿！`);
    }
  }

  private getExploreMenu(): RpgMenuOption[] {
    return EXPLORE_ACTIONS.map((a) => ({
      ...a,
      enabled: a.id === 'potion' ? this.hero.potions > 0 && this.hero.hp < this.hero.maxHp : true,
    }));
  }

  private buildCombatMenu(): RpgMenuOption[] {
    return [
      { id: 'attack', label: '⚔️ 長劍斬擊', enabled: true },
      { id: 'firebolt', label: '🔥 火焰箭 (3MP)', enabled: this.hero.mp >= 3 },
      { id: 'heal', label: '💚 治癒術 (4MP)', enabled: this.hero.mp >= 4 && this.hero.hp < this.hero.maxHp },
      { id: 'potion', label: `🧪 藥水 (×${this.hero.potions})`, enabled: this.hero.potions > 0 },
    ];
  }

  private buildHudSnapshot(): RpgHudSnapshot {
    const mode = this.phase.kind;
    let combat: RpgHudSnapshot['combat'];
    let dialog: RpgHudSnapshot['dialog'];
    let actions: RpgMenuOption[] = this.getExploreMenu();
    let selectedActionIdx = mode === 'explore' ? this.phase.menuIdx : 0;

    if (this.phase.kind === 'combat') {
      const enemy = this.floor.entities.find((e) => e.id === (this.phase as { entityId: string }).entityId);
      if (enemy) {
        combat = {
          enemyName: enemy.name,
          enemyHp: Math.max(0, enemy.hp),
          enemyMaxHp: enemy.maxHp,
          enemyAc: enemy.ac,
          round: this.phase.round,
          turnOwner: this.phase.turnOwner,
        };
      }
      actions = this.buildCombatMenu();
      selectedActionIdx = this.phase.selectedIdx;
    } else if (this.phase.kind === 'dialog') {
      const dlg = this.moduleDef.dialogs[this.phase.dialogId];
      if (dlg) {
        dialog = {
          speaker: dlg.speaker,
          text: dlg.text,
          choices: dlg.choices.map((c, i) => ({
            id: `dialog_${i}`,
            label: c.checkStat && c.checkDc ? `${c.label} [${c.checkStat.toUpperCase()} DC${c.checkDc}]` : c.label,
            enabled: true,
          })),
          selectedIdx: this.phase.selectedIdx,
        };
      }
      actions = [];
    }

    return {
      mode,
      floorName: this.floor.def.name,
      turnCount: this.turnCount,
      heroName: this.hero.name,
      level: this.hero.level,
      xp: this.hero.xp,
      nextXp: this.hero.nextXp,
      hp: Math.max(0, this.hero.hp),
      maxHp: this.hero.maxHp,
      mp: this.hero.mp,
      maxMp: this.hero.maxMp,
      ac: this.hero.ac,
      potions: this.hero.potions,
      keys: this.hero.keys,
      agentAuto: this.agentAuto,
      combat,
      dialog,
      actions,
      selectedActionIdx,
      combatLog: [...this.combatLog],
    };
  }

  public snapshot(params: RuntimeParams): RenderSceneSnapshot {
    const f = this.floor;
    const t = this.juice.visualTime;
    const glow = params.glowIntensity;
    const tiles: TileDesc[] = [];
    const entities: EntityDesc[] = [];
    const lights: LightDesc[] = [];

    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const key = y * f.width + x;
        if (!f.explored.has(key)) continue;
        const isVis = f.visible.has(key);
        const dimTint = isVis ? undefined : '#646e88';
        const kind = f.grid[y][x];
        const px = x * TILE_PX;
        const py = y * TILE_PX;

        let sprite: SpriteId = 'dungeon_floor';
        if (kind === 'wall') sprite = 'stone';
        else if (kind === 'door' || kind === 'locked_door') sprite = 'door_closed';
        else if (kind === 'stairs_down') sprite = 'stairs_down';
        else if (kind === 'trap') sprite = 'trap';
        else if (kind === 'torch') {
          sprite = 'dungeon_floor';
          tiles.push({ sprite: 'dungeon_floor', x: px, y: py, w: TILE_PX, h: TILE_PX, tint: dimTint });
          entities.push({ id: `torch-${x}-${y}`, sprite: 'torch', x: px, y: py, w: 16, h: 16, tint: dimTint });
          if (isVis && glow > 0.05) {
            lights.push({
              x: px + 8,
              y: py + 8,
              radius: 54 * (1 + Math.sin(t * 10 + x) * 0.08),
              color: '#ffae42',
              intensity: 0.72 * glow,
              falloffPower: 1.7,
            });
          }
          continue;
        }

        tiles.push({
          sprite,
          x: px,
          y: py,
          w: TILE_PX,
          h: TILE_PX,
          tint: kind === 'locked_door' ? '#ffd447' : dimTint,
        });
      }
    }

    for (const e of f.entities) {
      if (!e.alive) continue;
      if (!f.visible.has(e.y * f.width + e.x)) continue;
      entities.push({
        id: e.id,
        sprite: e.sprite,
        x: e.x * TILE_PX,
        y: e.y * TILE_PX,
        w: 16,
        h: 16,
        scaleX: e.squash.scaleX,
        scaleY: e.squash.scaleY,
        flash: Math.min(1, e.flash * 2.5),
      });
      if (e.isBoss && glow > 0.05) {
        lights.push({ x: e.x * TILE_PX + 8, y: e.y * TILE_PX + 8, radius: 46, color: '#ff708d', intensity: 0.65 * glow });
      }
    }

    // Hero sprite + torchlight aura
    entities.push({
      id: 'hero',
      sprite: Math.floor(this.turnCount) % 2 === 1 ? 'hero_b' : 'hero_a',
      x: this.hero.visualX,
      y: this.hero.visualY,
      w: 16,
      h: 16,
      scaleX: this.hero.squash.scaleX,
      scaleY: this.hero.squash.scaleY,
      flash: Math.min(1, this.hero.flash * 2.5),
      flipX: this.hero.facingLeft,
    });
    if (glow > 0.05) {
      lights.push({
        x: this.hero.visualX + 8,
        y: this.hero.visualY + 8,
        radius: this.blackboard.sage_blessing ? 72 : 52,
        color: '#ffe4a1',
        intensity: 0.66 * glow,
        falloffPower: 1.65,
      });
    }

    let debugRects: DebugRectDesc[] | undefined;
    if (this.debugHitboxes) {
      debugRects = [];
      for (const k of f.visible) {
        const vx = k % f.width;
        const vy = Math.floor(k / f.width);
        debugRects.push({ x: vx * TILE_PX, y: vy * TILE_PX, w: TILE_PX, h: TILE_PX, color: '#56d39c' });
      }
    }

    const hud = this.buildHudSnapshot();
    return {
      cartridgeId: 'emberkeep-dnd',
      skyTop: '#0d0918',
      skyBottom: '#1a122e',
      cozyFilter: params.cozyFilter > 0.5,
      timeSec: t,
      elapsedSec: t,
      status: this.getStatus(),
      score: this.score,
      starsCollected: this.chestsCollected,
      starsTotal: Math.max(1, this.totalChests),
      hasKey: this.hero.keys > 0,
      hearts: Math.max(0, Math.ceil((this.hero.hp / this.hero.maxHp) * 3)),
      maxHearts: 3,
      bossHp: hud.combat?.enemyHp ?? 0,
      bossMaxHp: hud.combat?.enemyMaxHp ?? 0,
      cameraX: this.cameraX + this.juice.shakeX,
      cameraY: this.cameraY + this.juice.shakeY,
      ambientDarkness: this.moduleDef.ambientDarkness ?? 0.72,
      ambientColor: '#0c0818',
      screenFlashAlpha: this.juice.flashAlpha,
      screenFlashColor: this.juice.flashColor,
      bgStars: [],
      bgClouds: [],
      tiles,
      entities,
      particles: this.juice.particles,
      lights,
      debugRects,
      statusBanner: this.combatLog[0] ?? '方向鍵探索迷宮・A 執行選單・可開啟 AI 代理自動探索',
      rpgHud: hud,
    };
  }
}
