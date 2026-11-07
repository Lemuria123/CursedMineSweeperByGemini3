/**
 * 求解器单测。局面用字符画：`.` 未开，`F` 旗，`0`–`8` 已打开的数字。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deduce, type SeenBoard, type SeenCell } from './deduce';
import { recommendedMines } from './mines';

function board(rows: string[], mines: number): SeenBoard {
  const cells: SeenCell[][] = rows.map((line) => [...line].map((ch) => {
    if (ch === '.') return { kind: 'hidden' };
    if (ch === 'F') return { kind: 'flag' };
    if (ch >= '0' && ch <= '8') return { kind: 'open', n: Number(ch) };
    throw new Error(`不认识的格子「${ch}」`);
  }));
  return { rows: cells.length, cols: cells[0].length, cells, mines };
}

function spots(moves: Array<{ row: number; col: number }>): string[] {
  return moves.map((move) => `${move.row},${move.col}`).sort();
}

describe('recommendedMines', () => {
  it('三档预设和游戏用的密度公式一致', () => {
    assert.equal(recommendedMines(9, 9), 19);
    assert.equal(recommendedMines(16, 16), 57);
    assert.equal(recommendedMines(25, 16), 87);
  });
});

describe('deduce', () => {
  it('1-2-1 要标出两端的雷和中间的安全格', () => {
    const result = deduce(board(['...', '121'], 2));
    assert.equal(result.inconsistent, false);
    assert.deepEqual(spots(result.flags), ['0,0', '0,2']);
    assert.deepEqual(spots(result.reveals), ['0,1']);
  });

  it('旗数已经补满数字时，剩下的未开格可以点', () => {
    // 边上的 1 只挨着一枚旗和一格未开，未开格必然安全。
    const result = deduce(board(['F', '1', '.'], 1));
    assert.equal(result.inconsistent, false);
    assert.deepEqual(spots(result.reveals), ['2,0']);
    assert.deepEqual(spots(result.flags), []);
  });

  it('剩余雷数为 0 时，未开格全部安全', () => {
    const result = deduce(board(['..', '..'], 0));
    assert.deepEqual(spots(result.reveals), ['0,0', '0,1', '1,0', '1,1']);
    assert.deepEqual(spots(result.flags), []);
  });

  it('剩余雷数等于未开格数时，全部标雷', () => {
    const result = deduce(board(['..', '..'], 4));
    assert.deepEqual(spots(result.flags), ['0,0', '0,1', '1,0', '1,1']);
    assert.deepEqual(spots(result.reveals), []);
  });

  it('还有两种合法布雷时不猜', () => {
    // 下面两个 1 都只要求上面两格里恰有一颗雷，两格都可能是雷。
    const result = deduce(board(['..', '11'], 1));
    assert.equal(result.inconsistent, false);
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.reveals, []);
  });

  it('数字和总雷数对不上时视为矛盾，不下任何子', () => {
    const result = deduce(board(['...', '121'], 3));
    assert.equal(result.inconsistent, true);
    assert.equal(result.fault?.kind, 'mines');
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.reveals, []);
  });

  it('剩余雷数放不进棋盘时单独记成雷数矛盾', () => {
    // 左上角是 0，三格邻居都不能是雷，但总雷数还有 1。
    const result = deduce(board(['0.', '..'], 1));
    assert.equal(result.inconsistent, true);
    assert.equal(result.fault?.kind, 'mines');
  });

  it('数字互相矛盾时，即使雷数够也记成数字矛盾', () => {
    // 1 的左右都是 5。这不是一条写死的形状，而是穷举后没有任何合法布雷。
    const result = deduce(board(['.....', '.515.', '.....'], 8));
    assert.equal(result.inconsistent, true);
    assert.equal(result.fault?.kind, 'numbers');
  });

  it('斜向的 5 和 1 在雷数够时可以同时成立', () => {
    const result = deduce(board(['.....', '..5..', '...1.', '.....'], 6));
    assert.equal(result.inconsistent, false);
  });

  it('区域大过枚举上限时不拿猜测填空', () => {
    const hidden = '.'.repeat(22);
    const ones = '1'.repeat(22);
    const result = deduce(board([hidden, ones], 10));
    assert.equal(result.capped, true);
    assert.equal(result.inconsistent, false);
    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.reveals, []);
  });
});
