// 重排不变量：总雷数、旗子、已翻开数字、同一种子、祈祷抽样区间，以及离散正态的直方图。
// 运行：cd server && npx ts-node --transpile-only src/test_csp_invariants.ts

import {
  DIRECTIONS,
  cloneGrid,
  createEmptyGrid,
  placeMines,
  rearrangeMines,
  revealCellLogic,
} from '../../shared/gameLogic';
import { CellData } from '../../shared/types';
import { createRNG, hashSeed } from '../../shared/deterministicPlaceMines';

let pass = 0;
let fail = 0;

function ok(name: string): void {
  pass++;
  console.log(`  ok  ${name}`);
}

function no(name: string, detail: string): void {
  fail++;
  console.log(`  FAIL ${name}: ${detail}`);
}

function countMines(grid: CellData[][]): number {
  let mines = 0;
  for (const row of grid) {
    for (const cell of row) if (cell.isMine) mines++;
  }
  return mines;
}

function minesAround(grid: CellData[][], r: number, c: number): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let mines = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) mines++;
  }
  return mines;
}

function degreeOf(grid: CellData[][], r: number, c: number): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let degree = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) degree++;
  }
  return degree;
}

function flaggedMinesAround(grid: CellData[][], r: number, c: number): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let mines = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const cell = grid[nr][nc];
    if (cell.status === 'flagged' && cell.isMine) mines++;
  }
  return mines;
}

function fillCounts(grid: CellData[][]): void {
  const rows = grid.length;
  const cols = grid[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid[r][c].neighborMines = minesAround(grid, r, c);
  }
}

function fingerprint(grid: CellData[][]): string {
  return JSON.stringify(grid.map((row) => row.map((cell) => [cell.isMine, cell.neighborMines, cell.status])));
}

function revealedNumbersMatch(grid: CellData[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.status === 'revealed' && cell.neighborMines !== minesAround(grid, cell.row, cell.col)) return false;
    }
  }
  return true;
}

function flaggedMinesUnchanged(before: CellData[][], after: CellData[][]): boolean {
  for (let r = 0; r < before.length; r++) {
    for (let c = 0; c < before[0].length; c++) {
      if (before[r][c].status === 'flagged' && before[r][c].isMine !== after[r][c].isMine) return false;
    }
  }
  return true;
}

// 已翻开数字写成 1，但周围没有雷。孤立安全格很多、孤立雷为 0，补不平必须失败且棋盘不动。
function testUnbalancedCurseRollsBack(): void {
  const grid = createEmptyGrid(10, 10);
  grid[1][1].status = 'revealed';
  grid[1][1].neighborMines = 1;
  const before = fingerprint(grid);
  const beforeMines = countMines(grid);
  const okMove = rearrangeMines(grid, 1, 2, true, createRNG(hashSeed('unbalanced')));
  if (okMove) no('补不平返回 false', 'solver returned true and created a mine');
  else if (fingerprint(grid) !== before) no('补不平棋盘不变', 'grid mutated after failure');
  else if (countMines(grid) !== beforeMines) no('补不平总雷数', `${countMines(grid)}`);
  else ok('补不平则失败且棋盘与进入时一致');
}

// 同样的已翻开数字，远处只有一颗孤立雷。雷可以挪进前沿，总数仍是 1。
function testFewIsolatedMinesKeepTotal(): void {
  const grid = createEmptyGrid(10, 10);
  grid[1][1].status = 'revealed';
  grid[1][1].neighborMines = 1;
  grid[8][8].isMine = true;
  const rng = createRNG(hashSeed('one-isolated-mine'));
  const moved = rearrangeMines(grid, 1, 2, true, rng);
  const total = countMines(grid);
  if (!moved) no('少量孤立雷仍能补平', 'expected a compensating swap');
  else if (total !== 1) no('补平后总雷数', `total=${total}`);
  else if (!grid[1][2].isMine) no('诅咒把目标格变成雷', 'target stayed safe');
  else if (grid[8][8].isMine) no('远处孤立雷被关掉', 'far mine still present');
  else if (!revealedNumbersMatch(grid)) no('补平后已翻开数字', 'revealed count drifted');
  else ok('孤立雷很少时总雷数仍然不变');
}

