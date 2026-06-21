import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const db = new (await initSqlJs()).Database(fs.readFileSync(path.join(__dirname, '..', 'data', 'cursed.db')));
  
  // 你的账号
  const YOUR = '1e9a3f6a-61d4-4264-ad7a-80d1a2e84160';
  
  console.log('=== 你的账号 ===');
  const a = db.exec(`SELECT id, nickname, platform_id FROM accounts WHERE id='${YOUR}'`);
  if (a.length) console.log(a[0].values.map((v:any)=>v.join(' | ')).join('\n'));
  
  console.log('\n=== 你的记录 ===');
  const r = db.exec(`SELECT rows, cols, time_ms FROM records WHERE account_id='${YOUR}' AND validated=1 ORDER BY rows, cols`);
  if (r.length) r[0].values.forEach((v:any)=>console.log(`  ${v[0]}x${v[1]}  ${v[2]}ms`));
  else console.log('  没有记录！');

  // 检查是否有其他账号有你的 platform_id
  console.log('\n=== platform_id=609ef3e2 的记录 ===');
  const p = db.exec(`SELECT a.id, a.nickname, r.rows, r.cols, r.time_ms FROM records r JOIN accounts a ON r.account_id=a.id WHERE a.platform_id='609ef3e2-1ff1-4977-9398-ad4b223d2e8b' AND r.validated=1`);
  if (p.length && p[0].values.length) {
    p[0].values.forEach((v:any)=>console.log(`  ${v[2]}x${v[3]} ${v[4]}ms  (account:${(v[0] as string).slice(0,8)}...)`));
  } else {
    console.log('  没有记录！');
  }

  // 检查 8x8, 25x15, 25x25 总共有谁的数据
  for (const [r,c] of [[8,8],[25,15],[25,25]]) {
    const lb = db.exec(`SELECT a.nickname, a.id, r.time_ms FROM records r LEFT JOIN accounts a ON r.account_id=a.id WHERE r.rows=${r} AND r.cols=${c} AND r.validated=1 ORDER BY r.time_ms ASC LIMIT 3`);
    if (lb.length) {
      console.log(`\n${r}x${c} 前3名:`);
      lb[0].values.forEach((v:any)=>console.log(`  ${(v[0] as string)||'Anonymous'} ${v[2]}ms (${(v[1] as string).slice(0,8)}...)`));
    }
  }

  db.close();
}
main();
