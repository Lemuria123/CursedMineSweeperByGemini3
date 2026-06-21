/**
 * 填充矩阵数据：为 8×8 ~ 25×25 各棋盘随机添加测试记录
 * 服务器必须先停止！
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const YOUR = '1e9a3f6a-61d4-4264-ad7a-80d1a2e84160';

// 测试玩家账号（含你共 6 人）
const PLAYERS = [
  'a700f8fd-89d5-4379-8117-ca9d654a6bcc', // AlphaAce
  '6a0e361a-c0d0-43cb-9f65-789bfc3fdafd', // BravoKing
  'caf4e9b8-60e2-4945-adbf-2be79ce38840', // CharliePro
  '09810214-061e-49f5-943c-e3e3e4da17b4', // DeltaLord
  '12bf6546-ccdb-4c14-a941-fc50d83e2bfb', // EchoMaster
];

const MN = (r: number, c: number) => Math.max(1, Math.floor(r * c * (0.20 + 1 / Math.pow(r * c, 0.65))) - 1);

// Mulberry32 simple PRNG for deterministic random times
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

async function main() {
  const db = new (await initSqlJs()).Database(fs.readFileSync(path.join(__dirname, '..', 'data', 'cursed.db')));
  const N = Date.now();

  // 收集已有数据的棋盘，跳过它们
  const exist = db.exec('SELECT DISTINCT rows, cols FROM records WHERE validated=1');
  const existSet = new Set<string>();
  if (exist.length) exist[0].values.forEach((v: any) => existSet.add(`${v[0]}-${v[1]}`));

  console.log(`已有数据的棋盘: ${existSet.size} 个`);
  console.log('填充剩余棋盘...\n');

  const rng = mulberry32(42); // 固定种子保证可复现
  let added = 0;

  // 遍历 8×8 到 25×25
  for (let rows = 8; rows <= 25; rows++) {
    for (let cols = 8; cols <= 25; cols++) {
      const key = `${rows}-${cols}`;
      if (existSet.has(key)) continue;
      
      // 每个棋盘添加 2~4 个随机玩家
      const playerCount = 2 + Math.floor(rng() * 3);
      const shuffled = [...PLAYERS].sort(() => rng() - 0.5);
      const selected = shuffled.slice(0, playerCount);
      
      // 基础时间 = 棋盘规模 × 200ms，加上随机抖动
      const baseTime = rows * cols * 200;
      for (let i = 0; i < selected.length; i++) {
        const time = Math.floor(baseTime * (0.7 + rng() * 0.6 + i * 0.15));
        db.run(
          'INSERT OR IGNORE INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
          [selected[i], rows, cols, MN(rows, cols), time, N - (rows * 31 + cols * 7) * 1000],
        );
        added++;
      }
      
      // 你有 40% 的概率也出现在这个棋盘上
      if (rng() < 0.4) {
        const yourTime = Math.floor(baseTime * (0.75 + rng() * 0.5));
        db.run(
          'INSERT OR IGNORE INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
          [YOUR, rows, cols, MN(rows, cols), yourTime, N - (rows * 31 + cols * 7 + 1) * 1000],
        );
        added++;
      }
    }
  }

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'cursed.db'), Buffer.from(db.export()));
  
  // 统计
  const total = db.exec('SELECT COUNT(DISTINCT rows||\'-\'||cols) FROM records WHERE validated=1');
  const totalCells = total.length > 0 ? total[0].values[0][0] : 0;
  const totalRecs = db.exec('SELECT COUNT(*) FROM records WHERE validated=1');
  const totalRecsCnt = totalRecs.length > 0 ? totalRecs[0].values[0][0] : 0;
  
  console.log(`新增 ${added} 条记录`);
  console.log(`矩阵覆盖: ${totalCells}/324 个棋盘`);
  console.log(`总记录数: ${totalRecsCnt}`);

  // 统计你的棋盘覆盖
  const myCells = db.exec(`SELECT COUNT(DISTINCT rows||'-'||cols) FROM records WHERE account_id='${YOUR}' AND validated=1`);
  const myCnt = myCells.length > 0 ? myCells[0].values[0][0] : 0;
  console.log(`你的棋盘覆盖: ${myCnt}/324`);

  db.close();
  console.log('\n✅ 完成！启动服务器即可看到填充效果。');
}
main();