function testFlaggedMineStays(): void {
  const grid = createEmptyGrid(10, 10);
  grid[1][1].status = 'revealed';
  grid[1][1].neighborMines = 1;
  grid[8][8].isMine = true;
  grid[8][8].status = 'flagged';
  const before = fingerprint(grid);
  const moved = rearrangeMines(grid, 1, 2, true, createRNG(hashSeed('flagged-only-mine')));
  if (moved) no('旗下唯一的雷不能拿来补平', 'solver flipped a flagged mine');
  else if (fingerprint(grid) !== before) no('旗下雷失败时棋盘不变', 'grid mutated');
  else if (!grid[8][8].isMine || grid[8][8].status !== 'flagged') no('插旗格 isMine 不变', 'flagged mine changed');
  else ok('插旗格的雷不会被重排翻掉');
}

function testFlaggedFrontierMineStaysOnPrayer(): void {
  const grid = createEmptyGrid(8, 8);
  grid[4][4].isMine = true;
  grid[4][5].isMine = true;
  grid[4][5].status = 'flagged';
  fillCounts(grid);
  const beforeFlag = grid[4][5].isMine;
  const totalBefore = countMines(grid);
  const moved = rearrangeMines(grid, 4, 4, false, createRNG(hashSeed('prayer-beside-flag')));
  const around = minesAround(grid, 4, 4);
  const degree = degreeOf(grid, 4, 4);
  if (!moved) no('旗旁边的祈祷', 'prayer could not move the unflagged mine');
  else if (grid[4][4].isMine) no('祈祷后目标格应安全', 'target still mined');
  else if (grid[4][5].isMine !== beforeFlag) no('祈祷不翻转邻旗', 'flagged neighbor flipped');
  else if (countMines(grid) !== totalBefore) no('祈祷总雷数', `${countMines(grid)}`);
  else if (grid[4][4].neighborMines !== around) no('祈祷数字未按真实雷数回填', `${grid[4][4].neighborMines} vs ${around}`);
  else if (around < flaggedMinesAround(grid, 4, 4) || around > degree) no('祈祷数字超出可行区间', `k=${around} degree=${degree}`);
  else if (!revealedNumbersMatch(grid)) no('祈祷后已翻开数字', 'revealed mismatch');
  else ok('祈祷抽样落在可行区间且旗子雷不动');
}

function testSameSeedMatches(): void {
  const build = (): CellData[][] => {
    const grid = createEmptyGrid(8, 8);
    grid[3][3].isMine = true;
    grid[3][4].isMine = true;
    grid[6][1].isMine = true;
    fillCounts(grid);
    grid[2][2].status = 'revealed';
    return grid;
  };
  const a = build();
  const b = build();
  const first = rearrangeMines(a, 3, 3, false, createRNG(hashSeed('same-seed')));
  const second = rearrangeMines(b, 3, 3, false, createRNG(hashSeed('same-seed')));
  if (first !== second) no('同种子成败一致', `${first} vs ${second}`);
  else if (fingerprint(a) !== fingerprint(b)) no('同种子布局一致', 'boards diverged');
  else if (!first) no('同种子祈祷应成功', 'both failed');
  else if (!revealedNumbersMatch(a) || countMines(a) !== 3) no('同种子不变量', `mines=${countMines(a)}`);
  else ok('同一 rng 种子两次重排结果相同');
}

function testConstrainedPrayerBackfill(): void {
  const grid = createEmptyGrid(8, 8);
  grid[2][3].isMine = true;
  fillCounts(grid);
  grid[2][2].status = 'revealed';
  const totalBefore = countMines(grid);
  const degree = degreeOf(grid, 2, 3);
  const moved = rearrangeMines(grid, 2, 3, false, createRNG(hashSeed('constrained-prayer')));
  const around = minesAround(grid, 2, 3);
  if (!moved) no('有约束的祈祷', 'could not relocate the mine');
  else if (grid[2][3].isMine) no('有约束祈祷后目标应安全', 'target still mined');
  else if (countMines(grid) !== totalBefore) no('有约束祈祷总雷数', `${countMines(grid)}`);
  else if (minesAround(grid, 2, 2) !== grid[2][2].neighborMines) no('已翻开数字被改写', 'revealed number changed');
  else if (grid[2][3].neighborMines !== around) no('回填不等于周围雷数', `${grid[2][3].neighborMines} vs ${around}`);
  else if (around < flaggedMinesAround(grid, 2, 3) || around > degree) no('k 不在可行区间', `k=${around}`);
  else ok('有约束祈祷的数字按真实雷数回填');
}

