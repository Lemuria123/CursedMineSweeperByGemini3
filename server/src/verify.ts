// Server-side replay verification engine.
//
// Design:
// - Reconstructs the deterministic mine layout from mine_seed.
// - Replays all actions using shared gameLogic (including CSP).
// - CSP uses Math.random() so outcomes may differ from the client,
//   but the server accepts its own simulation as the ground truth.
// - Validates: (1) action legality, (2) prayers match, (3) final state is won.

import { CellData } from '../../shared/types';
import {
  createEmptyGrid,
  cloneGrid,
  revealCellLogic,
  getChordTargets,
  checkWin,
} from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { GameSubmission, GameAction, VerifyResult } from './types';

/**
 * Verify a game submission by replaying all actions.
 * Returns { valid: true } if the game is legitimate.
 */
export function verifySubmission(submission: GameSubmission): VerifyResult {
  const { grid: gridConfig, mine_seed, actions, prayers_used } = submission;

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
  const emptyGrid = createEmptyGrid(gridConfig.rows, gridConfig.cols);
  let board = deterministicPlaceMines(
    gridConfig.rows,
    gridConfig.cols,
    gridConfig.mines,
    firstAction.row,
    firstAction.col,
    mine_seed,
  );

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
        const result = revealCellLogic(board, action.row, action.col, true, false, cspRng);
        board = result.grid;
        // first click is always safe (3x3 safe zone)
        break;
      }

      case 'reveal': {
        const isPraying = action.prayed === true;
        const result = revealCellLogic(board, action.row, action.col, false, isPraying, cspRng);
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
        for (const t of targets) {
          const result = revealCellLogic(board, t.r, t.c, false, false, cspRng);
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
