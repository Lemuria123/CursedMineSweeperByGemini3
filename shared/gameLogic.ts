// Shared game logic — pure functions used by both frontend and server replay verification.
// No React-specific code here (e.g. preserveRefs lives in the frontend wrapper).

import { CellData } from './types';

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

const updateLocalCounts = (grid: CellData[][], r: number, c: number) => {
  const rows = grid.length;
  const cols = grid[0].length;
  grid[r][c].neighborMines = countMinesAround(grid, r, c);
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      grid[nr][nc].neighborMines = countMinesAround(grid, nr, nc);
    }
  });
};

const getRevealedNeighbors = (grid: CellData[][], r: number, c: number): string[] => {
  const neighbors: string[] = [];
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      if (grid[nr][nc].status === 'revealed') {
        neighbors.push(grid[nr][nc].id);
      }
    }
  });
  return neighbors.sort();
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

// --- CSP Solver ---

// Exported for ACE testing: allows external code to query CSP solvability
export const rearrangeMines = (
  grid: CellData[][],
  targetRow: number,
  targetCol: number,
  forceMine: boolean,
  rng: () => number = Math.random,
): boolean => {
  const rows = grid.length;
  const cols = grid[0].length;
  const currentIsMine = grid[targetRow][targetCol].isMine;

  if (currentIsMine === forceMine) return true;

  // Immediate constraints
  const immediateConstraints: { r: number; c: number }[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const nr = targetRow + dr;
    const nc = targetCol + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
      immediateConstraints.push({ r: nr, c: nc });
    }
  }

  // --- SIMPLE: no constraints ---
  if (immediateConstraints.length === 0) {
    const candidates: { r: number; c: number }[] = [];
    const lookingForMine = forceMine;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (
          grid[r][c].status === 'hidden' &&
          grid[r][c].isMine === lookingForMine &&
          (r !== targetRow || c !== targetCol)
        ) {
          if (getRevealedNeighbors(grid, r, c).length === 0) candidates.push({ r, c });
        }
      }
    }
    if (candidates.length > 0) {
      const swap = candidates[Math.floor(rng() * candidates.length)];
      grid[targetRow][targetCol].isMine = forceMine;
      grid[swap.r][swap.c].isMine = !forceMine;
      updateLocalCounts(grid, targetRow, targetCol);
      updateLocalCounts(grid, swap.r, swap.c);
      return true;
    }
    return false;
  }

  // --- COMPLEX: BFS frontier ---
  const frontierSet = new Set<string>();
  const frontierList: { r: number; c: number; wasMine: boolean; id: string }[] = [];
  const frontierIndexMap = new Map<string, number>();
  const visitedConstraints = new Set<string>();
  const processingQueue: { r: number; c: number }[] = [];

  const addToFrontier = (r: number, c: number) => {
    const id = `${r}-${c}`;
    if (!frontierSet.has(id)) {
      frontierSet.add(id);
      frontierIndexMap.set(id, frontierList.length);
      frontierList.push({ r, c, wasMine: grid[r][c].isMine, id });
      processingQueue.push({ r, c });
    }
  };

  addToFrontier(targetRow, targetCol);

  const MAX_FRONTIER_SIZE = 50;
  let head = 0;
  while (head < processingQueue.length && frontierList.length < MAX_FRONTIER_SIZE) {
    const curr = processingQueue[head++];
    for (const [dr, dc] of DIRECTIONS) {
      const nr = curr.r + dr;
      const nc = curr.c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
        const constraintId = `${nr}-${nc}`;
        if (!visitedConstraints.has(constraintId)) {
          visitedConstraints.add(constraintId);
          for (const [ddr, ddc] of DIRECTIONS) {
            const nnr = nr + ddr;
            const nnc = nc + ddc;
            if (
              nnr >= 0 && nnr < rows && nnc >= 0 && nnc < cols &&
              grid[nnr][nnc].status !== 'revealed'
            ) {
              addToFrontier(nnr, nnc);
            }
          }
        }
      }
    }
    // Exit strategy: unconstrained sink
    for (const [dr, dc] of DIRECTIONS) {
      const nr = curr.r + dr;
      const nc = curr.c + dc;
      if (
        nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
        grid[nr][nc].status !== 'revealed' &&
        !frontierSet.has(`${nr}-${nc}`)
      ) {
        if (getRevealedNeighbors(grid, nr, nc).length === 0) {
          addToFrontier(nr, nc);
        }
      }
    }
  }

  // All constraints
  const allConstraintsMap = new Map<string, { r: number; c: number; val: number }>();
  for (const f of frontierList) {
    for (const [dr, dc] of DIRECTIONS) {
      const nr = f.r + dr;
      const nc = f.c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
        const id = `${nr}-${nc}`;
        if (!allConstraintsMap.has(id)) {
          allConstraintsMap.set(id, { r: nr, c: nc, val: grid[nr][nc].neighborMines });
        }
      }
    }
  }
  const allConstraints = Array.from(allConstraintsMap.values());

  // Global balancing options
  const isolatedMines: { r: number; c: number }[] = [];
  const isolatedSafe: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].status === 'hidden' && !frontierSet.has(`${r}-${c}`)) {
        const n = getRevealedNeighbors(grid, r, c);
        if (n.length === 0) {
          if (grid[r][c].isMine) isolatedMines.push({ r, c });
          else isolatedSafe.push({ r, c });
        }
      }
    }
  }

  const initialFrontierMines = frontierList.filter(f => f.wasMine).length;

  // Pruning helper
  const checkPartialValid = (g: CellData[][], currentIndex: number) => {
    for (const cc of allConstraints) {
      let placed = 0;
      let potential = 0;
      for (const [dr, dc] of DIRECTIONS) {
        const nr = cc.r + dr;
        const nc = cc.c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const cell = g[nr][nc];
          if (cell.status === 'revealed') {
            if (cell.isMine) placed++;
          } else {
            const fIdx = frontierIndexMap.get(cell.id);
            if (fIdx === undefined) {
              if (cell.isMine) placed++;
            } else if (fIdx <= currentIndex) {
              if (cell.isMine) placed++;
            } else {
              potential++;
            }
          }
        }
      }
      if (placed > cc.val) return false;
      if (placed + potential < cc.val) return false;
    }
    return true;
  };

  const checkFinalConstraints = (): boolean => {
    for (const cc of allConstraints) {
      let mines = 0;
      for (const [dr, dc] of DIRECTIONS) {
        const nr = cc.r + dr;
        const nc = cc.c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (grid[nr][nc].isMine) mines++;
        }
      }
      if (mines !== cc.val) return false;
    }
    return true;
  };

  let iterations = 0;
  const MAX_ITERATIONS = 100000;

  const solve = (index: number, currentMines: number, minTotal: number, maxTotal: number): boolean => {
    if (++iterations > MAX_ITERATIONS) return false;
    if (currentMines > maxTotal) return false;
    const remainingCells = frontierList.length - index;
    if (currentMines + remainingCells < minTotal) return false;
    if (index >= frontierList.length) return checkFinalConstraints();

    const cell = frontierList[index];
    let attempts = [true, false];
    if (cell.r === targetRow && cell.c === targetCol) {
      attempts = [forceMine];
    } else if (rng() > 0.5) {
      attempts = [false, true];
    }

    for (const isMine of attempts) {
      grid[cell.r][cell.c].isMine = isMine;
      if (checkPartialValid(grid, index)) {
        if (solve(index + 1, currentMines + (isMine ? 1 : 0), minTotal, maxTotal)) return true;
      }
    }
    return false;
  };

  // Phase 1: same mine count
  if (!solve(0, 0, initialFrontierMines, initialFrontierMines)) {
    // Phase 2: global balance
    const minPossible = initialFrontierMines - isolatedMines.length;
    const maxPossible = initialFrontierMines + isolatedSafe.length;
    for (const f of frontierList) grid[f.r][f.c].isMine = f.wasMine;
    if (!solve(0, 0, minPossible, maxPossible)) {
      for (const f of frontierList) grid[f.r][f.c].isMine = f.wasMine;
      return false;
    }
  }

  // Global balance application
  const newMineCount = frontierList.filter(f => grid[f.r][f.c].isMine).length;
  const diff = newMineCount - initialFrontierMines;

  if (diff > 0) {
    let removed = 0;
    while (removed < diff && isolatedMines.length > 0) {
      const idx = Math.floor(rng() * isolatedMines.length);
      const cand = isolatedMines.splice(idx, 1)[0];
      grid[cand.r][cand.c].isMine = false;
      updateLocalCounts(grid, cand.r, cand.c);
      removed++;
    }
  } else if (diff < 0) {
    let added = 0;
    const toAdd = Math.abs(diff);
    while (added < toAdd && isolatedSafe.length > 0) {
      const idx = Math.floor(rng() * isolatedSafe.length);
      const cand = isolatedSafe.splice(idx, 1)[0];
      grid[cand.r][cand.c].isMine = true;
      updateLocalCounts(grid, cand.r, cand.c);
      added++;
    }
  }

  for (const f of frontierList) updateLocalCounts(grid, f.r, f.c);
  for (const cc of allConstraints) updateLocalCounts(grid, cc.r, cc.c);

  return true;
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

