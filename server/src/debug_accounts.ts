import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const dbPath = path.join(__dirname, '..', 'data', 'cursed.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  console.log('=== 所有账号 ===');
  const accounts = db.exec('SELECT id, nickname, platform, platform_id FROM accounts ORDER BY created_at');
  if (accounts.length > 0) {
    for (const row of accounts[0].values) {
      console.log(`  ${row[0]} | ${(row[1] as string) || '(无昵称)'} | ${row[2]} | ${row[3]}`);
    }
  }

  const TARGET_PLATFORM_ID = '609ef3e2-1ff1-4977-9398-ad4b223d2e8b';

  console.log('\n=== platform_id 包含 609ef3e2 的账号 ===');
  const match = db.exec(`SELECT id, nickname, platform_id FROM accounts WHERE platform_id = '${TARGET_PLATFORM_ID}'`);
  if (match.length && match[0].values.length) {
    for (const row of match[0].values) {
      console.log(`  account_id: ${row[0]}  nickname: ${(row[1] as string) || '(无昵称)'}`);
    }
  } else {
    console.log('  未找到');
  }

  console.log('\n=== 无昵称账号及其记录数 ===');
  const noNick = db.exec(`SELECT a.id, a.platform_id, COUNT(r.id) as recs
    FROM accounts a LEFT JOIN records r ON r.account_id = a.id
    WHERE a.nickname IS NULL GROUP BY a.id`);
  if (noNick.length > 0) {
    for (const row of noNick[0].values) {
      console.log(`  ${row[0]} | platform_id=${row[1]} | ${row[2]}条记录`);
    }
  }

  console.log('\n=== 所有账号在各棋盘的记录 ===');
  for (const [r, c] of [[9,9], [8,8], [16,16], [25,15], [25,25]]) {
    const rec = db.exec(`SELECT a.id, a.nickname, r.time_ms FROM records r LEFT JOIN accounts a ON r.account_id=a.id WHERE r.rows=${r} AND r.cols=${c} AND r.validated=1 ORDER BY r.time_ms ASC LIMIT 8`);
    if (rec.length > 0) {
      console.log(`\n${r}x${c}:`);
      for (const row of rec[0].values) {
        const id = row[0] as string;
        const nn = (row[1] as string) || 'Anonymous';
        console.log(`  ${nn.padEnd(14)} ${(row[2] as number)}ms  (account: ${id.slice(0,8)}...)`);
      }
    }
  }

  db.close();
}

main();
