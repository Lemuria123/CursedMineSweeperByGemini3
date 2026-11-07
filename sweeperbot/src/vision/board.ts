/**
 * 从整张截图里找出棋盘，再按颜色把每一格分成未开、旗、数字或雷。
 * 不使用 OCR，也不读 DOM。
 */
import { getPixel, luma, type RGB, type RgbaImage } from '../image';
import { colorDist } from '../image';
import {
  DIGIT_COLORS,
  DIRT_DARK,
  DIRT_LIGHT,
  isDirt,
  isFlagRed,
  isFrameGreen,
  isGrass,
  isMineBackground,
} from './colors';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridGeom {
  rows: number;
  cols: number;
  rects: Rect[][];
  frame: Rect;
}

export type ClassifiedCell =
  | { kind: 'hidden' }
  | { kind: 'flag' }
  | { kind: 'mine' }
  | { kind: 'open'; n: number }
  | { kind: 'unknown' };

interface FrameHit {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 绿框外接矩形。只保留最大的一块，避免零星绿点把范围拉歪。 */
function largestFrame(image: RgbaImage): Rect | null {
  const { width, height } = image;
  const seen = new Uint8Array(width * height);
  let best: FrameHit | null = null;

  const tryStart = (sx: number, sy: number) => {
    const start = sy * width + sx;
    if (seen[start]) return;
    if (!isFrameGreen(getPixel(image, sx, sy))) {
      seen[start] = 1;
      return;
    }
    let minX = sx;
    let maxX = sx;
    let minY = sy;
    let maxY = sy;
    let area = 0;
    const queue: number[] = [start];
    seen[start] = 1;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const x = cur % width;
      const y = (cur - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const next: number[] = [];
      if (x > 0) next.push(cur - 1);
      if (x + 1 < width) next.push(cur + 1);
      if (y > 0) next.push(cur - width);
      if (y + 1 < height) next.push(cur + width);
      for (const n of next) {
        if (seen[n]) continue;
        const nx = n % width;
        const ny = (n - nx) / width;
        if (!isFrameGreen(getPixel(image, nx, ny))) {
          seen[n] = 1;
          continue;
        }
        seen[n] = 1;
        queue.push(n);
      }
    }
    if (!best || area > best.area) best = { area, minX, minY, maxX, maxY };
  };

  // 先隔行找种子。框至少有几像素厚，隔 2 像素不会漏掉整块棋盘。
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) tryStart(x, y);
  }
  if (!best || best.area < 200) return null;
  return { x: best.minX, y: best.minY, w: best.maxX - best.minX + 1, h: best.maxY - best.minY + 1 };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * 按「有内容 / 无内容」切条带。
 * unitHint：另一轴已经量到的单格尺寸。列缝被泥土盖住后，列宽中位数会漂到 2～8 格宽，
 * 真单列会被当成残边丢掉；这时必须用行高（格子近似正方形）当格宽基准。
 */
function contentBands(
  length: number,
  isContent: (index: number) => boolean,
  unitHint?: number,
): Array<{ start: number; length: number }> {
  const bands: Array<{ start: number; length: number; gapBefore: number }> = [];
  let start = -1;
  let lastEnd = 0;
  for (let i = 0; i <= length; i++) {
    const content = i < length && isContent(i);
    if (content && start < 0) start = i;
    if (!content && start >= 0) {
      const size = i - start;
      if (size >= 8) bands.push({ start, length: size, gapBefore: start - lastEnd });
      lastEnd = i;
      start = -1;
    }
  }
  if (bands.length === 0) return [];
  const widths = bands.map((band) => band.length).sort((a, b) => a - b);
  // 没有另一轴提示时，取「接近最窄条」那一簇的中位数，避免粘列把中位数抬到 96/144。
  const minWidth = widths[0];
  const singleish = widths.filter((width) => width <= minWidth * 1.55);
  const measured = medianOf(singleish.length > 0 ? singleish : widths);
  const median = unitHint && unitHint >= 8 ? unitHint : measured;
  const gaps = bands.map((band) => band.gapBefore).filter((gap) => gap >= 1 && gap <= 6).sort((a, b) => a - b);
  // 粘在一起的格子里还夹着缝。格宽要加上这条缝，否则会多切出一格。
  const gap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 2;
  const pitch = median + gap;
  const kept: Array<{ start: number; length: number }> = [];
  for (const band of bands) {
    // 外框残边偶尔会剩下一窄条，丢掉和正常格子差太远的。
    if (band.length <= median * 0.6) continue;
    if (band.length < median * 1.6) {
      kept.push(band);
      continue;
    }
    // 翻开的泥土会盖住深绿缝，好几格会粘成一条。按正常格宽切开，不能整条丢掉。
    const parts = Math.max(2, Math.round((band.length + gap) / pitch));
    for (let i = 0; i < parts; i++) {
      const pieceStart = band.start + Math.round((i * band.length) / parts);
      const pieceEnd = band.start + Math.round(((i + 1) * band.length) / parts);
      kept.push({ start: pieceStart, length: pieceEnd - pieceStart });
    }
  }
  return kept;
}