export const revealCellLogic = (
  grid: CellData[][],
  row: number,
  col: number,
  isFirstClick: boolean,
  isPraying: boolean,
  rng: () => number = Math.random,
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
        const success = rearrangeMines(newGrid, row, col, false, rng);
        // If CSP fails, the cell is provably a mine — prayer cannot save.
        // The cell remains a mine and will explode below.
      } else {
        prayerConsumed = true;
      }
    } else {
      if (!newGrid[row][col].isMine) {
        rearrangeMines(newGrid, row, col, true, rng);
      }
    }
  }

  if (newGrid[row][col].isMine) {
    newGrid[row][col].status = 'revealed';
    newGrid[row][col].isExploded = true;
    return { grid: newGrid, exploded: true, prayerConsumed };
  }

  // Flood fill
  const stack = [[row, col]];
  while (stack.length > 0) {
    const [currR, currC] = stack.pop()!;
    const current = newGrid[currR][currC];
    if (current.status === 'revealed') continue;
    if (current.status === 'flagged') current.status = 'hidden';
    current.status = 'revealed';

    if (current.neighborMines === 0) {
      DIRECTIONS.forEach(([dr, dc]) => {
        const nr = currR + dr;
        const nc = currC + dc;
        if (nr >= 0 && nr < newGrid.length && nc >= 0 && nc < newGrid[0].length) {
          const neighbor = newGrid[nr][nc];
          if (neighbor.status === 'hidden' && !neighbor.isMine) {
            stack.push([nr, nc]);
          }
        }
      });
    }
  }

  return { grid: newGrid, exploded: false, prayerConsumed };
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
