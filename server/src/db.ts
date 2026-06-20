// Database module — SQLite via sql.js (pure JS, no native bindings)
// Auto-creates tables on startup, runs nonce cleanup timer.

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cursed.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: SqlJsDatabase;

// Load existing or create new database
async function initDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    return new SQL.Database(buffer);
  }
  return new SQL.Database();
}

// ── Persist helper ──
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ── Initialize ──
const dbReady = initDb().then((database) => {
  db = database;

  // Performance pragma
  db.run('PRAGMA foreign_keys = ON');

  // ── Table creation (idempotent) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY,
      platform    TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      nickname    TEXT,
      created_at  INTEGER NOT NULL,
      UNIQUE(platform, platform_id)
    )
  `);

  // ── Table creation (idempotent) ──
  // Drop old single-PK rewards if it exists (schema migration)
  db.run('DROP TABLE IF EXISTS rewards');
  db.run(`
    CREATE TABLE IF NOT EXISTS rewards (
      id              TEXT NOT NULL,
      account_id      TEXT NOT NULL REFERENCES accounts(id),
      difficulty_name TEXT NOT NULL,
      rows            INTEGER NOT NULL,
      cols            INTEGER NOT NULL,
      mines           INTEGER NOT NULL,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      type            TEXT NOT NULL,
      hue             INTEGER NOT NULL,
      submitted_at    INTEGER NOT NULL,
      PRIMARY KEY (id, account_id)
    )
  `);

  // Migration: add prayers_used column if missing (v0.2.2)
  try { migrateAddColumn('records', 'prayers_used', 'INTEGER NOT NULL DEFAULT -1'); } catch {}
  // Migration: add verify_reason column if missing (v0.2.3)
  try { migrateAddColumn('records', 'verify_reason', "TEXT DEFAULT NULL"); } catch {}

  function migrateAddColumn(table: string, col: string, def: string) {
    const cols = db.exec(`PRAGMA table_info(${table})`);
    if (cols.length > 0) {
      const names = cols[0].values.map((v: any[]) => v[1]);
      if (!names.includes(col)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[db] added ${col} column to ${table}`);
      }
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  TEXT NOT NULL REFERENCES accounts(id),
      rows        INTEGER NOT NULL,
      cols        INTEGER NOT NULL,
      mines       INTEGER NOT NULL,
      time_ms     INTEGER NOT NULL,
      game_data   TEXT NOT NULL,
      validated   INTEGER NOT NULL DEFAULT 0,
      submitted_at INTEGER NOT NULL,
      prayers_used INTEGER NOT NULL DEFAULT -1
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_records_dim ON records(rows, cols, time_ms)');
  db.run('CREATE INDEX IF NOT EXISTS idx_records_account ON records(account_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS submission_nonces (
      id          TEXT PRIMARY KEY,
      nonce       TEXT NOT NULL UNIQUE,
      account_id  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_nonces_expires ON submission_nonces(expires_at)');

  saveDb();
  console.log(`[db] connected to ${DB_PATH}`);

  // Graceful shutdown: flush DB before exit
  process.on('beforeExit', () => { if (dirty) { dirty = false; try { saveDb(); } catch {} } });
  process.on('exit', () => { if (dirty) { dirty = false; try { saveDb(); } catch {} } });

  // ── Nonce cleanup timer (every 10 minutes) ──
  setInterval(() => {
    const before = (db.prepare('SELECT COUNT(*) as cnt FROM submission_nonces WHERE expires_at < ?').get([Date.now()]) as any)?.cnt || 0;
    if (before > 0) {
      db.run('DELETE FROM submission_nonces WHERE expires_at < ?', [Date.now()]);
      scheduleSave();
      console.log(`[db] cleaned ${before} expired nonces`);
    }
  }, 10 * 60 * 1000);

  return db;
});

// Export a db proxy that auto-saves writes
let dbInstance: SqlJsDatabase | null = null;
dbReady.then((d) => { dbInstance = d; });

export function getDb(): SqlJsDatabase {
  if (!dbInstance) throw new Error('Database not initialized. Await initDb first.');
  return dbInstance;
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  return dbReady;
}

// ── Auto-saving prepared statements ──
// Uses debounced async save to prevent sql.js crashes on rapid writes.

const WRITE_OPS = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];

let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e: any) {
      console.error('[db] save failed:', e.message);
    }
  }, 500); // debounce 500ms
}

export function run(sql: string, params?: any[]): any {
  const d = getDb();
  d.run(sql, params);
  const upper = sql.trim().toUpperCase();
  if (WRITE_OPS.some(op => upper.startsWith(op))) {
    scheduleSave();
  }
}

export function get<T = any>(sql: string, params?: any[]): T | undefined {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params || []);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    return obj as T;
  }
  stmt.free();
  return undefined;
}

export function all<T = any>(sql: string, params?: any[]): T[] {
  const d = getDb();
  const stmt = d.prepare(sql);
  if (params) stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const obj: any = {};
    cols.forEach((c, i) => { obj[c] = vals[i]; });
    results.push(obj as T);
  }
  stmt.free();
  return results;
}

export { SqlJsDatabase as Database };
