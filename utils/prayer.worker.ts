import { completeExactPrayer } from '../shared/gameLogic';
import type { CellData } from '../shared/types';

self.onmessage = ({ data }: MessageEvent<{ grid: CellData[][]; row: number; col: number }>) => {
  self.postMessage(completeExactPrayer(data.grid, data.row, data.col));
};
