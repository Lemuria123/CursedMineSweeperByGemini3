/**
 * 对局循环。
 *
 * 只做刷 ACE 的玩家会做的事：点必然安全的格子，标必然是雷的格子，从不用祈祷，从不猜。
 * 推不动、赢了或炸了，都记下并重开。
 * 用已打开的数字和剩余雷数一起推。推出来不可能，或剩余雷数和棋盘对不上，记成 logic_error 并重开。
 */
import type { BotConfig } from '../config';
import { PRESETS } from '../config';
import { grabPlayfield, type Playfield } from '../browser/capture';
import { GameSession } from '../browser/session';
import { recommendedMines } from '../solver/mines';
import { deduce, type SeenBoard, type SeenCell } from '../solver/deduce';
import {
  classifyGrid,
  findGrid,
  hashRegion,
  type ClassifiedCell,
  type GridGeom,
} from '../vision/board';
import { counterAnchorY, readMineCounter } from '../vision/digits';
import { detectOverlay, findResetFace, findSettingsGear, type Overlay } from '../vision/overlay';
import { SessionLog } from './log';

export interface RunSummary {
  win: number;
  loss: number;
  stuck: number;
  vision_error: number;
  logic_error: number;
  ace: number;
}

type OutcomeKind = 'win' | 'loss' | 'stuck' | 'vision_error' | 'logic_error';

const FIXED_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
type FixedDifficulty = (typeof FIXED_DIFFICULTIES)[number];

function pickDifficulty(config: BotConfig): FixedDifficulty {
  if (config.difficulty === 'random') {
    return FIXED_DIFFICULTIES[Math.floor(Math.random() * FIXED_DIFFICULTIES.length)];
  }
  return config.difficulty;
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(tries: number, waitMs: number, read: () => Promise<T | null>): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const value = await read();
    if (value) return value;
    await sleep(waitMs);
  }
  return null;
}

async function waitForGame(session: GameSession, url: string): Promise<void> {
  const appeared = await poll(40, 250, async () => {
    const shot = await session.screenshot();
    if (detectOverlay(shot).kind !== 'none') return true;
    if (findGrid(shot)) return true;
    return null;
  });
  if (!appeared) {
    throw new Error(`打开 ${url} 后没有看到棋盘。请先在仓库根目录运行 npm run dev。`);
  }
}

async function clickOverlaySkip(session: GameSession, overlay: Overlay): Promise<boolean> {
  if (overlay.kind !== 'nickname') return false;
  await session.click(overlay.skip.x, overlay.skip.y);
  await sleep(250);
  return true;
}

/** 点设置里从左到右的第几档，再点底部的开始按钮。 */
async function selectDifficulty(session: GameSession, difficulty: FixedDifficulty, log: SessionLog, url: string): Promise<void> {
  const target = PRESETS[difficulty];
  const index = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 1 : 2;

  for (let attempt = 0; attempt < 3; attempt++) {
    let view = await session.screenshot();
    const nick = detectOverlay(view);
    if (await clickOverlaySkip(session, nick)) view = await session.screenshot();

    const gear = findSettingsGear(view);
    await session.click(gear.x, gear.y);
    const settings = await poll(20, 200, async () => {
      const shot = await session.screenshot();
      const overlay = detectOverlay(shot);
      if (overlay.kind === 'settings') return overlay;
      if (overlay.kind === 'nickname') {
        await session.click(overlay.skip.x, overlay.skip.y);
        return null;
      }
      // 设置卡片比窗口高时，滚一下再找「开始」按钮和页签。
      await session.wheel(Math.round(shot.width / 2), Math.round(shot.height / 2), 280);
      return null;
    });
    if (!settings || settings.kind !== 'settings') continue;

    await session.click(settings.tabs[index].x, settings.tabs[index].y);
    await sleep(200);
    const afterTab = detectOverlay(await session.screenshot());
    const start = afterTab.kind === 'settings' ? afterTab.start : settings.start;
    await session.click(start.x, start.y);

    const ready = await poll(25, 200, async () => {
      const shot = await session.screenshot();
      const overlay = detectOverlay(shot);
      if (overlay.kind === 'nickname') {
        await session.click(overlay.skip.x, overlay.skip.y);
        return null;
      }
      if (overlay.kind !== 'none') return null;
      const geom = findGrid(shot);
      if (geom && geom.rows === target.rows && geom.cols === target.cols) return geom;
      return null;
    });
    if (ready) {
      log.event({
        type: 'difficulty',
        difficulty,
        rows: target.rows,
        cols: target.cols,
      });
      return;
    }
  }
  throw new Error(`没能把难度切到 ${difficulty}。请确认 ${url} 是这个游戏。`);
}

