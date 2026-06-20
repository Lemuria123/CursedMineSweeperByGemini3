// ACE Forged Test — 12 attack types on random grid sizes (4x4 ~ 16x16).
// Verifies all forged submissions are rejected, no rewards granted, no data leak.
// Run with server already started.

import { createEmptyGrid, revealCellLogic, checkWin } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const API = 'http://localhost:38001';
const ROUNDS = 12;

const SIZES = [
  { rows: 4, cols: 4, mines: 2 },
  { rows: 5, cols: 5, mines: 3 },
  { rows: 6, cols: 6, mines: 4 },
  { rows: 7, cols: 7, mines: 5 },
  { rows: 8, cols: 8, mines: 14 },
  { rows: 9, cols: 9, mines: 18 },
  { rows: 10, cols: 10, mines: 22 },
  { rows: 12, cols: 12, mines: 32 },
  { rows: 16, cols: 16, mines: 56 },
  { rows: 8, cols: 16, mines: 28 },
  { rows: 16, cols: 8, mines: 28 },
  { rows: 5, cols: 5, mines: 3 },
];

const ATTACKS = [
  'tampered_mine_seed', 'fake_zero_prayers', 'replay_attack',
  'missing_first', 'out_of_bounds', 'tampered_dimensions',
  'empty_actions', 'wrong_first', 'impossible_time',
  'duplicate_action', 'bad_nonce', 'tampered_time_ms',
];

interface ForgeResult {
  round: number;
  attackType: string;
  gridLabel: string;
  rows: number; cols: number; mines: number;
  accountId: string;
  valid: boolean;
  reason: string | null;
  reward: string | null;
  passed: boolean;
  timeMs: number;
  error?: string;
}

function buildBaseGame(rows: number, cols: number, mines: number, seedLabel: string): GameSubmission {
  const firstR = Math.floor(rows / 2), firstC = Math.floor(cols / 2);
  const mineSeed = `${rows}-${cols}-${mines}-${firstR}-${firstC}-${seedLabel}`;
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
  let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, mineSeed);
  board = board.map(r => r.map(c => ({ ...c })));

  const actions: GameAction[] = [];
  let ts = 0, prayers = 0;

  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  board = revealCellLogic(board, firstR, firstC, true, false, cspRng).grid;

  let stuck = 0;
  while (!checkWin(board) && stuck < 50) {
    let acted = false;
    for (let r = 0; r < rows && !acted; r++) {
      for (let c = 0; c < cols && !acted; c++) {
        if (board[r][c].status !== 'hidden') continue;
        acted = true;
        if (board[r][c].isMine) {
          actions.push({ type: 'flag', row: r, col: c, ts }); ts += 100;
          board[r][c].status = 'flagged';
        } else {
          actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true }); ts += 200;
          prayers++;
          const res = revealCellLogic(board, r, c, false, true, cspRng);
          board = res.grid;
          if (res.exploded) {
            actions.push({ type: 'flag', row: r, col: c, ts }); ts += 100;
            board[r][c].status = 'flagged';
          }
        }
      }
    }
    if (!acted) stuck++;
  }

  return {
    version: 1, nonce: 'PLACEHOLDER',
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: prayers,
    total_time_ms: ts,
  };
}

function forge(attackType: string, game: GameSubmission): GameSubmission {
  const g = JSON.parse(JSON.stringify(game));
  switch (attackType) {
    case 'tampered_mine_seed':
      g.mine_seed = `${g.grid.rows}-${g.grid.cols}-${g.grid.mines}-0-0-evil-hack`;
      break;
    case 'fake_zero_prayers':
      g.prayers_used = 0;
      break;
    case 'missing_first':
      g.actions = g.actions.filter((a: any) => a.type !== 'first_reveal');
      if (g.actions.length > 0) g.actions[0].type = 'reveal';
      break;
    case 'out_of_bounds':
      g.actions.splice(2, 0, { type: 'reveal', row: 99, col: 99, ts: g.actions[1].ts + 1, prayed: false });
      break;
    case 'tampered_dimensions':
      g.grid = { rows: 500, cols: 500, mines: g.grid.mines };
      break;
    case 'empty_actions':
      g.actions = [];
      break;
    case 'wrong_first':
      if (g.actions.length > 0) g.actions[0].type = 'flag';
      break;
    case 'impossible_time':
      g.total_time_ms = 50;
      break;
    case 'duplicate_action':
      g.actions.splice(2, 0, { ...g.actions[0], ts: g.actions[0].ts + 5 });
      break;
    case 'bad_nonce': {
      const fakeGame = JSON.parse(JSON.stringify(game));
      fakeGame.nonce = '00000000-0000-0000-0000-000000000000';
      return fakeGame; // nonce won't exist in DB
    }
    case 'tampered_time_ms':
      g.total_time_ms = g.actions.length > 0 ? (g.actions[g.actions.length - 1].ts - 50) : g.total_time_ms;
      break;
  }
  return g;
}

