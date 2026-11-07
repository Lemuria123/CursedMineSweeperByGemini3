/**
 * 用同一批 logic_error 截图复跑 findGrid，期望 Medium 盘回到 16 列。
 * 用法（在 sweeperbot 目录）：npx tsx scripts/verify-findgrid.ts [dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng } from '../src/image';
import { findGrid } from '../src/vision/board';

const dir = process.argv[2] ?? path.resolve('logs/logic-errors/2026-11-07T17-02-19');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('-logic_error.png')).sort();
if (files.length === 0) {
  console.error(`目录里没有 *-logic_error.png：${dir}`);
  process.exit(1);
}

let bad = 0;
for (const name of files) {
  const image = decodePng(fs.readFileSync(path.join(dir, name)));
  const geom = findGrid(image);
  const label = geom ? `${geom.rows}x${geom.cols}` : 'null';
  const ok = !!geom && geom.rows === 16 && geom.cols === 16;
  if (!ok) bad++;
  console.log(`${ok ? 'OK' : 'FAIL'}\t${name}\t${label}`);
}
console.log(bad === 0 ? `全部 ${files.length} 张回到 16x16` : `${bad}/${files.length} 张未回到 16x16`);
process.exit(bad === 0 ? 0 : 1);