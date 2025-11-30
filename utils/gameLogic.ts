
import { CellData, Difficulty } from '../types';

export const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// Formula provided by user: Total * (20% + 1 / Total^0.65)
// This reduces density for larger boards (e.g. from ~25% down to ~20%)
export const calculateRecommendedMines = (rows: number, cols: number): number => {
  const total = rows * cols;
  const factor = 0.20 + (1 / Math.pow(total, 0.65));
  return Math.floor(total * factor);
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

// Helper to get ALL valid neighbors (hidden or revealed)
export const getNeighbors = (grid: CellData[][], r: number, c: number): {r: number, c: number}[] => {
  const neighbors: {r: number, c: number}[] = [];
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      neighbors.push({r: nr, c: nc});
    }
  });
  return neighbors;
};

// Helper to count mines around a cell (based on truth, not flags)
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

// Update neighbor counts for a specific cell and its neighbors
const updateLocalCounts = (grid: CellData[][], r: number, c: number) => {
  const rows = grid.length;
  const cols = grid[0].length;
  
  // Update the cell itself
  grid[r][c].neighborMines = countMinesAround(grid, r, c);

  // Update its neighbors
  DIRECTIONS.forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      grid[nr][nc].neighborMines = countMinesAround(grid, nr, nc);
    }
  });
};

// Get signatures of revealed neighbors to ensure we don't break invariants
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
  firstClickCol: number
): CellData[][] => {
  const rows = grid.length;
  const cols = grid[0].length;
  let minesPlaced = 0;
  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));

  const isSafeZone = (r: number, c: number) => {
    return Math.abs(r - firstClickRow) <= 1 && Math.abs(c - firstClickCol) <= 1;
  };

  while (minesPlaced < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);

    if (!newGrid[r][c].isMine && !isSafeZone(r, c)) {
      newGrid[r][c].isMine = true;
      minesPlaced++;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newGrid[r][c].isMine) continue;
      newGrid[r][c].neighborMines = countMinesAround(newGrid, r, c);
    }
  }

  return newGrid;
};


// --- ADVANCED SOLVER (CURSE & PRAYER) ---

/**
 * The CSP Solver (Constraint Satisfaction Problem).
 * 
 * It rearranges local mines to enforce a specific state on the target cell (forceMine),
 * while strictly adhering to ALL surrounding numerical constraints.
 */
