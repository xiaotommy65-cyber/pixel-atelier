import { CloudberryHopGame } from './cartridges/cloudberryHop.ts';
import { DEFAULT_DND_MODULE_JSON, EmberkeepDndGame } from './cartridges/emberkeepDnd.ts';
import { DEFAULT_SANDBOX_SCRIPT, SandboxToyboxGame } from './cartridges/sandboxToybox.ts';
import { SugarStarlightGame } from './cartridges/sugarStarlight.ts';
import type { CartridgeId, CartridgeInstance, CartridgeMeta, RuntimeParams } from './WorldTypes.ts';

export interface CartridgeLaunchContext {
  sandboxScript: string;
  dndModuleJson: string;
  params: RuntimeParams;
}

export type CartridgeFactory = (ctx: CartridgeLaunchContext) => CartridgeInstance;

const CARTRIDGE_FACTORIES = new Map<CartridgeId, CartridgeFactory>([
  ['cloudberry-hop', () => new CloudberryHopGame()],
  ['sugar-starlight', () => new SugarStarlightGame()],
  ['sandbox-toybox', (ctx) => new SandboxToyboxGame(ctx.sandboxScript, ctx.params)],
  ['emberkeep-dnd', (ctx) => new EmberkeepDndGame(ctx.dndModuleJson)],
]);

export function registerCartridgeFactory(id: CartridgeId, factory: CartridgeFactory): void {
  CARTRIDGE_FACTORIES.set(id, factory);
}

export function createCartridgeInstance(id: CartridgeId, ctx: CartridgeLaunchContext): CartridgeInstance {
  const factory = CARTRIDGE_FACTORIES.get(id) ?? CARTRIDGE_FACTORIES.get('cloudberry-hop')!;
  return factory(ctx);
}

export const SANDBOX_DEFAULT_SCRIPT = DEFAULT_SANDBOX_SCRIPT;
export const DND_DEFAULT_MODULE_JSON = DEFAULT_DND_MODULE_JSON;

export interface WorkshopRecipe {
  label: string;
  code: string;
}

export const WORKSHOP_RECIPES: readonly WorkshopRecipe[] = [
  {
    label: '⭐ 黃金星雨配方',
    code: `// 滿滿黃金星星與粉紫晚霞！
api.setSky('#5979d6', '#ffd9e8');
api.setHeroSpawn(30, 118);
api.addCloud(70, 122, 3);
api.addCloud(176, 94, 4);
api.addSpring(56, 134);
api.addStar(84, 98);
api.addStar(118, 98);
api.addStar(190, 70);
api.addStar(224, 70);
api.addStar(258, 70);
api.addStar(284, 124);
api.addSlime(152, 134);`,
  },
  {
    label: '🍮 史萊姆派對',
    code: `// 果凍史萊姆大遊行！踩扁牠們或用彈簧跳躍！
api.setSky('#8ce0c4', '#fff5dc');
api.setHeroSpawn(24, 120);
api.addCloud(112, 114, 4);
api.addSpring(86, 134);
api.addStar(132, 90);
api.addStar(166, 90);
api.addSlime(96, 134);
api.addSlime(156, 134);
api.addSlime(216, 134);
api.addSlime(276, 134);`,
  },
  {
    label: '💣 連鎖爆破樂園',
    code: `// 推木箱或按 A 噴出火花，觸發炸彈連鎖爆破！
api.setSky('#5673b8', '#ffcf9f');
api.setHeroSpawn(24, 120);
api.addSpring(58, 134);
api.addCrate(96, 134);
api.addBomb(114, 134);
api.addBomb(132, 134);
api.addCrate(150, 134);
api.addCloud(172, 108, 4);
api.addStar(188, 86);
api.addStar(218, 86);
api.addStar(270, 122);
api.addSlime(182, 134);
api.addSlime(236, 134);`,
  },
  {
    label: '🕯️ 暗影地牢機關',
    code: `// 暗影地牢探險：推箱踩亮開關，靠火炬 GPU 光影尋找大門！
api.setSky('#141026', '#2a1d42');
api.setDarkness(0.76, '#0d091c');
api.setHeroSpawn(24, 120);
api.addWall(144, 102, 16, 48, 'stone');
api.addTorch(54, 134);
api.addTorch(196, 134);
api.addTorch(264, 134);
api.addCrate(88, 134);
api.addBomb(118, 134);
api.addSwitch(218, 134);
api.addCloud(112, 96, 3);
api.addStar(124, 74);
api.addStar(242, 118);
api.addSlime(174, 134);
api.addGate(286, 134);`,
  },
];

export const CARTRIDGES: readonly CartridgeMeta[] = [
  {
    id: 'cloudberry-hop',
    code: 'PA-01',
    title: '草莓雲海跳跳',
    subtitle: '跳躍冒險卡匣',
    genre: '平台冒險',
    accentHex: '#ff708d',
    badgeText: '繪本主角同步登場',
    controlsHint: '← → 移動・B / ↑ 跳躍・A 拋火花・F3 除錯框',
    goalHint: '踩扁史萊姆、彈簧飛躍拾取金鑰匙、打開彩虹大門！',
    defaultScript: DEFAULT_SANDBOX_SCRIPT,
  },
  {
    id: 'sugar-starlight',
    code: 'PA-02',
    title: '糖霜流星號',
    subtitle: '星海彈幕卡匣',
    genre: '橫向射擊',
    accentHex: '#5ec2f7',
    badgeText: '棉花糖飛碟 Boss 戰',
    controlsHint: '方向鍵飛行・B / A 發射星糖光束・F3 除錯框',
    goalHint: '吃星星升級散射砲、擊退果凍 UFO 與巨大棉花糖飛碟！',
    defaultScript: DEFAULT_SANDBOX_SCRIPT,
  },
  {
    id: 'sandbox-toybox',
    code: 'PA-03',
    title: '積木秘密基地',
    subtitle: '可改寫程式沙盒',
    genre: '創作工房',
    accentHex: '#56d39c',
    badgeText: '物理連鎖與地牢機關',
    controlsHint: '← → 推箱移動・B 跳躍・A 發射火花引爆炸彈！',
    goalHint: '去「積木工房」試試「連鎖爆破」或「暗影地牢機關」配方！',
    defaultScript: DEFAULT_SANDBOX_SCRIPT,
  },
  {
    id: 'emberkeep-dnd',
    code: 'PA-04',
    title: '龍與地城：餘燼',
    subtitle: 'd20 回合探索與 AI 託管',
    genre: 'CRPG 迷宮',
    accentHex: '#e0aaff',
    badgeText: 'd20 擲骰 × AI 代理',
    controlsHint: '方向鍵探索・A/B 選單指令・點擊右上「🤖 AI 託管」自動代駕！',
    goalHint: '通過法師檢定、開箱取鐵鑰匙開鎖、下 B2 擊敗餘燼幼龍！',
    defaultScript: DEFAULT_DND_MODULE_JSON,
  },
];

export function getCartridgeMeta(id: CartridgeId): CartridgeMeta {
  return CARTRIDGES.find((c) => c.id === id) ?? CARTRIDGES[0];
}
