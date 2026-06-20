// ACE Valid Test — realistic minesweeper solver (deduce → chord → pray).
// Builder behaves like a real player: deduct safe/mine cells, chord, only pray when stuck.
// All game data is deterministic — builder and verifier use the same mine_seed + CSP RNG.

import { revealCellLogic, checkWin, cloneGrid } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const API = 'http://localhost:38001';

// ── Size pool: realistic game sizes ──
const SIZES = [
  { rows: 8, cols: 8, mines: 10 },
  { rows: 8, cols: 8, mines: 14 },
  { rows: 9, cols: 9, mines: 14 },
  { rows: 9, cols: 9, mines: 18 },
  { rows: 10, cols: 10, mines: 18 },
  { rows: 10, cols: 10, mines: 22 },
  { rows: 12, cols: 12, mines: 28 },
  { rows: 12, cols: 12, mines: 32 },
  { rows: 16, cols: 16, mines: 40 },
  { rows: 16, cols: 16, mines: 56 },
  { rows: 8, cols: 16, mines: 22 },
  { rows: 8, cols: 16, mines: 28 },
  { rows: 16, cols: 8, mines: 22 },
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
  chords: number;
  ace: boolean;
  buildMs: number;
  totalMs: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// REALISTIC MINESWEEPER SOLVER
// Strategy loop (no RNG — fully deterministic):
//   1. Deduce safe cells (reveal without prayer)
//   2. Deduce mine cells (flag)
//   3. Chord on satisfied number cells
//   4. If stuck, use PRAYER on one cell — CSP will either make it safe or explode → flag
// ═══════════════════════════════════════════════════════════════════

const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

interface GridCell {
  status: 'hidden' | 'revealed' | 'flagged';
  isMine: boolean;
  neighborMines: number;
}

type Board = GridCell[][];

function neighborsOf(r: number, c: number, rows: number, cols: number): [number, number][] {
  const result: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push([nr, nc]);
  }
  return result;
}

function solveBoard(rows: number, cols: number, mines: number, mineSeed: string, cspRng: () => number): GameSubmission {
  let board: Board = deterministicPlaceMines(rows, cols, mines, 
    Math.floor(rows/2), Math.floor(cols/2), mineSeed);
  board = board.map(row => row.map(c => ({ ...c }))); // deep clone

  const actions: GameAction[] = [];
  let ts = 0;
  let prayers = 0;

  // 1. First reveal
  const firstR = Math.floor(rows/2), firstC = Math.floor(cols/2);
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  let r = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = r.grid;
  if (r.exploded) throw new Error('BOOM first click');

  // 2. Solve loop: flag-known-mines → chord → pray (no individual safe reveals)
  while (!checkWin(board)) {
    let acted = false;
    let prayBefore = prayers;

    // ── Phase A: DEDUCE MINES ──
    for (let r = 0; r < rows && !acted; r++) {
      for (let c = 0; c < cols && !acted; c++) {
        if (board[r][c].status !== 'revealed') continue;
        const nn = board[r][c].neighborMines;
        let flagged = 0, hidden: [number, number][] = [];
        for (const [nr, nc] of neighborsOf(r, c, rows, cols)) {
          if (board[nr][nc].status === 'flagged') flagged++;
          else if (board[nr][nc].status === 'hidden') hidden.push([nr, nc]);
        }
        if (flagged < nn && hidden.length === nn - flagged) {
          for (const [nr, nc] of hidden) {
            if (board[nr][nc].status !== 'hidden') continue;
            actions.push({ type: 'flag', row: nr, col: nc, ts }); ts += 100;
            board[nr][nc].status = 'flagged';
            acted = true;
          }
        }
      }
    }

    // ── Phase B: CHORD on satisfied cells ──
    if (!acted) {
      for (let r = 0; r < rows && !acted; r++) {
        for (let c = 0; c < cols && !acted; c++) {
          if (board[r][c].status !== 'revealed' || board[r][c].neighborMines === 0) continue;
          let flagged = 0, hasHidden = false;
          for (const [nr, nc] of neighborsOf(r, c, rows, cols)) {
            if (board[nr][nc].status === 'flagged') flagged++;
            if (board[nr][nc].status === 'hidden') hasHidden = true;
          }
          if (flagged === board[r][c].neighborMines && hasHidden) {
            actions.push({ type: 'chord', row: r, col: c, ts }); ts += 400;
            for (const [nr, nc] of neighborsOf(r, c, rows, cols)) {
              if (board[nr][nc].status !== 'hidden') continue;
              const res = revealCellLogic(board, nr, nc, false, false, cspRng);
              board = res.grid;
              if (res.exploded) board[nr][nc].status = 'flagged';
            }
            acted = true;
          }
        }
      }
    }

    // Clean up chord explosions
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if ((board[r][c] as any).isExploded) board[r][c].status = 'flagged';

    if (checkWin(board)) break;

    // ── Phase C: PRAYER on uncertain hidden cell ──
    if (!acted) {
      let found = false;
      for (let r = 0; r < rows && !found; r++) {
        for (let c = 0; c < cols && !found; c++) {
          if (board[r][c].status !== 'hidden') continue;
          actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true }); ts += 200;
          prayers++;
          const res = revealCellLogic(board, r, c, false, true, cspRng);
          board = res.grid;
          if (res.exploded) {
            board[r][c].status = 'flagged';
          }
          found = true;
        }
      }
      if (!found) throw new Error('Stuck: no hidden cells but not won');
    }

    if (checkWin(board)) break;
    if (!acted && prayers === prayBefore) throw new Error('Solver stuck in deadlock');
  }

  const chords = actions.filter(a => a.type === 'chord').length;

  return {
    version: 1, nonce: 'PLACEHOLDER',
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: prayers,
    total_time_ms: ts,
  };
}

