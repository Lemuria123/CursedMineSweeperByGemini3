/**
 * 四套界面。
 * cursed 是游戏原本的深色诅咒 + 绿草地，另外三套来自皮肤预览里选定的方案。
 * place 是设置页里灵魂相对骷髅的方位，颜色是该界面的代表色。
 */
export const SKIN_STORAGE_KEY = 'cms_skin';

export type SkinId = 'cursed' | 'abyss' | 'neon' | 'stone';

export type SkinPlace = 'up' | 'right' | 'down' | 'left';

export interface SkinChoice {
  id: SkinId;
  place: SkinPlace;
}

/** 上：原来的诅咒；右：深渊；下：街机；左：古庙 */
export const SKINS: SkinChoice[] = [
  { id: 'cursed', place: 'up' },
  { id: 'abyss', place: 'right' },
  { id: 'neon', place: 'down' },
  { id: 'stone', place: 'left' },
];

export function isSkinId(value: string | null): value is SkinId {
  return value === 'cursed' || value === 'abyss' || value === 'neon' || value === 'stone';
}
