/**
 * 将 rewards 表中所有记录的 mines 字段修正为 calculateRecommendedMines(rows, cols)
 * 用法: node scripts/artifacts/sync-reward-mines.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from '../../server/node_modules/sql.js/dist/sql-wasm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server/data/cursed.db');

/** 与 shared/gameLogic.ts calculateRecommendedMines 一致 */
function calculateRecommendedMines(rows, cols) {
  const total = rows * cols;
  const factor = 0.20 + 1 / Math.pow(total, 0.65);
  return Math.max(1, Math.floor(total * factor) - 1);
}

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const rows = db.exec('SELECT id, rows, cols, mines FROM rewards');
  if (!rows.length) {
    console.log('[sync-reward-mines] no rewards');
    db.close();
    return;
  }

  let updated = 0;
  for (const [id, r, c, oldMines] of rows[0].values) {
    const canonical = calculateRecommendedMines(r, c);
    if (oldMines !== canonical) {
      db.run('UPDATE rewards SET mines = ? WHERE id = ? AND rows = ? AND cols = ?', [canonical, id, r, c]);
      console.log(`[sync-reward-mines] ${id} (${r}x${c}): ${oldMines} → ${canonical}`);
      updated++;
    }
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log(`[sync-reward-mines] done, updated ${updated} row(s)`);

  try {
    const res = await fetch('http://localhost:38001/api/dev/reload-db', { method: 'POST' });
    if (res.ok) console.log('[sync-reward-mines] server reloaded from disk');
  } catch {
    console.warn('[sync-reward-mines] server reload skipped — 请重启后端');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
