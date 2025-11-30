import { CellData, Difficulty, GameMode } from '../types';

export const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

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
// Used when moving mines dynamically
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

const moveMineToSafeSpot = (grid: CellData[][], fromRow: number, fromCol: number) => {
  const rows = grid.length;
  const cols = grid[0].length;
  
  // Find a random spot that is NOT a mine and NOT the source
  let attempts = 0;
  while (attempts < 1000) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    
    // Don't place on source, and don't place where there is already a mine
    // Also avoid placing on revealed cells if possible (though revealed mines are bad anyway)
    if ((r !== fromRow || c !== fromCol) && !grid[r][c].isMine && grid[r][c].status === 'hidden') {
      
      // 1. Remove mine from source
      grid[fromRow][fromCol].isMine = false;
      updateLocalCounts(grid, fromRow, fromCol);

      // 2. Add mine to target
      grid[r][c].isMine = true;
      updateLocalCounts(grid, r, c);
      
      return;
    }
    attempts++;
  }
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

  // Avoid placing mine on first click and its immediate neighbors to ensure a safe start
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

  // Calculate numbers
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
  // Iterate all neighbors of the target cell
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    
    // Check if neighbor is valid and REVEALED
    if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length) {
      const neighbor = grid[nr][nc];
      if (neighbor.status === 'revealed') {
        // Now, for this revealed neighbor, count its hidden neighbors
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
        
        // neighbor.neighborMines is the total mines around it.
        // If hiddenNeighborsCount === neighbor.neighborMines, then ALL hidden neighbors MUST be mines.
        // (Note: This assumes we haven't already cleared some mines, but in standard play, 
        // neighborMines is constant. If we had mechanics that reduced neighborMines display, we'd need to adjust.
        // Standard Minesweeper: Number = Hidden Mines + Flagged Mines (if correct). 
        // Actually, strictly: Number = Hidden Mines + Revealed Mines (if we allow walking on mines).
        // Since we die on revealed mines, Number = Hidden Mines.
        
        if (isTargetCellNeighbor && hiddenNeighborsCount === neighbor.neighborMines) {
            return true;
        }
      }
    }
  }
  return false;
};

export const revealCellLogic = (
  grid: CellData[][], 
  row: number, 
  col: number,
  gameMode: GameMode,
  isFirstClick: boolean,
  isPraying: boolean
): { grid: CellData[][], exploded: boolean, prayerConsumed: boolean } => {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  const cell = newGrid[row][col];
  let prayerConsumed = false;

  if (cell.status !== 'hidden') {
    return { grid: newGrid, exploded: false, prayerConsumed: false };
  }

  // --- HOSTILE MODE LOGIC ---
  if (gameMode === 'strict' && !isFirstClick) {
    // 1. Identify revealed neighbors
    const revealedNeighbors = [];
    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < newGrid.length && nc >= 0 && nc < newGrid[0].length) {
        if (newGrid[nr][nc].status === 'revealed') {
          revealedNeighbors.push(newGrid[nr][nc]);
        }
      }
    }

    // 2. Check "Adversarial Consistency"
    let canBeMine = true;

    if (revealedNeighbors.length === 0) {
      canBeMine = true; 
    } else {
      for (const n of revealedNeighbors) {
        const currentMinesAround = countMinesAround(newGrid, n.row, n.col);
        const isTargetCurrentlyMine = newGrid[row][col].isMine ? 1 : 0;
        const otherMines = currentMinesAround - isTargetCurrentlyMine;
        
        if (otherMines >= n.neighborMines) {
          canBeMine = false;
          break;
        }
      }
    }

    if (canBeMine) {
      // It COULD be a mine (ambiguous or no info).
      // STRICT MODE BEHAVIOR: Force it to be a mine.
      
      // -- PRAYER INTERVENTION --
      if (isPraying) {
          // If praying, we defy the Strict Mode punishment.
          // We force it to be safe instead.
          if (newGrid[row][col].isMine) {
              moveMineToSafeSpot(newGrid, row, col);
          }
          // If it wasn't a mine, we just ensure it stays safe (no op).
          prayerConsumed = true;
          // Continue to reveal as normal safe cell
      } else {
          // Normal Strict Mode Punishment
          if (!newGrid[row][col].isMine) {
            // Find a hidden mine to remove/move to here
            let removed = false;
            let attempts = 0;
            while (!removed && attempts < 1000) {
                const r = Math.floor(Math.random() * newGrid.length);
                const c = Math.floor(Math.random() * newGrid[0].length);
                if (newGrid[r][c].isMine && newGrid[r][c].status === 'hidden' && (r !== row || c !== col)) {
                    newGrid[r][c].isMine = false;
                    updateLocalCounts(newGrid, r, c);
                    removed = true;
                }
                attempts++;
            }
            newGrid[row][col].isMine = true;
            updateLocalCounts(newGrid, row, col);
          }
          
          newGrid[row][col].status = 'revealed';
          newGrid[row][col].isExploded = true;
          return { grid: newGrid, exploded: true, prayerConsumed: false };
      }
    } else {
        // Logic dictates it MUST be safe.
        // If it was randomly placed as a mine during init, we must save the player.
        if (newGrid[row][col].isMine) {
            moveMineToSafeSpot(newGrid, row, col);
        }
    }
  }
  // --- END HOSTILE LOGIC ---


  // --- STANDARD MINE HIT LOGIC (Classic Mode or Post-Prayer Strict Mode) ---
  if (newGrid[row][col].isMine) {
    // We hit a mine. Is it savable via Prayer?
    if (isPraying) {
        // Check if it was a GUARANTEED mine
        if (isLogicallyGuaranteedMine(newGrid, row, col)) {
            // Prayer Fails: You ignored logic.
            newGrid[row][col].status = 'revealed';
            newGrid[row][col].isExploded = true;
            // Prayer is consumed in the attempt
            return { grid: newGrid, exploded: true, prayerConsumed: true };
        } else {
            // Prayer Succeeds: It was bad luck.
            moveMineToSafeSpot(newGrid, row, col);
            prayerConsumed = true;
            // Fall through to normal reveal logic
        }
    } else {
        // No prayer, boom.
        newGrid[row][col].status = 'revealed';
        newGrid[row][col].isExploded = true;
        return { grid: newGrid, exploded: true, prayerConsumed: false };
    }
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
