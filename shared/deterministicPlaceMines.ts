// Deterministic mine placement using a seeded PRNG.
// Used by the server to reconstruct the exact same mine layout from a mine_seed.

import type { CellData, ReplayVersion } from './types';
import { createEmptyGrid, placeMines } from './gameLogic';

/**
 * Simple seedable PRNG (mulberry32).
 * Accepts a numeric seed and returns a function that produces values in [0, 1).
 */
export const createRNG = (seed: number) => {
  let state = seed | 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, { snapshot: () => state });
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

export function placeSeededMines(
  grid: CellData[][], mines: number, firstRow: number, firstCol: number,
  seed: string, version: ReplayVersion,
): CellData[][] {
  const rng = createRNG(hashSeed(seed));
  if (version !== 4) return placeMines(grid, mines, firstRow, firstCol, rng);

  const rows = grid.length, cols = grid[0].length;
  const targetArea = rows * cols / 9;
  const shortSide = Math.max(1, Math.round(Math.min(rows, cols) / 3));
  const longSide = Math.max(1, Math.round(targetArea / shortSide));
  let height = rows > cols ? longSide : shortSide;
  let width = rows > cols ? shortSide : longSide;
  const region = createRNG(hashSeed(seed + '-cluster'));
  if (rows === cols && region() < 0.5) [height, width] = [width, height];
  const top = Math.floor(region() * (rows - height + 1));
  const left = Math.floor(region() * (cols - width + 1));
  return placeMines(grid, mines, firstRow, firstCol, rng, {
    weightAt: (row, col) => row >= top && row < top + height && col >= left && col < left + width ? 1.5 : 1,
    arrivals: createRNG(hashSeed(seed + '-cluster-arrivals')),
  });
}

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
  version: ReplayVersion = 3,
): CellData[][] => {
  return placeSeededMines(createEmptyGrid(rows, cols), mines, firstClickRow, firstClickCol, seed, version);
};
