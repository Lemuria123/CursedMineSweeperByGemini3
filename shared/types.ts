// Shared types for both frontend (React) and backend (server replay verification)

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
