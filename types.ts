
export type CellStatus = 'hidden' | 'revealed' | 'flagged';

export interface CellData {
  id: string; // unique identifier "row-col"
  row: number;
  col: number;
  isMine: boolean;
  status: CellStatus;
  neighborMines: number;
  isExploded?: boolean; // True if this specific mine was triggered
  isMisflagged?: boolean; // True if user flagged this safe cell (revealed at game over)
}

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

export interface Difficulty {
  name: string; // 'Custom' if manually changed
  rows: number;
  cols: number;
  mines: number;
}

export interface GameState {
  grid: CellData[][];
  status: GameStatus;
  difficulty: Difficulty;
  flagsUsed: number;
  prayersUsed: number; // Changed from prayersLeft
  isPraying: boolean;
}
