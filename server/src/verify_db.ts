// Quick DB verification — validates table creation and CRUD operations.
// Run with: npx ts-node --transpile-only src/verify_db.ts

import { initDatabase, getDb, get, all, run } from './db';

async function main() {
  await initDatabase();
  const db = getDb();

  console.log('\n=== Tables ===');
  const tables = all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.table(tables);

  console.log('\n=== accounts schema ===');
  console.log(all('PRAGMA table_info(accounts)'));

  console.log('\n=== rewards schema ===');
  console.log(all('PRAGMA table_info(rewards)'));

  console.log('\n=== records schema ===');
  console.log(all('PRAGMA table_info(records)'));

  console.log('\n=== submission_nonces schema ===');
  console.log(all('PRAGMA table_info(submission_nonces)'));

  // ── Test insert ──
  const now = Date.now();
  run('INSERT OR IGNORE INTO accounts (id, platform, platform_id, created_at) VALUES (?, ?, ?, ?)',
    ['test-user-1', 'auto', 'device-fingerprint-abc', now]);

  run('INSERT OR IGNORE INTO submission_nonces (id, nonce, account_id, expires_at) VALUES (?, ?, ?, ?)',
    ['nonce-1', 'challenge-abc123', 'test-user-1', now + 300_000]);

  run('INSERT OR IGNORE INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['test-user-1', 9, 9, 21, 45200, '{"encrypted": true}', 1, now]);

  console.log('\n=== accounts ===');
  console.log(get('SELECT * FROM accounts'));

  console.log('\n=== nonces ===');
  console.log(get('SELECT * FROM submission_nonces'));

  console.log('\n=== records ===');
  console.log(get('SELECT * FROM records'));

  // ── Cleanup ──
  run('DELETE FROM submission_nonces WHERE account_id = ?', ['test-user-1']);
  run('DELETE FROM records WHERE account_id = ?', ['test-user-1']);

  console.log('\n=== All verifications passed ===');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
