import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import initSqlJs from 'sql.js';

const mode = process.argv[2];
const root = path.resolve(__dirname, '../..');
const dir = mkdtempSync(path.join(root, '.analysis-p1-test-'));
const dbFile = path.join(dir, 'test.db');
process.env.DB_PATH = dbFile;
process.env.GAME_API_PORT = '0';
process.env.ADMIN_PORT = '0';
delete process.env.ADMIN_HOST;
process.env.ADMIN_TOKEN = mode === 'disabled' ? '' : mode === 'default-token' ? 'admin' : randomBytes(24).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');

async function listen(server: Server) {
  if (!server.listening) await once(server, 'listening');
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
}

async function close(server: Server | undefined) {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function main() {
  if (mode === 'legacy') {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, platform TEXT, platform_id TEXT, nickname TEXT, created_at INTEGER, UNIQUE(platform, platform_id));
      INSERT INTO accounts VALUES ('old-account', 'auto', 'old-device', 'Old nickname', 1);
      CREATE TABLE records (id INTEGER PRIMARY KEY, account_id TEXT, rows INTEGER, cols INTEGER, mines INTEGER,
        time_ms INTEGER, game_data TEXT, validated INTEGER, submitted_at INTEGER);
      INSERT INTO records VALUES (1, 'old-account', 5, 5, 3, 500, 'old record', 1, 1);
    `);
    writeFileSync(dbFile, db.export());
    db.close();
  }
  const { start } = await import('./index');
  const { get, run } = await import('./db');
  const { encrypt } = await import('./crypto');
  const { server, admin } = await start();
  try {
    const base = await listen(server);
    if (mode === 'disabled' || mode === 'default-token') {
      assert.equal(admin, undefined);
      assert.equal((await fetch(base + '/api/health')).status, 200);
      console.log('PASS: admin requires an explicit non-default token');
      return;
    }
    assert(admin);
    const adminBase = await listen(admin);
    assert.equal((admin.address() as AddressInfo).address, '127.0.0.1');
    const compose = readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
    assert.match(compose, /"127\.0\.0\.1:38002:38002"/);
    assert.doesNotMatch(compose, /ADMIN_TOKEN:.*:-admin/);

    const json = (body: unknown, credential?: string, method = 'POST') => ({
      method, headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: 'Bearer ' + credential } : {}) },
      body: JSON.stringify(body),
    });
    const tokenA = randomUUID(), tokenB = randomUUID();
    const registration = { platform: 'auto', platform_id: mode === 'legacy' ? 'old-device' : 'test-device-a' };
    const authA = await fetch(base + '/api/auth', json(registration, tokenA));
    assert.equal(authA.status, 200);
    const a = (await authA.json() as { account_id: string }).account_id;
    if (mode === 'legacy') {
      assert.equal(a, 'old-account');
      assert.deepEqual(get('SELECT game_data, prayers_used, verify_reason FROM records WHERE id = 1'),
        { game_data: 'old record', prayers_used: -1, verify_reason: null });
    }
    assert.equal((await fetch(base + '/api/auth', json(registration, tokenA))).status, 200);
    assert.equal((await fetch(base + '/api/auth', json(registration, tokenB))).status, 401);
    const authB = await fetch(base + '/api/auth', json({ ...registration, platform_id: 'test-device-b' }, tokenB));
    const b = (await authB.json() as { account_id: string }).account_id;
    assert(b && b !== a);
    const profile = await (await fetch(base + '/api/auth/' + a)).json() as object;
    assert(!('platform_id' in profile) && !('credential_hash' in profile));
    const setName = (token?: string) => fetch(base + '/api/auth/' + a + '/nickname', json({ nickname: 'Player A' }, token, 'PATCH'));
    assert.equal((await setName()).status, 401);
    assert.equal((await setName(tokenB)).status, 403);
    assert.equal((await setName(tokenA)).status, 200);
    const nonceUrl = base + '/api/nonce?account_id=' + a;
    assert.equal((await fetch(nonceUrl)).status, 401);
    assert.equal((await fetch(nonceUrl, { headers: { Authorization: 'Bearer ' + tokenB } })).status, 403);
    const nonce = (await (await fetch(nonceUrl, { headers: { Authorization: 'Bearer ' + tokenA } })).json() as { nonce: string }).nonce;
    assert(nonce);

    const game = {
      version: 1, nonce, grid: { rows: 5, cols: 5, mines: 3 }, mine_seed: '5-5-3-2-2-v3',
      actions: [
        { type: 'first_reveal', row: 2, col: 2, ts: 0 },
        { type: 'flag', row: 2, col: 4, ts: 500 },
        { type: 'reveal', row: 3, col: 4, ts: 600, prayed: true },
      ], prayers_used: 1, total_time_ms: 800,
    };
    const submit = (account_id: string, token: string, data: unknown) =>
      fetch(base + '/api/submit', json({ account_id, payload: encrypt(JSON.stringify(data)) }, token));
    assert.equal((await submit(a, tokenB, game)).status, 403);
    assert.equal((await submit(b, tokenB, game)).status, 400);
    const malformed = { ...game, actions: [...game.actions, { type: 'unrecognized', row: 0, col: 0, ts: 700 }] };
    assert.equal((await submit(a, tokenA, malformed)).status, 400);
    const submitted = await submit(a, tokenA, game);
    assert.equal(submitted.status, 200);
    assert.deepEqual(await submitted.json(), { valid: true, reason: null });
    assert.equal((await submit(a, tokenA, game)).status, 400);
    const record = get<{ id: number; verify_reason: string | null }>('SELECT id, verify_reason FROM records WHERE account_id = ? AND validated = 1 ORDER BY id DESC', [a]);
    assert(record);
    assert.equal(record.verify_reason, null);
    console.log('PASS: account authorization, nonce ownership, and score storage');

    const login = await fetch(adminBase + '/login', { ...json({ token: process.env.ADMIN_TOKEN }), redirect: 'manual' });
    assert.equal(login.headers.get('location'), '/dashboard');
    const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
    assert(cookie);
    const adminRequest = (route: string) => fetch(adminBase + route, { headers: { Cookie: cookie }, redirect: 'manual' });
    const replay = await adminRequest('/api/admin/record/' + record.id);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { status: string }).status, 'won');
    run('INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [a, 5, 5, 3, 800, encrypt(JSON.stringify(malformed)), 0, 1]);
    const invalid = get<{ id: number }>('SELECT MAX(id) AS id FROM records')!;
    assert.equal((await adminRequest('/api/admin/record/' + invalid.id)).status, 400);

    // Exercise the served page's renderer with inert markup so it must stay text.
    const page = await (await adminRequest('/replay/' + record.id)).text();
    const renderer = page.match(/function renderActionList\(\) \{[\s\S]*?(?=\nfunction setStep)/)?.[0];
    assert(renderer);
    const literal = '<b>sample</b>';
    function element() {
      const texts: unknown[] = [];
      return { texts, textContent: '', addEventListener() {}, append(node: { textContent: unknown }) { texts.push(node.textContent); } };
    }
    const list = { children: [] as ReturnType<typeof element>[], replaceChildren(...nodes: ReturnType<typeof element>[]) { this.children = nodes; } };
    runInNewContext(renderer + '\nrenderActionList();', {
      data: { steps: [{ action: { type: literal, row: 1, col: 2, ts: 10 } }] },
      document: { getElementById: () => list, createElement: element },
    });
    assert(list.children[0].texts.includes(literal));
    console.log('PASS: admin replay rejects malformed records and keeps action text literal');
  } finally {
    await Promise.all([close(server), close(admin)]);
    // Allow the existing DB write debounce to finish before deleting this fixture.
    await delay(550);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  try { unlinkSync(dbFile); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  rmdirSync(dir);
});
