/**
 * 从 resource/artifacts.md 批量写入 SQLite reward_templates
 * 用法: node scripts/artifacts/seed-db.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from '../../server/node_modules/sql.js/dist/sql-wasm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const ARTIFACTS_MD = path.join(ROOT, 'resource/artifacts.md');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server/data/cursed.db');

/** 解析 markdown 表格行（跳过表头、分隔线） */
function parseArtifactsMd(content) {
  const lines = content.split(/\r?\n/).filter(l => l.startsWith('|') && !l.includes('---'));
  return lines.slice(1).map(line => {
    // 按 | 切分，首尾各有空串，取中间 13 个有效列
    const cells = line.split('|').map(c => c.trim());
    // cells 形式: ['', '8', '8', ..., 'content', '']
    // 第一个和最后一个总是空串
    if (cells.length < 16) return null;
    return {
      rows: parseInt(cells[1], 10),
      cols: parseInt(cells[2], 10),
      name: cells[3],
      name_en: cells[4],
      source_ip: cells[5],       // 新增：宝物来源游戏
      icon: cells[6],
      type: cells[7],
      novel_index: parseInt(cells[8], 10),
      next_rows: parseInt(cells[9], 10),
      next_cols: parseInt(cells[10], 10),
      content_kind: cells[11],
      hue: parseInt(cells[12], 10),
      icon_source: cells[13],
      content: cells[14],
    };
  }).filter(Boolean);
}

async function main() {
  const md = fs.readFileSync(ARTIFACTS_MD, 'utf8');
  const artifacts = parseArtifactsMd(md);
  console.log(`[seed-db] parsed ${artifacts.length} artifacts`);

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log(`[seed-db] opened existing db: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log('[seed-db] created new db');
  }

  // 确保 reward_templates 表存在且有需要的列
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

  const ensureCol = (table, col, def) => {
    const info = db.exec(`PRAGMA table_info(${table})`);
    const names = info.length ? info[0].values.map(v => v[1]) : [];
    if (!names.includes(col)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[seed-db] added ${col} to ${table}`);
    }
  };
  for (const [col, def] of [
    ['novel_index', 'INTEGER NOT NULL DEFAULT -1'],
    ['next_rows', 'INTEGER NOT NULL DEFAULT 0'],
    ['next_cols', 'INTEGER NOT NULL DEFAULT 0'],
    ['content_kind', "TEXT NOT NULL DEFAULT 'item_lore'"],
    ['source_ip', "TEXT NOT NULL DEFAULT ''"],
    ['quality_status', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    ensureCol('reward_templates', col, def);
  }

  let inserted = 0;
  for (const a of artifacts) {
    const id = `${a.rows}-${a.cols}`;
    // 使用 INSERT ... ON CONFLICT DO UPDATE 以保留 quality_status 字段
    db.run(
      `INSERT INTO reward_templates
       (id, rows, cols, name, name_en, source_ip, icon, content, content_en, type, hue, novel_index, next_rows, next_cols, content_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(rows, cols) DO UPDATE SET
         name = excluded.name,
         name_en = excluded.name_en,
         source_ip = excluded.source_ip,
         icon = excluded.icon,
         content = excluded.content,
         type = excluded.type,
         hue = excluded.hue,
         novel_index = excluded.novel_index,
         next_rows = excluded.next_rows,
         next_cols = excluded.next_cols,
         content_kind = excluded.content_kind`,
      [
        id, a.rows, a.cols, a.name, a.name_en, a.source_ip, a.icon, a.content, '',
        a.type, a.hue, a.novel_index, a.next_rows, a.next_cols, a.content_kind,
      ]
    );
    inserted++;
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`[seed-db] upserted ${inserted} templates → ${DB_PATH}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
