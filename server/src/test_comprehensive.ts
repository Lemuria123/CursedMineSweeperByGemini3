/**
 * 排行榜综合测试脚本
 *
 * 验证 5 个用户在 5 种棋盘大小下的排行榜显示是否正确。
 * 直接操作数据库插入记录，然后通过相同的 SQL 查询验证排名。
 *
 * 用法: npx ts-node server/src/test_comprehensive.ts
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

// ── 测试用 5 种棋盘尺寸 ──
// 包含 Easy(9×9)、Medium(16×16)、Hard(25×16) 及 8×8、25×25
const BOARD_SIZES = [
  { name: '8×8',     rows: 8,  cols: 8 },
  { name: '9×9',     rows: 9,  cols: 9 },
  { name: '16×16',   rows: 16, cols: 16 },
  { name: '25×16',   rows: 25, cols: 16 },
  { name: '25×25',   rows: 25, cols: 25 },
];

// 地雷数：与前端 calculateRecommendedMines 保持一致
function calcMines(rows: number, cols: number): number {
  const total = rows * cols;
  const factor = 0.20 + (1 / Math.pow(total, 0.65));
  return Math.max(1, Math.floor(total * factor) - 1);
}

// ── 5 个测试玩家 ──
// 每个玩家在不同棋盘上的通关时间不同，故意打乱排名（不会有人所有棋盘都最快）
const PLAYERS = [
  { nickname: 'AlphaAce',    times_ms: [ 1200,  800,  4500,  2000,  9000] }, // 各棋盘时间 (8×8→25×25)
  { nickname: 'BravoKing',   times_ms: [  900, 1500,  3800,  3500,  7200] },
  { nickname: 'CharliePro',  times_ms: [ 1500, 1100,  5500,  2800, 11000] },
  { nickname: 'DeltaLord',   times_ms: [ 2000, 2200,  6200,  4100, 13000] },
  { nickname: 'EchoMaster',  times_ms: [ 1100, 1800,  4100,  5000,  8500] },
];

// ── 单条记录插入后的预期排名（排序为 time_ms ASC） ──
// 按 BOARD_SIZES 顺序 (8×8, 9×9, 16×16, 25×16, 25×25)
const EXPECTED_RANKINGS: Record<string, number[]> = {
  'AlphaAce':    [3, 1, 3, 1, 3],  // 8×8: 1200(3rd), 9×9: 800(1st), 16×16: 4500(3rd), 25×16: 2000(1st), 25×25: 9000(3rd)
  'BravoKing':   [1, 3, 1, 3, 1],  // 8×8: 900(1st), 9×9: 1500(3rd), 16×16: 3800(1st), 25×16: 3500(3rd), 25×25: 7200(1st)
  'CharliePro':  [4, 2, 4, 2, 4],  // 8×8: 1500(4th), 9×9: 1100(2nd), 16×16: 5500(4th), 25×16: 2800(2nd), 25×25: 11000(4th)
  'DeltaLord':   [5, 5, 5, 4, 5],  // 8×8: 2000(5th), 9×9: 2200(5th), 16×16: 6200(5th), 25×16: 4100(4th), 25×25: 13000(5th)
  'EchoMaster':  [2, 4, 2, 5, 2],  // 8×8: 1100(2nd), 9×9: 1800(4th), 16×16: 4100(2nd), 25×16: 5000(5th), 25×25: 8500(2nd)
};

// 预期的榜单排名顺序（每列从左到右）
const EXPECTED_ORDER = [
  ['BravoKing', 'EchoMaster', 'AlphaAce', 'CharliePro', 'DeltaLord'],     // 8×8
  ['AlphaAce',  'CharliePro', 'BravoKing', 'EchoMaster', 'DeltaLord'],    // 9×9
  ['BravoKing', 'EchoMaster', 'AlphaAce', 'CharliePro', 'DeltaLord'],     // 16×16
  ['AlphaAce',  'CharliePro', 'BravoKing', 'DeltaLord', 'EchoMaster'],    // 25×16
  ['BravoKing', 'EchoMaster', 'AlphaAce', 'CharliePro', 'DeltaLord'],     // 25×25
];

// ── 主流程 ──
async function main() {
  const DB_PATH = path.join(__dirname, '..', 'data', 'cursed.db');

  // 1. 打开数据库
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  console.log('═══════════════════════════════════════════');
  console.log('  排行榜综合测试 —— 5 用户 × 5 棋盘尺寸');
  console.log('═══════════════════════════════════════════\n');

  // 2. 创建 5 个测试用户（如果已存在则跳过）
  const accountIds: string[] = [];
  const now = Date.now();

  for (const player of PLAYERS) {
    // 为每个玩家生成固定 ID（方便多次运行，先查后插）
    let existing = db.exec(`SELECT id FROM accounts WHERE nickname = '${player.nickname}'`);
    let accId: string;

    if (existing.length > 0 && existing[0].values.length > 0) {
      accId = existing[0].values[0][0] as string;
      console.log(`[账号] ${player.nickname} 已存在 (${accId.slice(0, 8)}...)`);
    } else {
      accId = uuid();
      db.run(
        'INSERT INTO accounts (id, platform, platform_id, nickname, created_at) VALUES (?, ?, ?, ?, ?)',
        [accId, 'auto', accId, player.nickname, now],
      );
      console.log(`[账号] 创建 ${player.nickname} (${accId.slice(0, 8)}...)`);
    }
    accountIds.push(accId);
  }

  // 3. 删除旧测试记录（仅删除 5 个测试用户在这 5 种棋盘上的记录）
  //   其他真实玩家数据不受影响
  for (const accId of accountIds) {
    for (const board of BOARD_SIZES) {
      db.run('DELETE FROM records WHERE account_id = ? AND rows = ? AND cols = ?', [accId, board.rows, board.cols]);
    }
  }
  console.log('[清理] 已清理旧测试记录\n');

  // 4. 为每个玩家在每个棋盘上插入通关记录
  console.log('\n── 插入测试记录 ──');
  for (let pi = 0; pi < PLAYERS.length; pi++) {
    const player = PLAYERS[pi];
    const accId = accountIds[pi];
    for (let bi = 0; bi < BOARD_SIZES.length; bi++) {
      const board = BOARD_SIZES[bi];
      const mines = calcMines(board.rows, board.cols);
      const timeMs = player.times_ms[bi];
      db.run(
        'INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at, prayers_used) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)',
        [accId, board.rows, board.cols, mines, timeMs, 'test-data-' + uuid(), now - bi * 1000],
      );
      console.log(`  ${player.nickname}  ${board.name}  雷数=${mines}  通关耗时=${timeMs}ms`);
    }
  }

  // 5. 保存数据库
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  // 6. 查询并验证排行榜（仅比较 5 个测试玩家，忽略其他真实玩家数据）
  console.log('\n═══════════════════════════════════════════');
  console.log('          排行榜验证');
  console.log('═══════════════════════════════════════════\n');

  const testNicknames = new Set(PLAYERS.map(p => p.nickname));
  let totalPass = 0;
  let totalFail = 0;

  for (let bi = 0; bi < BOARD_SIZES.length; bi++) {
    const board = BOARD_SIZES[bi];
    console.log(`── ${board.name} (${board.rows}×${board.cols}) ──`);

    // 使用与 API 完全相同的查询
    const records = db.exec(
      `SELECT r.id, r.account_id, a.nickname, r.time_ms, r.submitted_at
       FROM records r
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.rows = ${board.rows} AND r.cols = ${board.cols} AND r.validated = 1
       ORDER BY r.time_ms ASC
       LIMIT 100`,
    );

    if (records.length === 0 || records[0].values.length === 0) {
      console.log('  ⚠ 无记录！\n');
      continue;
    }

    // 只筛选测试玩家的记录，按原始排名输出
    const rows = records[0].values;
    let shownCount = 0;
    // 统计非测试玩家数量（用于计算测试玩家间的相对排名）
    let nonTestBefore = 0;

    for (let i = 0; i < rows.length; i++) {
      const [id, accId, nickname, timeMs] = rows[i];
      const globalRank = i + 1;

      if (nickname && testNicknames.has(nickname as string)) {
        const testRank = shownCount;
        const expectedNickname = EXPECTED_ORDER[bi][testRank];

        // 排名徽章（使用全局排名）
        let badge = '';
        if (globalRank === 1) badge = '🥇';
        else if (globalRank === 2) badge = '🥈';
        else if (globalRank === 3) badge = '🥉';
        else badge = `#${globalRank}`;

        const passed = nickname === expectedNickname;
        const mark = passed ? '✅' : '❌';

        console.log(`  ${badge} ${mark} ${nickname as string}  ${timeMs}ms  (测试第${testRank + 1}名, 期望: ${expectedNickname})`);
        if (passed) totalPass++;
        else totalFail++;
        shownCount++;
      } else {
        nonTestBefore++;
      }
    }

    // 如果测试玩家不够，显示缺失信息
    if (shownCount < PLAYERS.length) {
      for (let k = shownCount; k < PLAYERS.length; k++) {
        const expectedNickname = EXPECTED_ORDER[bi][k];
        console.log(`  ❓  -  测试第${k + 1}名缺失  (期望: ${expectedNickname})`);
        totalFail++;
      }
    }
    console.log('');
  }

  // 7. 验证每个玩家的个人排名（只在测试玩家之间比较）
  console.log('── 个人排名矩阵验证 ──');
  console.log('  (Rows=棋盘尺寸, Cols=玩家, 单元格=实际排名/预期排名)');
  console.log('  Board      AlphaAce  BravoKing  CharliePro  DeltaLord  EchoMaster');
  console.log('  ───────────────────────────────────────────────────────────────────');

  for (let bi = 0; bi < BOARD_SIZES.length; bi++) {
    const board = BOARD_SIZES[bi];
    const records = db.exec(
      `SELECT r.account_id, a.nickname, r.time_ms
       FROM records r
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.rows = ${board.rows} AND r.cols = ${board.cols} AND r.validated = 1
       ORDER BY r.time_ms ASC
       LIMIT 100`,
    );
    const rows = records[0].values;

    // 只计算测试玩家之间的排名（过滤掉其他真实玩家）
    // 例如：全局第1名是真实玩家A，全局第2名是 BravoKing → BravoKing 在测试玩家中排第1
    let testRank = 0;
    const rankMap: Record<string, number> = {};
    for (const row of rows) {
      const nickname = row[1] as string;
      if (nickname && testNicknames.has(nickname)) {
        testRank++;
        rankMap[nickname] = testRank;
      }
    }

    let line = `  ${board.name.padEnd(10)}`;
    for (const player of PLAYERS) {
      const actualRank = rankMap[player.nickname];
      const expectedRank = EXPECTED_RANKINGS[player.nickname][bi];
      const match = actualRank === expectedRank;
      const display = actualRank !== undefined
        ? (match ? ` ${actualRank}✅ ` : ` ${actualRank}❌(${expectedRank}) `)
        : `  -❌  `;
      line += display + '     ';
    }
    console.log(line);
  }

  // 8. 总结
  console.log('\n═══════════════════════════════════════════');
  console.log(`  结果: ${totalPass} 通过 / ${totalFail} 失败`);
  if (totalFail === 0) {
    console.log('  🎉 所有排行榜查询结果与预期完全一致！');
  } else {
    console.log('  ⚠ 存在不一致，请检查数据库或测试数据');
  }
  console.log('═══════════════════════════════════════════\n');

  // 9. 模拟前端 recordsRanks 计算
  console.log('── 前端 recordsRanks 映射模拟 ──');
  console.log('  (键=rows-cols, 值=该玩家排名，101=100+)\n');

  // 为每个玩家计算 recordsRanks
  for (let pi = 0; pi < PLAYERS.length; pi++) {
    const player = PLAYERS[pi];
    const accId = accountIds[pi];
    const ranks: Record<string, number> = {};

    // 获取该玩家的个人最佳
    const myRecords = db.exec(
      `SELECT rows, cols, MIN(time_ms) as time_ms
       FROM records
       WHERE account_id = '${accId}' AND validated = 1
       GROUP BY rows, cols
       ORDER BY rows, cols`,
    );

    if (myRecords.length > 0) {
      for (const record of myRecords[0].values) {
        const [rows, cols, timeMs] = record;
        const key = `${rows}-${cols}`;
        // 查询该棋盘排行榜中该玩家的排名
        const lb = db.exec(
          `SELECT r.account_id, a.nickname
           FROM records r
           LEFT JOIN accounts a ON r.account_id = a.id
           WHERE r.rows = ${rows} AND r.cols = ${cols} AND r.validated = 1
           ORDER BY r.time_ms ASC
           LIMIT 100`,
        );
        if (lb.length > 0) {
          const lbRows = lb[0].values;
          const rankIdx = lbRows.findIndex((row: any[]) => row[0] === accId);
          ranks[key] = rankIdx >= 0 ? rankIdx + 1 : 101;
        }
      }
    }

    // 美化输出
    const rankDisplay = BOARD_SIZES.map(b => {
      const key = `${b.rows}-${b.cols}`;
      const r = ranks[key];
      if (!r) return '-';
      if (r === 1) return '🥇';
      if (r === 2) return '🥈';
      if (r === 3) return '🥉';
      if (r <= 99) return `#${r}`;
      return '100+';
    });

    console.log(`  ${player.nickname.padEnd(12)} ${rankDisplay.join('  ')}`);
    console.log(`  ${''.padEnd(12)} keys: ${Object.keys(ranks).join(', ')}`);
    console.log(`  ${''.padEnd(12)} vals: ${Object.values(ranks).join(', ')}\n`);
  }

  db.close();
  console.log('数据库已关闭。');
}

main().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
