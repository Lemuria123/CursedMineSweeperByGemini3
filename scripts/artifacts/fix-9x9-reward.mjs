/**
 * 重建并同步 9×9 宝物记录：
 * 1. 写入 reward_templates 模板
 * 2. 同步已有玩家 rewards 表中的 9×9 记录
 * 用法: node scripts/artifacts/fix-9x9-reward.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from '../../server/node_modules/sql.js/dist/sql-wasm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server/data/cursed.db');
const COVER_BACKUP = path.join(ROOT, 'public/covers/galaxy-colonization-guide-cover-backup.png');
const COVER_LEGACY = path.join(ROOT, 'public/covers/grimoire-cover.png');

/** 9×9 宝物标准字段 */
const REWARD_9X9 = {
  id: '9-9',
  rows: 9,
  cols: 9,
  name: '星系殖民指南',
  name_en: 'Galaxy Colonization Guide',
  source_ip: '',
  icon: '/covers/galaxy-colonization-guide-cover-backup.png',
  content: '/covers/galaxy-colonization-guide-cover-backup.png',
  content_en: '',
  type: 'image',
  hue: 297,
  novel_index: -1,
  next_rows: 0,
  next_cols: 0,
  content_kind: 'item_lore',
};

async function main() {
  // ── 0. 确保封面图文件存在（兼容仍指向 grimoire-cover.png 的旧 API 缓存） ──
  if (fs.existsSync(COVER_BACKUP)) {
    fs.copyFileSync(COVER_BACKUP, COVER_LEGACY);
    console.log('[fix-9x9] copied backup cover → grimoire-cover.png');
  } else {
    console.warn('[fix-9x9] warning: backup cover missing at', COVER_BACKUP);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // ── 1. 写入/更新 reward_templates ──
  db.run(
    `INSERT INTO reward_templates
     (id, rows, cols, name, name_en, source_ip, icon, content, content_en, type, hue, novel_index, next_rows, next_cols, content_kind, quality_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', datetime('now'))
     ON CONFLICT(rows, cols) DO UPDATE SET
       id = excluded.id,
       name = excluded.name,
       name_en = excluded.name_en,
       source_ip = excluded.source_ip,
       icon = excluded.icon,
       content = excluded.content,
       content_en = excluded.content_en,
       type = excluded.type,
       hue = excluded.hue,
       novel_index = excluded.novel_index,
       next_rows = excluded.next_rows,
       next_cols = excluded.next_cols,
       content_kind = excluded.content_kind,
       updated_at = datetime('now')`,
    [
      REWARD_9X9.id, REWARD_9X9.rows, REWARD_9X9.cols,
      REWARD_9X9.name, REWARD_9X9.name_en, REWARD_9X9.source_ip,
      REWARD_9X9.icon, REWARD_9X9.content, REWARD_9X9.content_en,
      REWARD_9X9.type, REWARD_9X9.hue,
      REWARD_9X9.novel_index, REWARD_9X9.next_rows, REWARD_9X9.next_cols,
      REWARD_9X9.content_kind,
    ]
  );
  console.log('[fix-9x9] reward_templates upserted');

  // ── 2. 同步已有玩家 rewards 记录 ──
  const before = db.exec(
    `SELECT COUNT(*) FROM rewards WHERE rows = 9 AND cols = 9`
  )[0].values[0][0];
  db.run(
    `UPDATE rewards SET
       title = ?,
       name_en = ?,
       source_ip = ?,
       icon = ?,
       content = ?,
       content_en = ?,
       type = ?,
       hue = ?,
       novel_index = ?,
       next_rows = ?,
       next_cols = ?,
       content_kind = ?
     WHERE rows = 9 AND cols = 9`,
    [
      REWARD_9X9.name, REWARD_9X9.name_en, REWARD_9X9.source_ip,
      REWARD_9X9.icon, REWARD_9X9.content, REWARD_9X9.content_en,
      REWARD_9X9.type, REWARD_9X9.hue,
      REWARD_9X9.novel_index, REWARD_9X9.next_rows, REWARD_9X9.next_cols,
      REWARD_9X9.content_kind,
    ]
  );
  console.log(`[fix-9x9] synced ${before} player reward(s)`);

  // ── 3. 验证 ──
  const tpl = db.exec(
    `SELECT id, name, name_en, icon, content, type, content_kind, novel_index, next_rows, next_cols
     FROM reward_templates WHERE rows = 9 AND cols = 9`
  );
  console.log('[fix-9x9] template:', tpl[0]?.values?.[0]);

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log('[fix-9x9] done →', DB_PATH);

  // ── 4. 通知本地开发服务器从磁盘 reload（无需 restart） ──
  try {
    const res = await fetch('http://localhost:38001/api/dev/reload-db', { method: 'POST' });
    if (res.ok) {
      console.log('[fix-9x9] server reloaded from disk');
    } else {
      console.warn('[fix-9x9] server reload skipped (status', res.status, ') — 请手动重启后端');
    }
  } catch {
    console.warn('[fix-9x9] server reload skipped — 后端未运行，下次启动会自动加载新数据');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