/**
 * 格子之间有约 2px 的深绿缝，格子内部不是这个颜色。
 * 某一列如果大部分是深绿，就是缝或外框；连续的非缝就是一列格子。
 */
export function findGrid(image: RgbaImage): GridGeom | null {
  const frame = largestFrame(image);
  if (!frame) return null;

  const columnContent = (x: number): boolean => {
    let green = 0;
    let total = 0;
    for (let y = frame.y; y < frame.y + frame.h; y += 2) {
      total++;
      if (isFrameGreen(getPixel(image, x, y))) green++;
    }
    return total > 0 && green / total < 0.45;
  };
  const rowContent = (y: number): boolean => {
    let green = 0;
    let total = 0;
    for (let x = frame.x; x < frame.x + frame.w; x += 2) {
      total++;
      if (isFrameGreen(getPixel(image, x, y))) green++;
    }
    return total > 0 && green / total < 0.45;
  };

  // 先切行：横缝基本还在，行高可靠。再拿行高当列宽提示，切开泥土粘住的竖列。
  const rowBands = contentBands(frame.h, (offset) => rowContent(frame.y + offset));
  const rowUnit = rowBands.length > 0 ? medianOf(rowBands.map((band) => band.length)) : undefined;
  const cols = contentBands(frame.w, (offset) => columnContent(frame.x + offset), rowUnit).map((band) => ({
    x: frame.x + band.start,
    w: band.length,
  }));
  const rows = rowBands.map((band) => ({
    y: frame.y + band.start,
    h: band.length,
  }));
  if (cols.length < 2 || rows.length < 2) return null;

  const rects: Rect[][] = rows.map((row) => cols.map((col) => ({ x: col.x, y: row.y, w: col.w, h: row.h })));
  return { rows: rows.length, cols: cols.length, rects, frame };
}

export function frameTouchesEdge(image: RgbaImage, frame: Rect, margin = 6): boolean {
  return frame.x <= margin
    || frame.y <= margin
    || frame.x + frame.w >= image.width - margin
    || frame.y + frame.h >= image.height - margin;
}

function sampleRect(image: RgbaImage, rect: Rect, inset: number): RGB[] {
  const pixels: RGB[] = [];
  const x0 = rect.x + inset;
  const y0 = rect.y + inset;
  const x1 = rect.x + rect.w - inset;
  const y1 = rect.y + rect.h - inset;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) pixels.push(getPixel(image, x, y));
  }
  return pixels;
}

function dirtDistance(color: RGB): number {
  if (isDirt(color)) return 0;
  return Math.min(colorDist(color, DIRT_LIGHT), colorDist(color, DIRT_DARK));
}

