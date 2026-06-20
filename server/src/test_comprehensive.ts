// ============================================================================
// Comprehensive Test Script — 综合验证测试
// ============================================================================
// Requirements:
//   1. 随机棋盘大小 — random rows, cols, mines=calculateRecommendedMines
//   2. 模拟前端真实数据 — exact GameRecorder.buildPayload output format
//   3. 覆盖 ACE/非ACE × 有效/伪造 四种场景
//
// Architecture:
//   ┌─ randomBoardResult() ─ 生成随机棋盘尺寸
//   ├─ buildNonAceGame()    ─ 使用 prayer 构建必过游戏 (非ACE)
//   ├─ buildAceGame()       ─ 使用 flag+chord 推理构建 ACE 游戏 (零祈祷)
//   ├─ forge()              ─ 对基础游戏应用 12 种攻击向量
//   ├─ submitAndVerify()    ─ 注册→nonce→加密(AES-256-GCM)→提交→验证
//   └─ 结果报告             ─ 分象限统计通过率
//
// Encryption: server/src/crypto.ts encrypt() — format identical to frontend's
//             Web Crypto AES-256-GCM (base64(iv+ciphertext+authTag)).
//
// Usage:
//   Ensure server is running, then:
//     npx ts-node --transpile-only src/test_comprehensive.ts
// ============================================================================

