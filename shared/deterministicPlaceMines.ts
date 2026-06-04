// Deterministic mine placement using a seeded PRNG.
// Used by the server to reconstruct the exact same mine layout from a mine_seed.

import { CellData } from './types';
import { placeMines } from './gameLogic';

/**
 * Simple seedable PRNG (mulberry32).
 * Accepts a numeric seed and returns a function that produces values in [0, 1).
 */
export const createRNG = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Hash a string to a 32-bit integer seed.
 */
export const hashSeed = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
};

/**
 * Deterministically place mines on a fresh grid.
 *
 * @param rows    - board rows
 * @param cols    - board columns
 * @param mines   - number of mines to place
 * @param seed    - string seed (e.g. "9-9-21-4-4-<server_nonce>")
 */
export const deterministicPlaceMines = (
  rows: number,
  cols: number,
  mines: number,
  firstClickRow: number,
  firstClickCol: number,
  seed: string,
): CellData[][] => {
  const rng = createRNG(hashSeed(seed));

  // placeMines expects a pre-created empty grid
  const emptyGrid: CellData[][] = [];
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
    emptyGrid.push(row);
  }

  return placeMines(emptyGrid, mines, firstClickRow, firstClickCol, rng);
};
