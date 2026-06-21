/**
 * 最终修复：清理重复/错误记录，确保你的账号有正确数据
 * 服务器必须已停止！
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const YOUR_ACCOUNT = '1e9a3f6a-61d4-4264-ad7a-80d1a2e84160';
const DUP_ACCOUNT = '3884eef4-8e75-4165-b799-021fe3af96b4'; // 重复记录的匿名账号

function calcMines(rows: number, cols: number): number {
  const total = rows * cols;
  return Math.max(1, Math.floor(total * (0.20 + 1 / Math.pow(total, 0.65))) - 1);
}

// 5 种棋盘 + 你的通关时间
const BOARDS = [
  { rows: 8, cols: 8, time: 1000 },
  { rows: 9, cols: 9, time: 600 },
  { rows: 16, cols: 16, time: 6200 },
  { rows: 25, cols: 15, time: 2500 },
  { rows: 25, cols: 25, time: 10000 },
];

// 旧匿名记录的时间（9×9 上有 5 条旧纪录）
const OLD_9X9_TIMES = [21106, 22927, 29518, 53271, 95806];

async function main() {
  const DB_PATH = path.join(__dirname, '..', 'data', 'cursed.db');
  const buf = fs.readFileSync(DB_PATH);
  console.log(`[文件] 当前数据库大小: ${buf.length} bytes`);

  const SQL = await initSqlJs();
  const db = new SQL.Database(buf);

  // 1. 删除重复账号 3884eef4 的所有记录（这是之前错误添加的副本）
  console.log('\n[清理] 删除重复匿名账号 3884eef4 的所有记录...');
  const dupRecs = db.exec(`SELECT COUNT(*) as cnt FROM records WHERE account_id = '${DUP_ACCOUNT}'`);
  const dupCnt = dupRecs.length > 0 ? dupRecs[0].values[0][0] as number : 0;
  console.log(`  删除 ${dupCnt} 条重复记录`);
  db.run(`DELETE FROM records WHERE account_id = '${DUP_ACCOUNT}'`);

  // 2. 删除旧匿名 9×9 记录（21106, 22927 等）
  console.log('[清理] 删除旧匿名 9×9 记录...');
  for (const t of OLD_9X9_TIMES) {
    db.run('DELETE FROM records WHERE rows=9 AND cols=9 AND time_ms=?', [t]);
  }
  console.log(`  删除 ${OLD_9X9_TIMES.length} 条旧记录`);

  // 3. 恢复 DeltaLord 的原始记录（如果缺少）
  console.log('[恢复] 检查 DeltaLord 数据...');
  const DELTA_ID = '09810214-061e-49f5-943c-e3e3e4da17b4';
  const DELTA_TIMES = [2000, 2200, 6200, 4100, 13000];
  const DELTA_BOARDS = [[8,8],[9,9],[16,16],[25,15],[25,25]];
  const now = Date.now();
  for (let i = 0; i < DELTA_BOARDS.length; i++) {
    const [r, c] = DELTA_BOARDS[i];
    const exist = db.exec(`SELECT id FROM records WHERE account_id='${DELTA_ID}' AND rows=${r} AND cols=${c} AND time_ms=${DELTA_TIMES[i]}`);
    if (!exist.length || !exist[0].values.length) {
      db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
        [DELTA_ID, r, c, calcMines(r, c), DELTA_TIMES[i], now - i * 1000]);
      console.log(`  + DeltaLord ${r}x${c} ${DELTA_TIMES[i]}ms`);
    }
  }

  // 4. 删除你账号上的旧记录，重新添加
  console.log('[重写] 你的记录:');
  db.run(`DELETE FROM records WHERE account_id = '${YOUR_ACCOUNT}'`);
  for (let i = 0; i < BOARDS.length; i++) {
    const b = BOARDS[i];
    db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
      [YOUR_ACCOUNT, b.rows, b.cols, calcMines(b.rows, b.cols), b.time, now - i * 1000]);
    console.log(`  ${b.rows}x${b.cols}  ${b.time}ms (雷数=${calcMines(b.rows, b.cols)})`);
  }

  // 5. 保存
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\n[保存] 数据库大小: ${data.length} bytes`);

  // 6. 最终验证
  console.log('\n══════ 最终排行榜 ══════');
  const ALL_BOARDS = [[8,8],[9,9],[16,16],[25,15],[25,25]];
  for (const [r, c] of ALL_BOARDS) {
    const rec = db.exec(`SELECT a.nickname, a.id, r.time_ms FROM records r LEFT JOIN accounts a ON r.account_id=a.id WHERE r.rows=${r} AND r.cols=${c} AND r.validated=1 ORDER BY r.time_ms ASC LIMIT 10`);
    if (rec.length > 0) {
      console.log(`\n${r}x${c}:`);
      for (let i = 0; i < rec[0].values.length; i++) {
        const [nn, accId, t] = rec[0].values[i];
        const badge = ['🥇','🥈','🥉'][i] || `#${i+1}`;
        const name = (nn as string) || 'Anonymous';
        const isYou = (accId as string) === YOUR_ACCOUNT;
        console.log(`  ${badge} ${name.padEnd(14)} ${(t as number)}ms${isYou ? '   ← 你' : ''}`);
      }
    }
  }

  // 7. 检查你的记录数
  const myRecs = db.exec(`SELECT COUNT(*) FROM records WHERE account_id='${YOUR_ACCOUNT}'`);
  const myCnt = myRecs[0].values[0][0] as number;
  console.log(`\n你的账号下共 ${myCnt} 条记录`);

  db.close();
  console.log('\n✅ 完成！现在可以启动服务器了。');
}

main();
