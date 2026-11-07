/**
 * 拿到能看清整盘的图。
 * 视口够大时就是当前画面；绿框贴边时先滚动，仍放不下再按重叠拼起来。
 * 点击坐标一律换回「当前视口」里的位置，拼图只用于认格子。
 */
import { crop, type RgbaImage } from '../image';
import { findGrid, frameTouchesEdge, hashRegion } from '../vision/board';
import { counterAnchorY } from '../vision/digits';
import { findResetFace } from '../vision/overlay';
import { bestVerticalShift, stitchVertical } from '../vision/stitch';
import type { GameSession } from './session';

export interface Point {
  x: number;
  y: number;
}

export interface Playfield {
  /** 用来认格子的图。没滚动时就是整个视口。 */
  image: RgbaImage;
  /** 视口原图，用来认弹层、雷数和笑脸。滚动拼接不会把它裁掉。 */
  viewport: RgbaImage;
  expose(x: number, y: number): Promise<Point>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Strip {
  image: RgbaImage;
  /** 这条带的第 0 行，在最终拼图里的 y */
  origin: number;
}

/**
 * 固定标题不跟着棋盘滚，对齐时只取标题下面的区域，否则静态标题会把位移拉回 0。
 */
function scrollCut(viewport: RgbaImage): number {
  const anchor = counterAnchorY(viewport);
  return findResetFace(viewport, anchor).y + 70;
}

export async function grabPlayfield(session: GameSession): Promise<Playfield> {
  const viewport = await session.screenshot();
  const grid = findGrid(viewport);
  if (!grid || !frameTouchesEdge(viewport, grid.frame)) {
    return {
      image: viewport,
      viewport,
      expose: async (x, y) => ({ x, y }),
    };
  }
  return stitchScrolledBoard(session, viewport);
}

async function stitchScrolledBoard(session: GameSession, first: RgbaImage): Promise<Playfield> {
  const cut = scrollCut(first);
  // 先滚到顶，作为拼图的 0 点。滚不动（两张图一样）就停。
  let top = first;
  for (let i = 0; i < 8; i++) {
    await session.wheel(Math.round(first.width / 2), Math.round((cut + first.height) / 2), -650);
    await sleep(90);
    const shot = await session.screenshot();
    if (hashRegion(shot, { x: 0, y: cut, w: shot.width, h: shot.height - cut })
      === hashRegion(top, { x: 0, y: cut, w: top.width, h: top.height - cut })) break;
    top = shot;
  }

  const strips: Strip[] = [];
  let current = top;
  strips.push({ image: crop(current, 0, cut, current.width, current.height - cut), origin: 0 });

  for (let i = 0; i < 8; i++) {
    const geom = findGrid(current);
    const closed = geom && !frameTouchesEdge(current, geom.frame, 4);
    if (closed && i > 0) break;
    if (closed && i === 0) {
      return { image: current, viewport: current, expose: async (x, y) => ({ x, y }) };
    }
    await session.wheel(Math.round(current.width / 2), Math.round((cut + current.height) / 2), 420);
    await sleep(100);
    const next = await session.screenshot();
    const prevStrip = strips[strips.length - 1].image;
    const nextStrip = crop(next, 0, cut, next.width, next.height - cut);
    if (hashRegion(prevStrip, { x: 0, y: 0, w: prevStrip.width, h: prevStrip.height })
      === hashRegion(nextStrip, { x: 0, y: 0, w: nextStrip.width, h: nextStrip.height })) break;
    const delta = bestVerticalShift(prevStrip, nextStrip, 420);
    const origin = strips[strips.length - 1].origin + delta;
    strips.push({ image: nextStrip, origin });
    current = next;
  }

  let image = strips[0].image;
  for (let i = 1; i < strips.length; i++) image = stitchVertical(image, strips[i].image, strips[i].origin);

  // 拼完后页面停在最后一条。点击时再滚回那一格所在的带。
  let pageAt = strips[strips.length - 1]?.origin ?? 0;
  return {
    image,
    viewport: current,
    expose: async (x, y) => {
      let host = strips[0];
      for (const strip of strips) {
        if (y >= strip.origin && y < strip.origin + strip.image.height) host = strip;
      }
      const delta = host.origin - pageAt;
      if (Math.abs(delta) > 4) {
        await session.wheel(Math.round(current.width / 2), Math.round((cut + current.height) / 2), delta);
        await sleep(90);
        pageAt = host.origin;
      }
      return { x, y: cut + (y - host.origin) };
    },
  };
}
