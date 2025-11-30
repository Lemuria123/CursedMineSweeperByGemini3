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

export const revealCellLogic = (
  grid: CellData[][], 
  row: number, 
  col: number,
  gameMode: GameMode,
  isFirstClick: boolean
): { grid: CellData[][], exploded: boolean } => {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  const cell = newGrid[row][col];

  if (cell.status !== 'hidden') {
    return { grid: newGrid, exploded: false };
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
    // Can we make this cell a mine?
    let canBeMine = true;

    if (revealedNeighbors.length === 0) {
      // Guessing in the void (no info) is punished in strict mode
      canBeMine = true; 
    } else {
      for (const n of revealedNeighbors) {
        const currentMinesAround = countMinesAround(newGrid, n.row, n.col);
        
        // If 'cell' is currently a mine, countMinesAround includes it.
        // If 'cell' is NOT a mine, countMinesAround excludes it.
        
        // We want to know: "If we force 'cell' to be a mine, does it break 'n'?"
        // The number of *other* mines around 'n' (excluding target)
        const isTargetCurrentlyMine = newGrid[row][col].isMine ? 1 : 0;
        const otherMines = currentMinesAround - isTargetCurrentlyMine;
        
        // If the other mines alone already equal or exceed the limit, 
        // then we CANNOT fit another mine here. It MUST be safe.
        if (otherMines >= n.neighborMines) {
          canBeMine = false;
          break;
        }
      }
    }

    if (canBeMine) {
      // ADVERSARIAL ACTION: Force it to be a mine!
      if (!newGrid[row][col].isMine) {
        // Steal a mine from elsewhere to keep total count consistent
        // (This is effectively "moving a safe spot to here")
        // But simpler: just turn this on, find a mine elsewhere to turn off.
        
        // 1. Find a hidden mine to remove (to keep count same)
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

        // 2. Make target a mine
        newGrid[row][col].isMine = true;
        updateLocalCounts(newGrid, row, col);
      }
      
      newGrid[row][col].status = 'revealed';
      newGrid[row][col].isExploded = true;
      return { grid: newGrid, exploded: true };
    } 
    
    // If we are here, logic dictates it MUST be safe.
    // If it was randomly placed as a mine during init, we must save the player.
    if (newGrid[row][col].isMine) {
      moveMineToSafeSpot(newGrid, row, col);
    }
  }
  // --- END HOSTILE LOGIC ---


  if (newGrid[row][col].isMine) {
    newGrid[row][col].status = 'revealed';
    newGrid[row][col].isExploded = true;
    return { grid: newGrid, exploded: true };
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

  return { grid: newGrid, exploded: false };
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
