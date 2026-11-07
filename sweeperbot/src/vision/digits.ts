/**
 * 读标题栏左侧的剩余雷数。
 * 模板是 Consolas 24px 粗体（与页面 font-mono text-2xl font-bold 一致），
 * 放在 sweeperbot/fixtures/0.png … 9.png。认的是字形，不是把数字画死在代码里。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, getPixel, type RgbaImage } from '../image';
import { isCounterRed } from './colors';

export interface DigitBlob {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TEMPLATE_W = 12;
const TEMPLATE_H = 16;

let templates: boolean[][][] | null = null;

function fixtureDir(): string {
  return fileURLToPath(new URL('../../fixtures/', import.meta.url));
}

function inkPoints(image: RgbaImage, x: number, y: number, w: number, h: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  for (let yy = Math.max(0, y); yy < y1; yy++) {
    for (let xx = Math.max(0, x); xx < x1; xx++) {
      if (isCounterRed(getPixel(image, xx, yy))) points.push({ x: xx, y: yy });
    }
  }
  return points;
}

/** 把一块墨点缩成固定大小的二值图，方便和模板比。 */
export function rasterize(points: Array<{ x: number; y: number }>, width: number, height: number): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < TEMPLATE_H; y++) grid.push(new Array(TEMPLATE_W).fill(false));
  if (points.length === 0 || width <= 0 || height <= 0) return grid;
  for (const point of points) {
    const gx = Math.min(TEMPLATE_W - 1, Math.floor((point.x / width) * TEMPLATE_W));
    const gy = Math.min(TEMPLATE_H - 1, Math.floor((point.y / height) * TEMPLATE_H));
    grid[gy][gx] = true;
  }
  return grid;
}

function loadTemplates(): boolean[][][] {
  if (templates) return templates;
  const dir = fixtureDir();
  templates = [];
  for (let digit = 0; digit <= 9; digit++) {
    const image = decodePng(fs.readFileSync(path.join(dir, `${digit}.png`)));
    templates.push(rasterOfImage(image));
  }
  return templates;
}

function rasterOfBlob(image: RgbaImage, blob: DigitBlob): boolean[][] {
  const points = inkPoints(image, blob.x, blob.y, blob.w, blob.h);
  if (points.length === 0) return rasterize([], 1, 1);
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  return rasterize(
    points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    maxX - minX + 1,
    maxY - minY + 1,
  );
}

function rasterOfImage(image: RgbaImage): boolean[][] {
  return rasterOfBlob(image, { x: 0, y: 0, w: image.width, h: image.height });
}

/**
 * 用当前浏览器画出来的 0–9 替换模板。
 * 游戏标题栏走的是同一套字体渲染，比系统 GDI 画的模板更接近实机。
 * 不足 10 个色块时保持原模板。
 */
export function installTemplates(image: RgbaImage): boolean {
  const blobs = blobsIn(image, 0, 0, image.width, image.height)
    .filter((blob) => blob.h > 8)
    .sort((a, b) => a.x - b.x);
  if (blobs.length !== 10) return false;
  templates = blobs.map((blob) => rasterOfBlob(image, blob));
  return true;
}

function score(grid: boolean[][], template: boolean[][]): number {
  let same = 0;
  const total = TEMPLATE_W * TEMPLATE_H;
  for (let y = 0; y < TEMPLATE_H; y++) {
    for (let x = 0; x < TEMPLATE_W; x++) if (grid[y][x] === template[y][x]) same++;
  }
  return same / total;
}

/** 一块墨点最像哪个数字。对不上返回 null。 */
export function matchDigit(image: RgbaImage, blob: DigitBlob): number | null {
  const grid = rasterOfBlob(image, blob);
  const ink = grid.flat().filter(Boolean).length;
  if (ink < 4) return null;
  const bank = loadTemplates();
  let best = 0;
  let bestScore = -1;
  let second = -1;
  for (let digit = 0; digit <= 9; digit++) {
    const value = score(grid, bank[digit]);
    if (value > bestScore) {
      second = bestScore;
      bestScore = value;
      best = digit;
    } else if (value > second) second = value;
  }
  // 同一张模板自比应接近 1。实机抗锯齿会低一些，但必须明显胜过第二名。
  if (bestScore < 0.62 || bestScore - second < 0.03) return null;
  return best;
}

function blobsIn(image: RgbaImage, x: number, y: number, w: number, h: number): DigitBlob[] {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  if (regionW <= 0 || regionH <= 0) return [];
  const seen = new Uint8Array(regionW * regionH);
  const found: DigitBlob[] = [];
  const index = (px: number, py: number) => (py - y0) * regionW + (px - x0);

  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const start = index(xx, yy);
      if (seen[start]) continue;
      if (!isCounterRed(getPixel(image, xx, yy))) {
        seen[start] = 1;
        continue;
      }
      let minX = xx;
      let maxX = xx;
      let minY = yy;
      let maxY = yy;
      let area = 0;
      const queue = [start];
      seen[start] = 1;
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const cx = x0 + (cur % regionW);
        const cy = y0 + Math.floor(cur / regionW);
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const ni = index(nx, ny);
          if (seen[ni]) continue;
          seen[ni] = 1;
          if (isCounterRed(getPixel(image, nx, ny))) queue.push(ni);
        }
      }
      if (area >= 12) found.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }
  found.sort((a, b) => a.x - b.x);
  return found;
}

/**
 * 两个数字粘在一起时，按列投影上最瘦的那一刀切开。
 * tracking-widest 通常已经分开了，这里是防粘连。
 */
function splitWide(image: RgbaImage, blob: DigitBlob): DigitBlob[] {
  if (blob.w < blob.h * 1.35) return [blob];
  const columns: number[] = [];
  for (let x = 0; x < blob.w; x++) {
    let count = 0;
    for (let y = 0; y < blob.h; y++) {
      if (isCounterRed(getPixel(image, blob.x + x, blob.y + y))) count++;
    }
    columns.push(count);
  }
  let cut = 1;
  let best = columns[1];
  for (let x = 2; x < columns.length - 1; x++) {
    if (columns[x] < best) {
      best = columns[x];
      cut = x;
    }
  }
  if (best > blob.h * 0.35) return [blob];
  return [
    { x: blob.x, y: blob.y, w: cut, h: blob.h },
    { x: blob.x + cut + 1, y: blob.y, w: blob.w - cut - 1, h: blob.h },
  ];
}

/**
 * 读剩余雷数。只在画面上半部、偏左找粉红色等宽数字，
 * 避免把棋盘上的红旗和红色数字算进来。
 */
export function readMineCounter(image: RgbaImage): number | null {
  const searchH = Math.min(260, image.height);
  const searchW = Math.max(1, Math.floor(image.width * 0.62));
  const blobs = blobsIn(image, 0, 0, searchW, searchH).flatMap((blob) => splitWide(image, blob));
  if (blobs.length < 1 || blobs.length > 3) return null;
  let text = '';
  for (const blob of blobs) {
    const digit = matchDigit(image, blob);
    if (digit === null) return null;
    text += String(digit);
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 999) return null;
  return value;
}

/** 雷数数字的垂直中心，用来点同一行正中的重置笑脸。 */
export function counterAnchorY(image: RgbaImage): number | null {
  const searchH = Math.min(260, image.height);
  const searchW = Math.max(1, Math.floor(image.width * 0.62));
  const blobs = blobsIn(image, 0, 0, searchW, searchH);
  if (blobs.length === 0) return null;
  return blobs[0].y + Math.round(blobs[0].h / 2);
}
