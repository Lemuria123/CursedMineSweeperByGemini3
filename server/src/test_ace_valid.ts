// ACE Valid Test — full pipeline verification (register → submit → records → rewards → leaderboard).
// Mix of ACE (0 prayers → earns reward) and CSP (prayers > 0 → no reward) on RANDOM sizes.
// Builder uses the SAME mine_seed + seeded CSP RNG as the server verifier,
// so replay is guaranteed identical.

import { createEmptyGrid, revealCellLogic, checkWin, cloneGrid } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const API = 'http://localhost:38001';

// Size pool with realistic difficulty spread.
// Smaller sizes with low density can ACE; larger sizes need CSP.
// All sizes pass verification — the verifier handles both correctly.
const SIZES = [
  // ACE-capable (verified via test_ace_scan.ts)
  { rows: 4, cols: 4, mines: 2 },
  { rows: 5, cols: 5, mines: 3 },
  { rows: 5, cols: 6, mines: 3 },
  { rows: 6, cols: 5, mines: 3 },
  { rows: 6, cols: 6, mines: 3 },
  { rows: 7, cols: 7, mines: 5 },
  // CSP-only (too many mines for flood fill)
  { rows: 8, cols: 8, mines: 14 },
  { rows: 9, cols: 9, mines: 18 },
  { rows: 10, cols: 10, mines: 22 },
  { rows: 12, cols: 12, mines: 32 },
  { rows: 16, cols: 16, mines: 56 },
  { rows: 8, cols: 16, mines: 28 },
  { rows: 16, cols: 8, mines: 28 },
];

interface RoundResult {
  round: number;
  gridLabel: string;
  rows: number; cols: number; mines: number;
  accountId: string;
  valid: boolean;
  reward: string | null;
  reason: string | null;
  actions: number;
  prayersUsed: number;
  ace: boolean;
  buildMs: number;
  totalMs: number;
  recordsOk: boolean;
  rewardsOk: boolean;
  leaderboardOk: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Builder: constructs game IDENTICALLY to how verifier replays it.
// Both use: deterministicPlaceMines(mine_seed) + revealCellLogic(..., cspRng)
// where cspRng = createRNG(hashSeed(mine_seed + '-csp'))
// ═══════════════════════════════════════════════════════════════

function makeSeed(rows: number, cols: number, mines: number, firstR: number, firstC: number, label: string, attempt: number): string {
  return `${rows}-${cols}-${mines}-${firstR}-${firstC}-${label}-${attempt}`;
}

function makeCspRng(mineSeed: string) {
  return createRNG(hashSeed(mineSeed + '-csp'));
}

/**
 * Try to build an ACE game (0 prayers) for the given grid config.
 * Returns null if flood fill can't win the board (no seed found in maxAttempts).
 */
function tryBuildAce(rows: number, cols: number, mines: number, label: string, maxAttempts = 200): GameSubmission | null {
  const firstR = Math.floor(rows / 2), firstC = Math.floor(cols / 2);
  for (let a = 0; a < maxAttempts; a++) {
    const seed = makeSeed(rows, cols, mines, firstR, firstC, label, a);
    // No CSP RNG needed — ACE has no reveal actions, only first_reveal + flag
    let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, seed);
    board = board.map(row => row.map(c => ({ ...c }))); // deep clone

    const actions: GameAction[] = [];
    let ts = 0;

    // first_reveal
    actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
    const res = revealCellLogic(board, firstR, firstC, true, false);
    board = res.grid;
    if (res.exploded) continue;

    // Flag all hidden mines
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (board[r][c].status === 'hidden' && board[r][c].isMine) {
          actions.push({ type: 'flag', row: r, col: c, ts }); ts += 100;
          board[r][c].status = 'flagged';
        }

    // All remaining hidden cells must be mines (flood fill covered all safe)
    let safeHidden = false;
    for (let r = 0; r < rows && !safeHidden; r++)
      for (let c = 0; c < cols && !safeHidden; c++)
        if (board[r][c].status === 'hidden' && !board[r][c].isMine) safeHidden = true;
    if (safeHidden) continue;

    return {
      version: 1, nonce: 'PLACEHOLDER',
      grid: { rows, cols, mines },
      mine_seed: seed,
      actions,
      prayers_used: 0,
      total_time_ms: ts,
    };
  }
  return null;
}

/**
 * Build a CSP game (prayers > 0) — guaranteed to work first try.
 * Uses seeded CSP RNG so verifier replays identically.
 */