import { createEmptyGrid, placeMines, revealCellLogic, getChordTargets, checkWin, calculateRecommendedMines } from '../../shared/gameLogic';
import { createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';
import { CellData } from '../../shared/types';

const API = 'http://localhost:38001';

// ── Types ──────────────────────────────────────────────────────────────────

interface BoardConfig { rows: number; cols: number; mines: number; }

interface TestResult {
  id: string;               // unique test id, e.g. "ace-valid-1"
  category: 'ace-valid' | 'nonace-valid' | 'ace-forged' | 'nonace-forged';
  config: BoardConfig;      // { rows, cols, mines }
  attack?: string;          // forge attack type (for forged rounds only)
  accountId: string;        // registered account UUID
  valid: boolean;           // server response valid
  reason: string | null;    // server rejection reason
  reward: string | null;    // cursed reward title (only for valid ACE)
  prayersUsed: number;      // prayers in submission
  ace: boolean;             // prayers === 0
  actions: number;          // total action count
  totalMs: number;          // round elapsed ms
  passed: boolean;          // valid → should be true for valid rounds, false for forged
  error?: string;           // unexpected error during round
}

// ── Random Board Size Generator ────────────────────────────────────────────

/**
 * Generate random board dimensions.
 * Rows: 6–20, Cols: 6–25, Mines: calculateRecommendedMines(rows, cols).
 * Ensures mine count <= available cells minus 3×3 safe zone.
 */
function randomBoardConfig(): BoardConfig {
  const rows = 6 + Math.floor(Math.random() * 15);   // 6–20
  const cols = 6 + Math.floor(Math.random() * 20);   // 6–25
  let mines = calculateRecommendedMines(rows, cols);
  // Cap mines to avoid "not enough non-safe cells" error
  const maxMines = rows * cols - 9; // 3×3 safe zone
  if (mines > maxMines) mines = maxMines;
  if (mines < 1) mines = 1;
  return { rows, cols, mines };
}

// ── Game Builders ──────────────────────────────────────────────────────────

/**
 * Build a Non-ACE game (uses prayer on every reveal — guaranteed to complete).
 *
 * Strategy:
 *   1. First click reveals safe zone
 *   2. Loop: flag all hidden mines (board knowledge), pray-reveal all hidden safe cells
 *   3. Continue until checkWin() returns true
 *
 * Produces GameSubmission payload matching EXACTLY what the frontend
 * GameRecorder.buildPayload() would output.
 */
function buildNonAceGame(cfg: BoardConfig, seedSuffix: string): { submission: GameSubmission; prayersUsed: number } {
  const { rows, cols, mines } = cfg;
  const firstR = Math.floor(rows / 2);
  const firstC = Math.floor(cols / 2);

  // Mine seed — matches frontend: rows-cols-mines-firstR-firstC-seedSuffix
  const mineSeed = `${rows}-${cols}-${mines}-${firstR}-${firstC}-${seedSuffix}`;
  const mineRng = createRNG(hashSeed(mineSeed));
  const cspRng = createRNG(hashSeed(mineSeed + '-csp')); // deterministic CSP

  // Place mines with seeded RNG (same as frontend: createRNG(hashSeed(mineSeed)))
  let board: CellData[][] = createEmptyGrid(rows, cols);
  board = placeMines(board, mines, firstR, firstC, mineRng);

  const actions: GameAction[] = [];
  let ts = 0;
  let prayersUsed = 0;

  // Step 1: First reveal (never explodes — 3×3 safe zone)
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts });
  ts += 300; // simulate human reaction time
  let result = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = result.grid;
  if (result.exploded) throw new Error('Non-ACE: BOOM on first click');

  // Step 2: Flag all mines, pray-reveal all safe cells
  while (!checkWin(board)) {
    let acted = false;

    // Phase A: Flag remaining hidden mines
    for (let r = 0; r < rows && !acted; r++) {
      for (let c = 0; c < cols && !acted; c++) {
        if (board[r][c].status === 'hidden' && board[r][c].isMine) {
          actions.push({ type: 'flag', row: r, col: c, ts });
          ts += 150;
          board[r][c].status = 'flagged';
          acted = true;
        }
      }
    }

    // Phase B: Reveal all remaining hidden safe cells — with prayer for CSP protection
    if (!acted) {
      for (let r = 0; r < rows && !acted; r++) {
        for (let c = 0; c < cols && !acted; c++) {
          if (board[r][c].status === 'hidden' && !board[r][c].isMine) {
            // Record with prayed:true to match frontend's isPraying state
            actions.push({ type: 'reveal', row: r, col: c, ts, prayed: true });
            ts += 250;
            prayersUsed++;
            const res = revealCellLogic(board, r, c, false, true, cspRng);
            board = res.grid;
            if (res.exploded) {
              throw new Error(`Non-ACE: BOOM at safe cell (${r},${c}) — CSP error`);
            }
            acted = true;
          }
        }
      }
    }

    if (!acted) break; // safety: no stuck loop
  }

  if (!checkWin(board)) {
    throw new Error('Non-ACE: game did not complete');
  }

  const submission: GameSubmission = {
    version: 1,
    nonce: 'PLACEHOLDER', // filled in submitAndVerify
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: prayersUsed,
    total_time_ms: ts + 200, // slightly more than last action ts (frontend calls Date.now() after win)
  };

  return { submission, prayersUsed };
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Build an ACE game (zero prayers) using CSP-based safety verification.
 *
 * Strategy:
 *   1. First click reveals initial region.
 *   2. For each hidden non-mine cell, test with CSP: can rearrangeMines make it a mine?
 *      - NO  → the cell is PROVABLY safe → directly reveal it (CSP curse fails)
 *      - YES → the cell is PROVABLY a mine in all solutions → flag it
 *   3. Reveal all provably-safe cells, flag all forced mines.
 *   4. After new reveals create new constraints, repeat.
 *   5. If no progress, board is ACE-unsolvable by this solver.
 *
 * Each cell is tested via: rearrangeMines(clone(grid), r, c, true, rng)
 *   - Returns true  = CSP found a valid arrangement where the cell IS a mine → cursed
 *   - Returns false = CSP cannot make it a mine while satisfying constraints → safe!
 *
 * Returns null if ACE solve is impossible for this random board.
 */
