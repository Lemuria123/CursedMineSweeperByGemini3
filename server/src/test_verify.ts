// Verify test — deterministic board, CSP-solved.
// Builder plays the game; verifier replays identically (same seeded RNG).
// Run with: npx ts-node --transpile-only src/test_verify.ts

import { createEmptyGrid, revealCellLogic, checkWin } from '../../shared/gameLogic';
import { verifySubmission } from './verify';
import { GameSubmission, GameAction } from './types';
import { createRNG, hashSeed, deterministicPlaceMines } from '../../shared/deterministicPlaceMines';
import { CellData } from '../../shared/types';

const rows = 5, cols = 5, mines = 3;
const firstR = 2, firstC = 2;
const mineSeed = '5-5-3-2-2-v3';

console.log('=== Building game ===');

const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
const empty = createEmptyGrid(rows, cols);
let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, mineSeed);

const actions: GameAction[] = [];
let ts = 0;
let totalPrayers = 0;

// 1. First reveal
actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
let r = revealCellLogic(board, firstR, firstC, true, false, cspRng);
board = r.grid;
if (r.exploded) throw new Error('first click BOOM');
console.log(`First reveal: ${cnt(board,'revealed')} revealed`);
printBoard(board);

// 2. Reveal remaining cells: flag mines, reveal safe cells (with prayer for safety)
let changed = true;
while (changed && !checkWin(board)) {
  changed = false;
  for (let r = 0; r < rows && !checkWin(board); r++) {
    for (let c = 0; c < cols && !checkWin(board); c++) {
      if (board[r][c].status !== 'hidden') continue;

      if (board[r][c].isMine) {
        // Flag mine directly — no CSP, always safe
        actions.push({ type: 'flag', row: r, col: c, ts }); ts += 100;
        board[r][c].status = 'flagged';
        console.log(`Flagged mine at (${r},${c})`);
      } else {
        // Safe cell — reveal with prayer to avoid CSP curse
        actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true }); ts += 200;
        totalPrayers++;
        const res = revealCellLogic(board, r, c, false, true, cspRng);
        board = res.grid;
        if (res.exploded) {
          // This should NOT happen — we checked isMine and it was false
          console.error(`BOOM at safe cell (${r},${c}) — CSP bug?`);
          process.exit(1);
        }
        console.log(`Revealed safe (${r},${c}), now ${cnt(board,'revealed')} revealed`);
      }
      changed = true;
    }
  }
}

const won = checkWin(board);
console.log(`Result: won=${won}, prayers=${totalPrayers}, actions=${actions.length}`);

const submission: GameSubmission = {
  version: 1, nonce: 'verify-test-nonce',
  grid: { rows, cols, mines },
  mine_seed: mineSeed,
  actions,
  prayers_used: totalPrayers,
  total_time_ms: ts,
};

console.log('\n=== Verifying ===');
const result = verifySubmission(submission);
console.log('Result:', JSON.stringify(result, null, 2));
console.log(result.valid ? '\n=== PASSED ===' : `\n=== FAILED: ${result.reason} ===`);
process.exit(result.valid ? 0 : 1);

function cnt(b: CellData[][], s: string) { let n=0; for (const r of b) for (const c of r) if (c.status===s) n++; return n; }
function printBoard(b: CellData[][]) { for (const row of b) { let l=''; for (const c of row) l+=c.status==='revealed'?c.neighborMines:c.isMine?'M':'.'; console.log(l); } }
