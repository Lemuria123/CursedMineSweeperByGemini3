/**
 * 认弹层和两个固定按钮：设置齿轮、重置用的笑脸。
 * 全部靠色块的位置和大小，不读按钮上的文字，这样换语言也不会点错。
 */
import { getPixel, type RgbaImage } from '../image';
import { isAmber, isEmerald, isOverlayDark, isSlateButton } from './colors';

export interface Point {
  x: number;
  y: number;
}

export interface Blob {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  cx: number;
  cy: number;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'win'; again: Point }
  | { kind: 'loss'; again: Point }
  | { kind: 'nickname'; skip: Point }
  | { kind: 'settings'; tabs: [Point, Point, Point]; start: Point };

function center(blob: Blob): Point {
  return { x: blob.cx, y: blob.cy };
}

/** 找出某种颜色的实心色块。文字笔画很稀，用填充率排除。 */
export function colorBlobs(
  image: RgbaImage,
  match: (r: number, g: number, b: number) => boolean,
  bounds?: { x: number; y: number; w: number; h: number },
): Blob[] {
  const x0 = bounds?.x ?? 0;
  const y0 = bounds?.y ?? 0;
  const x1 = Math.min(image.width, x0 + (bounds?.w ?? image.width));
  const y1 = Math.min(image.height, y0 + (bounds?.h ?? image.height));
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  if (regionW <= 0 || regionH <= 0) return [];
  const seen = new Uint8Array(regionW * regionH);
  const blobs: Blob[] = [];
  const index = (x: number, y: number) => (y - y0) * regionW + (x - x0);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const start = index(x, y);
      if (seen[start]) continue;
      const color = getPixel(image, x, y);
      if (!match(color.r, color.g, color.b)) {
        seen[start] = 1;
        continue;
      }
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
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
        const next = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
        ];
        for (const [nx, ny] of next) {
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const ni = index(nx, ny);
          if (seen[ni]) continue;
          seen[ni] = 1;
          const near = getPixel(image, nx, ny);
          if (match(near.r, near.g, near.b)) queue.push(ni);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (area < w * h * 0.45) continue;
      blobs.push({ x: minX, y: minY, w, h, area, cx: Math.round((minX + maxX) / 2), cy: Math.round((minY + maxY) / 2) });
    }
  }
  return blobs;
}

function inMiddle(image: RgbaImage, blob: Blob): boolean {
  return blob.cx > image.width * 0.2 && blob.cx < image.width * 0.8
    && blob.cy > image.height * 0.15 && blob.cy < image.height * 0.9;
}

/** 从页签中心向左右走到压暗区域，得到设置卡片的左右边，再把内部分成三等份。 */
function difficultyTabs(image: RgbaImage, tab: Blob): [Point, Point, Point] | null {
  const y = tab.cy;
  let left = tab.x;
  let right = tab.x + tab.w;
  while (left > 1) {
    const color = getPixel(image, left - 1, y);
    if (isOverlayDark(color)) break;
    left--;
  }
  while (right < image.width - 1) {
    const color = getPixel(image, right + 1, y);
    if (isOverlayDark(color)) break;
    right++;
  }
  const innerLeft = left + 20;
  const innerRight = right - 20;
  if (innerRight - innerLeft < 180) return null;
  const width = (innerRight - innerLeft) / 3;
  return [0, 1, 2].map((index) => ({
    x: Math.round(innerLeft + width * index + width / 2),
    y,
  })) as [Point, Point, Point];
}

/** 设置页难度钮底色接近 slate-800；选中时才是翠绿。 */
function isDiffChrome(color: { r: number; g: number; b: number }): boolean {
  if (isEmerald(color) || isSlateButton(color)) return true;
  return color.r < 55 && color.g < 60 && color.b < 85 && color.b >= color.r && color.g + 5 >= color.r;
}

/** 新设置页：左边竖排三个难度方钮，右边是加减雷和小勾「开始」。 */
function looksLikeDiffButton(image: RgbaImage, x: number, y: number): boolean {
  if (x < 2 || y < 2 || x >= image.width - 2 || y >= image.height - 2) return false;
  let hits = 0;
  for (let dy = -4; dy <= 4; dy += 2) {
    for (let dx = -4; dx <= 4; dx += 2) {
      if (isDiffChrome(getPixel(image, x + dx, y + dy))) hits++;
    }
  }
  return hits >= 8;
}