function buildAceGame(cfg: BoardConfig, seedSuffix: string): { submission: GameSubmission; prayersUsed: number } | null {
  const { rows, cols, mines } = cfg;
  const firstR = Math.floor(rows / 2);
  const firstC = Math.floor(cols / 2);

  const mineSeed = `${rows}-${cols}-${mines}-${firstR}-${firstC}-${seedSuffix}`;
  const mineRng = createRNG(hashSeed(mineSeed));
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));

  let board: CellData[][] = createEmptyGrid(rows, cols);
  board = placeMines(board, mines, firstR, firstC, mineRng);

  const actions: GameAction[] = [];
  let ts = 0;

  // Step 1: First reveal
  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts });
  ts += 300;
  let result = revealCellLogic(board, firstR, firstC, true, false, cspRng);
  board = result.grid;
  if (result.exploded) throw new Error('ACE: BOOM on first click');

  // Step 2: CSP-based ACE solve — for each hidden cell, test if CSP can curse it
  const maxIterations = rows * cols;
  let iteration = 0;
  while (!checkWin(board) && iteration < maxIterations) {
    iteration++;
    let acted = false;

    // Collect all hidden cells with their CSP curse status
    const provablySafe: [number, number][] = [];
    const forcedMines: [number, number][] = [];
    // Use RNG snapshot seed per iteration for deterministic per-cell testing
    const testBaseSeed = hashSeed(mineSeed + '-ace-' + iteration);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].status !== 'hidden') continue;

        // Test: can CSP rearrange this cell into a mine?
        //   Each cell gets a unique deterministic seed so test results are reproducible
        const canCurse = rearrangeMinesTest(board, r, c, true, testBaseSeed + r * cols + c);

        if (board[r][c].isMine) {
          if (!canCurse) forcedMines.push([r, c]);
        } else {
          if (!canCurse) provablySafe.push([r, c]);
        }
      }
    }

    // Phase A: Reveal all provably-safe cells — zero prayer, CSP won't curse
    for (const [r, c] of provablySafe) {
      if (board[r][c].status !== 'hidden') continue;
      actions.push({ type: 'reveal', row: r, col: c, ts });
      ts += 200;
      const cr = revealCellLogic(board, r, c, false, false, cspRng);
      board = cr.grid;
      if (cr.exploded) return null; // CSP somehow interfered — unexpected
      acted = true;
    }

    // Phase B: Flag all forced mines
    for (const [r, c] of forcedMines) {
      if (board[r][c].status !== 'hidden') continue;
      actions.push({ type: 'flag', row: r, col: c, ts });
      ts += 150;
      board[r][c].status = 'flagged';
      acted = true;
    }

    if (!acted) break; // no more provably-safe cells to reveal
  }

  if (!checkWin(board)) return null;

  const submission: GameSubmission = {
    version: 1,
    nonce: 'PLACEHOLDER',
    grid: { rows, cols, mines },
    mine_seed: mineSeed,
    actions,
    prayers_used: 0,
    total_time_ms: ts + 200,
  };

  return { submission, prayersUsed: 0 };
}

/**
 * Test-only wrapper: checks if CSP can rearrange the board to set a cell's mine state.
 * Uses cloneGrid to preserve original board, and a fresh RNG snapshot for determinism.
 */
function rearrangeMinesTest(
  grid: CellData[][],
  targetRow: number,
  targetCol: number,
  forceMine: boolean,
  rngSeed: number, // numeric seed for reproducibility
): boolean {
  // Import rearrangeMines at runtime (now exported from shared/gameLogic)
  const { rearrangeMines, cloneGrid } = require('../../shared/gameLogic');
  const { createRNG: mkRng } = require('../../shared/deterministicPlaceMines');
  const testGrid = cloneGrid(grid);
  const testRng = mkRng(rngSeed); // fresh RNG per test → deterministic, no state contamination
  return rearrangeMines(testGrid, targetRow, targetCol, forceMine, testRng);
}

// ── Forge Functions ────────────────────────────────────────────────────────

/**
 * Apply an attack vector to a base GameSubmission.
 * Returns a modified copy.
 */
