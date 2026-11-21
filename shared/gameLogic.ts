// Shared game logic — pure functions used by both frontend and server replay verification.
// No React-specific code here (e.g. preserveRefs lives in the frontend wrapper).

import { CURRENT_REPLAY_VERSION, type CellData, type ReplayVersion } from './types';
import { exactPrayerLayout } from './exactPrayer';
import {
  findBoundedCompensation,
  findThreeCellCompensation,
  type CompensationConstraint as RevealedConstraint,
  type CompensationDelta,
} from './compensationSearch';

export const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// Formula: Total * (20% + 1 / Total^0.65)
export const calculateRecommendedMines = (rows: number, cols: number): number => {
  const total = rows * cols;
  const factor = 0.20 + (1 / Math.pow(total, 0.65));
  return Math.max(1, Math.floor(total * factor) - 1);
};

export const createEmptyGrid = (rows: number, cols: number): CellData[][] => {
  const grid: CellData[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellData[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        id: `${r}-${c}`,
        row: r,
        col: c,
        isMine: false,
        status: 'hidden',
        neighborMines: 0,
      });
    }
    grid.push(row);
  }
  return grid;
};

// Deep-clone the grid — used by the server and as the base for frontend's preserveRefs wrapper.
export const cloneGrid = (grid: CellData[][]): CellData[][] =>
  grid.map(row => row.map(cell => ({ ...cell })));

export const getNeighbors = (grid: CellData[][], r: number, c: number): { r: number; c: number }[] => {
  const neighbors: { r: number; c: number }[] = [];
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      neighbors.push({ r: nr, c: nc });
    }
  });
  return neighbors;
};

// --- Internal helpers ---

const countMinesAround = (grid: CellData[][], r: number, c: number): number => {
  let count = 0;
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      if (grid[nr][nc].isMine) count++;
    }
  });
  return count;
};

// 目标格四周是否已经有翻开的格子。没有的话，翻转目标格本身不会改动任何已翻开数字。
const hasRevealedNeighbor = (grid: CellData[][], r: number, c: number): boolean => {
  const rows = grid.length;
  const cols = grid[0].length;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
      return true;
    }
  }
  return false;
};

const countAllMines = (grid: CellData[][]): number => {
  let mines = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isMine) mines++;
    }
  }
  return mines;
};

// 用真实周围雷数回填。抽到的 k 不能直接写进 neighborMines。
const recountAllNeighborMines = (grid: CellData[][]): void => {
  const rows = grid.length;
  const cols = grid[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r][c].neighborMines = countMinesAround(grid, r, c);
    }
  }
};

const shuffleCopy = <T>(items: readonly T[], rng: () => number): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
};

// 离散正态权重。σ 为 0 时钟形塌成最近的整数，其余 k 仍保留极小权重，方便按序试完整个可行区间。
const normalWeight = (k: number, mu: number, sigma: number): number => {
  if (!(sigma > 1e-9)) {
    return Math.abs(k - mu) <= 0.5 ? 1 : 1e-3;
  }
  const z = (k - mu) / sigma;
  const w = Math.exp(-0.5 * z * z);
  return w > 1e-12 ? w : 1e-12;
};

// Efraimidis-Spirakis：key = -ln(U) / w(k)。key 越小越先尝试，同一 rng 种子得到同一顺序。
const discreteNormalOrder = (
  kMin: number,
  kMax: number,
  mu: number,
  sigma: number,
  rng: () => number,
): number[] => {
  const ks: number[] = [];
  for (let k = kMin; k <= kMax; k++) ks.push(k);
  if (ks.length <= 1) return ks;
  const ranked = ks.map((k) => {
    const u = Math.min(Math.max(rng(), 1e-12), 1 - 1e-12);
    return { k, key: -Math.log(u) / normalWeight(k, mu, sigma) };
  });
  ranked.sort((a, b) => a.key - b.key || a.k - b.k);
  return ranked.map((item) => item.k);
};

export const placeMines = (
  grid: CellData[][],
  mines: number,
  firstClickRow: number,
  firstClickCol: number,
  rng: () => number = Math.random,
): CellData[][] => {
  const rows = grid.length;
  const cols = grid[0].length;
  const availableCells = rows * cols - 9;
  if (mines > availableCells) {
    throw new Error(
      `placeMines: requested ${mines} mines but only ${availableCells} non-safe cells available (${rows}×${cols}).`,
    );
  }

  const newGrid = cloneGrid(grid);

  const isSafeZone = (r: number, c: number) =>
    Math.abs(r - firstClickRow) <= 1 && Math.abs(c - firstClickCol) <= 1;

  const candidates: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isSafeZone(r, c)) {
        candidates.push({ r, c });
      }
    }
  }
  // Fisher-Yates shuffle using provided RNG
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < mines && i < candidates.length; i++) {
    newGrid[candidates[i].r][candidates[i].c].isMine = true;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newGrid[r][c].isMine) continue;
      newGrid[r][c].neighborMines = countMinesAround(newGrid, r, c);
    }
  }
  return newGrid;
};

// 新录像在数字偏好搜索结束后直接进入精确求解。旧录像沿用录制时的搜索顺序。
const MAX_CURSE_SOLVE_NODES = 4000;
const MAX_PREFERRED_PRAYER_NODES = 3000;
const LEGACY_PRAYER_SOLVE_NODES = MAX_PREFERRED_PRAYER_NODES + 3000;
// 沿已翻开约束向外扩展的变量上限。超出的格子视为固定，不再翻转。
const MAX_FRONTIER_SIZE = 50;
const MAX_PRAYER_RETRY_FRONTIER_SIZE = 112;
const MAX_PRAYER_RETRY_NODES = 768;
const MAX_PREFERRED_PRAYER_RETRY_NODES = 192;
const MAX_COMPENSATION_BLOCKS = 4;
const MAX_COMPENSATION_BLOCK_SIZE = 10;
const MAX_SHORTAGE_PROOF_NODES = 200;
const MAX_THREE_CELL_CHECKS = 1500;
const MAX_BOUNDED_COMPENSATION_CHANGES = 8;
const MAX_BOUNDED_COMPENSATION_NODES = 256;

