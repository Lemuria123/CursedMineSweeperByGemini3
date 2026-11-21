import type { CellData } from './types';

interface Equation {
  groups: number[];
  mines: number;
}

type ExactPrayerResult =
  | { kind: 'solution'; mines: boolean[] }
  | { kind: 'clueContradiction' }
  | { kind: 'searchExhausted' };

export function exactPrayerLayout(grid: CellData[][], row: number, col: number): boolean[] | null {
  const result = solveExactPrayer(grid, row, col);
  return result.kind === 'solution' ? result.mines : null;
}

// Hidden cells seen by exactly the same clues are interchangeable. Search their
// integer mine counts, including one group for all cells outside the frontier.
// The target is pinned safe and flags retain their actual state (including false flags).
export function solveExactPrayer(grid: CellData[][], row: number, col: number): ExactPrayerResult {
  const cells = grid.flat();
  const width = grid[0].length;
  const target = row * width + col;
  const equations: Equation[] = [];
  const membership = cells.map(() => [] as number[]);
  for (const cell of cells) {
    if (cell.status !== 'revealed') continue;
    const eq: Equation = { groups: [], mines: cell.neighborMines };
    for (let r = Math.max(0, cell.row - 1); r <= Math.min(grid.length - 1, cell.row + 1); r++) {
      for (let c = Math.max(0, cell.col - 1); c <= Math.min(width - 1, cell.col + 1); c++) {
        const other = grid[r][c];
        const id = r * width + c;
        if (other.status === 'flagged' && other.isMine) eq.mines--;
        if (other.status === 'hidden' && id !== target) membership[id].push(equations.length);
      }
    }
    equations.push(eq);
  }

  const groups: number[][] = [];
  const indices = new Map<string, number>();
  for (const [id, cell] of cells.entries()) {
    if (cell.status !== 'hidden' || id === target) continue;
    const key = membership[id].join(',');
    let index = indices.get(key);
    if (index === undefined) {
      index = groups.length;
      indices.set(key, index);
      groups.push([]);
      for (const clue of membership[id]) equations[clue].groups.push(index);
    }
    groups[index].push(id);
  }
  // Only a contradiction can terminate the precheck. The witness search starts with
  // its original bounds and branch order so successful layouts match older replays.
  if (cluesProveContradiction(equations, groups)) return { kind: 'clueContradiction' };
  equations.push({
    groups: groups.map((_, i) => i),
    mines: cells.filter(cell => cell.status === 'hidden' && cell.isMine).length,
  });
  const original = groups.map(ids => ids.filter(id => cells[id].isMine).length);
  const stack = [{ low: new Int32Array(groups.length), high: Int32Array.from(groups, ids => ids.length) }];
  while (stack.length) {
    const { low, high } = stack.pop()!;
    if (!propagate(equations, low, high)) continue;
    let choice = -1;
    let best = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const range = high[i] - low[i];
      const score = range / (1 + membership[groups[i][0]].length);
      if (range && score < best) { choice = i; best = score; }
    }
    if (choice < 0) {
      const mines = cells.map(cell => cell.status === 'flagged' && cell.isMine);
      groups.forEach((ids, i) => {
        const ordered = [...ids].sort((a,b) => Number(cells[b].isMine) - Number(cells[a].isMine));
        for (const id of ordered.slice(0, low[i])) mines[id] = true;
      });
      return { kind: 'solution', mines };
    }
    // Disjoint ranges cover every possible count. Visit the original count first.
    const preferred = Math.min(high[choice], Math.max(low[choice], original[choice]));
    if (low[choice] < preferred) {
      const upper = high.slice();
      upper[choice] = preferred - 1;
      stack.push({ low: low.slice(), high: upper });
    }
    if (preferred < high[choice]) {
      const lower = low.slice();
      lower[choice] = preferred + 1;
      stack.push({ low: lower, high: high.slice() });
    }
    low[choice] = high[choice] = preferred;
    stack.push({ low, high });
  }
  return { kind: 'searchExhausted' };
}

interface SignedClue {
  positive: number[];
  negative: number[];
  mines: number;
}

function cluesProveContradiction(clues: Equation[], groups: number[][]): boolean {
  const signed: SignedClue[] = [];
  const previousByGroup = groups.map(() => [] as Equation[]);
  for (const clue of clues) {
    if (!clue.groups.length) {
      if (clue.mines !== 0) return true;
      continue;
    }
    signed.push({ positive: clue.groups, negative: [], mines: clue.mines });
    const overlapping = new Set<Equation>();
    for (const group of clue.groups) {
      for (const previous of previousByGroup[group]) overlapping.add(previous);
      previousByGroup[group].push(clue);
    }
    for (const other of overlapping) {
      signed.push({
        positive: clue.groups.filter(group => !other.groups.includes(group)),
        negative: other.groups.filter(group => !clue.groups.includes(group)),
        mines: clue.mines - other.mines,
      });
    }
  }

  const low = new Int32Array(groups.length);
  const high = Int32Array.from(groups, group => group.length);
  let changed: boolean;
  do {
    changed = false;
    for (const { positive, negative, mines } of signed) {
      let min = 0, max = 0;
      for (const i of positive) { min += low[i]; max += high[i]; }
      for (const i of negative) { min -= high[i]; max -= low[i]; }
      if (mines < min || mines > max) return true;

      // Isolate one term in min <= sum(positive) - sum(negative) <= max.
      for (const i of positive) {
        const lower = Math.max(low[i], mines - max + high[i]);
        const upper = Math.min(high[i], mines - min + low[i]);
        if (lower !== low[i] || upper !== high[i]) {
          low[i] = lower;
          high[i] = upper;
          changed = true;
        }
      }
      for (const i of negative) {
        const lower = Math.max(low[i], min + high[i] - mines);
        const upper = Math.min(high[i], max + low[i] - mines);
        if (lower !== low[i] || upper !== high[i]) {
          low[i] = lower;
          high[i] = upper;
          changed = true;
        }
      }
    }
  } while (changed);
  return false;
}

function propagate(equations: Equation[], low: Int32Array, high: Int32Array): boolean {
  let changed: boolean;
  do {
    changed = false;
    for (const { groups, mines } of equations) {
      let min = 0, max = 0;
      for (const i of groups) { min += low[i]; max += high[i]; }
      if (min > mines || max < mines) return false;
      for (const i of groups) {
        const lower = Math.max(low[i], mines - max + high[i]);
        const upper = Math.min(high[i], mines - min + low[i]);
        if (low[i] !== lower || high[i] !== upper) {
          low[i] = lower;
          high[i] = upper;
          changed = true;
        }
      }
    }
  } while (changed);
  return true;
}
