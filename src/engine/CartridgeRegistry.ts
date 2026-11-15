import { DEFAULT_SANDBOX_SCRIPT } from './cartridges/sandboxToybox.ts';
import type { CartridgeId, CartridgeMeta } from './WorldTypes.ts';

export const CARTRIDGES: readonly CartridgeMeta[] = [
  {
    id: 'cloudberry-hop',
    code: 'PA-01',
    title: '草莓雲海跳跳',
    subtitle: '跳躍冒險卡匣',
    genre: '平台冒險',
    accentHex: '#ff708d',
    badgeText: '繪本主角同步登場',
    controlsHint: '← → 移動・B / ↑ / 空白鍵 跳躍',
    goalHint: '踩扁史萊姆、拾取高空金鑰匙、打開彩虹大門！',
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
    controlsHint: '方向鍵飛行・B / A 發射星糖光束',
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
    badgeText: '即時改程式立即玩',
    controlsHint: '← → 移動・B 跳躍・A 放煙火',
    goalHint: '前往「積木工房」改寫天空色調、雲朵台與星星位置！',
    defaultScript: DEFAULT_SANDBOX_SCRIPT,
  },
];

export function getCartridgeMeta(id: CartridgeId): CartridgeMeta {
  return CARTRIDGES.find((c) => c.id === id) ?? CARTRIDGES[0];
}