function verticalDifficultyTabs(image: RgbaImage, active: Blob): [Point, Point, Point] {
  const pitch = active.h + 8;
  let above = 0;
  for (let step = 1; step <= 2; step++) {
    if (looksLikeDiffButton(image, active.cx, active.cy - step * pitch)) above = step;
    else break;
  }
  const topY = active.cy - above * pitch;
  return [0, 1, 2].map((index) => ({
    x: active.cx,
    y: Math.round(topY + index * pitch),
  })) as [Point, Point, Point];
}

/** 没有翠绿高亮时，按小勾按钮左边的固定相对位置估出三档。 */
function tabsFromStartChip(start: Blob): [Point, Point, Point] {
  const pitch = 46;
  const x = start.cx - 279;
  const topY = start.cy - 96;
  return [0, 1, 2].map((index) => ({
    x: Math.round(x),
    y: Math.round(topY + index * pitch),
  })) as [Point, Point, Point];
}

export function detectOverlay(image: RgbaImage): Overlay {
  const emeralds = colorBlobs(image, (r, g, b) => isEmerald({ r, g, b }));
  const ambers = colorBlobs(image, (r, g, b) => isAmber({ r, g, b }));
  const slates = colorBlobs(image, (r, g, b) => isSlateButton({ r, g, b }));

  // 新 UI：琥珀色小勾约 40×40。选中难度不一定有翠绿高亮（重开设置后常见），不能硬依赖它。
  const startChip = ambers.find((blob) => blob.w >= 28 && blob.w <= 55 && blob.h >= 28 && blob.h <= 55 && inMiddle(image, blob));
  if (startChip) {
    // 相对小勾的固定偏移在两套截图上都稳；翠绿高亮重开后常消失，不能靠它推三档位置。
    const tabs = tabsFromStartChip(startChip);
    return { kind: 'settings', tabs, start: center(startChip) };
  }

  // 旧 UI：底部整宽琥珀色「开始」+ 横排页签（沙盒旧快照仍可能碰到）。
  const wideAmber = ambers.find((blob) => blob.w > 220 && blob.h > 28 && blob.h < 90 && inMiddle(image, blob));
  if (wideAmber) {
    const tab = emeralds.find((blob) => blob.w > 80 && blob.w < 220 && blob.h > 26 && blob.h < 70);
    const tabs = tab ? difficultyTabs(image, tab) : null;
    if (tabs) return { kind: 'settings', tabs, start: center(wideAmber) };
  }

  const wideEmerald = emeralds.find((blob) => blob.w > 200 && blob.h > 28 && blob.h < 90 && inMiddle(image, blob));
  if (wideEmerald) return { kind: 'win', again: center(wideEmerald) };

  const halfAmber = ambers.find((blob) => blob.w > 90 && blob.w <= 220 && blob.h > 28 && blob.h < 90 && inMiddle(image, blob));
  if (halfAmber) {
    // 右侧是保存，左侧同宽的那颗是跳过。
    return {
      kind: 'nickname',
      skip: { x: Math.round(halfAmber.x - 12 - halfAmber.w / 2), y: halfAmber.cy },
    };
  }

  const lossButton = slates.find((blob) => blob.w > 200 && blob.h > 28 && blob.h < 90 && inMiddle(image, blob));
  if (lossButton) return { kind: 'loss', again: center(lossButton) };
  return { kind: 'none' };
}

/**
 * 设置齿轮在顶栏卡片的右上角，和橙色标题同一行。
 * 书本在左边，标题本身也是橙色，不能把标题最后一个字当成书本再往右偏。
 * 卡片在 md 宽度是 512px 居中，齿轮贴在右内边距上。
 */
export function findSettingsGear(image: RgbaImage): Point {
  const titles = colorBlobs(
    image,
    (r, g, b) => isAmber({ r, g, b }),
    { x: Math.floor(image.width * 0.25), y: 0, w: Math.floor(image.width * 0.5), h: 90 },
  ).filter((blob) => blob.area >= 20 && blob.h >= 8);
  const titleY = titles.length
    ? Math.round(titles.reduce((sum, blob) => sum + blob.cy * blob.area, 0) / titles.reduce((sum, blob) => sum + blob.area, 0))
    : 48;
  // 512/2 - 左右内边距 16 - 按钮半宽 18
  return { x: Math.round(image.width / 2 + 222), y: titleY };
}

/**
 * 笑脸在标题栏正中，和左侧红色雷数同一高度。
 * 卡住时点它重开。弹层打开时它被盖住，不能点。
 */
export function findResetFace(image: RgbaImage, counterY: number | null): Point {
  return { x: Math.round(image.width / 2), y: counterY ?? 120 };
}
