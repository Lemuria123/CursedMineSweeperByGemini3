// E2E Submit Test — builds a game, encrypts, submits to running server.
// Run with:
//   terminal 1: cd server && set ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef && npx ts-node --transpile-only src/index.ts
//   terminal 2: cd server && set ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef && npx ts-node --transpile-only src/test_e2e_submit.ts

import { createEmptyGrid, revealCellLogic, checkWin } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';
import { CellData } from '../../shared/types';

const SERVER = 'http://localhost:38001';

// ── Build a complete solvable game (same pattern as test_verify.ts) ──
function buildGame(): GameSubmission {
  const rows = 5, cols = 5, mines = 3;
  const firstR = 2, firstC = 2;
  const mineSeed = 'e2e-submit-test';

  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
  const empty = createEmptyGrid(rows, cols);
  let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, mineSeed);

  const actions: GameAction[] = [];
  let ts = 0;
  let totalPrayers = 0;

  // First reveal
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  let r = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = r.grid;
  if (r.exploded) throw new Error('first click BOOM');

  // Flag mines, reveal safe cells with prayer
  let changed = true;
  while (changed && !checkWin(board)) {
    changed = false;
    for (let r = 0; r < rows && !checkWin(board); r++) {
      for (let c = 0; c < cols && !checkWin(board); c++) {
        if (board[r][c].status !== 'hidden') continue;
        if (board[r][c].isMine) {
          actions.push({ type: 'flag', row: r, col: c, ts }); ts += 100;
          board[r][c].status = 'flagged';
        } else {
          actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true }); ts += 200;
          totalPrayers++;
          const res = revealCellLogic(board, r, c, false, true, cspRng);
          board = res.grid;
          if (res.exploded) throw new Error(`BOOM at safe cell (${r},${c})`);
        }
        changed = true;
      }
    }
  }

  if (!checkWin(board)) throw new Error('Failed to win');

  return {
    version: 1,
    nonce: 'PLACEHOLDER', // will be filled after getting nonce from server
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: totalPrayers,
    total_time_ms: ts,
  };
}

// ── Run ──
async function main() {
  console.log('=== Cursed Minesweeper E2E Submit Test ===\n');

  // 1. Build game
  console.log('[1/7] Building game...');
  const submission = buildGame();
  console.log(`       Actions: ${submission.actions.length}, Prayers: ${submission.prayers_used}, Time: ${submission.total_time_ms}ms`);

  // 2. Health check
  console.log('\n[2/7] Checking server health...');
  try {
    const h = await fetch(`${SERVER}/api/health`);
    const hb = await h.json();
    console.log(`       Server OK: ${JSON.stringify(hb)}`);
  } catch {
    console.error('       FAILED: Server not running on :38001');
    console.error('       Start with: cd server && set ENCRYPTION_KEY=... && npx ts-node --transpile-only src/index.ts');
    process.exit(1);
  }

  // 3. Register account
  console.log('\n[3/7] Registering test account...');
  const authRes = await fetch(`${SERVER}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: 'e2e-test-device' }),
  });
  const auth = await authRes.json() as any;
  const accountId = auth.account_id;
  console.log(`       Account ID: ${accountId}`);
  console.log(`       Nickname: ${auth.nickname || '(not set)'}`);

  // 4. Set nickname
  console.log('\n[4/7] Setting nickname...');
  await fetch(`${SERVER}/api/auth/${accountId}/nickname`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'TestPlayer' }),
  });
  console.log('       Nickname set to: TestPlayer');

  // 5. Get nonce
  console.log('\n[5/7] Getting nonce...');
  const nonceRes = await fetch(`${SERVER}/api/nonce?account_id=${accountId}`);
  const { nonce } = await nonceRes.json() as any;
  console.log(`       Nonce: ${nonce.slice(0, 12)}...`);

  // 6. Build final payload & encrypt
  console.log('\n[6/7] Encrypting game data...');
  submission.nonce = nonce;
  const plaintext = JSON.stringify(submission);
  console.log(`       Plaintext: ${plaintext.length} chars`);
  const payload = encrypt(plaintext);
  console.log(`       Encrypted: ${payload.length} chars (base64)`);
  console.log(`       First 40 chars: ${payload.slice(0, 40)}...`);

  // 7. Submit
  console.log('\n[7/7] Submitting to server...');
  const submitRes = await fetch(`${SERVER}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload }),
  });
  const result = await submitRes.json();
  console.log(`       Result: ${JSON.stringify(result, null, 2)}`);

  // Verify
  if ((result as any).valid) {
    console.log('\n=== E2E SUBMIT TEST PASSED ===');
    console.log(`Reward: ${(result as any).reward ? (result as any).reward.title : '(prayers > 0, not ACE)'}`);

    // Also check records
    const recordsRes = await fetch(`${SERVER}/api/records/me/${accountId}`);
    const records = await recordsRes.json();
    console.log(`\n=== My Records ===`);
    console.log(JSON.stringify(records, null, 2));
  } else {
    console.log(`\n=== E2E SUBMIT TEST FAILED ===`);
    console.log(`Reason: ${(result as any).reason}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
