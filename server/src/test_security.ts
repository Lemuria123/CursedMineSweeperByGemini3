// Comprehensive anti-cheat test suite.
// Tests both valid submissions that should pass and malicious ones that should be rejected.
// Run with server already started:
//   cd server && set ENCRYPTION_KEY=0123... && npx ts-node --transpile-only src/index.ts
// Then in another terminal:
//   cd server && set ENCRYPTION_KEY=0123... && npx ts-node --transpile-only src/test_security.ts

import { createEmptyGrid, revealCellLogic, checkWin } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const SERVER = 'http://localhost:38001';
const KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const WRONG_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

let accountId = '';
let passCount = 0;
let failCount = 0;

// ── Helpers ──

function pass(name: string) { passCount++; console.log(`  ✅ PASS: ${name}`); }
function fail(name: string, reason: string) { failCount++; console.log(`  ❌ FAIL: ${name} — ${reason}`); }

async function ensureAccount() {
  if (accountId) return accountId;
  const r = await fetch(`${SERVER}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: 'security-test-device' }),
  });
  const j = await r.json();
  accountId = j.account_id;
  // Set nickname
  await fetch(`${SERVER}/api/auth/${accountId}/nickname`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'SecurityTest' }),
  });
  return accountId;
}

async function getNonce(): Promise<string> {
  const r = await fetch(`${SERVER}/api/nonce?account_id=${await ensureAccount()}`);
  const j = await r.json();
  return j.nonce;
}

function buildValidGame(): GameSubmission {
  const rows = 5, cols = 5, mines = 3;
  const firstR = 2, firstC = 2;
  const mineSeed = 'sec-test-game';
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
  const empty = createEmptyGrid(rows, cols);
  let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, mineSeed);
  const actions: GameAction[] = [];
  let ts = 0, prayers = 0;

  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  let r = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = r.grid;

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
          prayers++;
          const res = revealCellLogic(board, r, c, false, true, cspRng);
          board = res.grid;
        }
        changed = true;
      }
    }
  }

  return { version: 1, nonce: 'PLACEHOLDER', grid: { rows, cols, mines }, mine_seed: mineSeed, actions, prayers_used: prayers, total_time_ms: ts };
}

async function submit(submission: GameSubmission, nonce?: string): Promise<{ valid: boolean; reason?: string; reward?: any; status: number; body: any }> {
  const sub = { ...submission, nonce: nonce || submission.nonce };
  const plaintext = JSON.stringify(sub);
  const payload = encrypt(plaintext);

  const r = await fetch(`${SERVER}/api/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: await ensureAccount(), payload }),
  });
  const body = await r.json();
  return { valid: body.valid, reason: body.reason, reward: body.reward, status: r.status, body };
}

