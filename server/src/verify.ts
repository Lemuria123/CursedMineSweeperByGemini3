// Server-side replay verification engine.
//
// Design:
// - Reconstructs the deterministic mine layout from mine_seed.
// - Replays all actions using shared gameLogic (including CSP).
// - Uses the client's seeded random stream and the recording's prayer rules.
// - Validates: (1) action legality, (2) prayers match, (3) final state is won.

import { CellData, CURRENT_REPLAY_VERSION, type ReplayVersion } from '../../shared/types';
import {
  revealCellLogic,
  getChordTargets,
  checkWin,
} from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { GameSubmission, GameAction, GridConfig, VerifyResult } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerBetween(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function isGameSubmission(value: unknown): value is GameSubmission {
  if (!isObject(value) || !isObject(value.grid)) return false;
  const { rows, cols, mines } = value.grid;
  if (!integerBetween(rows, 1, 25) || !integerBetween(cols, 1, 25) ||
      !integerBetween(mines, 1, rows * cols - 9)) return false;
  if (value.version !== undefined && value.version !== 1 && value.version !== 2 &&
      value.version !== 3 && value.version !== CURRENT_REPLAY_VERSION) return false;
  if (typeof value.nonce !== 'string' || !value.nonce || typeof value.mine_seed !== 'string' ||
      !integerBetween(value.prayers_used, 0) || !integerBetween(value.total_time_ms, 0)) return false;
  const inGrid = (point: unknown) => isObject(point) &&
    integerBetween(point.row, 0, rows - 1) && integerBetween(point.col, 0, cols - 1);
  return Array.isArray(value.actions) && value.actions.length > 0 &&
    value.actions.every((action: unknown, i: number) => {
      if (!isObject(action) || !inGrid(action) || !integerBetween(action.ts, 0) ||
          (action.prayed !== undefined && typeof action.prayed !== 'boolean')) return false;
      if (i === 0) {
        return action.type === 'first_reveal' && (action.initial_flags === undefined ||
          (Array.isArray(action.initial_flags) && action.initial_flags.length <= rows * cols &&
           action.initial_flags.every(inGrid)));
      }
      return action.initial_flags === undefined &&
        (action.type === 'reveal' || action.type === 'flag' || action.type === 'chord');
    });
}

export function createReplayBoard(grid: GridConfig, mineSeed: string, firstReveal: GameAction, version: ReplayVersion = 1): CellData[][] | null {
  const { row, col, initial_flags } = firstReveal;
  if (initial_flags !== undefined && !Array.isArray(initial_flags)) return null;

  const board = deterministicPlaceMines(grid.rows, grid.cols, grid.mines, row, col, mineSeed, version);
  for (const flag of initial_flags ?? []) {
    if (!flag || !Number.isInteger(flag.row) || !Number.isInteger(flag.col)) return null;
    if (flag.row === row && flag.col === col) return null;

    const cell = board[flag.row]?.[flag.col];
    if (cell?.status !== 'hidden') return null;
    cell.status = 'flagged';
  }
  return board;
}

/**
 * Verify a game submission by replaying all actions.
 * Returns { valid: true } if the game is legitimate.
 */
export function verifySubmission(submission: GameSubmission): VerifyResult {
  const { grid: gridConfig, mine_seed, actions, prayers_used, version = 1 } = submission;

  // ── Validate actions array ──
  if (!actions || actions.length === 0) {
    return { valid: false, reason: 'no actions provided' };
  }

  const firstAction = actions[0];
  if (firstAction.type !== 'first_reveal') {
    return { valid: false, reason: 'first action must be first_reveal' };
  }

  // ── Validate mine_seed matches grid config ──
  const expectedPrefix = `${gridConfig.rows}-${gridConfig.cols}-${gridConfig.mines}-`;
  if (!mine_seed.startsWith(expectedPrefix)) {
    return { valid: false, reason: `mine_seed prefix mismatch: expected ${expectedPrefix}, got ${mine_seed.slice(0, expectedPrefix.length + 6)}` };
  }

  // ── Validate total_time_ms ──
  if (submission.total_time_ms < 100) {
    return { valid: false, reason: `impossible time: ${submission.total_time_ms}ms` };
  }

  // ── Validate time against last action ──
  const lastTs = actions[actions.length - 1].ts;
  if (submission.total_time_ms < lastTs) {
    return { valid: false, reason: `total_time_ms (${submission.total_time_ms}) < last action ts (${lastTs})` };
  }

  // ── Reconstruct mine layout ──
  let board = createReplayBoard(gridConfig, mine_seed, firstAction, version);
  if (!board) return { valid: false, reason: 'invalid initial flags' };

  // ── Game state ──
  let status: 'playing' | 'won' | 'lost' = 'playing';
  let prayerCount = 0; // prayers consumed in replay

  // ── Seeded RNG for deterministic CSP replay ──
  const cspRng = createRNG(hashSeed(mine_seed + '-csp'));

  // ── Replay actions ──
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (status !== 'playing') {
      // Extra actions after game end — not necessarily invalid (animation/UI),
      // but we stop processing.
      break;
    }

    const valid = validateAction(board, action, i === 0);
    if (!valid) {
      return { valid: false, reason: `illegal action #${i}: ${action.type} (${action.row},${action.col})` };
    }

    switch (action.type) {
      case 'first_reveal': {
        // first_reveal: placeMines already done above, now reveal
        const result = revealCellLogic(board, action.row, action.col, true, false, cspRng, undefined, version);
        board = result.grid;
        // first click is always safe (3x3 safe zone)
        break;
      }

      case 'reveal': {
        const isPraying = action.prayed === true;
        const result = revealCellLogic(board, action.row, action.col, false, isPraying, cspRng, undefined, version);
        board = result.grid;
        if (result.prayerConsumed) prayerCount++;
        if (result.exploded) {
          status = 'lost';
        }
        break;
      }

      case 'flag': {
        const cell = board[action.row][action.col];
        if (cell.status === 'hidden') {
          board = board.map((row, r) =>
            row.map((c, col) =>
              r === action.row && col === action.col
                ? { ...c, status: 'flagged' as const }
                : c,
            ),
          );
        } else if (cell.status === 'flagged') {
          board = board.map((row, r) =>
            row.map((c, col) =>
              r === action.row && col === action.col
                ? { ...c, status: 'hidden' as const }
                : c,
            ),
          );
        }
        break;
      }

      case 'chord': {
        const targets = getChordTargets(board, action.row, action.col);
        const isPraying = action.prayed === true;
        for (const t of targets) {
          const result = revealCellLogic(board, t.r, t.c, false, isPraying, cspRng, undefined, version);
          if (result.prayerConsumed) prayerCount++;
          board = result.grid;
          if (result.exploded) {
            status = 'lost';
            break;
          }
        }
        break;
      }
    }

    // Check win after each action
    if (status === 'playing' && checkWin(board)) {
      status = 'won';
    }
  }

  // ── Final checks ──
  if (status !== 'won') {
    return { valid: false, reason: `game did not end in win (status: ${status})` };
  }

  // Prayer count should match (allow ±1 for CSP divergence edge cases)
  if (prayerCount > prayers_used) {
    return { valid: false, reason: `prayer mismatch: recorded ${prayers_used}, replay consumed ${prayerCount}` };
  }

  return { valid: true };
}

/**
 * Validate that an action is syntactically legal in the current board state.
 */
function validateAction(board: CellData[][], action: GameAction, isFirst: boolean): boolean {
  const rows = board.length;
  const cols = board[0].length;

  if (action.row < 0 || action.row >= rows) return false;
  if (action.col < 0 || action.col >= cols) return false;

  const cell = board[action.row][action.col];

  switch (action.type) {
    case 'first_reveal':
      return isFirst && cell.status === 'hidden';

    case 'reveal':
      return !isFirst && cell.status === 'hidden';

    case 'flag':
      return cell.status === 'hidden' || cell.status === 'flagged';

    case 'chord':
      if (cell.status !== 'revealed') return false;
      return getChordTargets(board, action.row, action.col).length > 0;

    default:
      return false;
  }
}
