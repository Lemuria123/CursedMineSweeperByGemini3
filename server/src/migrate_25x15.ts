/**
 * 迁移: 25×15 → 25×16（正确 Hard 尺寸）
 * 服务器必须先停止！
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const YOUR = '1e9a3f6a-61d4-4264-ad7a-80d1a2e84160';
const MN = (r: number, c: number) => Math.max(1, Math.floor(r * c * (0.20 + 1 / Math.pow(r * c, 0.65))) - 1);
const N = Date.now();

const T = [
  ['a700f8fd-89d5-4379-8117-ca9d654a6bcc', 2000],
  ['6a0e361a-c0d0-43cb-9f65-789bfc3fdafd', 3500],
  ['caf4e9b8-60e2-4945-adbf-2be79ce38840', 2800],
  ['09810214-061e-49f5-943c-e3e3e4da17b4', 4100],
  ['12bf6546-ccdb-4c14-a941-fc50d83e2bfb', 5000],
];

async function main() {
  const db = new (await initSqlJs()).Database(fs.readFileSync(path.join(__dirname, '..', 'data', 'cursed.db')));
  db.run('DELETE FROM records WHERE rows=26 AND cols=16');
  db.run('DELETE FROM records WHERE rows=25 AND cols=15');
  for (let i = 0; i < T.length; i++)
    db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
      [T[i][0], 25, 15, MN(25, 15), T[i][1], N - i * 1000]);
  db.run(`DELETE FROM records WHERE account_id='${YOUR}' AND rows=25 AND cols=15`);
  db.run('INSERT INTO records (account_id,rows,cols,mines,time_ms,game_data,validated,submitted_at,prayers_used) VALUES (?,?,?,?,?,\'x\',1,?,0)',
    [YOUR, 25, 15, MN(25, 15), 2500, N - 100000]);
  console.log('25x15:');
  const r = db.exec('SELECT a.nickname, r.time_ms FROM records r LEFT JOIN accounts a ON r.account_id=a.id WHERE r.rows=25 AND r.cols=15 AND r.validated=1 ORDER BY r.time_ms ASC');
  if (r.length) r[0].values.forEach((v: any, i: number) => console.log('  ' + (['🥇','🥈','🥉'][i]||'#'+(i+1)) + ' ' + ((v[0] as string)||'Anonymous') + ' ' + v[1] + 'ms' + (!v[0]?' <-- 你':'')));
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'cursed.db'), Buffer.from(db.export()));
  db.close();
  console.log('OK');
}
main();