interface FrontierVar {
  r: number;
  c: number;
}

interface SolveBudget {
  used: number;
}

interface ConstrainedSearchOptions {
  budget?: SolveBudget;
  onlyCompensation?: boolean;
  retryFrontier?: boolean;
}

interface SolvedLayout {
  assignment: Int8Array;
  freeCount: number;
}

interface CompensationLayout {
  cells: FrontierVar[];
  assignment: Int8Array;
}

export interface RearrangementAttempt {
  kind: 'curse' | 'prayer';
  outcome: 'success' | 'isolated_shortage' | 'budget_exhausted' | 'frontier_limit' | 'unclassified';
}

// 三条路径共用同一次快照。入口负责保存和回滚，路径只改 isMine，成败交给 commit。
// 补偿方向不变：这一块雷变多就关掉同样多的孤立雷，变少就把孤立安全格改成雷。
interface RearrangeCtx {
  grid: CellData[][];
  rows: number;
  cols: number;
  targetRow: number;
  targetCol: number;
  forceMine: boolean;
  rng: () => number;
  originalTotal: number;
  preferredPrayerOnly: boolean;
  observeFailure: boolean;
  restore: () => void;
  commit: () => boolean;
}

// 目标格和它的隐藏邻居都不挨着已翻开数字时，才能直接抽样，不必进约束搜索。
const canResampleWithoutConstraints = (
  grid: CellData[][],
  targetRow: number,
  targetCol: number,
): boolean => {
  if (hasRevealedNeighbor(grid, targetRow, targetCol)) return false;
  const rows = grid.length;
  const cols = grid[0].length;
  for (const [dr, dc] of DIRECTIONS) {
    const nr = targetRow + dr;
    const nc = targetCol + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const cell = grid[nr][nc];
    // 会碰到已翻开数字的隐藏邻居不能随便改雷，交给约束求解。
    if (cell.status === 'hidden' && hasRevealedNeighbor(grid, nr, nc)) return false;
  }
  return true;
};

const neighborhoodOf = (rows: number, cols: number, row: number, col: number): FrontierVar[] => {
  const list: FrontierVar[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) list.push({ r: nr, c: nc });
  }
  return list;
};

// 诅咒且目标格四周没有已翻开数字：和一颗孤立雷对调。对不上就不动棋盘。
const swapInIsolatedMine = (ctx: RearrangeCtx): RearrangementAttempt['outcome'] => {
  const { grid, rows, cols, targetRow, targetCol, rng, commit } = ctx;

  const candidates: FrontierVar[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === targetRow && c === targetCol) continue;
      const cell = grid[r][c];
      if (cell.status !== 'hidden' || !cell.isMine) continue;
      if (hasRevealedNeighbor(grid, r, c)) continue;
      candidates.push({ r, c });
    }
  }
  if (candidates.length === 0) return 'isolated_shortage';
  const pick = candidates[Math.floor(rng() * candidates.length)];
  grid[targetRow][targetCol].isMine = true;
  grid[pick.r][pick.c].isMine = false;
  return commit() ? 'success' : 'unclassified';
};

// 祈祷且没有已翻开约束：按离散正态抽周围雷数 k，只把差额搬到邻域外的孤立格。
const resampleSafeNeighborhood = (ctx: RearrangeCtx): RearrangementAttempt['outcome'] => {
  const { grid, rows, cols, targetRow, targetCol, rng, originalTotal, restore, commit } = ctx;
  const target = grid[targetRow][targetCol];
  const neighborCoords = (): FrontierVar[] => neighborhoodOf(rows, cols, targetRow, targetCol);
  const density = (): number => originalTotal / (rows * cols);

  const neighbors = neighborCoords();
  const variable: FrontierVar[] = [];
  let fixedMines = 0;
  for (const n of neighbors) {
    const cell = grid[n.r][n.c];
    if (cell.status === 'hidden' && !hasRevealedNeighbor(grid, n.r, n.c)) {
      variable.push(n);
    } else if (cell.isMine) {
      fixedMines++;
    }
  }

  const variableKeys = new Set(variable.map((v) => `${v.r}-${v.c}`));
  const outside: FrontierVar[] = [];
  let outsideMines = 0;
  let variableMines = 0;
  for (const v of variable) {
    if (grid[v.r][v.c].isMine) variableMines++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r === targetRow && c === targetCol) || variableKeys.has(`${r}-${c}`)) continue;
      const cell = grid[r][c];
      if (cell.status !== 'hidden' || hasRevealedNeighbor(grid, r, c)) continue;
      outside.push({ r, c });
      if (cell.isMine) outsideMines++;
    }
  }

  const degree = neighbors.length;
  const p = density();
  const mu = p * degree;
  const sigma = Math.sqrt(degree * p * (1 - p));
  const order = discreteNormalOrder(fixedMines, fixedMines + variable.length, mu, sigma, rng);
  const targetWasMine = target.isMine ? 1 : 0;
  let triedLayout = false;

  for (const k of order) {
    const minesInNeighborhood = k - fixedMines;
    // 目标格改成安全后，多出来或少掉的雷都要落到邻域外的孤立格上，总数才不变。
    const outsideNeeded = outsideMines + targetWasMine + variableMines - minesInNeighborhood;
    if (outsideNeeded < 0 || outsideNeeded > outside.length) continue;

    triedLayout = true;
    restore();
    grid[targetRow][targetCol].isMine = false;
    const varied = shuffleCopy(variable, rng);
    for (let i = 0; i < varied.length; i++) {
      grid[varied[i].r][varied[i].c].isMine = i < minesInNeighborhood;
    }
    // 只搬差额。邻域外的雷已经够数时不动它们，避免把整盘孤立雷重新洗一遍。
    const outsideDelta = outsideNeeded - outsideMines;
    if (outsideDelta > 0) {
      const safes = shuffleCopy(outside.filter((cell) => !grid[cell.r][cell.c].isMine), rng);
      for (let i = 0; i < outsideDelta; i++) grid[safes[i].r][safes[i].c].isMine = true;
    } else if (outsideDelta < 0) {
      const mines = shuffleCopy(outside.filter((cell) => grid[cell.r][cell.c].isMine), rng);
      for (let i = 0; i < -outsideDelta; i++) grid[mines[i].r][mines[i].c].isMine = false;
    }
    if (commit()) return 'success';
  }

  restore();
  return triedLayout ? 'unclassified' : 'isolated_shortage';
};