// 8×8、16 颗雷，密度 0.25。内格有 8 个邻居，μ = 密度 × 邻居数 = 2。
// 一颗邻旗雷把可行下界钉在 1，两格还能改的隐藏邻居把上界钉在 3。
// 另外五个邻居插上安全旗，避免它们把区间撑大。整盘没有已翻开格，所以走直接抽样。
// 1、2、3 都能补平，抽到的就是权重顺序里的第一个 k。钟形峰大约占 0.41，平坦抽样大约占 0.33。
// 2000 次才够把这两个比例分开；再少的话，这条断言会自己闪红。
function testPrayerHistogramPeaksNearDensity(): void {
  const rows = 8;
  const cols = 8;
  const targetR = 3;
  const targetC = 3;
  const trials = 2000;
  const flaggedMine: [number, number] = [2, 4];
  const flaggedSafes: Array<[number, number]> = [
    [3, 2],
    [3, 4],
    [4, 2],
    [4, 3],
    [4, 4],
  ];
  const counts = [0, 0, 0, 0];
  let sum = 0;

  const build = (): CellData[][] => {
    const grid = createEmptyGrid(rows, cols);
    grid[targetR][targetC].isMine = true;
    grid[flaggedMine[0]][flaggedMine[1]].isMine = true;
    grid[flaggedMine[0]][flaggedMine[1]].status = 'flagged';
    for (const [r, c] of flaggedSafes) grid[r][c].status = 'flagged';
    // 剩下 14 颗雷放在 3×3 邻域外面。两格可变邻居保持安全，下界才稳定在 1。
    let placed = 0;
    for (let r = 0; r < rows && placed < 14; r++) {
      for (let c = 0; c < cols && placed < 14; c++) {
        if (Math.abs(r - targetR) <= 1 && Math.abs(c - targetC) <= 1) continue;
        grid[r][c].isMine = true;
        placed++;
      }
    }
    fillCounts(grid);
    return grid;
  };

  const probe = build();
  if (countMines(probe) !== 16) {
    no('离散正态棋盘雷数', `${countMines(probe)}`);
    return;
  }

  for (let i = 0; i < trials; i++) {
    const grid = build();
    const moved = rearrangeMines(grid, targetR, targetC, false, createRNG(hashSeed(`normal-hist-${i}`)));
    const around = minesAround(grid, targetR, targetC);
    if (!moved) {
      no('离散正态祈祷应成功', `trial ${i}`);
      return;
    }
    if (countMines(grid) !== 16) {
      no('离散正态总雷数', `trial ${i} mines=${countMines(grid)}`);
      return;
    }
    if (grid[targetR][targetC].isMine) {
      no('离散正态目标应安全', `trial ${i}`);
      return;
    }
    if (!grid[flaggedMine[0]][flaggedMine[1]].isMine || grid[flaggedMine[0]][flaggedMine[1]].status !== 'flagged') {
      no('离散正态邻旗雷', `trial ${i}`);
      return;
    }
    for (const [r, c] of flaggedSafes) {
      if (grid[r][c].isMine || grid[r][c].status !== 'flagged') {
        no('离散正态安全旗被改成雷', `trial ${i} at ${r},${c}`);
        return;
      }
    }
    if (grid[targetR][targetC].neighborMines !== around) {
      no('离散正态回填', `trial ${i} ${grid[targetR][targetC].neighborMines} vs ${around}`);
      return;
    }
    if (around < 1 || around > 3) {
      no('离散正态 k 超出预设区间', `trial ${i} k=${around}`);
      return;
    }
    counts[around]++;
    sum += around;
  }

  const peak = counts[2] / trials;
  const mean = sum / trials;
  const mu = (16 / (rows * cols)) * degreeOf(probe, targetR, targetC);
  if (counts[1] === 0 || counts[3] === 0) {
    no('离散正态两端都要出现', `counts=${counts.slice(1).join(',')}`);
  } else if (peak < 0.37) {
    no('离散正态应集中在 μ 附近', `peak=${peak.toFixed(3)} counts=${counts.slice(1).join(',')}`);
  } else if (Math.abs(mean - mu) > 0.15) {
    no('离散正态均值偏离 μ', `mean=${mean.toFixed(3)} mu=${mu}`);
  } else if (counts[1] + counts[2] + counts[3] !== trials) {
    no('离散正态样本数', `${counts.join(',')}`);
  } else {
    ok(`祈祷周围雷数集中在 μ=${mu} 附近且两端都出现（${counts[1]}/${counts[2]}/${counts[3]}）`);
  }
}