function toSeen(cells: ClassifiedCell[][], mines: number): SeenBoard | null {
  const seen: SeenCell[][] = [];
  for (const row of cells) {
    const line: SeenCell[] = [];
    for (const cell of row) {
      if (cell.kind === 'unknown' || cell.kind === 'mine') return null;
      if (cell.kind === 'open') line.push({ kind: 'open', n: cell.n });
      else if (cell.kind === 'flag') line.push({ kind: 'flag' });
      else line.push({ kind: 'hidden' });
    }
    seen.push(line);
  }
  return { rows: seen.length, cols: seen[0].length, cells: seen, mines };
}

async function clickCell(
  session: GameSession,
  field: Playfield,
  geom: GridGeom,
  row: number,
  col: number,
  button: 'left' | 'right',
): Promise<void> {
  const rect = geom.rects[row][col];
  const point = await field.expose(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await session.click(point.x, point.y, button);
  await sleep(40);
}

async function restartFromFace(session: GameSession): Promise<void> {
  const shot = await session.screenshot();
  const overlay = detectOverlay(shot);
  if (overlay.kind === 'win' || overlay.kind === 'loss') {
    await session.click(overlay.again.x, overlay.again.y);
  } else if (overlay.kind === 'nickname') {
    await session.click(overlay.skip.x, overlay.skip.y);
  } else {
    const face = findResetFace(shot, counterAnchorY(shot));
    await session.click(face.x, face.y);
  }
  await sleep(400);
}

async function finishModal(session: GameSession): Promise<void> {
  const hit = await poll(18, 150, async () => {
    const shot = await session.screenshot();
    const overlay = detectOverlay(shot);
    if (overlay.kind === 'nickname') {
      await session.click(overlay.skip.x, overlay.skip.y);
      await sleep(200);
      return null;
    }
    if (overlay.kind === 'win' || overlay.kind === 'loss') return overlay;
    return null;
  });
  if (hit && (hit.kind === 'win' || hit.kind === 'loss')) {
    await session.click(hit.again.x, hit.again.y);
  } else {
    await restartFromFace(session);
    return;
  }
  await sleep(350);
  // 赢了之后昵称框可能晚一拍才出现，跳过它，免得挡下一局。
  const late = detectOverlay(await session.screenshot());
  if (late.kind === 'nickname') {
    await session.click(late.skip.x, late.skip.y);
    await sleep(250);
  }
}

interface GameResult {
  kind: OutcomeKind;
  ace: boolean;
}

async function playOne(
  session: GameSession,
  config: BotConfig,
  log: SessionLog,
  game: number,
): Promise<GameResult> {
  const started = Date.now();
  let steps = 0;
  let flagsPlaced = 0;
  let totalMines: number | null = null;
  let rows = 0;
  let cols = 0;
  let badReads = 0;
  let stalls = 0;
  let loggedStart = false;
  // 同一处矛盾连续出现才记成算法错误，避免某一帧把数字认错。
  let faultKey = '';
  let faultStreak = 0;

  const end = async (kind: OutcomeKind, image: Playfield['viewport'], extra: Record<string, unknown> = {}): Promise<GameResult> => {
    const ace = kind === 'win';
    const screenshot = log.saveImage(`g${game}-${kind}`, image);
    log.event({
      type: 'game_end',
      game,
      outcome: kind,
      ace,
      prayers: 0,
      steps,
      mines: totalMines,
      rows,
      cols,
      difficulty: config.difficulty,
      elapsedMs: Date.now() - started,
      screenshot,
      ...extra,
    });
    const detail = kind === 'logic_error' && typeof extra.reason === 'string' ? `：${extra.reason}` : '';
    console.log(`第 ${game} 局 ${kind}${ace ? '（ACE）' : ''}${detail}，${steps} 步`);
    if (kind === 'win' || kind === 'loss') await finishModal(session);
    else await restartFromFace(session);
    return { kind, ace };
  };

  while (steps < config.maxSteps) {
    const field = await grabPlayfield(session);
    const overlay = detectOverlay(field.viewport);
    if (overlay.kind === 'nickname') {
      await session.click(overlay.skip.x, overlay.skip.y);
      await sleep(250);
      continue;
    }
    if (overlay.kind === 'win') return end('win', field.viewport);
    if (overlay.kind === 'loss') return end('loss', field.viewport);
    if (overlay.kind === 'settings') {
      await session.click(overlay.start.x, overlay.start.y);
      await sleep(300);
      continue;
    }

    const geom = findGrid(field.image);
    if (!geom) {
      badReads++;
      if (badReads >= 3) return end('vision_error', field.viewport, { reason: '看不到棋盘' });
      await sleep(200);
      continue;
    }
    rows = geom.rows;
    cols = geom.cols;
    const cells = classifyGrid(field.image, geom);
    if (cells.some((row) => row.some((cell) => cell.kind === 'mine'))) {
      return end('loss', field.viewport, { reason: '画面上出现了雷' });
    }
    if (cells.some((row) => row.some((cell) => cell.kind === 'unknown'))) {
      badReads++;
      if (badReads >= 3) return end('vision_error', field.viewport, { reason: '有格子认不出来' });
      await sleep(150);
      continue;
    }

    const expectedMines = recommendedMines(rows, cols);
    const counter = readMineCounter(field.viewport);
    if (totalMines === null) {
      if (counter !== expectedMines) {
        badReads++;
        if (badReads >= 3) {
          return end('vision_error', field.viewport, { reason: '开局雷数和预设不一致', counter, expectedMines });
        }
        await sleep(150);
        continue;
      }
      totalMines = expectedMines;
      badReads = 0;
    } else if (counter !== null && counter !== totalMines - flagsPlaced) {
      const expected = totalMines - flagsPlaced;
      const reason = `画面剩余雷数是 ${counter}，按棋盘上已经确定的雷计算应当是 ${expected}`;
      const key = `counter|${reason}`;
      faultStreak = key === faultKey ? faultStreak + 1 : 1;
      faultKey = key;
      if (faultStreak >= 3) {
        return end('logic_error', field.viewport, { reason, kind: 'mines', counter, expected });
      }
      await sleep(150);
      continue;
    } else {
      badReads = 0;
    }

    if (!loggedStart) {
      loggedStart = true;
      log.event({
        type: 'game_start',
        game,
        rows,
        cols,
        mines: totalMines,
        difficulty: config.difficulty,
      });
    }

    const seen = toSeen(cells, totalMines);
    if (!seen) {
      badReads++;
      if (badReads >= 3) return end('vision_error', field.viewport, { reason: '有格子认不出来' });
      await sleep(150);
      continue;
    }

    const hidden = seen.cells.flat().filter((cell) => cell.kind === 'hidden').length;
    if (hidden === 0) return end('win', field.viewport, { reason: '已没有未开的安全格' });

    const allHidden = hidden === rows * cols;
    const before = hashRegion(field.viewport, geom.frame);

    if (allHidden) {
      // 第一下以及它周围一圈由游戏保证无雷，点最靠近中心的格。
      const row = Math.floor((rows - 1) / 2);
      const col = Math.floor((cols - 1) / 2);
      await clickCell(session, field, geom, row, col, 'left');
      steps++;
      log.event({ type: 'action', game, action: 'reveal', row, col, reason: '开局点最靠近中心的格子', step: steps });
      await sleep(180);
      continue;
    }

    const result = deduce(seen);
    if (result.inconsistent) {
      const reason = result.fault?.reason ?? '已打开的数字和剩余雷数无法同时成立';
      const key = `${result.fault?.kind ?? 'unknown'}|${reason}`;
      faultStreak = key === faultKey ? faultStreak + 1 : 1;
      faultKey = key;
      if (faultStreak >= 3) {
        return end('logic_error', field.viewport, { reason, kind: result.fault?.kind ?? 'numbers' });
      }
      await sleep(150);
      continue;
    }
    faultKey = '';
    faultStreak = 0;
    if (result.flags.length === 0 && result.reveals.length === 0) {
      return end('stuck', field.viewport, { capped: result.capped, reason: '没有必然安全的格子' });
    }

    for (const move of result.flags) {
      await clickCell(session, field, geom, move.row, move.col, 'right');
      flagsPlaced++;
      steps++;
      log.event({
        type: 'action',
        game,
        action: 'flag',
        row: move.row,
        col: move.col,
        reason: move.reason,
        step: steps,
      });
    }
    for (const move of result.reveals) {
      await clickCell(session, field, geom, move.row, move.col, 'left');
      steps++;
      log.event({
        type: 'action',
        game,
        action: 'reveal',
        row: move.row,
        col: move.col,
        reason: move.reason,
        step: steps,
      });
    }

    const changed = await poll(12, 80, async () => {
      const shot = await session.screenshot();
      const over = detectOverlay(shot);
      if (over.kind === 'win' || over.kind === 'loss' || over.kind === 'nickname') return true;
      const next = findGrid(shot);
      const hash = next
        ? hashRegion(shot, next.frame)
        : hashRegion(shot, { x: 0, y: 0, w: shot.width, h: shot.height });
      return hash !== before ? true : null;
    });
    if (!changed) {
      stalls++;
      if (stalls >= 3) return end('vision_error', field.viewport, { reason: '点击后画面没有变化' });
    } else {
      stalls = 0;
    }
  }

  const last = await session.screenshot();
  return end('vision_error', last, { reason: '超过单局步数上限' });
}

export async function runBot(config: BotConfig): Promise<RunSummary> {
  const log = new SessionLog(config.logDir);
  const session = await GameSession.open(config);
  const summary: RunSummary = { win: 0, loss: 0, stuck: 0, vision_error: 0, logic_error: 0, ace: 0 };
  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    await session.close();
  };
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(130));
  });

  log.event({
    type: 'session_start',
    url: config.url,
    difficulty: config.difficulty,
    games: config.games,
    headless: config.headless,
  });
  console.log(`记录写到 ${log.file}`);

  try {
    const learned = await session.learnCounterFont();
    log.event({ type: 'counter_font', learned });
    await session.goto(config.url);
    await waitForGame(session, config.url);
    let current: FixedDifficulty | null = null;
    for (let game = 1; game <= config.games; game++) {
      const next = pickDifficulty(config);
      if (current !== next) {
        await selectDifficulty(session, next, log, config.url);
        current = next;
      }
      const gameConfig = { ...config, difficulty: next };
      const result = await playOne(session, gameConfig, log, game);
      summary[result.kind]++;
      if (result.ace) summary.ace++;
    }
  } finally {
    log.event({ type: 'session_end', ...summary });
    console.log(`结束：赢 ${summary.win}（ACE ${summary.ace}），输 ${summary.loss}，卡住 ${summary.stuck}，逻辑错误 ${summary.logic_error}，认盘失败 ${summary.vision_error}`);
    await shutdown();
  }
  return summary;
}
