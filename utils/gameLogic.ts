// Frontend wrapper — re-exports from shared/gameLogic and adds React-specific preserveRefs optimization.

export {
  calculateRecommendedMines,
  createEmptyGrid,
  getNeighbors,
  placeMines,
  getChordTargets,
  revealAllMines,
  checkWin,
} from '../shared/gameLogic';

// ── React-specific wrapper: preserve cell references for React.memo ──

import { CellData } from '../types';
import {
  revealCellLogic as sharedRevealCellLogic,
} from '../shared/gameLogic';

const preserveRefs = (original: CellData[][], modified: CellData[][]): CellData[][] => {
  return original.map((row, r) =>
    row.map((cell, c) => {
      const mod = modified[r][c];
      if (
        cell.status === mod.status &&
        cell.isMine === mod.isMine &&
        cell.neighborMines === mod.neighborMines &&
        cell.isExploded === mod.isExploded &&
        cell.isMisflagged === mod.isMisflagged
      ) {
        return cell;
      }
      return mod;
    })
  );
};

export const revealCellLogic = (
  grid: CellData[][],
  row: number,
  col: number,
  isFirstClick: boolean,
  isPraying: boolean,
  rng?: () => number,
): { grid: CellData[][]; exploded: boolean; prayerConsumed: boolean } => {
  const result = sharedRevealCellLogic(grid, row, col, isFirstClick, isPraying, rng);
  return { ...result, grid: preserveRefs(grid, result.grid) };
};
