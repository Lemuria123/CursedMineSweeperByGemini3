
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
  id: string; // 尺寸标识，格式 "rows-cols"（如 "9-9"）
  date: number; // 获得时间戳
  difficultyName: string; // 难度名，如 "Easy"
  title: string; // 奖品标题（模板名或 "ACE"）
  icon?: string; // emoji / icon identifier from reward template
  content: string; // URL or Text body
  type: RewardType;
  hue: number; // visual theme color
  mines?: number; // 本局雷数（服务端返回；本地旧数据可能无此字段）
  // i18n 多语言字段：英文版本的名称与正文（数据库双列方案）
  nameEn?: string;   // 英文名称
  contentEn?: string; // 英文正文
}
