/**
 * 这个游戏格子的配色。数值来自页面里写死的 Tailwind 颜色，认盘只比这些颜色。
 */
import type { RGB } from '../image';

/** 棋盘外框、内边距和格子之间的缝，#14532d */
export const FRAME: RGB = { r: 20, g: 83, b: 45 };

/** 未打开格子的两种草地 */
export const GRASS_LIGHT: RGB = { r: 74, g: 222, b: 128 };
export const GRASS_DARK: RGB = { r: 34, g: 197, b: 94 };

/** 已打开空地的两种泥土 */
export const DIRT_LIGHT: RGB = { r: 231, g: 203, b: 169 };
export const DIRT_DARK: RGB = { r: 219, g: 180, b: 132 };

/** 旗的红色，#dc2626 */
export const FLAG_RED: RGB = { r: 220, g: 38, b: 38 };

/** 踩雷后的底色 */
export const MINE_RED: RGB = { r: 239, g: 68, b: 68 };
export const MINE_RED_SOFT: RGB = { r: 248, g: 113, b: 113 };

/**
 * 数字 1–8 的字色，顺序与页面 NUMBER_COLORS 下标一致。
 * 0 没有字，只有泥土。
 */
export const DIGIT_COLORS: RGB[] = [
  { r: 0, g: 0, b: 0 },
  { r: 37, g: 99, b: 235 },
  { r: 22, g: 163, b: 74 },
  { r: 220, g: 38, b: 38 },
  { r: 126, g: 34, b: 206 },
  { r: 127, g: 29, b: 29 },
  { r: 14, g: 116, b: 144 },
  { r: 20, g: 20, b: 20 },
  { r: 75, g: 85, b: 99 },
];

/** 标题栏剩余雷数，text-red-400 #f87171 */
export const COUNTER_RED: RGB = { r: 248, g: 113, b: 113 };

/** 再来一局（赢）和设置页选中页签，emerald-600 #059669 */
export const EMERALD: RGB = { r: 5, g: 150, b: 105 };

/** 设置里的「开始新游戏」和昵称框右侧按钮，amber-600 #d97706 */
export const AMBER: RGB = { r: 217, g: 119, b: 6 };

/** 书本图标，amber-500，用来定位它右边的设置齿轮 */
export const AMBER_LIGHT: RGB = { r: 245, g: 158, b: 11 };

/** 失败弹层的按钮，slate-600 #475569 */
export const SLATE_BUTTON: RGB = { r: 71, g: 85, b: 105 };

export function isFrameGreen(color: RGB): boolean {
  // 草地阴影 #15803d 的绿通道更高，不能算进框。
  return color.g > 55 && color.g < 110 && color.r < 50 && color.b < 80 && color.g > color.r + 25 && color.g > color.b + 15;
}

export function isGrass(color: RGB): boolean {
  return color.g > 150 && color.g > color.r + 40 && color.g > color.b;
}

export function isDirt(color: RGB): boolean {
  return color.r > 170 && color.g > 130 && color.b > 90 && color.r > color.b + 40 && color.r >= color.g - 10 && color.g > color.b;
}

export function isFlagRed(color: RGB): boolean {
  return color.r > 160 && color.g < 80 && color.b < 80 && color.r > color.g + 80;
}

export function isMineBackground(color: RGB): boolean {
  return color.r > 200 && color.g >= 50 && color.g < 160 && color.b >= 50 && color.b < 160
    && Math.abs(color.g - color.b) < 45 && color.r > color.g + 70;
}

export function isCounterRed(color: RGB): boolean {
  return color.r > 190 && color.g > 70 && color.g < 170 && color.b > 70 && color.b < 170
    && color.r > color.g + 50 && Math.abs(color.g - color.b) < 45;
}

export function isEmerald(color: RGB): boolean {
  // 草地的绿比这个按钮亮得多，这里把草地排除掉。
  return color.r < 45 && color.g > 115 && color.g < 185 && color.b > 70 && color.b < 150
    && color.g > color.r + 70 && Math.abs(color.g - color.b) < 80;
}

export function isAmber(color: RGB): boolean {
  return color.r > 180 && color.g > 80 && color.g < 190 && color.b < 45 && color.r > color.g && color.g > color.b + 40;
}

export function isSlateButton(color: RGB): boolean {
  return Math.abs(color.r - SLATE_BUTTON.r) < 24
    && Math.abs(color.g - SLATE_BUTTON.g) < 24
    && Math.abs(color.b - SLATE_BUTTON.b) < 28
    && color.b + 8 > color.r;
}

/** 弹层外面那层压暗。卡片本身比这亮。 */
export function isOverlayDark(color: RGB): boolean {
  return color.r + color.g + color.b < 48 && color.r < 22;
}
