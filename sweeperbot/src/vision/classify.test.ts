/**
 * 用和游戏相同的颜色画一块小棋盘，确认切格和认格。
 * 再确认滚动拼接能把两张有重叠的图接上。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createImage, fillRect, type RGB } from '../image';
import { classifyGrid, findGrid } from './board';
import { DIGIT_COLORS, DIRT_LIGHT, FLAG_RED, FRAME, GRASS_DARK, GRASS_LIGHT, MINE_RED } from './colors';
import { bestVerticalShift, stitchVertical } from './stitch';

const DARK: RGB = { r: 15, g: 23, b: 42 };

function paintBoard(): { image: ReturnType<typeof createImage>; rows: number; cols: number } {
  const rows = 3;
  const cols = 4;
  const body = 22;
  const gap = 2;
  const pad = 8;
  const border = 3;
  const originX = 12;
  const originY = 14;
  const width = border * 2 + pad * 2 + cols * body + (cols - 1) * gap;
  const height = border * 2 + pad * 2 + rows * body + (rows - 1) * gap;
  const image = createImage(originX + width + 16, originY + height + 16, DARK);
  fillRect(image, originX, originY, width, height, FRAME);

  const kinds: Array<'grass' | 'flag' | 'zero' | 'd1' | 'd3' | 'd5' | 'd7' | 'd8' | 'mine'> = [
    'grass', 'flag', 'zero', 'd1',
    'd3', 'd5', 'd7', 'd8',
    'mine', 'grass', 'grass', 'flag',
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + border + pad + c * (body + gap);
      const y = originY + border + pad + r * (body + gap);
      const kind = kinds[r * cols + c];
      const grass = (r + c) % 2 === 0 ? GRASS_LIGHT : GRASS_DARK;
      if (kind === 'grass' || kind === 'flag') fillRect(image, x, y, body, body, grass);
      else if (kind === 'mine') fillRect(image, x, y, body, body, MINE_RED);
      else fillRect(image, x, y, body, body, DIRT_LIGHT);
      if (kind === 'flag') fillRect(image, x + 6, y + 4, 8, 8, FLAG_RED);
      const digit = kind === 'd1' ? 1 : kind === 'd3' ? 3 : kind === 'd5' ? 5 : kind === 'd7' ? 7 : kind === 'd8' ? 8 : 0;
      if (digit) fillRect(image, x + 6, y + 4, 10, 12, DIGIT_COLORS[digit]);
    }
  }
  return { image, rows, cols };
}

describe('findGrid / classifyGrid', () => {
  it('切开格子并认出草地、旗、数字和雷', () => {
    const { image, rows, cols } = paintBoard();
    const geom = findGrid(image);
    assert.ok(geom);
    assert.equal(geom.rows, rows);
    assert.equal(geom.cols, cols);
    const cells = classifyGrid(image, geom);
    assert.equal(cells[0][0].kind, 'hidden');
    assert.equal(cells[0][1].kind, 'flag');
    assert.deepEqual(cells[0][2], { kind: 'open', n: 0 });
    assert.deepEqual(cells[0][3], { kind: 'open', n: 1 });
    assert.deepEqual(cells[1][0], { kind: 'open', n: 3 });
    assert.deepEqual(cells[1][1], { kind: 'open', n: 5 });
    assert.deepEqual(cells[1][2], { kind: 'open', n: 7 });
    assert.deepEqual(cells[1][3], { kind: 'open', n: 8 });
    assert.equal(cells[2][0].kind, 'mine');
    assert.equal(cells[2][1].kind, 'hidden');
    assert.equal(cells[2][3].kind, 'flag');
  });
});

describe('stitchVertical', () => {
  it('按重叠把下面一张图接上，并找回实际位移', () => {
    const base = createImage(20, 24, { r: 8, g: 8, b: 8 });
    for (let y = 0; y < 24; y++) fillRect(base, 0, y, 20, 1, { r: y * 8, g: 0, b: 40 });
    const next = createImage(20, 24, { r: 0, g: 0, b: 0 });
    const truth = 10;
    for (let y = 0; y < 24; y++) {
      const src = truth + y;
      const color = src < 24 ? { r: src * 8, g: 0, b: 40 } : { r: 0, g: 200, b: 0 };
      fillRect(next, 0, y, 20, 1, color);
    }
    assert.equal(bestVerticalShift(base, next, 12, 6), truth);
    const stitched = stitchVertical(base, next, truth);
    assert.equal(stitched.height, truth + 24);
    assert.equal(stitched.width, 20);
  });
});
