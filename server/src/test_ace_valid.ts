// ACE Valid Test — simulates real player using ONLY shared gameLogic functions.
// Uses seeded RNG everywhere (same as frontend after v0.2.2 RNG fix).
// Builder and verifier produce identical board states → 100% deterministic.

import {
  createEmptyGrid, placeMines, revealCellLogic, getChordTargets, checkWin, cloneGrid
} from '../../shared/gameLogic';
import { createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const API = 'http://localhost:38001';

// Realistic game sizes
const SIZES = [
  { rows: 8, cols: 8, mines: 10 },
  { rows: 9, cols: 9, mines: 14 },
  { rows: 9, cols: 9, mines: 18 },
  { rows: 10, cols: 10, mines: 18 },
  { rows: 10, cols: 10, mines: 22 },
  { rows: 12, cols: 12, mines: 28 },
  { rows: 16, cols: 16, mines: 40 },
  { rows: 8, cols: 16, mines: 22 },
  { rows: 16, cols: 8, mines: 22 },
  { rows: 8, cols: 8, mines: 14 },
  { rows: 12, cols: 12, mines: 32 },
  { rows: 16, cols: 16, mines: 56 },
  { rows: 8, cols: 16, mines: 28 },
  { rows: 16, cols: 8, mines: 28 },
];

interface RoundResult {
  round: number; gridLabel: string;
  rows: number; cols: number; mines: number;
  accountId: string; valid: boolean; reward: string | null; reason: string | null;
  actions: number; prayersUsed: number; ace: boolean; buildMs: number; totalMs: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════
// Game builder — uses ONLY shared functions with seeded RNG
// Strategy: a human player deducing from revealed numbers
// ═══════════════════════════════════════════════════════════

type Board = any[][];

function buildGame(rows: number, cols: number, mines: number, label: string): GameSubmission {
  const firstR = Math.floor(rows / 2), firstC = Math.floor(cols / 2);
  // Seed matches frontend: rows-cols-mines-firstR-firstC-{label}
  const mineSeed = `${rows}-${cols}-${mines}-${firstR}-${firstC}-${label}`;
  // Mines RNG = placeMines() seeded (same as frontend: createRNG(hashSeed(mineSeed)))
  const mineRng = createRNG(hashSeed(mineSeed));
  // CSP RNG = same as frontend (cspRngRef.current) and verifier
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));

  // 1. Place mines with seeded RNG → shared placeMines
  let board: Board = createEmptyGrid(rows, cols);
  board = placeMines(board, mines, firstR, firstC, mineRng);

  const actions: GameAction[] = [];
  let ts = 0;
  let prayers = 0;

  // 2. First reveal → shared revealCellLogic (isFirstClick=true)
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  let res = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = res.grid;
  if (res.exploded) throw new Error('BOOM on first click');

  // 3. Solve loop using deduction (reads board.isMine to simulate human deduction)
  while (!checkWin(board)) {
    let acted = false;

    // ── Phase A: Deduce mines from revealed numbers ──
    // hidden == remaining mines → all hidden are mines
    for (let r = 0; r < rows && !acted; r++) {
      for (let c = 0; c < cols && !acted; c++) {
        if (board[r][c].status !== 'revealed') continue;
        const nn = board[r][c].neighborMines;
        let flagged = 0; const hidden: [number, number][] = [];
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
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

    // ── Phase B: Deduce safe cells → pray-reveal ──
    // flagged == neighborMines → remaining hidden are safe → pray-reveal (curse protection)
    if (!acted) {
      for (let r = 0; r < rows && !acted; r++) {
        for (let c = 0; c < cols && !acted; c++) {
          if (board[r][c].status !== 'revealed') continue;
          const nn = board[r][c].neighborMines;
          let flagged = 0; const hidden: [number, number][] = [];
          const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (board[nr][nc].status === 'flagged') flagged++;
            else if (board[nr][nc].status === 'hidden') hidden.push([nr, nc]);
          }
          if (flagged === nn && hidden.length > 0) {
            // All remaining hidden neighbors are safe → pray-reveal (without prayer, CSP would curse them)
            for (const [nr, nc] of hidden) {
              if (board[nr][nc].status !== 'hidden') continue;
              actions.push({ type: 'reveal', row: nr, col: nc, ts, prayed: true }); ts += 200;
              prayers++;
              const cr = revealCellLogic(board, nr, nc, false, true, cspRng);
              board = cr.grid;
              // Cannot explode — cell is safe AND we prayed (CSP only activates on mine prayer)
              acted = true;
            }
          }
        }
      }
    }

    if (checkWin(board)) break;

    // ── Phase C: Exhaust remaining safe cells using full board knowledge ──
    // After simple deduction, pray-reveal any remaining non-mine hidden cells
    // (equivalent to a player doing deeper constraint inference)
    if (!acted) {
      for (let r = 0; r < rows && !acted; r++) {
        for (let c = 0; c < cols && !acted; c++) {
          if (board[r][c].status !== 'hidden') continue;
          if (!board[r][c].isMine) {
            // Safe cell — pray-reveal to avoid curse
            actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true }); ts += 200;
            prayers++;
            const cr = revealCellLogic(board, r, c, false, true, cspRng);
            board = cr.grid;
            acted = true;
          }
        }
      }
    }

    // If still stuck, break to avoid infinite loop
    if (!acted) break;
  }

  return {
    version: 1,
    nonce: 'PLACEHOLDER',
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: prayers,
    total_time_ms: ts,
  };
}

// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ACE Valid Test — Shared Functions, Seeded  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  try { await fetch(`${API}/api/health`); console.log('[SERVER] OK\n'); }
  catch { console.error('Server not running'); process.exit(1); }

  const results: RoundResult[] = [];
  let aceCount = 0, rewardCount = 0;

  for (let i = 0; i < SIZES.length; i++) {
    const sz = SIZES[i];
    const r: RoundResult = {
      round: i + 1, gridLabel: `${sz.rows}x${sz.cols}`,
      rows: sz.rows, cols: sz.cols, mines: sz.mines,
      accountId: '', valid: false, reward: null, reason: null,
      actions: 0, prayersUsed: 0, ace: false, buildMs: 0, totalMs: 0,
    };
    try {
      const t0 = Date.now();
      const did = `t-${i + 1}-${Date.now()}`;

      const auth = await (await fetch(`${API}/api/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'auto', platform_id: did }),
      })).json() as any;
      r.accountId = auth.account_id;

      await fetch(`${API}/api/auth/${r.accountId}/nickname`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `Tester${i + 1}` }),
      });

      const b0 = Date.now();
      const game = buildGame(sz.rows, sz.cols, sz.mines, `r${i + 1}`);
      r.buildMs = Date.now() - b0;
      r.actions = game.actions.length;
      r.prayersUsed = game.prayers_used;
      r.ace = game.prayers_used === 0;
      if (r.ace) aceCount++;

      const nonce = (await (await fetch(`${API}/api/nonce?account_id=${r.accountId}`)).json() as any).nonce;
      game.nonce = nonce;
      const sub = await fetch(`${API}/api/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: r.accountId, payload: encrypt(JSON.stringify(game)) }),
      });
      const sd = await sub.json() as any;
      r.valid = sd.valid;
      r.reason = sd.reason || null;
      r.reward = sd.reward?.title || null;
      if (r.reward) rewardCount++;
      r.totalMs = Date.now() - t0;
    } catch (e: any) { r.error = e.message; }
    results.push(r);

    const tag = r.ace ? 'ACE' : 'CSP';
    const icon = r.valid ? '✅' : '❌';
    const rw = r.reward ? `🎁${r.reward}` : '--';
    console.log(`[${String(i+1).padStart(2)}/${SIZES.length}] ${tag} ${r.gridLabel.padEnd(7)} ${String(sz.mines).padStart(3)}m ` +
      `${icon} valid=${r.valid} reward=${rw} acts=${String(r.actions).padStart(3)} pray=${String(r.prayersUsed).padStart(3)} ` +
      `build=${String(r.buildMs).padStart(4)}ms total=${String(r.totalMs).padStart(4)}ms` +
      (r.error ? ` ERR:${r.error}` : '') + (r.reason && !r.valid ? `\n       reason: ${r.reason}` : ''));
    await new Promise(res => setTimeout(res, 300));
  }

  const validCount = results.filter(r => r.valid).length;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Valid: ${validCount}/${SIZES.length} | ACE: ${aceCount} | Rewarded: ${rewardCount}         ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log('\nRd |Type| Size   |Mines|Valid|Reward|Acts|Pray|buildMs');
  console.log('---|----|--------|-----|-----|------|----|----|-------');
  for (const r of results)
    console.log(`${String(r.round).padStart(2)} | ${r.ace?'ACE':'CSP'} | ${r.gridLabel.padEnd(6)} | ${String(r.mines).padStart(3)} | ${String(r.valid).padStart(3)} | ${(r.reward||'-').padStart(4)} | ${String(r.actions).padStart(3)} | ${String(r.prayersUsed).padStart(3)} | ${String(r.buildMs).padStart(5)}`);
  require('fs').writeFileSync('test_ace_valid_results.json', JSON.stringify(results, null, 2));
  console.log('\n→ test_ace_valid_results.json');
  process.exit(validCount === SIZES.length ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
