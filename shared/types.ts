// Shared types for both frontend (React) and backend (server replay verification)

export const CURRENT_REPLAY_VERSION = 4;
export type ReplayVersion = 1 | 2 | 3 | typeof CURRENT_REPLAY_VERSION;

export type CellStatus = 'hidden' | 'revealed' | 'flagged';

export interface CellData {
  id: string;
  row: number;
  col: number;
  isMine: boolean;
  status: CellStatus;
  neighborMines: number;
  isExploded?: boolean;
  isMisflagged?: boolean;
}

export interface Difficulty {
  name: string;
  rows: number;
  cols: number;
  mines: number;
}