// ═══════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Anti-Cheat Security Test Suite     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Check server alive
  try {
    const h = await fetch(`${SERVER}/api/health`);
    if (!h.ok) throw new Error('unhealthy');
    console.log('[SERVER] Health check OK\n');
  } catch {
    console.error('ERROR: Server not running on :38001');
    console.error('Start with: cd server && set ENCRYPTION_KEY=... && npx ts-node --transpile-only src/index.ts');
    process.exit(1);
  }

  // ═══ POSITIVE TESTS ═══
  console.log('─── POSITIVE TESTS ───\n');

  // T1: Valid game (with prayers)
  {
    console.log('[T1] Valid game with prayers');
    const game = buildValidGame();
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (result.valid) pass('Valid game accepted');
    else fail('Valid game', `rejected: ${result.reason}`);

    if (result.status === 200 && result.body.reward === null) pass('No ACE reward (prayers > 0)');
    else fail('Reward logic', `reward should be null, got ${JSON.stringify(result.body.reward)}`);
  }

  // ═══ NEGATIVE TESTS ═══

  console.log('\n─── NEGATIVE: Nonce Attacks ───\n');

  // T2: Nonce reuse (replay attack)
  {
    console.log('[T2] Nonce reuse (replay attack)');
    const game = buildValidGame();
    const nonce = await getNonce();
    // First submission
    const r1 = await submit(game, nonce);
    if (!r1.valid) { fail('Nonce reuse setup', 'first submit should pass'); }
    else {
      // Second submission with SAME nonce
      const r2 = await submit(game, nonce);
      if (!r2.valid) pass('Reused nonce rejected');
      else fail('Nonce reuse', 'second submit with same nonce should be rejected');
    }
  }

  // T3: Expired nonce (we can't easily test in real-time, but we can test fake nonce)
  {
    console.log('[T3] Fake/unknown nonce');
    const game = buildValidGame();
    game.nonce = '00000000-0000-0000-0000-000000000000';
    const plaintext = JSON.stringify(game);
    const payload = encrypt(plaintext);
    const r = await fetch(`${SERVER}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: await ensureAccount(), payload }),
    });
    const body = await r.json();
    if (body.error?.includes('nonce')) pass('Fake nonce rejected');
    else fail('Fake nonce', `should reject, got ${JSON.stringify(body)}`);
  }

  // T4: Missing nonce in payload
  {
    console.log('[T4] Missing nonce field');
    const game = buildValidGame();
    (game as any).nonce = undefined;
    const result = await submit(game, 'should-be-ignored');
    if (!result.valid) pass('Missing nonce rejected');
    else fail('Missing nonce', 'should reject missing nonce');
  }

  console.log('\n─── NEGATIVE: Data Tampering ───\n');

  // T5: Tampered mine_seed
  {
    console.log('[T5] Tampered mine_seed');
    const game = buildValidGame();
    game.mine_seed = 'tampered-seed-evil';
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Tampered mine_seed rejected');
    else fail('Tampered mine_seed', 'should reject different seed');
  }

  // T6: Fake 0 prayers (should fail because game needs prayers)
  {
    console.log('[T6] Fake zero prayers');
    const game = buildValidGame();
    game.prayers_used = 0; // lie — game actually used prayers
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Fake zero prayers rejected');
    else fail('Fake zero prayers', `should reject, but got valid=${result.valid}`);
  }

  // T7: Empty actions list
  {
    console.log('[T7] Empty actions');
    const game = buildValidGame();
    game.actions = [];
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Empty actions rejected');
    else fail('Empty actions', 'should reject empty actions');
  }

  // T8: Wrong first action type
  {
    console.log('[T8] Wrong first action (flag instead of first_reveal)');
    const game = buildValidGame();
    game.actions[0] = { ...game.actions[0], type: 'flag' as any };
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Wrong first action rejected');
    else fail('Wrong first action', 'should reject flag as first action');
  }

  // T9: Out-of-bounds action (insert BEFORE game ends)
  {
    console.log('[T9] Out-of-bounds reveal');
    const game = buildValidGame();
    // Insert at position 2 (after first_reveal, before game is won)
    game.actions.splice(2, 0, { type: 'reveal' as any, row: 99, col: 99, ts: 500, prayed: false });
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Out-of-bounds action rejected');
    else fail('Out-of-bounds', 'should reject row=99');
  }

  // T10: Duplicate reveal of already-revealed cell (insert BEFORE game ends)
  {
    console.log('[T10] Reveal already-revealed cell');
    const game = buildValidGame();
    const firstAction = game.actions[0];
    // Insert after first_reveal
    game.actions.splice(2, 0, { type: 'reveal' as any, row: firstAction.row, col: firstAction.col, ts: 500, prayed: false });
    const nonce = await getNonce();
    const result = await submit(game, nonce);
    if (!result.valid) pass('Duplicate reveal rejected');
    else fail('Duplicate reveal', 'should reject revealing already-revealed cell');
  }

  console.log('\n─── NEGATIVE: Crypto Attacks ───\n');

  // T11: Bogus payload (not valid encrypted data)
  {
    console.log('[T11] Bogus encrypted payload');
    const r = await fetch(`${SERVER}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: await ensureAccount(), payload: 'NOT-REAL-ENCRYPTED-DATA!!!!' }),
    });
    const body = await r.json();
    if (body.error?.includes('decrypt')) pass('Bogus payload rejected');
    else fail('Bogus payload', `should fail decrypt, got ${JSON.stringify(body)}`);
  }

  // T12: Missing required fields (no account_id)
  {
    console.log('[T12] Missing account_id');
    const r = await fetch(`${SERVER}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'anything' }),
    });
    const body = await r.json();
    if (body.error) pass('Missing account_id rejected');
    else fail('Missing account_id', 'should reject');
  }

  // ═══ SUMMARY ═══
  const total = passCount + failCount;
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Results: ${passCount}/${total} passed, ${failCount} failed  ║`);
  console.log(`╚══════════════════════════════════════╝`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
