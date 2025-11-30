
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

// Robust Mine Moving: Only moves mine to a spot that shares the EXACT same revealed neighbors.
// This ensures that the displayed numbers on the board never change.
const attemptMineMovePreservingCounts = (grid: CellData[][], r: number, c: number): boolean => {
  const rows = grid.length;
  const cols = grid[0].length;
  const currentRevealedNeighbors = getRevealedNeighbors(grid, r, c);
  const currentRevealedNeighborsStr = JSON.stringify(currentRevealedNeighbors);

  // Collect all valid empty candidates
  const candidates: {r: number, c: number}[] = [];

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (i === r && j === c) continue;
      if (grid[i][j].isMine) continue;
      if (grid[i][j].status !== 'hidden') continue;

      // Optimization: If source has no revealed neighbors, target just needs no revealed neighbors
      // If source has neighbors, target must match them exactly
      const candidateRevealedNeighbors = getRevealedNeighbors(grid, i, j);
      
      if (JSON.stringify(candidateRevealedNeighbors) === currentRevealedNeighborsStr) {
        candidates.push({r: i, c: j});
      }
    }
  }

  if (candidates.length === 0) return false;

  // Pick random candidate
  const target = candidates[Math.floor(Math.random() * candidates.length)];

  // Swap
  grid[r][c].isMine = false;
  grid[target.r][target.c].isMine = true;

  // Update counts for both affected areas
  updateLocalCounts(grid, r, c);
  updateLocalCounts(grid, target.r, target.c);

  return true;
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

// Check if a cell is logically FORCED to be a mine based on revealed neighbors
const isLogicallyGuaranteedMine = (grid: CellData[][], r: number, c: number): boolean => {
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      const neighbor = grid[nr][nc];
      if (neighbor.status === 'revealed') {
        let hiddenNeighborsCount = 0;
        let isTargetCellNeighbor = false;
        
        for (const [ndr, ndc] of DIRECTIONS) {
            const nnr = nr + ndr;
            const nnc = nc + ndc;
            if (nnr >= 0 && nnr < grid.length && nnc >= 0 && nnc < grid[0].length) {
                if (grid[nnr][nnc].status === 'hidden' || grid[nnr][nnc].status === 'flagged') {
                    hiddenNeighborsCount++;
                }
                if (nnr === r && nnc === c) {
                    isTargetCellNeighbor = true;
                }
            }
        }
        
        if (isTargetCellNeighbor && hiddenNeighborsCount === neighbor.neighborMines) {
            return true;
        }
      }
    }
  }
  return false;
};

// --- TRUE CURSED LOGIC HELPERS ---

// Check if the current board state is valid regarding all revealed numbers
const isValidStateAround = (grid: CellData[][], cellsToCheck: {r: number, c: number}[]) => {
    for (const cell of cellsToCheck) {
        const neighborsToCheck = [];
        if (grid[cell.r][cell.c].status === 'revealed') neighborsToCheck.push({r: cell.r, c: cell.c});

        for (const [dr, dc] of DIRECTIONS) {
            const nr = cell.r + dr;
            const nc = cell.c + dc;
            if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
                if (grid[nr][nc].status === 'revealed') {
                    neighborsToCheck.push({r: nr, c: nc});
                }
            }
        }

        for (const n of neighborsToCheck) {
            const currentCount = countMinesAround(grid, n.r, n.c);
            if (currentCount !== grid[n.r][n.c].neighborMines) {
                return false;
            }
        }
    }
    return true;
};

// The Reaper: Tries to rearrange mines to ensure grid[row][col] is a mine
const attemptStrictKill = (grid: CellData[][], targetRow: number, targetCol: number): boolean => {
    // 1. Identify all existing hidden mines that we can potentially move
    const hiddenMines: {r: number, c: number, dist: number}[] = [];
    
    for(let r=0; r<grid.length; r++) {
        for(let c=0; c<grid[0].length; c++) {
            if (grid[r][c].isMine && grid[r][c].status === 'hidden') {
                if (r === targetRow && c === targetCol) continue;
                
                const dist = Math.abs(r - targetRow) + Math.abs(c - targetCol);
                hiddenMines.push({r, c, dist});
            }
        }
    }

    hiddenMines.sort((a, b) => a.dist - b.dist);

    for (const mine of hiddenMines) {
        grid[mine.r][mine.c].isMine = false;
        grid[targetRow][targetCol].isMine = true;

        if (isValidStateAround(grid, [{r: mine.r, c: mine.c}, {r: targetRow, c: targetCol}])) {
            updateLocalCounts(grid, mine.r, mine.c);
            updateLocalCounts(grid, targetRow, targetCol);
            return true;
        }

        grid[mine.r][mine.c].isMine = true;
        grid[targetRow][targetCol].isMine = false;
    }

    return false;
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

  // --- STRICT MODE LOGIC (ALWAYS ON) ---
  if (!isFirstClick) {
     if (isPraying) {
         // Prayer Logic: Try to SAVE the player
         if (newGrid[row][col].isMine) {
             const success = attemptMineMovePreservingCounts(newGrid, row, col);
             // If we successfully moved it, prayer worked
             if (success) {
                 prayerConsumed = true;
             }
         } else {
             // Safe anyway, but prayer was active so we count it as usage (check)
             prayerConsumed = true;
         }
     } else {
         // Punishment Logic: Try to KILL the player
         if (!newGrid[row][col].isMine) {
             attemptStrictKill(newGrid, row, col);
         }
     }
  }

  // --- STANDARD MINE HIT LOGIC ---
  if (newGrid[row][col].isMine) {
    // If we are here, either:
    // 1. Not praying
    // 2. Praying, but move failed (Guaranteed Mine / No Candidates)
    
    newGrid[row][col].status = 'revealed';
    newGrid[row][col].isExploded = true;
    
    // Prayer is consumed if it was active, even if it failed to save you
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

export const revealAllMines = (grid: CellData[][]): CellData[][] => {
  return grid.map(row => row.map(cell => {
    if (cell.isMine) {
      return { ...cell, status: 'revealed' };
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