// ═══════════════════════════════════════════════════════════════════

function makeSeed(rows: number, cols: number, mines: number, firstR: number, firstC: number, label: string): string {
  return `${rows}-${cols}-${mines}-${firstR}-${firstC}-${label}`;
}

async function submit(game: GameSubmission, accountId: string) {
  const nonce = (await (await fetch(`${API}/api/nonce?account_id=${accountId}`)).json() as any).nonce;
  game.nonce = nonce;
  return fetch(`${API}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload: encrypt(JSON.stringify(game)) }),
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ACE Valid Test — Realistic Solver, 14 Rounds       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  try { await fetch(`${API}/api/health`); } catch { console.error('Server not running'); process.exit(1); }
  console.log('[SERVER] OK\n');

  const TOTAL = SIZES.length;
  const results: RoundResult[] = [];
  let aceTotal = 0, aceRewarded = 0;

  for (let i = 0; i < TOTAL; i++) {
    const size = SIZES[i];
    const r: RoundResult = {
      round: i + 1,
      gridLabel: `${size.rows}x${size.cols}`,
      rows: size.rows, cols: size.cols, mines: size.mines,
      accountId: '', valid: false, reward: null, reason: null,
      actions: 0, prayersUsed: 0, chords: 0, ace: false,
      buildMs: 0, totalMs: 0,
    };

    try {
      const totalStart = Date.now();
      const deviceId = `solve-${i+1}-${Date.now()}`;

      const auth = await (await fetch(`${API}/api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'auto', platform_id: deviceId }),
      })).json() as any;
      r.accountId = auth.account_id;

      await fetch(`${API}/api/auth/${r.accountId}/nickname`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `Solver${i+1}` }),
      });

      const buildStart = Date.now();
      const firstR = Math.floor(size.rows/2), firstC = Math.floor(size.cols/2);
      const seed = makeSeed(size.rows, size.cols, size.mines, firstR, firstC, `r${i+1}`);
      const cspRng = createRNG(hashSeed(seed + '-csp'));
      const game = solveBoard(size.rows, size.cols, size.mines, seed, cspRng);
      r.buildMs = Date.now() - buildStart;
      r.actions = game.actions.length;
      r.prayersUsed = game.prayers_used;
      r.chords = game.actions.filter(a => a.type === 'chord').length;
      r.ace = game.prayers_used === 0;
      if (r.ace) aceTotal++;

      const subRes = await submit(game, r.accountId);
      const subData = await subRes.json() as any;
      r.valid = subData.valid;
      r.reason = subData.reason || null;
      r.reward = subData.reward ? subData.reward.title : null;

      if (r.ace && r.reward) aceRewarded++;

      r.totalMs = Date.now() - totalStart;
    } catch (e: any) {
      r.error = e.message;
    }

    results.push(r);

    const type = r.ace ? 'ACE' : 'CSP';
    const icon = r.valid ? '✅' : '❌';
    const reward = r.reward ? `🎁${r.reward}` : '--';
    console.log(
      `[${String(i+1).padStart(2)}/${TOTAL}] ${type} ${r.gridLabel.padEnd(7)} ${String(size.mines).padStart(3)}m ` +
      `${icon} valid=${r.valid} reward=${reward.padEnd(5)} acts=${String(r.actions).padStart(3)} chord=${String(r.chords).padStart(3)} pray=${String(r.prayersUsed).padStart(3)} ` +
      `build=${String(r.buildMs).padStart(4)}ms total=${String(r.totalMs).padStart(4)}ms` +
      (r.error ? ` ERR:${r.error}` : '')
    );
    if (r.reason && !r.valid) console.log(`       reason: ${r.reason}`);

    await new Promise(res => setTimeout(res, 800));
  }

  const validCount = results.filter(r => r.valid).length;
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Valid: ${validCount}/${TOTAL} | ACE: ${aceTotal}/${TOTAL} | ACE Rewarded: ${aceRewarded}  ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  console.log('\nRd |Type| Size   |Mines|Valid|Reward|Acts|Chrd|Pray|buildMs');
  console.log('---|----|--------|-----|-----|------|----|----|----|-------');
  for (const r of results) {
    console.log(
      `${String(r.round).padStart(2)} | ${r.ace?'ACE':'CSP'} | ${r.gridLabel.padEnd(6)} | ${String(r.mines).padStart(3)} | ${String(r.valid).padStart(3)} | ` +
      `${(r.reward||'-').padStart(4)} | ${String(r.actions).padStart(3)} | ${String(r.chords).padStart(3)} | ${String(r.prayersUsed).padStart(3)} | ${String(r.buildMs).padStart(5)}`
    );
  }

  require('fs').writeFileSync('test_ace_valid_results.json', JSON.stringify(results, null, 2));
  console.log('\n→ test_ace_valid_results.json');
  process.exit(validCount === TOTAL ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
