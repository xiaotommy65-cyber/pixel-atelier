import type { SpriteId } from '../gpu/TextureAtlas.ts';

export type CartridgeId = 'cloudberry-hop' | 'sugar-starlight' | 'sandbox-toybox' | 'emberkeep-dnd';

export type SimEvent =
  | 'jump'
  | 'star'
  | 'stomp'
  | 'hurt'
  | 'laser'
  | 'key'
  | 'win'
  | 'bounce'
  | 'explode'
  | 'ignite'
  | 'snap';

export type BgmTheme = 'meadow' | 'starlight' | 'dungeon' | 'boss';

export interface StageProgressInfo {
  index: number; // 1-based stage/floor index
  total: number;
  name: string;
}

export interface RpgMenuOption {
  id: string;
  label: string;
  enabled: boolean;
}

export interface RpgHudSnapshot {
  mode: 'explore' | 'combat' | 'dialog' | 'won' | 'lost';
  floorName: string;
  turnCount: number;
  heroName: string;
  level: number;
  xp: number;
  nextXp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ac: number;
  potions: number;
  keys: number;
  gold: number;
  weaponName?: string;
  armorName?: string;
  relicName?: string;
  statuses?: string[];
  agentAuto: boolean;
  combat?: {
    enemyName: string;
    enemyHp: number;
    enemyMaxHp: number;
    enemyAc: number;
    round: number;
    turnOwner: 'player' | 'enemy';
  };
  dialog?: {
    speaker: string;
    text: string;
    choices: RpgMenuOption[];
    selectedIdx: number;
  };
  actions: RpgMenuOption[];
  selectedActionIdx: number;
  combatLog: string[];
}

export interface SimEventDetail {
  kind: SimEvent;
  combo?: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  action: boolean;
  restart: boolean;
}

export interface CartridgeParamDef {
  key: keyof RuntimeParams;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
}

export interface RuntimeParams {
  gravityScale: number;
  moveSpeed: number;
  jumpPower: number;
  glowIntensity: number;
  sparkleDensity: number;
  enemyCount: number;
  shakeScale: number;
  cozyFilter: number; // 1 = subtle LCD scanline on, 0 = off
}

export interface CartridgeMeta {
  id: CartridgeId;
  code: string;
  title: string;
  subtitle: string;
  genre: string;
  accentHex: string;
  badgeText: string;
  controlsHint: string;
  goalHint: string;
  defaultScript: string;
}

export interface TileDesc {
  sprite: SpriteId;
  x: number;
  y: number;
  w: number;
  h: number;
  tint?: string;
  unlockable?: boolean;
}

export interface EntityDesc {
  id: string;
  sprite: SpriteId;
  x: number;
  y: number;
  w: number;
  h: number;
  scaleX?: number;
  scaleY?: number;
  anchorY?: number; // 0 = top, 0.5 = center (default), 1 = feet bottom
  flash?: number; // 0..1 white hit-flash in GPU shader
  flipX?: boolean;
  rot?: number;
  tint?: string;
  alpha?: number;
  additive?: boolean;
}

export interface ParticleDesc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vRot: number;
  sprite?: SpriteId;
  additive?: boolean;
  gravity?: number;
}

export interface LightDesc {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  falloffPower?: number;
}

export interface DebugRectDesc {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface BgCloudDesc {
  x: number;
  y: number;
  scale: number;
  speed: number;
  tint: string;
  alpha: number;
}

export interface BgStarDesc {
  x: number;
  y: number;
  size: number;
  phase: number;
  color: string;
}

export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: 'solid' | 'cloud';
  unlockable?: boolean;
}

export interface RenderSceneSnapshot {
  cartridgeId: CartridgeId;
  skyTop: string;
  skyBottom: string;
  cozyFilter: boolean;
  timeSec: number;
  elapsedSec: number;
  status: 'playing' | 'won' | 'lost';
  score: number;
  comboCount?: number;
  starsCollected: number;
  starsTotal: number;
  hasKey: boolean;
  hearts: number;
  maxHearts: number;
  bossHp: number;
  bossMaxHp: number;
  cameraX: number;
  cameraY: number;
  ambientDarkness?: number;
  ambientColor?: string;
  screenFlashAlpha?: number;
  screenFlashColor?: string;
  bgStars: BgStarDesc[];
  bgClouds: BgCloudDesc[];
  tiles: TileDesc[];
  entities: EntityDesc[];
  particles: ParticleDesc[];
  lights: LightDesc[];
  debugRects?: DebugRectDesc[];
  statusBanner: string;
  stage?: StageProgressInfo;
  bgmTheme?: BgmTheme;
  rpgHud?: RpgHudSnapshot;
}

export interface CartridgeInstance {
  step(dt: number, input: InputState, params: RuntimeParams): SimEvent[];
  snapshot(params: RuntimeParams): RenderSceneSnapshot;
  getStatus(): 'playing' | 'won' | 'lost';
  dispatchCommand?(commandId: string): SimEvent[];
  serializeSave?(): unknown;
  hydrateSave?(raw: unknown): boolean;
  retryStage?(): void;
}

export const DEFAULT_RUNTIME_PARAMS: RuntimeParams = {
  gravityScale: 1.0,
  moveSpeed: 96,
  jumpPower: 220,
  glowIntensity: 1.0,
  sparkleDensity: 1.0,
  enemyCount: 3,
  shakeScale: 1.0,
  cozyFilter: 1,
};

export const CARTRIDGE_PARAM_DEFS: CartridgeParamDef[] = [
  { key: 'gravityScale', label: '重力手感', min: 0.4, max: 1.6, step: 0.1, defaultValue: 1.0, unit: 'x' },
  { key: 'moveSpeed', label: '移動速度', min: 60, max: 150, step: 5, defaultValue: 96, unit: 'px/s' },
  { key: 'jumpPower', label: '跳躍彈力', min: 160, max: 290, step: 10, defaultValue: 220, unit: '' },
  { key: 'glowIntensity', label: 'GPU 光暈強度', min: 0, max: 1.8, step: 0.1, defaultValue: 1.0, unit: 'x' },
  { key: 'sparkleDensity', label: '星星特效粒子', min: 0.2, max: 2.0, step: 0.2, defaultValue: 1.0, unit: 'x' },
  { key: 'shakeScale', label: '震動打擊回饋', min: 0, max: 1.5, step: 0.25, defaultValue: 1.0, unit: 'x' },
  { key: 'enemyCount', label: '秘密基地怪物數', min: 0, max: 8, step: 1, defaultValue: 3, unit: '隻' },
];