function buildCsp(rows: number, cols: number, mines: number, label: string): GameSubmission {
  const firstR = Math.floor(rows / 2), firstC = Math.floor(cols / 2);
  const seed = makeSeed(rows, cols, mines, firstR, firstC, label, 0);
  const cspRng = makeCspRng(seed);
  let board = deterministicPlaceMines(rows, cols, mines, firstR, firstC, seed);
  board = board.map(row => row.map(c => ({ ...c })));

  const actions: GameAction[] = [];
  let ts = 0, prayers = 0;

  // first_reveal
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  board = revealCellLogic(board, firstR, firstC, true, false, cspRng).grid;

  // Greedy solver: scan cells, flag mines, reveal safe with prayer
  let changed = true;
  while (changed && !checkWin(board)) {
    changed = false;
    for (let r = 0; r < rows && !changed && !checkWin(board); r++) {
      for (let c = 0; c < cols && !changed && !checkWin(board); c++) {
        if (board[r][c].status !== 'hidden') continue;
        changed = true;
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
  }

  return {
    version: 1, nonce: 'PLACEHOLDER',
    grid: { rows, cols, mines },
    mine_seed: seed,
    actions,
    prayers_used: prayers,
    total_time_ms: ts,
  };
}

// ═══════════════════════════════════════════════════════════════
// API helpers
// ═══════════════════════════════════════════════════════════════

async function submit(game: GameSubmission, accountId: string) {
  const nonce = (await (await fetch(`${API}/api/nonce?account_id=${accountId}`)).json() as any).nonce;
  game.nonce = nonce;
  return fetch(`${API}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload: encrypt(JSON.stringify(game)) }),
  });
}

// ═══════════════════════════════════════════════════════════════
// Main test loop
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ACE Valid Test — Full Sizes, ACE + CSP     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  try { await fetch(`${API}/api/health`); } catch { console.error('Server not running'); process.exit(1); }
  console.log('[SERVER] OK\n');

  const TOTAL = 20;
  const results: RoundResult[] = [];
  let aceFound = 0;

  for (let i = 0; i < TOTAL; i++) {
    const size = SIZES[i % SIZES.length];
    const r: RoundResult = {
      round: i + 1,
      gridLabel: `${size.rows}x${size.cols}`,
      rows: size.rows, cols: size.cols, mines: size.mines,
      accountId: '', valid: false, reward: null, reason: null,
      actions: 0, prayersUsed: 0, ace: false,
      buildMs: 0, totalMs: 0,
      recordsOk: false, rewardsOk: false, leaderboardOk: false,
    };

    try {
      const totalStart = Date.now();
      const deviceId = `test-${i + 1}-${Date.now()}`;

      // ── Register ──
      const auth = await (await fetch(`${API}/api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'auto', platform_id: deviceId }),
      })).json() as any;
      r.accountId = auth.account_id;

      await fetch(`${API}/api/auth/${r.accountId}/nickname`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `Tester${i + 1}` }),
      });

      // ── Build game ──
      const buildStart = Date.now();
      let game: GameSubmission;

      // Try ACE first, fall back to CSP
      const aceGame = tryBuildAce(size.rows, size.cols, size.mines, `ace-round${i + 1}`);
      if (aceGame) {
        game = aceGame;
        r.ace = true;
        aceFound++;
      } else {
        game = buildCsp(size.rows, size.cols, size.mines, `csp-round${i + 1}`);
      }

      r.buildMs = Date.now() - buildStart;
      r.actions = game.actions.length;
      r.prayersUsed = game.prayers_used;

      // ── Submit ──
      const subRes = await submit(game, r.accountId);
      const subData = await subRes.json() as any;
      r.valid = subData.valid;
      r.reason = subData.reason || subData.error || null;
      r.reward = subData.reward ? subData.reward.title : null;

      // ── Verify supporting endpoints ──
      const recs = await (await fetch(`${API}/api/records/me/${r.accountId}`)).json() as any[];
      r.recordsOk = Array.isArray(recs) && recs.length > 0;

      const rews = await (await fetch(`${API}/api/rewards/${r.accountId}`)).json() as any[];
      r.rewardsOk = Array.isArray(rews);

      const lb = await (await fetch(`${API}/api/records/${size.rows}/${size.cols}`)).json() as any[];
      r.leaderboardOk = Array.isArray(lb) && lb.length > 0;

      r.totalMs = Date.now() - totalStart;
    } catch (e: any) {
      r.error = e.message;
    }

    results.push(r);

    const type = r.ace ? 'ACE' : 'CSP';
    const icon = r.valid ? '✅' : '❌';
    const rw = r.reward ? `🎁${r.reward}` : '--';
    console.log(
      `[${String(i + 1).padStart(2)}/${TOTAL}] ${type} ${r.gridLabel.padEnd(7)} ${String(r.mines).padStart(3)}m ` +
      `${icon} valid=${r.valid} reward=${rw.padEnd(5)} acts=${String(r.actions).padStart(3)} pray=${String(r.prayersUsed).padStart(3)} ` +
      `build=${String(r.buildMs).padStart(4)}ms total=${String(r.totalMs).padStart(4)}ms` +
      (r.error ? ` ERR:${r.error}` : '')
    );
    if (r.reason && !r.valid) console.log(`          reason: ${r.reason}`);

    await new Promise(res => setTimeout(res, 300));
  }

  // ── Summary ──
  const valid = results.filter(r => r.valid).length;
  const aceValid = results.filter(r => r.ace && r.valid).length;
  const rewarded = results.filter(r => r.reward).length;

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Valid: ${String(valid).padStart(2)}/${TOTAL} | ACE found: ${String(aceFound).padStart(2)} | ACE valid: ${String(aceValid).padStart(2)} | Rewarded: ${String(rewarded).padStart(2)}  ║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  // Table
  console.log('\nRd |Type| Size  |Mines|Valid|Reward|Acts|Pray|buildMs|totalMs');
  console.log('---|----|-------|-----|-----|------|----|----|-------|-------');
  for (const r of results) {
    console.log(
      `${String(r.round).padStart(2)} | ${r.ace ? 'ACE' : 'CSP'} | ${r.gridLabel.padEnd(5)} | ${String(r.mines).padStart(3)} | ${String(r.valid).padStart(3)} | ` +
      `${(r.reward || '-').padStart(4)} | ${String(r.actions).padStart(3)} | ${String(r.prayersUsed).padStart(3)} | ` +
      `${String(r.buildMs).padStart(5)} | ${String(r.totalMs).padStart(5)}`
    );
  }

  require('fs').writeFileSync('test_ace_valid_results.json', JSON.stringify(results, null, 2));
  console.log('\n→ test_ace_valid_results.json');
  process.exit(valid === TOTAL ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
