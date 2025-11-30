export type CellStatus = 'hidden' | 'revealed' | 'flagged';

export interface CellData {
  id: string; // unique identifier "row-col"
  row: number;
  col: number;
  isMine: boolean;
  status: CellStatus;
  neighborMines: number;
  isExploded?: boolean; // True if this specific mine was triggered
}

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';
export type GameMode = 'classic' | 'strict';

export interface Difficulty {
  name: string;
  rows: number;
  cols: number;
  mines: number;
}

export interface GameState {
  grid: CellData[][];
  status: GameStatus;
  difficulty: Difficulty;
  mode: GameMode;
  flagsUsed: number;
  timeElapsed: number;
  prayersLeft: number;
  isPraying: boolean;
}

export interface GameRecord {
  id: string;
  date: number; // timestamp
  time: number; // seconds
  difficultyName: string; // 'Easy', 'Medium', 'Hard'
  mode: GameMode;
}
