/**
 * 为每个宝物生成占位图标（64x64 PNG），存到 resource/icons/ 与 public/icons/
 * 后续可用真实搜图结果替换同名文件。
 * 用法: node scripts/artifacts/fetch-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ITEM_NAMES } from './item-names.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const RESOURCE_ICONS = path.join(ROOT, 'resource/icons');
const PUBLIC_ICONS = path.join(ROOT, 'public/icons');

/** 64x64 灰色纯色 PNG 占位图（最小有效 PNG） */
const PLACEHOLDER_64 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA' +
  'BXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEHSURBVHgB7dhBDoAgDAXQ/hf1DnoXb6KXIW5M' +
  '3QgLk4iUBSxkCUPTAH+LACgtCzoDAHCW52dLnwgAeF77vdo2hfdWBPDe+kx/SwQAzy2nvlUEAB6a' +
  'T9/5eUcA4J3V9G8FAYD7lvMtvTwzAHji4Hq7l4+OAMC9k+n5AYDdDk/v+pcXhwBgun7q+PywpwC' +
  'A0fjfYQBgJn78AQQAxuLHN0AAYBp+/AEMAIzEjy+AAIDR+PEBEABYgx/vH0AA4Hj8+AAIAFyH9w8g' +
  'AHA8Xh8AAMADeP4AAAA+wPO/uFJCAoGEAAAAAElFTkSuQmCC',
  'base64'
);

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function main() {
  ensureDir(RESOURCE_ICONS);
  ensureDir(PUBLIC_ICONS);

  let written = 0;
  for (const item of ITEM_NAMES) {
    const filename = `${item.slug}.png`;
    const resPath = path.join(RESOURCE_ICONS, filename);
    const pubPath = path.join(PUBLIC_ICONS, filename);

    if (!fs.existsSync(resPath)) {
      fs.writeFileSync(resPath, PLACEHOLDER_64);
      written++;
    }
    // 复制到 public/icons 供前端引用
    if (!fs.existsSync(pubPath)) {
      fs.copyFileSync(resPath, pubPath);
    }
  }

  console.log(`[fetch-icons] new placeholder icons: ${written}, synced ${ITEM_NAMES.length} -> public/icons`);
}

main();
