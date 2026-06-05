// Full-stack test suite for Cursed Minesweeper server (Stages 1-6).
// Run with: cd server && set ENCRYPTION_KEY=... && npx ts-node --transpile-only src/test_all.ts
// Server must be running on :38001 and :38002.

import { createEmptyGrid, revealCellLogic, checkWin, placeMines, cloneGrid } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt, decrypt } from './crypto';
import { verifySubmission } from './verify';
import { initDatabase, all, get, run } from './db';
import { GameSubmission, GameAction } from './types';
import fs from 'fs';
import path from 'path';

const KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const API = 'http://localhost:38001';
const ADMIN = 'http://localhost:38002';

let pass = 0, fail = 0;
function ok(n: string) { pass++; console.log(`  ✅ ${n}`); }
function no(n: string, m: string) { fail++; console.log(`  ❌ ${n}: ${m}`); }

// ═══ 7.1 Shared ═══
console.log('\n═══ 7.1 Shared Modules ═══');
{
  const e1 = createEmptyGrid(5, 5), e2 = createEmptyGrid(5, 5);
  const rng = createRNG(hashSeed('test'));
  const g1 = placeMines(e1, 3, 2, 2, rng);
  const g2 = placeMines(e2, 3, 2, 2, createRNG(hashSeed('test')));
  let match = true;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (g1[r][c].isMine !== g2[r][c].isMine) match = false;
  match ? ok('placeMines determinism') : no('placeMines determinism', 'different layouts');

  const d1 = deterministicPlaceMines(5, 5, 3, 2, 2, 'det-test');
  const d2 = deterministicPlaceMines(5, 5, 3, 2, 2, 'det-test');
  let match2 = true;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (d1[r][c].isMine !== d2[r][c].isMine) match2 = false;
  match2 ? ok('deterministicPlaceMines') : no('deterministicPlaceMines', 'different');

  const mineSeed = 'csp-det-test';
  const csp1 = createRNG(hashSeed(mineSeed + '-csp'));
  const csp2 = createRNG(hashSeed(mineSeed + '-csp'));
  const board = deterministicPlaceMines(5, 5, 3, 2, 2, mineSeed);
  const r1 = revealCellLogic(cloneGrid(board), 2, 2, true, false, csp1);
  const r2 = revealCellLogic(cloneGrid(board), 2, 2, true, false, csp2);
  (r1.exploded === r2.exploded) ? ok('seeded CSP determinism') : no('seeded CSP', 'divergent');

  const cg = createEmptyGrid(3, 3);
  (checkWin(cg) === false) ? ok('checkWin false empty') : no('checkWin empty', '');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cg[r][c].status = 'revealed';
  (checkWin(cg) === true) ? ok('checkWin all revealed') : no('checkWin all rev', '');
  cg[0][0].isMine = true;
  (checkWin(cg) === false) ? ok('checkWin mine shown') : no('checkWin mine', '');
  cg[0][0].status = 'flagged';
  (checkWin(cg) === true) ? ok('checkWin mine flagged') : no('checkWin flag', '');
}