// 直接交换覆盖不了时，沿已翻开约束搜索目标所在的那一块。
const solveConstrained = (
  ctx: RearrangeCtx,
  { budget = { used: 0 }, onlyCompensation = false, retryFrontier = false }: ConstrainedSearchOptions = {},
): RearrangementAttempt['outcome'] => {
  const { grid, rows, cols, targetRow, targetCol, forceMine, rng, originalTotal, restore, commit } = ctx;
  const frontierLimit = retryFrontier ? MAX_PRAYER_RETRY_FRONTIER_SIZE : MAX_FRONTIER_SIZE;
  const fastBudget = ctx.preferredPrayerOnly ? MAX_PREFERRED_PRAYER_NODES : LEGACY_PRAYER_SOLVE_NODES;
  const prayerNodeLimit = retryFrontier ? Math.min(fastBudget, budget.used + MAX_PRAYER_RETRY_NODES) : fastBudget;
  const inBounds = (r: number, c: number): boolean => r >= 0 && r < rows && c >= 0 && c < cols;
  const neighborCoords = (): FrontierVar[] => neighborhoodOf(rows, cols, targetRow, targetCol);
  const density = (): number => originalTotal / (rows * cols);

  // 从目标格沿已翻开约束做 BFS，得到的就是目标所在的那一块。
  // 其他不连通的区域保持原样，搜索代价按这一块计算，而不是按整盘相乘。
  let frontierTruncated = false;
  let shortageWitness = false;
  let rejectedLayout = false;
  let hasSafeRange = false;
  const trackShortage = !forceMine || ctx.observeFailure;
  const compensationWitnesses = forceMine || ctx.preferredPrayerOnly ? null : new Map<number, Int8Array>();
  const vars = collectTargetComponent();
  const targetIdx = vars.findIndex((v) => v.r === targetRow && v.c === targetCol);
  if (targetIdx < 0) return 'unclassified';

  const varIndex = new Map<string, number>();
  vars.forEach((v, i) => varIndex.set(`${v.r}-${v.c}`, i));

  const constraints = buildConstraints(vars, varIndex);
  const neighbors = neighborCoords();
  const neighborVarIdxs: number[] = [];
  const freeNeighbors: FrontierVar[] = [];
  let fixedNeighborMines = 0;
  for (const n of neighbors) {
    const idx = varIndex.get(`${n.r}-${n.c}`);
    if (idx !== undefined) {
      neighborVarIdxs.push(idx);
    } else if (
      !forceMine &&
      grid[n.r][n.c].status === 'hidden' &&
      !hasRevealedNeighbor(grid, n.r, n.c)
    ) {
      // 只有祈祷才会改这些不挨着已翻开数字的邻居，用来凑周围雷数 k。诅咒不动它们。
      freeNeighbors.push(n);
    } else if (grid[n.r][n.c].isMine) {
      fixedNeighborMines++;
    }
  }

  const excluded = new Set<string>(vars.map((v) => `${v.r}-${v.c}`));
  for (const n of freeNeighbors) excluded.add(`${n.r}-${n.c}`);
  const isolatedMines: FrontierVar[] = [];
  const isolatedSafes: FrontierVar[] = [];
  let originalFreeMines = 0;
  for (const n of freeNeighbors) {
    if (grid[n.r][n.c].isMine) originalFreeMines++;
  }
  let initialChangedMines = originalFreeMines;
  for (const v of vars) {
    if (grid[v.r][v.c].isMine) initialChangedMines++;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (excluded.has(`${r}-${c}`)) continue;
      const cell = grid[r][c];
      if (cell.status !== 'hidden' || hasRevealedNeighbor(grid, r, c)) continue;
      if (cell.isMine) isolatedMines.push({ r, c });
      else isolatedSafes.push({ r, c });
    }
  }

  const minChangedMines = initialChangedMines - isolatedSafes.length;
  const maxChangedMines = initialChangedMines + isolatedMines.length;
  const neighborVarSet = new Uint8Array(vars.length);
  for (const idx of neighborVarIdxs) neighborVarSet[idx] = 1;

  if (onlyCompensation) {
    // The isolated target has no revealed constraints and is the only variable in its block.
    noteShortage(new Int8Array(vars.length));
    return failed();
  }

  if (!forceMine) {
    const range = estimateSafeRange();
    if (!range) return failed();
    hasSafeRange = true;
    const degree = neighbors.length;
    const p = density();
    const mu = p * degree;
    const sigma = Math.sqrt(degree * p * (1 - p));
    const order = discreteNormalOrder(range.kMin, range.kMax, mu, sigma, rng);
    // Reserve most of the retry allowance for any legal digit, even with a short remaining budget.
    const localPreferredLimit = retryFrontier
      ? budget.used + Math.floor((prayerNodeLimit - budget.used) *
          MAX_PREFERRED_PRAYER_RETRY_NODES / MAX_PRAYER_RETRY_NODES)
      : prayerNodeLimit;
    const preferredLimit = Math.min(MAX_PREFERRED_PRAYER_NODES, localPreferredLimit);
    for (const k of order) {
      const solved = search(k, preferredLimit);
      if (solved === 'budget') {
        if (budget.used >= prayerNodeLimit) return failed(true);
        break;
      }
      if (solved && applyLayout(solved)) return 'success';
      restore();
    }
    if (!ctx.preferredPrayerOnly && budget.used >= preferredLimit) {
      // 两段共用计数器。剩余预算内接受能安全翻开目标格的任意数字。
      const solved = search(null, prayerNodeLimit);
      if (solved && solved !== 'budget' && applyLayout(solved)) return 'success';
      return failed(solved === 'budget');
    }
    return failed();
  }

  const solved = search(null, MAX_CURSE_SOLVE_NODES);
  if (solved && solved !== 'budget' && applyLayout(solved)) return 'success';
  return failed(solved === 'budget');

  function failed(exhausted = false): RearrangementAttempt['outcome'] {
    restore();
    if (exhausted) return 'budget_exhausted';
    if (frontierTruncated) return 'frontier_limit';
    if (ctx.preferredPrayerOnly) return shortageWitness ? 'isolated_shortage' : 'unclassified';
    if (!shortageWitness && hasSafeRange && !rejectedLayout && budget.used < prayerNodeLimit) {
      // Mine-count pruning can reject a partial assignment before its legal flip is visible.
      const proof = search(null, Math.min(prayerNodeLimit, budget.used + MAX_SHORTAGE_PROOF_NODES), false);
      if (proof && proof !== 'budget') noteShortage(proof.assignment);
    }
    if (!shortageWitness || rejectedLayout) return 'unclassified';
    if (compensationWitnesses?.size && budget.used < prayerNodeLimit &&
        tryCrossBlockCompensation(compensationWitnesses)) return 'success';
    return 'isolated_shortage';
  }

  function noteShortage(assignment: Int8Array): void {
    if (!trackShortage || frontierTruncated || (forceMine && shortageWitness) || assignment.includes(-1)) return;
    const mines = assignment.reduce((sum, value) => sum + value, 0);
    // A preferred digit can fail even when some other digit would fit the isolated pool.
    if (minChangedMines <= mines + freeNeighbors.length && mines <= maxChangedMines) return;
    if (compensationWitnesses?.has(mines) || !constraintsSatisfied(assignment)) return;
    shortageWitness = true;
    compensationWitnesses?.set(mines, new Int8Array(assignment));
  }

  function tryCrossBlockCompensation(witnesses: ReadonlyMap<number, Int8Array>): boolean {
    const blocks = collectCompensationBlocks();
    let combinations = new Map<number, CompensationLayout[]>([[0, []]]);
    const smallBlocks = blocks.filter(block => block.length <= MAX_COMPENSATION_BLOCK_SIZE);
    for (const block of smallBlocks.slice(0, MAX_COMPENSATION_BLOCKS)) {
      if (budget.used >= prayerNodeLimit) break;
      const layouts = enumerateCompensationBlock(block);
      const combined = new Map(combinations);
      for (const [previousDelta, previousLayouts] of combinations) {
        for (const [delta, assignment] of layouts) {
          const totalDelta = previousDelta + delta;
          if (!combined.has(totalDelta)) {
            combined.set(totalDelta, [...previousLayouts, { cells: block, assignment }]);
          }
        }
      }
      combinations = combined;

      for (const [mines, assignment] of witnesses) {
        for (const [delta, moves] of combinations) {
          if (delta === 0) continue;
          const freeCount = chooseFreeMineCount(mines + delta);
          if (freeCount !== null && applyLayout({ assignment, freeCount }, moves)) return true;
        }
      }
    }

    return budget.used < prayerNodeLimit && tryLargerBlockCompensation(witnesses, blocks);
  }

  function tryLargerBlockCompensation(witnesses: ReadonlyMap<number, Int8Array>, blocks: FrontierVar[][]): boolean {
    const candidates = new Map<CompensationDelta, SolvedLayout>();
    for (const delta of [1, -1, 2, -2] as const) {
      for (const [mines, assignment] of witnesses) {
        const freeCount = chooseFreeMineCount(mines + delta);
        if (freeCount === null) continue;
        candidates.set(delta, { assignment, freeCount });
        break;
      }
    }
    if (candidates.size === 0) return false;

    const largerBlocks = blocks.filter(block => block.length > MAX_COMPENSATION_BLOCK_SIZE);
    const signatureLimit = Math.min(prayerNodeLimit, budget.used + MAX_THREE_CELL_CHECKS);
    const prepared: Array<{ cells: FrontierVar[]; original: Int8Array; constraints: RevealedConstraint[] }> = [];
    for (const cells of largerBlocks) {
      if (budget.used >= signatureLimit) break;
      const index = new Map(cells.map((cell, i) => [`${cell.r}-${cell.c}`, i]));
      const constraints = buildConstraints(cells, index);
      const original = Int8Array.from(cells, cell => Number(grid[cell.r][cell.c].isMine));
      prepared.push({ cells, original, constraints });
      for (const [delta, target] of candidates) {
        if (delta === -2 || delta === 2) continue;
        const assignment = findThreeCellCompensation(original, constraints, delta, spendUntil(signatureLimit));
        if (assignment && applyLayout(target, [{ cells, assignment }])) return true;
      }
    }

    for (const { cells, original, constraints } of prepared.slice(0, MAX_COMPENSATION_BLOCKS)) {
      if (budget.used >= prayerNodeLimit) break;
      const limit = Math.min(prayerNodeLimit, budget.used + MAX_BOUNDED_COMPENSATION_NODES);
      for (const [delta, target] of candidates) {
        const assignment = findBoundedCompensation(
          original, constraints, delta, MAX_BOUNDED_COMPENSATION_CHANGES, spendUntil(limit),
        );
        if (assignment && applyLayout(target, [{ cells, assignment }])) return true;
      }
    }
    return false;
  }

  function spendUntil(limit: number): () => boolean {
    return () => {
      if (budget.used >= limit) return false;
      budget.used++;
      return true;
    };
  }

  function collectCompensationBlocks(): FrontierVar[][] {
    const seen = new Uint8Array(rows * cols);
    const seenClues = new Uint8Array(rows * cols);
    for (const v of vars) seen[v.r * cols + v.c] = 1;
    const blocks: FrontierVar[][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (seen[r * cols + c] || grid[r][c].status !== 'hidden' || !hasRevealedNeighbor(grid, r, c)) continue;
        const block: FrontierVar[] = [{ r, c }];
        seen[r * cols + c] = 1;
        for (let i = 0; i < block.length; i++) {
          for (const clue of neighborhoodOf(rows, cols, block[i].r, block[i].c)) {
            const clueId = clue.r * cols + clue.c;
            if (seenClues[clueId] || grid[clue.r][clue.c].status !== 'revealed') continue;
            seenClues[clueId] = 1;
            for (const neighbor of neighborhoodOf(rows, cols, clue.r, clue.c)) {
              const id = neighbor.r * cols + neighbor.c;
              if (seen[id] || grid[neighbor.r][neighbor.c].status !== 'hidden') continue;
              seen[id] = 1;
              block.push(neighbor);
            }
          }
        }
        blocks.push(block);
      }
    }
    return blocks.sort((a, b) => a.length - b.length);
  }

  function enumerateCompensationBlock(block: FrontierVar[]): Map<number, Int8Array> {
    const index = new Map(block.map((cell, i) => [`${cell.r}-${cell.c}`, i]));
    const equationsByVar = block.map<RevealedConstraint[]>(() => []);
    for (const constraint of buildConstraints(block, index)) {
      for (const variable of constraint.varIdxs) equationsByVar[variable].push(constraint);
    }

    const originalMines = block.filter(cell => grid[cell.r][cell.c].isMine).length;
    const layouts = new Map<number, Int8Array>();
    const assignment = new Int8Array(block.length).fill(-1);
    visit(0, 0);
    return layouts;

    function visit(index: number, mines: number): void {
      if (index === assignment.length) {
        const delta = mines - originalMines;
        // Keeping a block unchanged is always available without a search branch.
        if (delta !== 0 && !layouts.has(delta)) layouts.set(delta, new Int8Array(assignment));
        return;
      }
      // External blocks have at most ten cells. Every value tried shares the prayer budget.
      for (let value = 0; value <= 1 && budget.used < prayerNodeLimit; value++) {
        budget.used++;
        assignment[index] = value;
        const feasible = equationsByVar[index].every(constraint => {
          let placed = constraint.fixed;
          let undecided = 0;
          for (const variable of constraint.varIdxs) {
            if (assignment[variable] === 1) placed++;
            else if (assignment[variable] === -1) undecided++;
          }
          return placed <= constraint.need && constraint.need <= placed + undecided;
        });
        if (feasible) visit(index + 1, mines + value);
      }
      assignment[index] = -1;
    }
  }

  function collectTargetComponent(): FrontierVar[] {
    const list: FrontierVar[] = [];
    const seen = new Set<string>();
    const queue: FrontierVar[] = [];
    const add = (r: number, c: number): void => {
      if (!inBounds(r, c)) return;
      if (list.length >= frontierLimit && (!trackShortage || frontierTruncated)) return;
      const cell = grid[r][c];
      // 插旗格不是变量。已翻开格也不是。
      if (cell.status !== 'hidden') return;
      const key = `${r}-${c}`;
      if (seen.has(key)) return;
      if (list.length >= frontierLimit) {
        frontierTruncated = true;
        return;
      }
      seen.add(key);
      list.push({ r, c });
      queue.push({ r, c });
    };

    add(targetRow, targetCol);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const [dr, dc] of DIRECTIONS) {
        const nr = cur.r + dr;
        const nc = cur.c + dc;
        if (!inBounds(nr, nc) || grid[nr][nc].status !== 'revealed') continue;
        for (const [ddr, ddc] of DIRECTIONS) {
          add(nr + ddr, nc + ddc);
        }
      }
    }
    return list;
  }

  function buildConstraints(frontier: FrontierVar[], index: Map<string, number>): RevealedConstraint[] {
    const map = new Map<string, RevealedConstraint>();
    for (const v of frontier) {
      for (const [dr, dc] of DIRECTIONS) {
        const nr = v.r + dr;
        const nc = v.c + dc;
        if (!inBounds(nr, nc) || grid[nr][nc].status !== 'revealed') continue;
        const id = `${nr}-${nc}`;
        if (map.has(id)) continue;
        const constraint: RevealedConstraint = {
          need: grid[nr][nc].neighborMines,
          varIdxs: [],
          fixed: 0,
        };
        for (const [ddr, ddc] of DIRECTIONS) {
          const rr = nr + ddr;
          const cc = nc + ddc;
          if (!inBounds(rr, cc)) continue;
          const idx = index.get(`${rr}-${cc}`);
          if (idx !== undefined) constraint.varIdxs.push(idx);
          else if (grid[rr][cc].isMine) constraint.fixed++;
        }
        map.set(id, constraint);
      }
    }
    return Array.from(map.values());
  }

  // 只按已翻开数字做一次传播，用来估计目标格周围雷数的可行闭区间。
  function estimateSafeRange(): { kMin: number; kMax: number } | null {
    const assignment = new Int8Array(vars.length).fill(-1);
    assignment[targetIdx] = 0;
    if (!propagate(assignment, null, true)) return null;
    let forced = fixedNeighborMines;
    let slots = freeNeighbors.length;
    for (const idx of neighborVarIdxs) {
      if (assignment[idx] === 1) forced++;
      else if (assignment[idx] === -1) slots++;
    }
    return { kMin: forced, kMax: forced + slots };
  }

  function search(desiredK: number | null, nodeLimit: number, checkBalance = true): SolvedLayout | 'budget' | null {
    const root = new Int8Array(vars.length).fill(-1);
    root[targetIdx] = forceMine ? 1 : 0;
    if (!propagate(root, desiredK, !checkBalance)) return null;

    const stack: Array<{ vi: number; tried: number; options: Array<0 | 1>; snap: Int8Array }> = [];
    const rootVar = pickVar(root);
    if (rootVar < 0) {
      const freeCount = checkBalance ? acceptedFreeCount(root, desiredK) : 0;
      return freeCount === null ? null : { assignment: root, freeCount };
    }
    stack.push({ vi: rootVar, tried: 0, options: branchOptions(rootVar), snap: root });

    while (stack.length > 0) {
      if (budget.used >= nodeLimit) return 'budget';
      const frame = stack[stack.length - 1];
      if (frame.tried >= frame.options.length) {
        stack.pop();
        continue;
      }
      const trial = new Int8Array(frame.snap);
      trial[frame.vi] = frame.options[frame.tried++];
      budget.used++;
      if (!propagate(trial, desiredK, !checkBalance)) continue;
      const nextVar = pickVar(trial);
      if (nextVar < 0) {
        const freeCount = checkBalance ? acceptedFreeCount(trial, desiredK) : 0;
        if (freeCount !== null) return { assignment: trial, freeCount };
        continue;
      }
      stack.push({ vi: nextVar, tried: 0, options: branchOptions(nextVar), snap: trial });
    }
    return null;
  }

  function branchOptions(index: number): Array<0 | 1> {
    if (retryFrontier) {
      const { r, c } = vars[index];
      return grid[r][c].isMine ? [1, 0] : [0, 1];
    }
    return rng() > 0.5 ? [0, 1] : [1, 0];
  }

  function pickVar(assignment: Int8Array): number {
    let best = -1;
    let bestSlack = Number.POSITIVE_INFINITY;
    for (const constraint of constraints) {
      let undecided = 0;
      for (const idx of constraint.varIdxs) {
        if (assignment[idx] === -1) undecided++;
      }
      for (const idx of constraint.varIdxs) {
        if (assignment[idx] !== -1) continue;
        if (undecided < bestSlack || (undecided === bestSlack && idx < best)) {
          bestSlack = undecided;
          best = idx;
        }
      }
    }
    if (best >= 0) return best;
    for (let i = 0; i < assignment.length; i++) {
      if (assignment[i] === -1) return i;
    }
    return -1;
  }

  // constraintsOnly 为真时只传播已翻开数字，用来估计 k 的区间，不把雷数窗口写进去。
  // 雷数窗口刚强制了一批格子之后必须再跑一圈已翻开数字，两边交替直到不再变化。
  function propagate(assignment: Int8Array, desiredK: number | null, constraintsOnly: boolean): boolean {
    const limit = assignment.length + 5;
    for (let guard = 0; guard < limit; guard++) {
      const before = new Int8Array(assignment);
      if (!applyConstraints(assignment)) return false;
      if (!constraintsOnly && !enforceMineWindow(assignment, desiredK)) {
        noteShortage(assignment);
        return false;
      }
      let changed = false;
      for (let i = 0; i < assignment.length; i++) {
        if (before[i] !== assignment[i]) {
          changed = true;
          break;
        }
      }
      if (!changed) return true;
    }
    return false;
  }

  function applyConstraints(assignment: Int8Array): boolean {
    for (const constraint of constraints) {
      let placed = constraint.fixed;
      const open: number[] = [];
      for (const idx of constraint.varIdxs) {
        const value = assignment[idx];
        if (value === 1) placed++;
        else if (value === -1) open.push(idx);
      }
      const undecided = open.length;
      if (placed > constraint.need || placed + undecided < constraint.need) return false;
      if (undecided === 0) continue;
      if (placed === constraint.need) {
        for (const idx of open) assignment[idx] = 0;
      } else if (placed + undecided === constraint.need) {
        for (const idx of open) assignment[idx] = 1;
      }
    }
    return true;
  }

  function enforceMineWindow(assignment: Int8Array, desiredK: number | null): boolean {
    const low = minChangedMines;
    const high = maxChangedMines;

    if (desiredK === null) {
      // 自由邻居不进入搜索树，但可以补足雷数下界。
      return forceRange(assignment, varsIndexList(), low - freeNeighbors.length, high);
    }

    // 周围雷数 k = 固定雷 + 连通块里的邻居雷 + 自由邻居雷。自由邻居不进搜索树。
    const needHi = desiredK - fixedNeighborMines;
    const needLo = needHi - freeNeighbors.length;
    if (!forceRange(assignment, neighborVarIdxs, needLo, needHi)) return false;

    // 最终雷数 = 非邻居变量上的雷 + k - 固定雷。窗口两边分别受孤立雷、孤立安全格的数量限制：
    // 变多只能关掉孤立雷，变少只能把孤立安全格改成雷。补不平的分配在这里剪掉。
    const constant = desiredK - fixedNeighborMines;
    let placed = 0;
    const open: number[] = [];
    for (let i = 0; i < assignment.length; i++) {
      if (neighborVarSet[i]) continue;
      if (assignment[i] === 1) placed++;
      else if (assignment[i] === -1) open.push(i);
    }
    const undecided = open.length;
    if (placed + constant > high || placed + undecided + constant < low) return false;
    if (undecided > 0 && placed + constant === high) {
      for (const idx of open) assignment[idx] = 0;
    } else if (undecided > 0 && placed + undecided + constant === low) {
      for (const idx of open) assignment[idx] = 1;
    }
    return true;
  }

  function varsIndexList(): number[] {
    const list: number[] = [];
    for (let i = 0; i < vars.length; i++) list.push(i);
    return list;
  }

  function forceRange(assignment: Int8Array, idxs: number[], low: number, high: number): boolean {
    let placed = 0;
    const open: number[] = [];
    for (const idx of idxs) {
      if (assignment[idx] === 1) placed++;
      else if (assignment[idx] === -1) open.push(idx);
    }
    const undecided = open.length;
    if (placed > high || placed + undecided < low) return false;
    if (undecided > 0 && placed === high) {
      for (const idx of open) assignment[idx] = 0;
    } else if (undecided > 0 && placed + undecided === low) {
      for (const idx of open) assignment[idx] = 1;
    }
    return true;
  }

  function constraintsSatisfied(assignment: Int8Array): boolean {
    for (const constraint of constraints) {
      let placed = constraint.fixed;
      for (const idx of constraint.varIdxs) {
        if (assignment[idx] === 1) placed++;
        else if (assignment[idx] !== 0) return false;
      }
      if (placed !== constraint.need) return false;
    }
    return true;
  }

  function acceptedFreeCount(assignment: Int8Array, desiredK: number | null): number | null {
    if (!constraintsSatisfied(assignment)) return null;
    if (assignment[targetIdx] !== (forceMine ? 1 : 0)) return null;
    let assignedMines = 0;
    for (let i = 0; i < assignment.length; i++) {
      if (assignment[i] === 1) assignedMines++;
      else if (assignment[i] !== 0) return null;
    }

    const minFreeMines = Math.max(0, minChangedMines - assignedMines);
    const maxFreeMines = Math.min(freeNeighbors.length, maxChangedMines - assignedMines);
    if (minFreeMines > maxFreeMines) return null;
    if (desiredK === null) {
      return Math.max(minFreeMines, Math.min(maxFreeMines, originalFreeMines));
    }

    let neighborPlaced = 0;
    for (const idx of neighborVarIdxs) {
      if (assignment[idx] === 1) neighborPlaced++;
    }
    const freeCount = desiredK - fixedNeighborMines - neighborPlaced;
    return freeCount >= minFreeMines && freeCount <= maxFreeMines ? freeCount : null;
  }

  function chooseFreeMineCount(mines: number): number | null {
    const low = Math.max(0, minChangedMines - mines);
    const high = Math.min(freeNeighbors.length, maxChangedMines - mines);
    return low <= high ? Math.max(low, Math.min(high, originalFreeMines)) : null;
  }

  function applyLayout(solved: SolvedLayout, compensation: CompensationLayout[] = []): boolean {
    restore();
    for (let i = 0; i < vars.length; i++) {
      grid[vars[i].r][vars[i].c].isMine = solved.assignment[i] === 1;
    }
    if (freeNeighbors.length > 0) {
      const order =
        solved.freeCount > 0 && solved.freeCount < freeNeighbors.length
          ? shuffleCopy(freeNeighbors, rng)
          : freeNeighbors;
      for (let i = 0; i < order.length; i++) {
        grid[order[i].r][order[i].c].isMine = i < solved.freeCount;
      }
    }

    for (const { cells, assignment } of compensation) {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        grid[cell.r][cell.c].isMine = assignment[i] === 1;
      }
    }

    const diff = countAllMines(grid) - originalTotal;
    // diff > 0：这一块雷变多，关掉同样多的孤立雷。
    // diff < 0：这一块雷变少，把同样多的孤立安全格改成雷。
    // 池子不够就放弃，不能带着差额成功返回。
    if (diff > 0) {
      if (isolatedMines.length < diff) {
        rejectedLayout = true;
        restore();
        return false;
      }
      const pool = shuffleCopy(isolatedMines, rng);
      for (let i = 0; i < diff; i++) grid[pool[i].r][pool[i].c].isMine = false;
    } else if (diff < 0) {
      const need = -diff;
      if (isolatedSafes.length < need) {
        rejectedLayout = true;
        restore();
        return false;
      }
      const pool = shuffleCopy(isolatedSafes, rng);
      for (let i = 0; i < need; i++) grid[pool[i].r][pool[i].c].isMine = true;
    }
    const applied = commit();
    rejectedLayout ||= !applied;
    return applied;
  }
};