function forge(attackType: string, base: GameSubmission): GameSubmission {
  const g: GameSubmission = JSON.parse(JSON.stringify(base));
  switch (attackType) {
    // 1. Tamper the mine seed — server detects prefix mismatch
    case 'tampered_mine_seed':
      g.mine_seed = `${g.grid.rows}-${g.grid.cols}-${g.grid.mines}-0-0-evil`;
      break;

    // 2. Fake zero prayers — claim ACE but actually used prayers
    case 'fake_zero_prayers':
      g.prayers_used = 0;
      break;

    // 3. Replay attack — submit same nonce twice
    case 'replay_attack':
      // Handled specially in submitAndVerify (submits twice)
      break;

    // 4. Remove first_reveal — first action becomes plain reveal
    case 'missing_first':
      g.actions = g.actions.filter((a: GameAction) => a.type !== 'first_reveal');
      if (g.actions.length > 0) g.actions[0].type = 'reveal';
      break;

    // 5. Insert out-of-bounds action
    case 'out_of_bounds':
      g.actions.splice(2, 0, {
        type: 'reveal', row: 99, col: 99,
        ts: (g.actions[1]?.ts || 0) + 1, prayed: false,
      });
      break;

    // 6. Tamper grid dimensions — seed prefix mismatch
    case 'tampered_dimensions':
      g.grid = { rows: 500, cols: 500, mines: g.grid.mines };
      break;

    // 7. Empty actions array
    case 'empty_actions':
      g.actions = [];
      break;

    // 8. First action is flag instead of first_reveal
    case 'wrong_first':
      if (g.actions.length > 0) g.actions[0].type = 'flag' as any;
      break;

    // 9. Impossible time (< 100ms minimum)
    case 'impossible_time':
      g.total_time_ms = 50;
      break;

    // 10. Duplicate the first action
    case 'duplicate_action':
      g.actions.splice(2, 0, { ...g.actions[0], ts: g.actions[0].ts + 5 });
      break;

    // 11. Fake nonce — invalid UUID
    case 'bad_nonce': {
      const fg: GameSubmission = JSON.parse(JSON.stringify(base));
      fg.nonce = '00000000-0000-0000-0000-000000000000';
      return fg;
    }

    // 12. total_time_ms less than last action timestamp
    case 'tampered_time_ms':
      if (g.actions.length > 0) {
        g.total_time_ms = g.actions[g.actions.length - 1].ts - 50;
      }
      break;

    default:
      break;
  }
  return g;
}

// ── Submit & Verify ────────────────────────────────────────────────────────

/**
 * Submit a GameSubmission to the server and return verification result.
 *
 * Flow matches EXACT frontend pipeline:
 *   register → getNonce → buildPayload → encrypt(AES-256-GCM) → POST /api/submit
 */
