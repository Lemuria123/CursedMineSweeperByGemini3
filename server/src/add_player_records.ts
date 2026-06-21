/**
 * 为指定 platform_id 用户添加通关记录。
 * 用法: npx ts-node src/add_player_records.ts
 * 
 * 注意：运行前必须先停止后端服务器！
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

// ── 配置 ──
// 目标用户的 platform_id（设备指纹 UUID）
const TARGET_PLATFORM_ID = 'a51ade3c-636a-4290-82ad-045a62c387ae';
// 自定义昵称（可选，设为 null 则不修改）
const NICKNAME: string | null = 'TestPlayer';

// ── 地雷数计算（与 App.tsx 中 calculateRecommendedMines 一致） ──
function calcMines(rows: number, cols: number): number {
  const total = rows * cols;
  const factor = 0.20 + (1 / Math.pow(total, 0.65));
  return Math.max(1, Math.floor(total * factor) - 1);
}

// 5 种标准棋盘尺寸
const BOARDS = [
  { name: '8×8',   rows: 8,  cols: 8 },
  { name: '9×9',   rows: 9,  cols: 9 },
  { name: '16×16', rows: 16, cols: 16 },
  { name: '25×16', rows: 25, cols: 16 },
  { name: '25×25', rows: 25, cols: 25 },
];

// 通关时间（ms），随意设定以分布到不同排名位置
const TIMES_MS = [800, 450, 5000, 3200, 9500];

async function main() {
  const DB_PATH = path.join(__dirname, '..', 'data', 'cursed.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // 1. 查找账号
  let accountId: string | null = null;

  // 先按 platform_id 精确匹配
  console.log(`[查找] 查找 platform_id = ${TARGET_PLATFORM_ID} ...`);
  let result = db.exec(
    'SELECT id, nickname FROM accounts WHERE platform_id = ?',
    [TARGET_PLATFORM_ID],
  );

  if (result.length > 0 && result[0].values.length > 0) {
    const row = result[0].values[0];
    accountId = row[0] as string;
    const existingNickname = row[1] as string | null;
    console.log(`[账号] 通过 platform_id 找到账号: ${existingNickname || '(无昵称)'} (account_id=${accountId.slice(0, 8)}...)`);
  }

  // 如果 platform_id 没找到，尝试按 account_id 匹配
  if (!accountId) {
    result = db.exec(
      'SELECT id, nickname FROM accounts WHERE id = ?',
      [TARGET_PLATFORM_ID],
    );
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0];
      accountId = row[0] as string;
      const existingNickname = row[1] as string | null;
      console.log(`[账号] 通过 account_id 找到账号: ${existingNickname || '(无昵称)'} (${accountId.slice(0, 8)}...)`);
    }
  }

  // 都没找到，创建新账号
  if (!accountId) {
    console.log('[账号] 未找到账号，正在创建...');
    accountId = TARGET_PLATFORM_ID; // 直接用 platform_id 作为 account_id
    const now = Date.now();
    db.run(
      'INSERT INTO accounts (id, platform, platform_id, nickname, created_at) VALUES (?, ?, ?, ?, ?)',
      [accountId, 'auto', TARGET_PLATFORM_ID, NICKNAME, now],
    );
    console.log(`[账号] 已创建: ${NICKNAME || '(无昵称)'} (${accountId.slice(0, 8)}...)`);
  } else if (NICKNAME) {
    // 更新昵称
    db.run('UPDATE accounts SET nickname = ? WHERE id = ?', [NICKNAME, accountId]);
    console.log(`[昵称] 已更新为: ${NICKNAME}`);
  }

  // 2. 删除旧记录（避免重复）
  let deletedCount = 0;
  for (const board of BOARDS) {
    const stmt = db.prepare('DELETE FROM records WHERE account_id = ? AND rows = ? AND cols = ?');
    stmt.bind([accountId, board.rows, board.cols]);
    stmt.step();
    deletedCount += db.getRowsModified();
    stmt.free();
  }
  console.log(`[清理] 已删除 ${deletedCount} 条旧记录`);

  // 3. 插入新记录
  console.log('\n── 插入通关记录 ──');
  const now = Date.now();
  for (let i = 0; i < BOARDS.length; i++) {
    const board = BOARDS[i];
    const mines = calcMines(board.rows, board.cols);
    const timeMs = TIMES_MS[i];
    db.run(
      `INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at, prayers_used)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)`,
      [accountId, board.rows, board.cols, mines, timeMs, 'test-data', now - i * 1000],
    );
    console.log(`  ${board.name}  雷数=${mines}  通关耗时=${timeMs}ms`);
  }

  // 4. 保存数据库
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('\n[保存] 数据库已更新');

  // 5. 验证排行榜
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
        console.log(`  ${badge} ${nickname}  ${(row[1] as number)}ms`);
      });
    }
  }

  db.close();
  console.log('\n✅ 完成！重启后端服务器后，前端即可看到新增记录。');
}

main().catch(e => {
  console.error('失败:', e);
  process.exit(1);
});