// --- CSP Solver ---

// Exported for ACE testing: allows external code to query CSP solvability.
// 重排期间守住三条不变量，任何一条失败都恢复进入函数时的 isMine 与 neighborMines：
// 1. 全盘雷数不变。顶栏剩余雷是「难度雷数 - 已插旗数」，雷总数一变，显示就会和真实雷数矛盾。
// 2. 已插旗格子的 isMine 不翻转。旗还在、雷被搬走时，隐藏雷会比顶栏多。
// 3. 已翻开格子的数字仍等于周围真实雷数，并且与进入时的数字相同。
// 这条路径只使用调用方传入的 rng。
export const rearrangeMines = (
  grid: CellData[][],
  targetRow: number,
  targetCol: number,
  forceMine: boolean,
  rng: () => number = Math.random,
  observeAttempt?: (attempt: RearrangementAttempt) => void,
  version: ReplayVersion = CURRENT_REPLAY_VERSION,
): boolean => {
  const rows = grid.length;
  const cols = grid[0].length;
  const target = grid[targetRow][targetCol];

  // 旗子钉死雷位。对得上就不用动；对不上也不能翻，否则剩余雷会和顶栏矛盾。
  if (target.status === 'flagged') return target.isMine === forceMine;
  if (target.isMine === forceMine) return true;
  if (target.status !== 'hidden') return false;

  const originalTotal = countAllMines(grid);
  const mineSnap: boolean[][] = grid.map((row) => row.map((cell) => cell.isMine));
  const countSnap: number[][] = grid.map((row) => row.map((cell) => cell.neighborMines));

  const restore = (): void => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c].isMine = mineSnap[r][c];
        grid[r][c].neighborMines = countSnap[r][c];
      }
    }
  };

  // 回填之后再核对。已翻开数字必须和快照一致，不能把新算出来的数写进已经翻开的格子。
  const invariantsHold = (): boolean => {
    if (countAllMines(grid) !== originalTotal) return false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.status === 'flagged' && cell.isMine !== mineSnap[r][c]) return false;
        if (cell.status === 'revealed' && cell.neighborMines !== countSnap[r][c]) return false;
      }
    }
    return true;
  };

  const commit = (): boolean => {
    recountAllNeighborMines(grid);
    if (!invariantsHold() || grid[targetRow][targetCol].isMine !== forceMine) {
      restore();
      return false;
    }
    return true;
  };

  // 无已翻开约束时走直接交换：总雷数不变，且不碰插旗格。
  // 祈祷还要把目标格周围雷数抽成离散正态；诅咒只把目标格变成雷。
  const ctx: RearrangeCtx = {
    grid,
    rows,
    cols,
    targetRow,
    targetCol,
    forceMine,
    rng,
    originalTotal,
    preferredPrayerOnly: !forceMine && version >= 3,
    observeFailure: observeAttempt !== undefined,
    restore,
    commit,
  };
  let outcome: RearrangementAttempt['outcome'];
  if (!forceMine && canResampleWithoutConstraints(grid, targetRow, targetCol)) {
    outcome = resampleSafeNeighborhood(ctx);
    if (!ctx.preferredPrayerOnly && outcome === 'isolated_shortage') outcome = solveConstrained(ctx, { onlyCompensation: true });
  } else if (forceMine && !hasRevealedNeighbor(grid, targetRow, targetCol)) {
    outcome = swapInIsolatedMine(ctx);
  } else {
    const budget: SolveBudget = { used: 0 };
    outcome = solveConstrained(ctx, { budget });
    if (!forceMine && !ctx.preferredPrayerOnly && outcome === 'frontier_limit' && budget.used < LEGACY_PRAYER_SOLVE_NODES) {
      outcome = solveConstrained(ctx, { budget, retryFrontier: true });
    }
  }
  observeAttempt?.({ kind: forceMine ? 'curse' : 'prayer', outcome });
  return outcome === 'success';
};