async function runRound(round: number, size: typeof SIZES[number], attackType: string): Promise<ForgeResult> {
  const deviceId = `forge-${round}-${Date.now()}`;
  const start = Date.now();
  const r: ForgeResult = {
    round, attackType, gridLabel: `${size.rows}x${size.cols}`,
    rows: size.rows, cols: size.cols, mines: size.mines,
    accountId: '', valid: false, reason: null, reward: null, passed: false, timeMs: 0,
  };

  try {
    const auth = await (await fetch(`${API}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'auto', platform_id: deviceId }),
    })).json() as any;
    r.accountId = auth.account_id;

    const base = buildBaseGame(size.rows, size.cols, size.mines, `forge-r${round}`);
    const game = forge(attackType, base);

    let subRes: any;
    if (attackType === 'replay_attack') {
      const n1 = (await (await fetch(`${API}/api/nonce?account_id=${r.accountId}`)).json() as any).nonce;
      game.nonce = n1;
      await fetch(`${API}/api/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: r.accountId, payload: encrypt(JSON.stringify(game)) }),
      });
      subRes = await fetch(`${API}/api/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: r.accountId, payload: encrypt(JSON.stringify(game)) }),
      });
    } else if (attackType === 'bad_nonce') {
      // Skip normal nonce flow — use forged nonce directly
      subRes = await fetch(`${API}/api/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: r.accountId, payload: encrypt(JSON.stringify(game)) }),
      });
    } else {
      const nonce = (await (await fetch(`${API}/api/nonce?account_id=${r.accountId}`)).json() as any).nonce;
      game.nonce = nonce;
      subRes = await fetch(`${API}/api/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: r.accountId, payload: encrypt(JSON.stringify(game)) }),
      });
    }

    const sd = await subRes.json() as any;
    r.valid = sd.valid === true;
    r.reason = sd.reason || sd.error || null;
    r.reward = sd.reward?.title || null;

    r.passed = (!r.valid && !r.reward);

    // Verify no rewards leaked
    try {
      const rewData = await (await fetch(`${API}/api/rewards/${r.accountId}`)).json() as any[];
      if (rewData.length > 0) { r.passed = false; r.reason = (r.reason || '') + ' [LEAK:rewards]'; }
    } catch {}

  } catch (e: any) {
    r.error = e.message;
  }

  r.timeMs = Date.now() - start;
  return r;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ACE Forged Test — 12 Attacks, Mixed Sizes  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  try { await fetch(`${API}/api/health`); } catch { console.error('Server not running'); process.exit(1); }
  console.log('[SERVER] OK\n');

  const results: ForgeResult[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const size = SIZES[i];
    const attack = ATTACKS[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${ROUNDS}] ${size.rows}x${size.cols}(${size.mines}m) ${attack.padEnd(22)}...`);
    const r = await runRound(i + 1, size, attack);
    results.push(r);

    const icon = r.passed ? '✅' : '❌';
    console.log(` ${icon} ${r.valid ? 'ACCEPTED(BUG!)' : 'REJECTED'} | ${r.timeMs}ms`);
    if (!r.passed) console.log(`         reason: ${r.reason}`);

    await new Promise(res => setTimeout(res, 200));
  }

  const passed = results.filter(r => r.passed).length;
  const leaked = results.filter(r => r.valid).length;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Rejected: ${passed}/${ROUNDS} | Leaked: ${leaked}                              ║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  console.log('\nRd | Size   |Attack               |Result  |Time');
  console.log('---|--------|---------------------|--------|----');
  for (const r of results) {
    console.log(`${String(r.round).padStart(2)} | ${r.gridLabel.padEnd(6)} | ${r.attackType.padEnd(19)} | ${r.valid ? 'ACCEPTED' : 'REJECTED'} | ${r.timeMs}ms`);
  }

  require('fs').writeFileSync('test_ace_forged_results.json', JSON.stringify(results, null, 2));
  console.log('\n→ test_ace_forged_results.json');
  process.exit(passed === ROUNDS ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
