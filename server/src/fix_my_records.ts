/**
 * 修复：将通关记录从 DeltaLord 移到你的真实账号
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const CORRECT = '1e9a3f6a-61d4-4264-ad7a-80d1a2e84160';
const WRONG = '09810214-061e-49f5-943c-e3e3e4da17b4';
const B = [[8,8],[9,9],[16,16],[25,15],[25,25]];
const WT = [1000,600,6200,2500,10000];
const DT = [2000,2200,6200,4100,13000];
const YT = [1000,600,6200,2500,10000];
const MN = (r:number,c:number)=>Math.max(1,Math.floor(r*c*(0.20+1/Math.pow(r*c,0.65)))-1);

async function main() {
  const db = new (await initSqlJs()).Database(fs.readFileSync(path.join(__dirname,'..','data','cursed.db')));
  const n = Date.now();

  // 1. 删除错误数据
  for (let i=0;i<B.length;i++) db.run('DELETE FROM records WHERE account_id=? AND rows=? AND cols=? AND time_ms=?',[WRONG,B[i][0],B[i][1],WT[i]]);
  // 2. 恢复 DeltaLord 原始数据
  for (let i=0;i<B.length;i++) {
    const e = db.exec('SELECT id FROM records WHERE account_id=? AND rows=? AND cols=? AND time_ms=?',[WRONG,B[i][0],B[i][1],DT[i]]);
    if (!e.length||!e[0].values.length) db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',[WRONG,B[i][0],B[i][1],MN(B[i][0],B[i][1]),DT[i],n-i*1000]);
  }
  // 3. 删除你的旧记录 + 添加新记录
  for (const b of B) db.run('DELETE FROM records WHERE account_id=? AND rows=? AND cols=?',[CORRECT,b[0],b[1]]);
  console.log('你的记录:');
  for (let i=0;i<B.length;i++) {
    db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',[CORRECT,B[i][0],B[i][1],MN(B[i][0],B[i][1]),YT[i],n-i*1000]);
    console.log('  '+B[i][0]+'x'+B[i][1]+' '+YT[i]+'ms');
  }
  fs.writeFileSync(path.join(__dirname,'..','data','cursed.db'),Buffer.from(db.export()));

  // 4. 验证
  console.log('\n排行榜:');
  for (const [r,c] of B) {
    const rec = db.exec('SELECT a.nickname, r.time_ms FROM records r LEFT JOIN accounts a ON r.account_id=a.id WHERE r.rows='+r+' AND r.cols='+c+' AND r.validated=1 ORDER BY r.time_ms ASC LIMIT 10');
    if (rec.length) { console.log('-- '+r+'x'+c+' --'); rec[0].values.forEach((v:any[],i:number)=>{const b=['🥇','🥈','🥉'][i]||'#'+(i+1);const isU=!v[0];console.log('  '+b+' '+(v[0]||'Anonymous')+' '+v[1]+'ms'+(isU?' <-- 你':''));}); }
  }
  db.close();
  console.log('\n完成!重启后端服务器。');
}
main();