function hueOf(color: RGB): number {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === color.r) hue = ((color.g - color.b) / delta) % 6;
  else if (max === color.g) hue = (color.b - color.r) / delta + 2;
  else hue = (color.r - color.g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

/**
 * 泥土上的墨点归到 1–8。
 * 3/5 靠亮度，7/8 靠饱和度；核心像素取离泥土最远的那一半，避免抗锯齿把暗红色抬亮。
 */
export function classifyDigit(core: RGB[]): number {
  if (core.length === 0) return 0;
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const color of core) {
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const light = luma(color);
    let digit: number;
    if (sat < 0.32) digit = light < 48 ? 7 : 8;
    else {
      const hue = hueOf(color);
      if (hue < 18 || hue >= 345) digit = light >= 85 ? 3 : 5;
      else if (hue < 75) digit = light >= 85 ? 3 : 5;
      else if (hue < 170) digit = 2;
      else if (hue < 205) digit = 6;
      else if (hue < 255) digit = 1;
      else digit = 4;
    }
    buckets[digit]++;
  }
  let best = 1;
  for (let n = 2; n <= 8; n++) if (buckets[n] > buckets[best]) best = n;
  const ambiguous = (n: number) => n === 3 || n === 5 || n === 7 || n === 8;
  let second = best === 1 ? 2 : 1;
  for (let n = 1; n <= 8; n++) if (n !== best && buckets[n] > buckets[second]) second = n;
  if (ambiguous(best) && ambiguous(second) && buckets[second] > buckets[best] * 0.75) {
    // 颜色票数接近时，用墨点形状把 8（两个孔）和其余分开，再用亮度分 3/5/7。
    return shapeTieBreak(core, best, second);
  }
  return best;
}

function shapeTieBreak(core: RGB[], best: number, second: number): number {
  const lights = core.map((color) => luma(color));
  lights.sort((a, b) => a - b);
  const mid = lights[Math.floor(lights.length / 2)];
  const candidates = [best, second];
  if (mid < 48 && candidates.includes(7)) return 7;
  if (mid >= 85 && candidates.includes(3)) return 3;
  if (mid < 85 && candidates.includes(5)) return 5;
  return best;
}

export function classifyCell(image: RgbaImage, rect: Rect): ClassifiedCell {
  const pixels = sampleRect(image, rect, 2);
  if (pixels.length === 0) return { kind: 'unknown' };
  let grass = 0;
  let dirt = 0;
  let mine = 0;
  let flag = 0;
  for (const color of pixels) {
    if (isMineBackground(color)) mine++;
    else if (isGrass(color)) grass++;
    else if (isDirt(color)) dirt++;
    if (isFlagRed(color)) flag++;
  }
  const total = pixels.length;
  // 踩雷格的底是整格红色，旗只是草地上的一小块红。
  if (mine / total > 0.28) return { kind: 'mine' };
  if (grass / total > 0.4) {
    if (flag / total > 0.015) return { kind: 'flag' };
    return { kind: 'hidden' };
  }
  if (dirt / total > 0.35) {
    const ink = pixels
      .map((color) => ({ color, distance: dirtDistance(color) }))
      .filter((item) => item.distance > 42 && !isDirt(item.color));
    if (ink.length < 8) return { kind: 'open', n: 0 };
    ink.sort((a, b) => b.distance - a.distance);
    const core = ink.slice(0, Math.max(8, Math.ceil(ink.length / 2))).map((item) => item.color);
    return { kind: 'open', n: classifyDigit(core) };
  }
  return { kind: 'unknown' };
}

export function classifyGrid(image: RgbaImage, geom: GridGeom): ClassifiedCell[][] {
  return geom.rects.map((row) => row.map((rect) => classifyCell(image, rect)));
}

/** 给等待画面稳定用，不需要加密级别，只要格子变了哈希就变。 */
export function hashRegion(image: RgbaImage, rect: Rect): number {
  let hash = 2166136261;
  const x1 = Math.min(image.width, rect.x + rect.w);
  const y1 = Math.min(image.height, rect.y + rect.h);
  for (let y = Math.max(0, rect.y); y < y1; y += 8) {
    for (let x = Math.max(0, rect.x); x < x1; x += 8) {
      const color = getPixel(image, x, y);
      hash = Math.imul(hash ^ color.r, 16777619);
      hash = Math.imul(hash ^ color.g, 16777619);
      hash = Math.imul(hash ^ color.b, 16777619);
    }
  }
  return hash >>> 0;
}

/** 测试和注释用：确认字色表没有漏。 */
export function digitColor(n: number): RGB {
  return DIGIT_COLORS[n];
}