const rearrangeMines = (
    grid: CellData[][], 
    targetRow: number, 
    targetCol: number, 
    forceMine: boolean
): boolean => {
    const rows = grid.length;
    const cols = grid[0].length;
    const currentIsMine = grid[targetRow][targetCol].isMine;

    // Optimization: If already in desired state, return true (success)
    if (currentIsMine === forceMine) return true;

    // 1. Identify Immediate Constraints (Revealed cells around target)
    const immediateConstraints: {r: number, c: number}[] = [];
    for (const [dr, dc] of DIRECTIONS) {
        const nr = targetRow + dr;
        const nc = targetCol + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
            immediateConstraints.push({r: nr, c: nc});
        }
    }

    // --- SIMPLE CASE: No constraints ---
    if (immediateConstraints.length === 0) {
        // Find a valid swap partner globally
        const candidates: {r: number, c: number}[] = [];
        const lookingForMine = forceMine; 
        
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                // We need a hidden cell, with desired mine status, that is NOT constrained by neighbors
                if (grid[r][c].status === 'hidden' && grid[r][c].isMine === lookingForMine && (r !== targetRow || c !== targetCol)) {
                    const neighbors = getRevealedNeighbors(grid, r, c);
                    if (neighbors.length === 0) candidates.push({r, c});
                }
            }
        }

        if (candidates.length > 0) {
            const swap = candidates[Math.floor(Math.random() * candidates.length)];
            // Swap
            grid[targetRow][targetCol].isMine = forceMine;
            grid[swap.r][swap.c].isMine = !forceMine;
            
            updateLocalCounts(grid, targetRow, targetCol);
            updateLocalCounts(grid, swap.r, swap.c);
            return true;
        }
        return false;
    }

    // --- COMPLEX CASE: BFS Constraint Walker ---
    
    // We want to build a "Connected Component" of hidden cells that interact with each other.
    // We stop when the cluster is too big OR we find an "Exit" (an unconstrained cell).
    
    const frontierSet = new Set<string>();
    const frontierList: {r: number, c: number, wasMine: boolean, id: string}[] = [];
    const frontierIndexMap = new Map<string, number>();
    const visitedConstraints = new Set<string>();
    
    // Use a queue for BFS expansion
    const processingQueue: {r: number, c: number}[] = [];

    const addToFrontier = (r: number, c: number) => {
        const id = `${r}-${c}`;
        if (!frontierSet.has(id)) {
            frontierSet.add(id);
            frontierIndexMap.set(id, frontierList.length);
            frontierList.push({r, c, wasMine: grid[r][c].isMine, id});
            processingQueue.push({r, c});
        }
    };

    addToFrontier(targetRow, targetCol);

    // Limit Search Size (Performance vs Cleverness trade-off)
    // 50 is fairly deep for backtracking, but we prune aggressively.
    const MAX_FRONTIER_SIZE = 50;
    
    let head = 0;
    while(head < processingQueue.length && frontierList.length < MAX_FRONTIER_SIZE) {
        const curr = processingQueue[head++];
        
        // 1. Find all constraints touching this frontier cell
        for (const [dr, dc] of DIRECTIONS) {
            const nr = curr.r + dr;
            const nc = curr.c + dc;
            
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
                const constraintId = `${nr}-${nc}`;
                if (!visitedConstraints.has(constraintId)) {
                    visitedConstraints.add(constraintId);
                    
                    // 2. This constraint connects to OTHER hidden cells. Add them.
                    for (const [ddr, ddc] of DIRECTIONS) {
                        const nnr = nr + ddr;
                        const nnc = nc + ddc;
                        
                        if (nnr >= 0 && nnr < rows && nnc >= 0 && nnc < cols && grid[nnr][nnc].status !== 'revealed') {
                            addToFrontier(nnr, nnc);
                        }
                    }
                }
            }
        }

        // 3. EXIT STRATEGY (Heat Sink)
        // Does this frontier cell have a neighbor that is completely unconstrained?
        // If so, we can "dump" a mine there easily. Add it and consider stopping.
        // This bridges the "Gap" between dense clusters and open space.
        for (const [dr, dc] of DIRECTIONS) {
            const nr = curr.r + dr;
            const nc = curr.c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status !== 'revealed' && !frontierSet.has(`${nr}-${nc}`)) {
                // Check if unconstrained
                const revealedNeighbors = getRevealedNeighbors(grid, nr, nc);
                if (revealedNeighbors.length === 0) {
                     // Found a sink! Add it.
                     addToFrontier(nr, nc);
                     // We don't need to add ALL sinks, just one or two is enough to break the strict count.
                }
            }
        }
    }


    // 3. Identify ALL Constraints (Revealed cells touching ANY frontier cell)
    const allConstraintsMap = new Map<string, {r: number, c: number, val: number}>();
    
    for (const f of frontierList) {
        for (const [dr, dc] of DIRECTIONS) {
             const nr = f.r + dr;
             const nc = f.c + dc;
             if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].status === 'revealed') {
                 const id = `${nr}-${nc}`;
                 if (!allConstraintsMap.has(id)) {
                     allConstraintsMap.set(id, {r: nr, c: nc, val: grid[nr][nc].neighborMines});
                 }
             }
        }
    }
    const allConstraints = Array.from(allConstraintsMap.values());

    // 4. Pre-calculate Global Balancing Options (for Phase 2)
    const isolatedMines: {r: number, c: number}[] = [];
    const isolatedSafe: {r: number, c: number}[] = [];

    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            if (grid[r][c].status === 'hidden' && !frontierSet.has(`${r}-${c}`)) {
                const n = getRevealedNeighbors(grid, r, c);
                if (n.length === 0) {
                    if (grid[r][c].isMine) isolatedMines.push({r, c});
                    else isolatedSafe.push({r, c});
                }
            }
        }
    }

    const initialFrontierMines = frontierList.filter(f => f.wasMine).length;

    // 5. Backtracking Solver
    
    // Improved pruning function: checks both overflow and underflow
    const checkPartialValid = (g: CellData[][], currentIndex: number) => {
         for (const cc of allConstraints) {
            let placed = 0;       // Mines definitely placed (revealed + assigned true)
            let potential = 0;    // Mines that COULD be placed (unassigned frontier neighbors)

            for (const [dr, dc] of DIRECTIONS) {
                const nr = cc.r + dr;
                const nc = cc.c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    const cell = g[nr][nc];
                    
                    if (cell.status === 'revealed') {
                        if (cell.isMine) placed++;
                    } else {
                        // Hidden cell
                        const fIdx = frontierIndexMap.get(cell.id);
                        
                        if (fIdx === undefined) {
                            // Outside frontier: state is fixed
                            if (cell.isMine) placed++;
                        } else {
                            // Inside frontier
                            if (fIdx <= currentIndex) {
                                // Already assigned in recursion
                                if (cell.isMine) placed++;
                            } else {
                                // Not yet assigned (Future)
                                potential++;
                            }
                        }
                    }
                }
            }

            // Pruning Rules
            // 1. Overflow: We already have too many mines
            if (placed > cc.val) return false;
            
            // 2. Underflow: Even if all potential spots become mines, we can't reach the target
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

    const solve = (index: number, currentMines: number, minTotal: number, maxTotal: number): boolean => {
        // Global count pruning
        if (currentMines > maxTotal) return false;
        const remainingCells = frontierList.length - index;
        if (currentMines + remainingCells < minTotal) return false;

        if (index >= frontierList.length) {
            return checkFinalConstraints();
        }

        const cell = frontierList[index];
        
        let attempts = [true, false];
        if (cell.r === targetRow && cell.c === targetCol) {
            attempts = [forceMine];
        } else {
             // Heuristic: Randomized order helps find swaps naturally
             if (Math.random() > 0.5) attempts = [false, true];
        }

        for (const isMine of attempts) {
            grid[cell.r][cell.c].isMine = isMine;
            
            // Pass index to checkPartialValid so it knows which cells are 'future'
            if (checkPartialValid(grid, index)) {
                if (solve(index + 1, currentMines + (isMine ? 1 : 0), minTotal, maxTotal)) return true;
            }
        }
        
        return false;
    };


    // EXECUTION STRATEGY
    
    // Phase 1: Perfect Swap (Same mine count)
    const phase1Success = solve(0, 0, initialFrontierMines, initialFrontierMines);

    if (phase1Success) {
        // Success
    } else {
        // Phase 2: Global Balance
        const minPossible = initialFrontierMines - isolatedMines.length;
        const maxPossible = initialFrontierMines + isolatedSafe.length;
        
        // Reset grid for retry
        for (const f of frontierList) grid[f.r][f.c].isMine = f.wasMine;

        const phase2Success = solve(0, 0, minPossible, maxPossible);
        
        if (!phase2Success) {
            // Restore and Fail
            for (const f of frontierList) grid[f.r][f.c].isMine = f.wasMine;
            return false;
        }
    }

    // Apply Global Changes if needed
    const newMineCount = frontierList.filter(f => grid[f.r][f.c].isMine).length;
    const diff = newMineCount - initialFrontierMines;

    if (diff > 0) {
        let removed = 0;
        while (removed < diff) {
            const idx = Math.floor(Math.random() * isolatedMines.length);
            const cand = isolatedMines.splice(idx, 1)[0];
            grid[cand.r][cand.c].isMine = false;
            updateLocalCounts(grid, cand.r, cand.c);
            removed++;
        }
    } else if (diff < 0) {
        let added = 0;
        const toAdd = Math.abs(diff);
        while (added < toAdd) {
             const idx = Math.floor(Math.random() * isolatedSafe.length);
             const cand = isolatedSafe.splice(idx, 1)[0];
             grid[cand.r][cand.c].isMine = true;
             updateLocalCounts(grid, cand.r, cand.c);
             added++;
        }
    }

    // Final cleanup
    for (const f of frontierList) updateLocalCounts(grid, f.r, f.c);
    for (const cc of allConstraints) updateLocalCounts(grid, cc.r, cc.c);

    return true;
};


