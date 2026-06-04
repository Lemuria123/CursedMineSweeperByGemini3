// End-to-end test: construct a complete game, encrypt, submit to API.
// Run with: ENCRYPTION_KEY=... npx ts-node --transpile-only src/test_e2e.ts

import { createEmptyGrid, placeMines, revealCellLogic, getChordTargets, checkWin, getNeighbors } from '../../shared/gameLogic';
import { deterministicPlaceMines, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt, generateKey } from './crypto';
import { GameSubmission, GameAction } from './types';

// ── Build a complete game ──
function buildGameData(rows: number, cols: number, mines: number): GameSubmission {
  // Pick a deterministic seed
  const firstClickRow = Math.floor(rows / 2);
  const firstClickCol = Math.floor(cols / 2);
  const mineSeed = `${rows}-${cols}-${mines}-${firstClickRow}-${firstClickCol}-e2e-test`;

  // Build the board deterministically
  const emptyGrid = createEmptyGrid(rows, cols);
  let board = deterministicPlaceMines(rows, cols, mines, firstClickRow, firstClickCol, mineSeed);

  const actions: GameAction[] = [];
  let ts = 0;
  let prayersUsed = 0;

  // first_reveal
  actions.push({ type: 'first_reveal', row: firstClickRow, col: firstClickCol, ts });
  ts += 500;
  const r1 = revealCellLogic(board, firstClickRow, firstClickCol, true, false);
  board = r1.grid;
  if (r1.exploded) throw new Error('First click exploded!');

  // Flag all mines that are visible, reveal all safe cells
  let status: 'playing' | 'won' = 'playing';
  let rounds = 0;

  while (status !== 'won' && rounds < 500) {
    rounds++;
    let acted = false;

    // Try chord on revealed cells
    for (let r = 0; r < rows && status !== 'won'; r++) {
      for (let c = 0; c < cols && status !== 'won'; c++) {
        if (board[r][c].status !== 'revealed') continue;
        const targets = getChordTargets(board, r, c);
        if (targets.length > 0) {
          // First flag any mine targets we know about
          actions.push({ type: 'chord', row: r, col: c, ts });
          ts += 1200;
          for (const t of targets) {
            const r2 = revealCellLogic(board, t.r, t.c, false, false);
            board = r2.grid;
            if (r2.exploded) status = 'lost';
          }
          acted = true;
          if (checkWin(board)) status = 'won';
          break;
        }
      }
      if (acted) break;
    }

    if (acted) continue;

    // Reveal a hidden safe cell
    for (let r = 0; r < rows && !acted; r++) {
      for (let c = 0; c < cols && !acted; c++) {
        if (board[r][c].status === 'hidden' && !board[r][c].isMine) {
          actions.push({ type: 'reveal', row: r, col: c, ts, prayed: false });
          ts += 800;
          const r2 = revealCellLogic(board, r, c, false, false);
          board = r2.grid;
          if (r2.exploded) throw new Error('Hit a mine on safe reveal!');
          acted = true;
          if (checkWin(board)) status = 'won';
        }
      }
    }

    // If nothing found, flag a mine
    if (!acted) {
      for (let r = 0; r < rows && !acted; r++) {
        for (let c = 0; c < cols && !acted; c++) {
          if (board[r][c].status === 'hidden' && board[r][c].isMine) {
            actions.push({ type: 'flag', row: r, col: c, ts });
            ts += 600;
            board[r][c].status = 'flagged';
            acted = true;
            if (checkWin(board)) status = 'won';
          }
        }
      }
    }

    if (!acted) break; // stuck
  }

  if (status !== 'won') {
    throw new Error(`Failed to complete game after ${rounds} rounds`);
  }

  return {
    version: 1,
    nonce: 'e2e-test-nonce',
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: prayersUsed,
    total_time_ms: ts,
  };
}

// ── Run ──
async function main() {
  const key = process.env.ENCRYPTION_KEY || generateKey();
  if (!process.env.ENCRYPTION_KEY) {
    console.log(`[test] Generated key: ${key}`);
    console.log('[test] Set ENCRYPTION_KEY env var to use this key on the server.');
  }

  // Build a 9x9 game
  console.log('[test] Building 9x9 game with 21 mines...');
  const submission = buildGameData(9, 9, 21);
  console.log(`[test] Game built: ${submission.actions.length} actions, ${submission.total_time_ms}ms`);

  // Encrypt
  const payload = encrypt(JSON.stringify(submission), key);
  console.log(`[test] Encrypted payload: ${payload.length} chars`);

  // Submit via HTTP
  console.log('[test] Submitting to server...');
  const nonceRes = await fetch('http://localhost:38001/api/nonce');
  const { nonce } = await nonceRes.json() as any;
  console.log(`[test] Got nonce: ${nonce}`);

  // Update nonce in submission (re-encrypt)
  submission.nonce = nonce;
  const finalPayload = encrypt(JSON.stringify(submission), key);

  // Register account
  const authRes = await fetch('http://localhost:38001/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: 'e2e-test-device' }),
  });
  const { account_id } = await authRes.json() as any;
  console.log(`[test] Account: ${account_id}`);

  // Submit
  const submitRes = await fetch('http://localhost:38001/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id, payload: finalPayload }),
  });
  const result = await submitRes.json();
  console.log('[test] Submit result:', JSON.stringify(result, null, 2));

  if ((result as any).valid) {
    console.log('\n=== E2E TEST PASSED ===');
  } else {
    console.log('\n=== E2E TEST FAILED ===');
    console.log('Reason:', (result as any).reason);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('[test] Error:', e);
  process.exit(1);
});
