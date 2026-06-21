/**
 * 为指定用户添加 5 种棋盘的通关记录，使其出现在排行榜中。
 * 用法: npx ts-node src/add_my_records.ts
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

let ACCOUNT_ID = '609ef3e2-1ff1-4977-9398-ad4b223d2e8b';

// 5 种棋盘尺寸 + 地雷数（与 calculateRecommendedMines 一致）
function calcMines(rows: number, cols: number): number {
  const total = rows * cols;
  const factor = 0.20 + (1 / Math.pow(total, 0.65));
  return Math.max(1, Math.floor(total * factor) - 1);
}

const BOARDS = [
  { name: '8×8',   rows: 8,  cols: 8 },
  { name: '9×9',   rows: 9,  cols: 9 },
  { name: '16×16', rows: 16, cols: 16 },
  { name: '25×16', rows: 25, cols: 16 },
  { name: '25×25', rows: 25, cols: 25 },
];

// 你的通关时间（分别插入到不同排名位置，方便验证排序）
const TIMES_MS = [1000, 600, 6200, 2500, 10000];

async function main() {
  const DB_PATH = path.join(__dirname, '..', 'data', 'cursed.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // 检查用户是否存在（通过 ID 精确匹配或 LIKE 前缀匹配）
  let acc = db.exec(`SELECT id, nickname FROM accounts WHERE id = '${ACCOUNT_ID}'`);
  if (!acc.length || !acc[0].values.length) {
    // 尝试模糊匹配（前 8 个字符）
    const prefix = ACCOUNT_ID.slice(0, 8);
    acc = db.exec(`SELECT id, nickname FROM accounts WHERE id LIKE '${prefix}%'`);
    if (acc.length > 0 && acc[0].values.length > 0) {
      const row = acc[0].values[0];
      const realId = row[0] as string;
      const nickname = row[1] as string;
      console.log(`[账号] 通过前缀匹配找到用户: ${nickname || '(无昵称)'} (${realId})`);
      // 使用已存在的真实 ID
      ACCOUNT_ID = realId;
    }
  }
  
  if (!acc.length || !acc[0].values.length) {
    // 仍然找不到，可能是前端用 platform/platoform_id 注册的，尝试按 platform='auto' 查找
    acc = db.exec(`SELECT id, nickname FROM accounts WHERE platform = 'auto' LIMIT 50`);
    if (acc.length > 0 && acc[0].values.length > 0) {
      // 取最近创建的那个（通常就是当前用户）
      const row = acc[0].values[acc[0].values.length - 1];
      const realId = row[0] as string;
      const nickname = row[1] as string;
      console.log(`[账号] 通过 platform='auto' 找到用户: ${nickname || '(无昵称)'} (${realId.slice(0, 8)}...)`);
      console.log(`[账号] 使用此 ID 添加记录，请确认这是你的账号`);
      ACCOUNT_ID = realId;
    }
  }

  if (!acc.length || !acc[0].values.length) {
    console.error('[账号] 无法找到用户！请先用前端登录一次以创建账号。');
    db.close();
    process.exit(1);
  } else {
    const row = acc[0].values[0];
    const nickname = row[1] as string;
    const id = row[0] as string;
    console.log(`[账号] 用户已存在: ${nickname || '(无昵称)'} (${id.slice(0, 8)}...)`);
  }

  // 删除该用户在这 5 种棋盘上的旧记录，避免重复
  for (const board of BOARDS) {
    db.run('DELETE FROM records WHERE account_id = ? AND rows = ? AND cols = ?',
      [ACCOUNT_ID, board.rows, board.cols]);
  }
  console.log('[清理] 已删除旧记录');

  // 插入新纪录
  console.log('\n── 插入你的通关记录 ──');
  const now = Date.now();
  for (let i = 0; i < BOARDS.length; i++) {
    const board = BOARDS[i];
    const mines = calcMines(board.rows, board.cols);
    const timeMs = TIMES_MS[i];
    db.run(
      `INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at, prayers_used)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)`,
      [ACCOUNT_ID, board.rows, board.cols, mines, timeMs, 'test-data', now - i * 1000],
    );
    console.log(`  ${board.name}  雷数=${mines}  通关耗时=${timeMs}ms`);
  }

  // 保存
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('\n[保存] 数据库已更新');

  // 查询排行榜验证
  console.log('\n── 排行榜预览 ──');
  for (const board of BOARDS) {
    const records = db.exec(
      `SELECT a.nickname, r.time_ms
       FROM records r
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.rows = ${board.rows} AND r.cols = ${board.cols} AND r.validated = 1
       ORDER BY r.time_ms ASC
       LIMIT 10`,
    );
    console.log(`\n${board.name} (${board.rows}×${board.cols}):`);
    if (records.length > 0) {
      records[0].values.forEach((row: any[], idx: number) => {
        const badge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        const nickname = row[0] || 'Anonymous';
        const isYou = row[0] === 'You' || row[0] === null;
        console.log(`  ${badge} ${nickname}  ${row[1]}ms${isYou ? ' ← 你' : ''}`);
      });
    }
  }

  db.close();
  console.log('\n✅ 完成！重启后端服务器后，前端即可看到你的排名。');
}

main().catch(e => {
  console.error('失败:', e);
  process.exit(1);
});