// --- CHORDING HELPER ---
export const getChordTargets = (grid: CellData[][], r: number, c: number): {r: number, c: number}[] => {
    const cell = grid[r][c];
    if (cell.status !== 'revealed' || cell.neighborMines === 0) return [];
    
    let flagCount = 0;
    const hiddenNeighbors: {r: number, c: number}[] = [];

    DIRECTIONS.forEach(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
            const neighbor = grid[nr][nc];
            if (neighbor.status === 'flagged') {
                flagCount++;
            } else if (neighbor.status === 'hidden') {
                hiddenNeighbors.push({r: nr, c: nc});
            }
        }
    });

    if (flagCount === cell.neighborMines) {
        return hiddenNeighbors;
    }
    return [];
}

export const revealCellLogic = (
  grid: CellData[][], 
  row: number, 
  col: number,
  isFirstClick: boolean,
  isPraying: boolean
): { grid: CellData[][], exploded: boolean, prayerConsumed: boolean } => {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  const cell = newGrid[row][col];
  let prayerConsumed = false;

  if (cell.status !== 'hidden') {
    return { grid: newGrid, exploded: false, prayerConsumed: false };
  }

  // --- STRICT MODE / PRAYER LOGIC ---
  if (!isFirstClick) {
     if (isPraying) {
         if (newGrid[row][col].isMine) {
             // Try to remove the mine.
             const success = rearrangeMines(newGrid, row, col, false);
             prayerConsumed = true; 
             // If success, isMine became false.
             // If failure, isMine remains true and will trigger explosion below.
         } else {
             // User prayed on a safe cell. Still consumes prayer.
             prayerConsumed = true;
         }
     } else {
         // Punishment Mode: If user clicks a safe cell (guessing), try to turn it into a mine.
         if (!newGrid[row][col].isMine) {
             rearrangeMines(newGrid, row, col, true);
         }
     }
  }

  // --- STANDARD MINE HIT LOGIC ---
  if (newGrid[row][col].isMine) {
    newGrid[row][col].status = 'revealed';
    newGrid[row][col].isExploded = true;
    return { grid: newGrid, exploded: true, prayerConsumed: isPraying };
  }

  // Normal Flood Fill Reveal
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

// UI UPDATE: Reveal Mines for Game Over
// 1. Unflagged mines -> Revealed
// 2. Flagged mines -> Keep Flagged
// 3. Flagged safe cells -> Revealed + Marked as Misflagged
export const revealAllMines = (grid: CellData[][]): CellData[][] => {
  return grid.map(row => row.map(cell => {
    // Correctly Flagged Mine -> Do nothing (Keep flag)
    if (cell.isMine && cell.status === 'flagged') {
        return cell;
    }
    // Hidden Mine -> Reveal it
    if (cell.isMine && cell.status === 'hidden') {
      return { ...cell, status: 'revealed' };
    }
    // Incorrect Flag (Safe cell flagged as mine) -> Reveal + Mark misflagged
    if (!cell.isMine && cell.status === 'flagged') {
        return { ...cell, status: 'revealed', isMisflagged: true };
    }
    return cell;
  }));
};

export const checkWin = (grid: CellData[][]): boolean => {
  for (const row of grid) {
    for (const cell of row) {
      if (!cell.isMine && cell.status !== 'revealed') {
        return false;
      }
      if (cell.isMine && cell.status === 'revealed') {
        return false;
      }
    }
  }
  return true;
};
