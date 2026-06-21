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

  // 奖励记录表（服务器权威数据，持久化保存，重启不会丢失）
  db.run(`
    CREATE TABLE IF NOT EXISTS rewards (
      id              TEXT NOT NULL,
      account_id      TEXT NOT NULL REFERENCES accounts(id),
      difficulty_name TEXT NOT NULL,
      rows            INTEGER NOT NULL,
      cols            INTEGER NOT NULL,
      mines           INTEGER NOT NULL,
      title           TEXT NOT NULL,
      name_en         TEXT NOT NULL DEFAULT '',
      content         TEXT NOT NULL,
      content_en      TEXT NOT NULL DEFAULT '',
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
  // Migration: add icon column to rewards (v0.3.0 — reward templates)
  try { migrateAddColumn('rewards', 'icon', "TEXT NOT NULL DEFAULT ''"); } catch {}

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

  // ── 配置表（key-value 键值对） ──
  // 存储可动态调整的服务器配置项
  // 默认配置：祈祷奖励阈值为 0（即必须零祈祷才能获得 ACE 奖励）
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`INSERT OR IGNORE INTO config (key, value) VALUES ('prayer_reward_threshold', '0')`);

  // ── 奖品模板表 ──
  // 每种棋盘尺寸可以配置一个奖品模板（名称、图标、文字、类型、色调）
  // 玩家达成条件后，从此表读取奖品信息写入 rewards 表
  db.run(`
    CREATE TABLE IF NOT EXISTS reward_templates (
      id         TEXT PRIMARY KEY,
      rows       INTEGER NOT NULL,
      cols       INTEGER NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      name_en    TEXT NOT NULL DEFAULT '',
      icon       TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      content_en TEXT NOT NULL DEFAULT '',
      type       TEXT NOT NULL DEFAULT 'text',
      hue        INTEGER NOT NULL DEFAULT 0,
      UNIQUE(rows, cols)
    )
  `);

  // 迁移：为已有 reward_templates 表添加 i18n 列（name_en、content_en）
  // PRAGMA table_info 兼容已有数据库；若列不存在则添加
  const templateCols = db.exec('PRAGMA table_info(reward_templates)');
  const templateColNames = templateCols.length > 0 ? templateCols[0].values.map((v: any[]) => v[1]) : [];
  const hasNameEn = templateColNames.includes('name_en');
  const hasContentEn = templateColNames.includes('content_en');
  if (!hasNameEn) db.run('ALTER TABLE reward_templates ADD COLUMN name_en TEXT NOT NULL DEFAULT \'\'');
  if (!hasContentEn) db.run('ALTER TABLE reward_templates ADD COLUMN content_en TEXT NOT NULL DEFAULT \'\'');

  // 迁移：为已有 rewards 表添加 i18n 列（name_en、content_en）
  const rewardsCols = db.exec('PRAGMA table_info(rewards)');
  const rewardsColNames = rewardsCols.length > 0 ? rewardsCols[0].values.map((v: any[]) => v[1]) : [];
  const hasRewardsNameEn = rewardsColNames.includes('name_en');
  const hasRewardsContentEn = rewardsColNames.includes('content_en');
  if (!hasRewardsNameEn) db.run('ALTER TABLE rewards ADD COLUMN name_en TEXT NOT NULL DEFAULT \'\'');
  if (!hasRewardsContentEn) db.run('ALTER TABLE rewards ADD COLUMN content_en TEXT NOT NULL DEFAULT \'\'');

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
