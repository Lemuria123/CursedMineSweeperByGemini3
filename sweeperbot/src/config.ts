/**
 * 命令行配置。机器人不引用游戏源码，难度只用三档预设的行列。
 *
 * 用法（在 sweeperbot 目录）：
 *   npm start -- --url http://127.0.0.1:5173 --difficulty hard --games 20
 *   npm start -- --headed --games 1
 */

export type DifficultyName = 'easy' | 'medium' | 'hard' | 'random';

export interface PresetSize {
  rows: number;
  cols: number;
}

/** 与游戏界面三档页签从左到右一致。Hard 是 25 行 × 16 列。 */
export const PRESETS: Record<DifficultyName, PresetSize> = {
  easy: { rows: 9, cols: 9 },
  medium: { rows: 16, cols: 16 },
  hard: { rows: 25, cols: 16 },
};

export interface BotConfig {
  url: string;
  difficulty: DifficultyName;
  games: number;
  /** 单局最多点击次数，防止认盘失败时死循环 */
  maxSteps: number;
  viewportWidth: number;
  viewportHeight: number;
  headless: boolean;
  /** 拦掉对 localhost:38001 的请求，避免沙盒里的页面打到正在改的那套 API */
  offline: boolean;
  logDir: string;
}

export const DEFAULT_CONFIG: BotConfig = {
  url: 'http://127.0.0.1:5173',
  difficulty: 'hard',
  games: 20,
  maxSteps: 500,
  // 高视口让 25×16（格约 48px）整盘落在一屏里，避免滚动拼接。
  viewportWidth: 1440,
  viewportHeight: 1900,
  headless: true,
  offline: false,
  logDir: 'logs/sessions',
};

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export function parseArgs(argv: string[]): BotConfig {
  const config: BotConfig = { ...DEFAULT_CONFIG };
  const url = readOption(argv, '--url');
  if (url) config.url = url;

  const difficulty = readOption(argv, '--difficulty');
  if (difficulty) {
    if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard' && difficulty !== 'random') {
      throw new Error(`不认识的难度「${difficulty}」，只能是 easy、medium、hard、random`);
    }
    config.difficulty = difficulty;
  }

  const games = readOption(argv, '--games');
  if (games) {
    const n = Number(games);
    if (!Number.isInteger(n) || n < 1) throw new Error('--games 必须是正整数');
    config.games = n;
  }

  const maxSteps = readOption(argv, '--max-steps');
  if (maxSteps) {
    const n = Number(maxSteps);
    if (!Number.isInteger(n) || n < 1) throw new Error('--max-steps 必须是正整数');
    config.maxSteps = n;
  }

  const viewport = readOption(argv, '--viewport');
  if (viewport) {
    const match = /^(\d+)x(\d+)$/.exec(viewport);
    if (!match) throw new Error('--viewport 的格式是 宽x高，例如 1440x1900');
    config.viewportWidth = Number(match[1]);
    config.viewportHeight = Number(match[2]);
  }

  if (hasFlag(argv, '--headed')) config.headless = false;
  if (hasFlag(argv, '--offline')) config.offline = true;
  const logDir = readOption(argv, '--log-dir');
  if (logDir) config.logDir = logDir;
  return config;
}
