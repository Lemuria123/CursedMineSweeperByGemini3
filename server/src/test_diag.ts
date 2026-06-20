// Quick diagnostic: does the server accept submissions encrypted with the frontend key?
import { encrypt } from './crypto';

async function main() {
  // Frontend uses VITE_ENCRYPTION_KEY; server uses ENCRYPTION_KEY.
  // Use server's encrypt() but with the frontend key to see if it's the same.
  const frontendKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  try {
    const encrypted = encrypt('hello', frontendKey);
    console.log('[encrypt] OK,', encrypted.substring(0, 20) + '...');
  } catch (e: any) {
    console.log('[encrypt] FAIL:', e.message);
  }

  // Now do a full submit cycle
  const api = 'http://localhost:38001';
  try {
    const auth = await (await fetch(`${api}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'test', platform_id: 'diag-' + Date.now() }),
    })).json() as any;
    console.log('[auth] account_id:', auth.account_id);

    const nonce = (await (await fetch(`${api}/api/nonce?account_id=${auth.account_id}`)).json() as any).nonce;
    console.log('[nonce]', nonce.substring(0, 8) + '...');

    // Build minimal valid payload
    const payload_raw = { version: 1, nonce, grid: { rows: 9, cols: 9, mines: 19 },
      mine_seed: '9-9-19-4-4-diag',
      actions: [{ type: 'first_reveal', row: 4, col: 4, ts: 0 }],
      prayers_used: 0, total_time_ms: 500 };
    const encrypted = encrypt(JSON.stringify(payload_raw), frontendKey);
    console.log('[payload] encrypted, len:', encrypted.length);

    const sub = await (await fetch(`${api}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: auth.account_id, payload: encrypted }),
    })).json() as any;
    console.log('[submit] valid:', sub.valid, 'reason:', sub.reason || 'none');

    // Check DB
    const db = require('better-sqlite3')('./data/cursed.db');
    const rows = db.prepare('SELECT id, account_id, rows, cols, mines, validated, prayers_used FROM records ORDER BY id DESC LIMIT 3').all();
    console.log('\n[DB] Latest records:');
    for (const r of rows) console.log(JSON.stringify(r));
    db.close();
  } catch (e: any) {
    console.log('[FATAL]', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