function testZeroRegionFlood(): void {
  const grid = createEmptyGrid(8, 8);
  const opened = revealCellLogic(grid, 3, 3, true, false, createRNG(hashSeed('flood')));
  let revealed = 0;
  for (const row of opened.grid) {
    for (const cell of row) if (cell.status === 'revealed') revealed++;
  }
  if (opened.exploded) no('空棋盘泛洪不应爆炸', 'exploded');
  else if (revealed !== 64) no('空棋盘应一次翻开', `revealed=${revealed}`);
  else if (countMines(opened.grid) !== 0) no('空棋盘雷数', `${countMines(opened.grid)}`);
  else ok('泛洪入栈去重后仍能翻开整片空地');
}

function touchesRevealed(grid: CellData[][], r: number, c: number): boolean {
  const rows = grid.length;
  const cols = grid[0].length;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') return true;
  }
  return false;
}

function testLargeBoardStaysConsistent(): void {
  const seed = 'large-board';
  const placed = placeMines(createEmptyGrid(25, 25), 80, 12, 12, createRNG(hashSeed(seed)));
  const total = countMines(placed);
  const opened = revealCellLogic(placed, 12, 12, true, false, createRNG(hashSeed(seed + '-csp')));
  const grid = opened.grid;
  if (countMines(grid) !== total || !revealedNumbersMatch(grid)) {
    no('大盘首击', 'mine count or numbers drifted');
    return;
  }

  // 紧挨已翻开区域的格子会走进约束求解。在副本上重排，避免第一次诅咒爆炸后就停。
  const started = Date.now();
  let tried = 0;
  for (let r = 0; r < 25 && tried < 30; r++) {
    for (let c = 0; c < 25 && tried < 30; c++) {
      const cell = grid[r][c];
      if (cell.status !== 'hidden' || !touchesRevealed(grid, r, c)) continue;
      const copy = cloneGrid(grid);
      const moved = rearrangeMines(copy, r, c, !cell.isMine, createRNG(hashSeed(`${seed}-${r}-${c}`)));
      tried++;
      if (countMines(copy) !== total) {
        no('大盘总雷数', `at ${r},${c} total=${countMines(copy)}`);
        return;
      }
      if (!revealedNumbersMatch(copy) || !flaggedMinesUnchanged(grid, copy)) {
        no('大盘已翻开数字或旗子', `at ${r},${c}`);
        return;
      }
      if (!moved && fingerprint(copy) !== fingerprint(grid)) {
        no('大盘失败回滚', `at ${r},${c}`);
        return;
      }
    }
  }
  const elapsed = Date.now() - started;
  if (tried < 10) no('大盘样本太少', `tried=${tried}`);
  else if (elapsed > 8000) no('大盘耗时', `${elapsed}ms for ${tried} rearranges`);
  else ok(`大盘 ${tried} 次贴边重排后雷数与数字仍一致（${elapsed}ms）`);
}

function testDeterministicCurseOnClone(): void {
  const build = (): CellData[][] => {
    const grid = placeMines(createEmptyGrid(12, 12), 20, 5, 5, createRNG(hashSeed('det-place')));
    fillCounts(grid);
    const opened = revealCellLogic(cloneGrid(grid), 5, 5, true, false, createRNG(hashSeed('det-open')));
    return opened.grid;
  };
  const a = build();
  const b = build();
  const target = findHiddenSafe(a);
  if (!target) {
    no('寻找可诅咒的安全格', 'none');
    return;
  }
  const ra = rearrangeMines(a, target.r, target.c, true, createRNG(hashSeed('det-curse')));
  const rb = rearrangeMines(b, target.r, target.c, true, createRNG(hashSeed('det-curse')));
  if (ra !== rb || fingerprint(a) !== fingerprint(b)) no('诅咒同种子', 'diverged');
  else if (countMines(a) !== 20 || !revealedNumbersMatch(a)) no('诅咒同种子不变量', `mines=${countMines(a)}`);
  else ok('诅咒同种子布局一致且总雷数不变');
}

function findHiddenSafe(grid: CellData[][]): { r: number; c: number } | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c].status === 'hidden' && !grid[r][c].isMine) return { r, c };
    }
  }
  return null;
}

console.log('CSP invariants');
testUnbalancedCurseRollsBack();
testFewIsolatedMinesKeepTotal();
testFlaggedMineStays();
testFlaggedFrontierMineStaysOnPrayer();
testSameSeedMatches();
testConstrainedPrayerBackfill();
testPrayerHistogramPeaksNearDensity();
testZeroRegionFlood();
testDeterministicCurseOnClone();
testLargeBoardStaysConsistent();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