// ═══ 7.2 Server Module Tests ═══
console.log('\n═══ 7.2 Server Modules ═══');
(async () => {
  await initDatabase();
  const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
  const names = tables.map((t: any) => t.name);
  ['accounts', 'records', 'rewards', 'submission_nonces'].forEach(t => {
    names.includes(t) ? ok(`DB table: ${t}`) : no(`DB table: ${t}`, 'missing');
  });

  const plain = JSON.stringify({ test: true, data: 'hello' });
  const enc = encrypt(plain);
  const dec = decrypt(enc);
  (dec === plain) ? ok('crypto round-trip') : no('crypto round-trip', 'mismatch');
  try { decrypt(encrypt('x', 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210')); no('crypto wrong key', 'should throw'); }
  catch { ok('crypto wrong key rejected'); }

  const game = buildValidGame();
  const vr = verifySubmission(game);
  vr.valid ? ok('verify valid game') : no('verify valid game', vr.reason || '');

  const game2 = buildValidGame();
  game2.actions[0].type = 'flag' as any;
  (!verifySubmission(game2).valid) ? ok('verify bad first action') : no('verify bad first', '');

  const game3 = buildValidGame();
  game3.actions = [];
  (!verifySubmission(game3).valid) ? ok('verify empty actions') : no('verify empty', '');

  const game4 = buildValidGame();
  game4.prayers_used = 0;
  (!verifySubmission(game4).valid) ? ok('verify fake prayers') : no('verify fake prayers', '');

  // ═══ 7.3 API Tests ═══
  console.log('\n═══ 7.3 API Endpoints ═══');
  try {
    const h = await fetch(`${API}/api/health`);
    h.ok ? ok('API health') : no('API health', `${h.status}`);
  } catch { no('API health', 'unreachable'); return; }

  const authRes = await fetch(`${API}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: 'test-all-device' }),
  });
  const auth = await authRes.json();
  const accountId = auth.account_id;
  !!accountId ? ok('POST /api/auth register') : no('POST /api/auth', JSON.stringify(auth));

  const authRe = await fetch(`${API}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'auto', platform_id: 'test-all-device' }),
  });
  const authReData = await authRe.json();
  (authReData.account_id === accountId) ? ok('POST /api/auth idempotent') : no('idempotent', '');

  const getAcc = await fetch(`${API}/api/auth/${accountId}`);
  getAcc.ok ? ok('GET /api/auth/:id') : no('GET /api/auth', `${getAcc.status}`);
  const get404 = await fetch(`${API}/api/auth/nonexistent`);
  (get404.status === 404) ? ok('GET auth 404') : no('GET auth 404', `${get404.status}`);

  const patch = await fetch(`${API}/api/auth/${accountId}/nickname`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'TestPlayer' }),
  });
  const patchData = await patch.json();
  (patchData.ok) ? ok('PATCH nickname') : no('PATCH nickname', JSON.stringify(patchData));

  const patchEmpty = await fetch(`${API}/api/auth/${accountId}/nickname`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '' }),
  });
  (patchEmpty.status === 400) ? ok('PATCH nickname empty rejected') : no('PATCH empty', `${patchEmpty.status}`);

  const nonceRes = await fetch(`${API}/api/nonce?account_id=${accountId}`);
  const nonceData = await nonceRes.json();
  (!!nonceData.nonce) ? ok('GET /api/nonce') : no('GET /api/nonce', '');

  const subGame = buildValidGame();
  const nonceForSub = (await (await fetch(`${API}/api/nonce?account_id=${accountId}`)).json()).nonce;
  subGame.nonce = nonceForSub;
  const payload = encrypt(JSON.stringify(subGame));
  const subRes = await fetch(`${API}/api/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload }),
  });
  const subData = await subRes.json();
  (subData.valid === true) ? ok('POST /api/submit valid') : no('POST /api/submit', JSON.stringify(subData));

  const bogus = await fetch(`${API}/api/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, payload: 'BAD-DATA' }),
  });
  const bogusData = await bogus.json();
  (!!bogusData.error) ? ok('POST /api/submit bogus') : no('bogus submit', '');

  const lb = await fetch(`${API}/api/records/5/5`);
  const lbData = await lb.json();
  (Array.isArray(lbData) && lbData.length > 0) ? ok('GET records leaderboard') : no('leaderboard', `len=${lbData.length}`);

  const myRecs = await fetch(`${API}/api/records/me/${accountId}`);
  (myRecs.ok) ? ok('GET records/me') : no('records/me', `${myRecs.status}`);

  const rews = await fetch(`${API}/api/rewards/${accountId}`);
  (rews.ok) ? ok('GET rewards') : no('rewards', `${rews.status}`);

  // ═══ 7.4 Admin Panel ═══
  console.log('\n═══ 7.4 Admin Panel ═══');
  try {
    const unauth = await fetch(`${ADMIN}/dashboard`, { redirect: 'manual' });
    (unauth.status === 302) ? ok('admin redirect unauth') : no('admin redirect', `${unauth.status}`);
  } catch { no('admin', 'unreachable'); return; }

  const loginRes = await fetch(`${ADMIN}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'token=admin', redirect: 'manual',
  });
  const cookieHdr = loginRes.headers.get('set-cookie') || '';
  const cookie = cookieHdr.split(';')[0];
  (loginRes.status === 302) ? ok('admin login') : no('admin login', `${loginRes.status}`);

  async function aGet(p: string) {
    const r = await fetch(`${ADMIN}${p}`, { headers: { Cookie: cookie } });
    return { status: r.status, body: await r.text() };
  }

  for (const [path, label] of [['/dashboard','Dashboard'],['/users','Users'],['/records','Records'],['/rewards','Rewards'],['/submissions','Submissions']] as const) {
    const r = await aGet(path);
    (r.status === 200) ? ok(`admin ${label} (${path})`) : no(`admin ${label}`, `${r.status}`);
  }

  if (accountId) {
    const detail = await aGet(`/users/${accountId}`);
    (detail.status === 200) ? ok('admin user detail') : no('admin detail', `${detail.status}`);
  }

  const subPass = await aGet('/submissions?validated=1');
  (subPass.status === 200) ? ok('admin submissions filtered') : no('admin sub filter', '');
  const recFilter = await aGet('/records?rows=5&cols=5');
  (recFilter.status === 200) ? ok('admin records filtered') : no('admin rec filter', '');

  // ═══ 7.5 Frontend files ═══
  console.log('\n═══ 7.5 Frontend Files ═══');
  for (const f of ['../../utils/api.ts','../../utils/auth.ts','../../utils/encrypt.ts','../../utils/recorder.ts','../../App.tsx','../../components/LeaderboardModal.tsx']) {
    fs.existsSync(path.join(__dirname, f)) ? ok(`file: ${f}`) : no(`file: ${f}`, 'missing');
  }

  // ═══ SUMMARY ═══
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║  Results: ${pass}/${pass+fail} passed, ${fail} failed  ║`);
  console.log(`╚══════════════════════════════════╝`);
  process.exit(fail > 0 ? 1 : 0);
})();

// ── Helper ──
function buildValidGame(): GameSubmission {
  const rows = 5, cols = 5, mines = 3;
  const firstR = 2, firstC = 2;
  const mineSeed = 'all-test-game';
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
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
          board = revealCellLogic(board, r, c, false, true, cspRng).grid;
        }
        changed = true;
      }
    }
  }

  return { version: 1, nonce: 'test-nonce', grid: { rows, cols, mines }, mine_seed: mineSeed, actions, prayers_used: prayers, total_time_ms: ts };
}
