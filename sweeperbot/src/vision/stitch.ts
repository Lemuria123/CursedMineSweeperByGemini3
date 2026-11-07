/**
 * 棋盘比窗口高时，把滚动后的几张截图按重叠条带拼回去。
 * 默认视口足够放下 25×16，这条路径是兜底。
 */
import { createImage, getPixel, luma, setPixel, type RgbaImage } from '../image';

function rowDiff(base: RgbaImage, next: RgbaImage, baseY: number, nextY: number): number {
  const width = Math.min(base.width, next.width);
  let score = 0;
  let samples = 0;
  for (let x = 0; x < width; x += 4) {
    score += Math.abs(luma(getPixel(base, x, baseY)) - luma(getPixel(next, x, nextY)));
    samples++;
  }
  return samples === 0 ? Number.POSITIVE_INFINITY : score / samples;
}

/**
 * next 的第 0 行对应 base 的哪一行。
 * expected 是滚轮大概滚过的像素，只在它附近搜索，避免拼到错误的周期（格子是重复花纹）。
 */
export function bestVerticalShift(base: RgbaImage, next: RgbaImage, expected: number, slack = 48): number {
  let best = Math.max(0, Math.min(base.height - 1, Math.round(expected)));
  let bestScore = Number.POSITIVE_INFINITY;
  const from = Math.max(0, best - slack);
  const to = Math.min(base.height - 1, best + slack);
  for (let shift = from; shift <= to; shift++) {
    const overlap = Math.min(base.height - shift, next.height, 96);
    if (overlap < 12) continue;
    let score = 0;
    let rows = 0;
    for (let row = 0; row < overlap; row += 2) {
      score += rowDiff(base, next, shift + row, row);
      rows++;
    }
    score /= rows;
    if (score < bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  return best;
}

/** 把 next 贴到 base 的 shift 行上，超出的部分加高画布。 */
export function stitchVertical(base: RgbaImage, next: RgbaImage, shift: number): RgbaImage {
  const width = Math.max(base.width, next.width);
  const height = Math.max(base.height, shift + next.height);
  const out = createImage(width, height, { r: 0, g: 0, b: 0 });
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) setPixel(out, x, y, getPixel(base, x, y));
  }
  const start = Math.max(0, shift);
  for (let y = start; y < shift + next.height; y++) {
    const srcY = y - shift;
    if (srcY < 0 || srcY >= next.height) continue;
    for (let x = 0; x < next.width; x++) setPixel(out, x, y, getPixel(next, x, srcY));
  }
  return out;
}