// --- Chording ---

export const getChordTargets = (grid: CellData[][], r: number, c: number): { r: number; c: number }[] => {
  const cell = grid[r][c];
  if (cell.status !== 'revealed' || cell.neighborMines === 0) return [];

  let flagCount = 0;
  const hiddenNeighbors: { r: number; c: number }[] = [];
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      const neighbor = grid[nr][nc];
      if (neighbor.status === 'flagged') flagCount++;
      else if (neighbor.status === 'hidden') hiddenNeighbors.push({ r: nr, c: nc });
    }
  });

  return flagCount === cell.neighborMines ? hiddenNeighbors : [];
};

// --- Reveal ---

export const revealCellFast = (
  grid: CellData[][],
  row: number,
  col: number,
  isFirstClick: boolean,
  isPraying: boolean,
  rng: () => number = Math.random,
  observeAttempt?: (attempt: RearrangementAttempt) => void,
  version: ReplayVersion = CURRENT_REPLAY_VERSION,
): { grid: CellData[][]; exploded: boolean; prayerConsumed: boolean } => {
  const newGrid = cloneGrid(grid);
  const cell = newGrid[row][col];
  let prayerConsumed = false;

  if (cell.status !== 'hidden') {
    return { grid: newGrid, exploded: false, prayerConsumed: false };
  }

  // Curse / Prayer logic
  if (!isFirstClick) {
    if (isPraying) {
      if (newGrid[row][col].isMine) {
        prayerConsumed = true;
        // 快速搜索失败时返回原雷位。调用方在确认祈祷结果前运行全盘兜底。
        rearrangeMines(newGrid, row, col, false, rng, observeAttempt, version);
      } else {
        prayerConsumed = true;
      }
    } else {
      if (!newGrid[row][col].isMine) {
        rearrangeMines(newGrid, row, col, true, rng, observeAttempt);
      }
    }
  }

  if (newGrid[row][col].isMine) {
    newGrid[row][col].status = 'revealed';
    newGrid[row][col].isExploded = true;
    return { grid: newGrid, exploded: true, prayerConsumed };
  }

  // 泛洪用堆上的数组，不用调用栈。入栈前先标记，避免同一个安全格被多个空邻居重复推进。
  const floodRows = newGrid.length;
  const floodCols = newGrid[0].length;
  const queued: boolean[][] = Array.from({ length: floodRows }, () => Array<boolean>(floodCols).fill(false));
  const stack: Array<[number, number]> = [[row, col]];
  queued[row][col] = true;
  while (stack.length > 0) {
    const [currR, currC] = stack.pop()!;
    const current = newGrid[currR][currC];
    if (current.status === 'revealed') continue;
    if (current.status === 'flagged') current.status = 'hidden';
    current.status = 'revealed';

    if (current.neighborMines === 0) {
      for (const [dr, dc] of DIRECTIONS) {
        const nr = currR + dr;
        const nc = currC + dc;
        if (nr < 0 || nr >= floodRows || nc < 0 || nc >= floodCols) continue;
        if (queued[nr][nc]) continue;
        const neighbor = newGrid[nr][nc];
        if (neighbor.status === 'hidden' && !neighbor.isMine) {
          queued[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
    }
  }

  return { grid: newGrid, exploded: false, prayerConsumed };
};

export type RevealResult = ReturnType<typeof revealCellFast>;

// Called only after a failed fast prayer, with the board as it was before the click.
export function completeExactPrayer(grid: CellData[][], row: number, col: number): RevealResult | null {
  const mines = exactPrayerLayout(grid, row, col);
  if (!mines) return null;
  const board = cloneGrid(grid);
  const width = board[0].length;
  for (const line of board) {
    for (const cell of line) cell.isMine = mines[cell.row * width + cell.col];
  }
  recountAllNeighborMines(board);
  return revealCellFast(board, row, col, false, true);
}

export const revealCellLogic: typeof revealCellFast = (grid, row, col, first, prayer, rng, observe, version = CURRENT_REPLAY_VERSION) => {
  if (version === 1) return revealCellFast(grid, row, col, first, prayer, rng, observe, version);
  let attempt: RearrangementAttempt | undefined;
  const fast = revealCellFast(grid, row, col, first, prayer, rng, observe && (event => { attempt = event; }), version);
  const exact = prayer && fast.exploded ? completeExactPrayer(grid, row, col) : null;
  if (attempt) observe?.(exact ? { kind: 'prayer', outcome: 'success' } : attempt);
  return exact ?? fast;
};

// --- Game-over reveal ---

export const revealAllMines = (grid: CellData[][]): CellData[][] => {
  return grid.map(row =>
    row.map(cell => {
      if (cell.isMine && cell.status === 'flagged') return cell;
      if (cell.isMine && cell.status === 'hidden')
        return { ...cell, status: 'revealed' as const };
      if (!cell.isMine && cell.status === 'flagged')
        return { ...cell, status: 'revealed' as const, isMisflagged: true };
      return cell;
    }),
  );
};

// --- Win check ---

export const checkWin = (grid: CellData[][]): boolean => {
  for (const row of grid) {
    for (const cell of row) {
      if (!cell.isMine && cell.status !== 'revealed') return false;
      if (cell.isMine && cell.status === 'revealed') return false;
    }
  }
  return true;
};
