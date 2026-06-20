// ACE Forged Test — 12 attacks on realistic game sizes.
// Base game uses proper minesweeper solver (deduce → chord → pray).
// Each round applies one attack vector and verifies rejection.

import { revealCellLogic, checkWin } from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { encrypt } from './crypto';
import { GameSubmission, GameAction } from './types';

const API = 'http://localhost:38001';

const SIZES = [
  { rows: 8, cols: 8, mines: 10 },
  { rows: 8, cols: 8, mines: 14 },
  { rows: 9, cols: 9, mines: 14 },
  { rows: 10, cols: 10, mines: 18 },
  { rows: 12, cols: 12, mines: 28 },
  { rows: 16, cols: 16, mines: 40 },
  { rows: 8, cols: 16, mines: 22 },
  { rows: 16, cols: 8, mines: 22 },
  { rows: 10, cols: 10, mines: 22 },
  { rows: 12, cols: 12, mines: 32 },
  { rows: 16, cols: 16, mines: 56 },
  { rows: 9, cols: 9, mines: 18 },
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
  accountId: string;
  valid: boolean;
  reason: string | null;
  reward: string | null;
  passed: boolean;
  timeMs: number;
}

const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function nbrs(r: number, c: number, rows: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const nr = r+dr, nc = c+dc;
    if (nr>=0 && nr<rows && nc>=0 && nc<cols) out.push([nr,nc]);
  }
  return out;
}

function buildBaseGame(rows: number, cols: number, mines: number, mineSeed: string): GameSubmission {
  const cspRng = createRNG(hashSeed(mineSeed + '-csp'));
  const firstR = Math.floor(rows/2), firstC = Math.floor(cols/2);
  let board: any[][] = deterministicPlaceMines(rows, cols, mines, firstR, firstC, mineSeed)
    .map(r => r.map(c => ({...c})));
  const actions: GameAction[] = [];
  let ts = 0, prayers = 0;

  actions.push({ type: 'first_reveal', row: firstR, col: firstC, ts }); ts += 500;
  board = revealCellLogic(board, firstR, firstC, true, false, cspRng).grid;

  while (!checkWin(board)) {
    let acted = false;
    // deduce mines
    for (let r=0;r<rows && !acted;r++) for (let c=0;c<cols && !acted;c++) {
      if (board[r][c].status!=='revealed') continue;
      const nn = board[r][c].neighborMines;
      let fl=0; const hd: [number,number][]=[];
      for (const [nr,nc] of nbrs(r,c,rows,cols)) {
        if (board[nr][nc].status==='flagged') fl++;
        else if (board[nr][nc].status==='hidden') hd.push([nr,nc]);
      }
      if (fl<nn && hd.length===nn-fl) {
        for (const [nr,nc] of hd) { actions.push({ type:'flag', row:nr, col:nc, ts }); ts+=100; board[nr][nc].status='flagged'; acted=true; }
      }
    }
    // chord
    if (!acted) for (let r=0;r<rows && !acted;r++) for (let c=0;c<cols && !acted;c++) {
      if (board[r][c].status!=='revealed' || board[r][c].neighborMines===0) continue;
      let fl=0, hh=false;
      for (const [nr,nc] of nbrs(r,c,rows,cols)) {
        if (board[nr][nc].status==='flagged') fl++;
        if (board[nr][nc].status==='hidden') hh=true;
      }
      if (fl===board[r][c].neighborMines && hh) {
        actions.push({ type:'chord', row:r, col:c, ts }); ts+=400;
        for (const [nr,nc] of nbrs(r,c,rows,cols)) {
          if (board[nr][nc].status!=='hidden') continue;
          const res = revealCellLogic(board, nr, nc, false, false, cspRng);
          board = res.grid;
          if (res.exploded) board[nr][nc].status='flagged';
        }
        acted=true;
      }
    }
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) if (board[r][c].isExploded) board[r][c].status='flagged';
    if (checkWin(board)) break;
    // pray
    if (!acted) {
      for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
        if (board[r][c].status!=='hidden') continue;
        actions.push({ type:'reveal', row:r, col:c, ts, prayed:true }); ts+=200; prayers++;
        const res = revealCellLogic(board, r, c, false, true, cspRng);
        board = res.grid;
        if (res.exploded) { board[r][c].status='flagged'; }
        acted=true; break;
      }
      if (!acted) break;
    }
  }
  return { version:1, nonce:'PLACEHOLDER', grid:{rows,cols,mines}, mine_seed:mineSeed, actions, prayers_used:prayers, total_time_ms:ts };
}