async function submitAndVerify(
  game: GameSubmission,
  attackType?: string,
): Promise<{ valid: boolean; reason: string | null; reward: string | null }> {
  const platformId = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Register account (matches frontend: register('auto', accountId))
  const authResp = await fetchRetry(`${API}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: platformId }),
  });
  const auth = await authResp.json() as any;
  const accountId: string = auth.account_id;

  // Set nickname (for leaderboard record)
  await fetchRetry(`${API}/api/auth/${accountId}/nickname`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: `Tester-${platformId.slice(-6)}` }),
  });

  // Special handling: replay attack — submit same nonce twice
  if (attackType === 'replay_attack') {
    const nonceResp = await fetchRetry(`${API}/api/nonce?account_id=${accountId}`);
    const nonceData = await nonceResp.json() as any;
    const nonce = nonceData.nonce;
    game.nonce = nonce;

    // First submission (should pass if payload is valid)
    await fetchRetry(`${API}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, payload: encrypt(JSON.stringify(game)) }),
    });

    // Second submission — same nonce already consumed → rejected
    const subResp = await fetchRetry(`${API}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, payload: encrypt(JSON.stringify(game)) }),
    });
    const sd = await subResp.json() as any;
    return { valid: sd.valid === true, reason: sd.reason || sd.error || null, reward: sd.reward?.title || null };
  }

  // Special handling: bad_nonce — use fake nonce directly
  if (attackType === 'bad_nonce') {
    const subResp = await fetchRetry(`${API}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, payload: encrypt(JSON.stringify(game)) }),
    });
    const sd = await subResp.json() as any;
    return { valid: sd.valid === true, reason: sd.reason || sd.error || null, reward: sd.reward?.title || null };
  }

  // Normal flow: get nonce → encrypt → submit
  const nonceResp = await fetchRetry(`${API}/api/nonce?account_id=${accountId}`);
  const nonceData = await nonceResp.json() as any;
  game.nonce = nonceData.nonce;

  // Encrypt payload (server-side crypto.ts encrypt() — identical format to frontend Web Crypto)
  const encrypted = encrypt(JSON.stringify(game));

  // Submit (matches frontend: submitGame(accountId, encrypted))
  const subResp = await fetchRetry(`${API}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload: encrypted }),
  });
  const sd = await subResp.json() as any;
  return { valid: sd.valid === true, reason: sd.reason || null, reward: sd.reward?.title || null };
}

// ── Attack Vectors List ────────────────────────────────────────────────────

const ATTACK_VECTORS = [
  'tampered_mine_seed',
  'fake_zero_prayers',
  'replay_attack',
  'missing_first',
  'out_of_bounds',
  'tampered_dimensions',
  'empty_actions',
  'wrong_first',
  'impossible_time',
  'duplicate_action',
  'bad_nonce',
  'tampered_time_ms',
] as const;

// ── ACE Build Helper (with retries) ────────────────────────────────────────

/**
 * Try to build an ACE-solvable game on multiple random boards.
 * Returns null if no board works within maxRetries attempts.
 */
function tryBuildAceGame(maxRetries: number = 10): { submission: GameSubmission; config: BoardConfig } | null {
  for (let retry = 0; retry < maxRetries; retry++) {
    const cfg = randomBoardConfig();
    const built = buildAceGame(cfg, `v-ace-${Date.now()}-${retry}`);
    if (built) return { submission: built.submission, config: cfg };
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Cursed Minesweeper — Comprehensive Verification     ║');
  console.log('║  Random Sizes | Frontend-Identical Data | All Cases  ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // ── Check server health ──
  try {
    await fetch(`${API}/api/health`);
    console.log('[SERVER] Healthy — http://localhost:38001\n');
  } catch {
    console.error('[FATAL] Server not running at http://localhost:38001');
    console.error('        Start with: node --loader ts-node/esm server/src/index.ts');
    process.exit(1);
  }

  const results: TestResult[] = [];

  // ═══════════════════════════════════════════════════════════════
  // ROUND 1–4: Valid Games (ACE + Non-ACE, random sizes)
  // ═══════════════════════════════════════════════════════════════
  console.log('─── Valid Rounds ───');

  for (let i = 0; i < 2; i++) {
    // Non-ACE valid round — always succeeds
    const nonAceCfg = randomBoardConfig();
    const roundId = `nonace-valid-${i + 1}`;
    process.stdout.write(`[${roundId}] ${nonAceCfg.rows}×${nonAceCfg.cols} ${nonAceCfg.mines}m building...`);
    try {
      const t0 = Date.now();
      const { submission: game, prayersUsed } = buildNonAceGame(nonAceCfg, `v-nonace-${Date.now()}`);
      const buildMs = Date.now() - t0;
      process.stdout.write(` built(${buildMs}ms) pray=${prayersUsed} submitting...`);

      const sv = await submitAndVerify(game);
      const roundMs = Date.now() - t0;
      const r: TestResult = {
        id: roundId,
        category: 'nonace-valid',
        config: nonAceCfg,
        accountId: '',
        valid: sv.valid,
        reason: sv.reason,
        reward: sv.reward,
        prayersUsed,
        ace: prayersUsed === 0,
        actions: game.actions.length,
        totalMs: roundMs,
        passed: sv.valid,
      };
      results.push(r);
      console.log(` ${sv.valid ? '✅ VALID' : '❌ REJECTED'} | ${roundMs}ms` + (sv.reason ? `\n         reason: ${sv.reason}` : ''));
      if (sv.reward) console.log(`         reward: ${sv.reward}`);
    } catch (e: any) {
      results.push({
        id: roundId, category: 'nonace-valid', config: nonAceCfg,
        accountId: '', valid: false, reason: null, reward: null,
        prayersUsed: 0, ace: false, actions: 0, totalMs: 0, passed: false, error: e.message,
      });
      console.log(` ❌ ERROR: ${e.message}`);
    }
    await sleep(300);
  }

  for (let i = 0; i < 2; i++) {
    // ACE valid round — retries random boards automatically
    const roundId = `ace-valid-${i + 1}`;
    process.stdout.write(`[${roundId}] searching ACE-solvable board...`);

    const aceGame = tryBuildAceGame(3);
    if (!aceGame) {
      console.log(` ⚠️ SKIPPED (no ACE-solvable board found in 3 retries)`);
      continue;
    }

    try {
      const t0 = Date.now();
      const { submission: game, config: aceCfg } = aceGame;
      process.stdout.write(`\n[${roundId}] ${aceCfg.rows}×${aceCfg.cols} ${aceCfg.mines}m submitting...`);

      const sv = await submitAndVerify(game);
      const roundMs = Date.now() - t0;
      const r: TestResult = {
        id: roundId,
        category: 'ace-valid',
        config: aceCfg,
        accountId: '',
        valid: sv.valid,
        reason: sv.reason,
        reward: sv.reward,
        prayersUsed: 0,
        ace: true,
        actions: game.actions.length,
        totalMs: roundMs,
        passed: sv.valid,
      };
      results.push(r);
      console.log(` ${sv.valid ? '✅ VALID' : '❌ REJECTED'} | ${roundMs}ms` + (sv.reason ? `\n         reason: ${sv.reason}` : ''));
      if (sv.reward) console.log(`         reward: ${sv.reward}`);
    } catch (e: any) {
      results.push({
        id: roundId, category: 'ace-valid', config: aceGame.config,
        accountId: '', valid: false, reason: null, reward: null,
        prayersUsed: 0, ace: true, actions: 0, totalMs: 0, passed: false, error: e.message,
      });
      console.log(` ❌ ERROR: ${e.message}`);
    }
    await sleep(300);
  }

  // Allow server to recover from ACE CSP load before forged rounds
  console.log('');
  await sleep(2000);

  // ═══════════════════════════════════════════════════════════════
  // ROUND 5+: Forged Games (apply attacks to valid bases)
  // ═══════════════════════════════════════════════════════════════
  console.log('─── Forged Rounds ───');

  for (const at of ATTACK_VECTORS) {
    // Randomly pick base type for this attack (some attacks only make sense on specific bases)
    let baseCategory: 'ace-valid' | 'nonace-valid';
    if (at === 'fake_zero_prayers') {
      // fake_zero_prayers only makes sense on non-ACE bases (prayers > 0 → forge to 0)
      baseCategory = 'nonace-valid';
    } else {
      // Randomly use ACE or non-ACE base
      baseCategory = Math.random() > 0.5 ? 'ace-valid' : 'nonace-valid';
    }

    const cfg = randomBoardConfig();
    const roundId = `${baseCategory === 'ace-valid' ? 'ace' : 'nonace'}-forged-${at}`;
    process.stdout.write(`[${roundId}] ${cfg.rows}×${cfg.cols} ${cfg.mines}m ${at}...`);

    try {
      const t0 = Date.now();
      const seedSuffix = `fg-${Date.now()}`;

      // Build base game: try ACE first, fall back to non-ACE if unsolvable
      let game: GameSubmission;
      let prayersUsed: number;
      let actualCategory = baseCategory;

      if (baseCategory === 'ace-valid') {
        const aceGame = tryBuildAceGame(3);
        if (aceGame) {
          game = aceGame.submission;
          prayersUsed = 0;
        } else {
          // ACE unsolvable — fall back to non-ACE
          const built = buildNonAceGame(cfg, seedSuffix);
          game = built.submission;
          prayersUsed = built.prayersUsed;
          actualCategory = 'nonace-valid';
        }
      } else {
        const built = buildNonAceGame(cfg, seedSuffix);
        game = built.submission;
        prayersUsed = built.prayersUsed;
      }

      // Apply forge (returns new object for replay_attack / bad_nonce)
      const forged = forge(at, game);

      const sv = await submitAndVerify(forged, at);
      const roundMs = Date.now() - t0;

      // Forged rounds should be REJECTED → passed = !valid
      const r: TestResult = {
        id: roundId,
        category: actualCategory === 'ace-valid' ? 'ace-forged' : 'nonace-forged',
        config: cfg,
        attack: at,
        accountId: '',
        valid: sv.valid,
        reason: sv.reason,
        reward: sv.reward,
        prayersUsed,
        ace: prayersUsed === 0,
        actions: forged.actions.length,
        totalMs: roundMs,
        passed: !sv.valid && !sv.reward, // rejected (no reward leaked)
      };
      results.push(r);

      const icon = r.passed ? '✅' : '❌';
      const status = sv.valid ? 'ACCEPTED(BUG!)' : 'REJECTED';
      console.log(` ${icon} ${status} | ${roundMs}ms` + (sv.reason ? `\n         reason: ${sv.reason}` : ''));
      if (sv.reward) console.log(`         ⚠️ REWARD LEAKED: ${sv.reward}`);
    } catch (e: any) {
      results.push({
        id: roundId,
        category: baseCategory === 'ace-valid' ? 'ace-forged' : 'nonace-forged',
        config: cfg, attack: at,
        accountId: '', valid: false, reason: null, reward: null,
        prayersUsed: 0, ace: false, actions: 0, totalMs: 0, passed: false, error: e.message,
      });
      console.log(` ❌ ERROR: ${e.message}`);
    }
    await sleep(300);
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  const errors = results.filter(r => r.error).length;
  const validRounds = results.filter(r => r.category.endsWith('-valid'));
  const forgedRounds = results.filter(r => r.category.endsWith('-forged'));
  const validPassCount = validRounds.filter(r => r.passed).length;
  const forgedPassCount = forgedRounds.filter(r => r.passed).length;
  const aceValidCount = results.filter(r => r.category === 'ace-valid' && r.passed).length;
  const nonAceValidCount = results.filter(r => r.category === 'nonace-valid' && r.passed).length;

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  RESULTS SUMMARY                                     ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  ACE Valid:     ${aceValidCount}/${validRounds.filter(r => r.category === 'ace-valid').length} passed                              ║`);
  console.log(`║  Non-ACE Valid: ${nonAceValidCount}/${validRounds.filter(r => r.category === 'nonace-valid').length} passed                              ║`);
  console.log(`║  Forged:        ${forgedPassCount}/${forgedRounds.length} rejected (no leaks)                ║`);
  if (errors > 0) {
    console.log(`║  Errors:        ${errors}                            ║`);
  }
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Detail table
  console.log('\n# | Category      | Size      | Mines | Attack             | Valid | Pass | Time');
  console.log('- | ------------- | --------- | ----- | ------------------ | ----- | ---- | ----');
  for (const r of results) {
    const cat = r.category.padEnd(13);
    const size = `${r.config.rows}×${String(r.config.cols).padStart(2)}`.padEnd(8);
    const m = String(r.config.mines).padStart(3);
    const atk = (r.attack || (r.category.endsWith('-valid') ? '—' : '?')).padEnd(18);
    const v = String(r.valid).padEnd(4);
    const p = r.passed ? '✅' : '❌';
    const ms = `${r.totalMs}ms`;
    const extra = r.error ? ` ERR:${r.error}` : (r.reason && !r.passed ? ` (${r.reason.slice(0, 30)})` : '');
    console.log(`${r.id.slice(0, 2)}| ${cat}| ${size}| ${m} | ${atk}| ${v}| ${p}  | ${ms}${extra}`);
  }

  // Exit code
  const allValidPassed = validRounds.length > 0 && validPassCount === validRounds.length;
  const allForgedRejected = forgedRounds.length > 0 && forgedPassCount === forgedRounds.length;
  process.exit(allValidPassed && allForgedRejected ? 0 : 1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a fetch-based operation up to 3 times with increasing backoff.
 */
async function fetchRetry(url: string, init?: RequestInit, retries: number = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, init);
      return resp;
    } catch (e: any) {
      if (attempt === retries - 1) throw e;
      await sleep(500 * (attempt + 1)); // 500ms, 1000ms, 1500ms backoff
    }
  }
  throw new Error('unreachable');
}

// ── Run ─────────────────────────────────────────────────────────────────────

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
