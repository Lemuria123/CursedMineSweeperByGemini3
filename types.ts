
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

export type GameMode = 'strict' | 'standard';

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

// Replaced GameRecord with RewardRecord
export type RewardType = 'image' | 'text' | 'glitch';

export interface CursedReward {
  id: string; // unique based on difficulty params
  date: number;
  difficultyName: string;
  title: string;
  content: string; // URL or Text body
  type: RewardType;
  hue: number; // visual theme color
}