function forge(at: string, g: GameSubmission): GameSubmission {
  const gg = JSON.parse(JSON.stringify(g));
  switch (at) {
    case 'tampered_mine_seed': gg.mine_seed = `${gg.grid.rows}-${gg.grid.cols}-${gg.grid.mines}-0-0-evil`; break;
    case 'fake_zero_prayers': gg.prayers_used = 0; break;
    case 'missing_first': gg.actions = gg.actions.filter((a:any) => a.type!=='first_reveal'); if (gg.actions.length>0) gg.actions[0].type='reveal'; break;
    case 'out_of_bounds': gg.actions.splice(2,0,{type:'reveal',row:99,col:99,ts:(gg.actions[1]?.ts||0)+1,prayed:false}); break;
    case 'tampered_dimensions': gg.grid = { rows:500, cols:500, mines:gg.grid.mines }; break;
    case 'empty_actions': gg.actions = []; break;
    case 'wrong_first': if (gg.actions.length>0) gg.actions[0].type='flag'; break;
    case 'impossible_time': gg.total_time_ms = 50; break;
    case 'duplicate_action': gg.actions.splice(2,0,{...gg.actions[0], ts:gg.actions[0].ts+5}); break;
    case 'bad_nonce': { const fg = JSON.parse(JSON.stringify(g)); fg.nonce='00000000-0000-0000-0000-000000000000'; return fg; }
    case 'tampered_time_ms': gg.total_time_ms = gg.actions.length>0?(gg.actions[gg.actions.length-1].ts-50):gg.total_time_ms; break;
  }
  return gg;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ACE Forged Test — 12 Attacks               ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  try { await fetch(`${API}/api/health`); } catch { console.error('Server not running'); process.exit(1); }
  console.log('[SERVER] OK\n');

  const results: ForgeResult[] = [];
  for (let i = 0; i < ATTACKS.length; i++) {
    const sz = SIZES[i], at = ATTACKS[i];
    process.stdout.write(`[${String(i+1).padStart(2)}/${ATTACKS.length}] ${sz.rows}x${sz.cols}(${sz.mines}m) ${at.padEnd(22)}...`);
    const r: ForgeResult = { round:i+1, attackType:at, gridLabel:`${sz.rows}x${sz.cols}`, accountId:'', valid:false, reason:null, reward:null, passed:false, timeMs:0 };
    try {
      const start = Date.now();
      const auth = await (await fetch(`${API}/api/auth`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({platform:'auto',platform_id:`forge-${i+1}-${Date.now()}`}) })).json() as any;
      r.accountId = auth.account_id;
      const fr = Math.floor(sz.rows/2), fc = Math.floor(sz.cols/2);
      const seed = `${sz.rows}-${sz.cols}-${sz.mines}-${fr}-${fc}-forge-r${i+1}`;
      const base = buildBaseGame(sz.rows, sz.cols, sz.mines, seed);
      const game = forge(at, base);
      let subRes: any;
      if (at==='replay_attack') {
        const n1 = (await (await fetch(`${API}/api/nonce?account_id=${r.accountId}`)).json() as any).nonce;
        game.nonce = n1;
        await fetch(`${API}/api/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({account_id:r.accountId,payload:encrypt(JSON.stringify(game))}) });
        subRes = await fetch(`${API}/api/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({account_id:r.accountId,payload:encrypt(JSON.stringify(game))}) });
      } else if (at==='bad_nonce') {
        subRes = await fetch(`${API}/api/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({account_id:r.accountId,payload:encrypt(JSON.stringify(game))}) });
      } else {
        const nonce = (await (await fetch(`${API}/api/nonce?account_id=${r.accountId}`)).json() as any).nonce;
        game.nonce = nonce;
        subRes = await fetch(`${API}/api/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({account_id:r.accountId,payload:encrypt(JSON.stringify(game))}) });
      }
      const sd = await subRes.json() as any;
      r.valid = sd.valid===true; r.reason = sd.reason||sd.error||null; r.reward = sd.reward?.title||null;
      r.passed = (!r.valid && !r.reward);
      r.timeMs = Date.now() - start;
    } catch (e: any) { r.error = e.message; }
    results.push(r);
    console.log(` ${r.passed?'✅':'❌'} ${r.valid?'ACCEPTED(BUG!)':'REJECTED'} | ${r.timeMs}ms`);
    if (!r.passed) console.log(`         reason: ${r.reason}`);
    await new Promise(res => setTimeout(res,200));
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Rejected: ${passed}/${ATTACKS.length} | Leaked: ${results.filter(r=>r.valid).length}                              ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  for (const r of results) console.log(`${String(r.round).padStart(2)} | ${r.gridLabel.padEnd(6)} | ${r.attackType.padEnd(22)} | ${r.valid?'ACCEPTED':'REJECTED'} | ${r.timeMs}ms`);
  require('fs').writeFileSync('test_ace_forged_results.json', JSON.stringify(results,null,2));
  console.log('\n→ test_ace_forged_results.json');
  process.exit(passed===ATTACKS.length?0:1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
