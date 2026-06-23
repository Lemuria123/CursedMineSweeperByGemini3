/**
 * 构建 324 宝物主数据表 resource/artifacts.md
 * 用法: node scripts/artifacts/build-artifacts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from '../../server/node_modules/sql.js/dist/sql-wasm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'server/data/cursed.db');
const NOVEL_PATH = path.join(ROOT, 'resource/星系殖民指南.md');
const OUT_MD = path.join(ROOT, 'resource/artifacts.md');

// 从 SQLite DB 读取 324 宝物（不再依赖 item-names.mjs）
const SQL = await initSqlJs();
const dbBuf = fs.readFileSync(DB_PATH);
const db = new SQL.Database(dbBuf);
const rows = db.exec(`SELECT name, name_en, source_ip, icon FROM reward_templates ORDER BY rows, cols`);
if (!rows.length) throw new Error('DB 无数据');
const ITEM_NAMES = rows[0].values.map(r => {
  const icon = r[3] || '';
  return { name: r[0], nameEn: r[1] || r[0], ip: r[2] || '', slug: icon.replace('/icons/', '').replace('.png', '') };
});
db.close();

const MIN = 8, MAX = 25;
const SHUFFLE_SEED = 0x324a5744;
const COVER_BACKUP_PATH = '/covers/galaxy-colonization-guide-cover-backup.png';

/** 确定性 shuffle（Fisher-Yates + LCG） */
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function allBoards() {
  const boards = [];
  for (let r = MIN; r <= MAX; r++) {
    for (let c = MIN; c <= MAX; c++) boards.push({ rows: r, cols: c });
  }
  return boards;
}

function isEdge(r, c) { return r === 8 || c === 8; }
function isInner(r, c) { return r >= 9 && c >= 9; }
function isSpecial(r, c) {
  return (r === 9 && c === 9) || (r === 16 && c === 16)
    || (r === 25 && c === 16) || (r === 25 && c === 25);
}

/** 按句号/问号/叹号切分，保留整句 */
function splitSentences(text) {
  return text.split(/(?<=[。！？])/).filter(s => s.trim());
}

/** 解析小说：自序段 + 正文段（每行一段） */
function parseNovel(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const prefaceLines = [];
  const postLines = [];
  let inPreface = false;

  for (const line of lines) {
    const t = line.trim();
    if (t === '## 作者自序') { inPreface = true; continue; }
    if (t.startsWith('## ') && inPreface) inPreface = false;
    if (!t || t === '---' || t.startsWith('#') || /^\*.*\*$/.test(t)) continue;
    if (inPreface) prefaceLines.push(t);
    else postLines.push(t);
  }
  return { prefaceLines, postLines };
}

/** 将段落数组扩展为目标数量（按整句拆半） */
function expandParagraphs(paragraphs, targetCount) {
  const units = [...paragraphs];
  while (units.length < targetCount) {
    let bestIdx = -1, bestN = 0;
    for (let i = 0; i < units.length; i++) {
      const n = splitSentences(units[i]).length;
      if (n > bestN) { bestN = n; bestIdx = i; }
    }
    if (bestIdx < 0 || bestN <= 1) break;
    const sents = splitSentences(units[bestIdx]);
    const mid = Math.ceil(sents.length / 2);
    const first = sents.slice(0, mid).join('');
    const second = sents.slice(mid).join('');
    units.splice(bestIdx, 1, first, second);
  }
  if (units.length !== targetCount) {
    throw new Error(`无法扩展到 ${targetCount} 单元，当前 ${units.length}`);
  }
  return units;
}

function itemLore(name, nameEn, ip) {
  return `在诅咒与逻辑交汇的深处，你发掘出一件上古遗物——「${name}」，它似乎来自于一个虚拟的世界。`;
}

function escapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function main() {
  const { prefaceLines, postLines } = parseNovel(NOVEL_PATH);

  // 自序三段（用户确认的拆分）
  const preface1 = prefaceLines.slice(0, 4).join('\n');
  const preface2 = [prefaceLines[4], prefaceLines[5], prefaceLines[6]].filter(Boolean).join('\n');
  const preface3 = [prefaceLines[7], prefaceLines[8]].filter(Boolean).join('\n');

  const bodyUnits = expandParagraphs(postLines, 285);

  // 阅读链 288 单元（9×9 不参与阅读链，作为独立封面宝物）
  const chain = [];
  chain.push({
    novel_index: 0,
    rows: 16, cols: 16,
    content: preface1,
    type: 'text',
    content_kind: 'preface',
  });
  chain.push({
    novel_index: 1,
    rows: 25, cols: 16,
    content: preface2,
    type: 'text',
    content_kind: 'preface',
  });
  chain.push({
    novel_index: 2,
    rows: 25, cols: 25,
    content: preface3,
    type: 'text',
    content_kind: 'preface',
  });

  // 正文 285 单元：打乱映射到内区非特殊格
  const shuffleTargets = [];
  for (let r = 9; r <= MAX; r++) {
    for (let c = 9; c <= MAX; c++) {
      if (!isSpecial(r, c)) shuffleTargets.push({ rows: r, cols: c });
    }
  }
  if (shuffleTargets.length !== 285) {
    throw new Error(`shuffle targets ${shuffleTargets.length} !== 285`);
  }
  const shuffledBoards = seededShuffle(shuffleTargets, SHUFFLE_SEED);
  for (let i = 0; i < 285; i++) {
    chain.push({
      novel_index: 3 + i,
      rows: shuffledBoards[i].rows,
      cols: shuffledBoards[i].cols,
      content: bodyUnits[i],
      type: 'text',
      content_kind: 'novel',
    });
  }

  // novel_index -> board
  const byIndex = new Map(chain.map(c => [c.novel_index, c]));
  for (const c of chain) {
    const next = byIndex.get(c.novel_index + 1);
    c.next_rows = next ? next.rows : 0;
    c.next_cols = next ? next.cols : 0;
  }

  const chainByBoard = new Map(chain.map(c => [`${c.rows}-${c.cols}`, c]));

  const boards = allBoards();
  if (boards.length !== 324) throw new Error('boards !== 324');
  if (ITEM_NAMES.length !== 324) throw new Error('ITEM_NAMES !== 324');

  const artifacts = boards.map((b, idx) => {
    const item = ITEM_NAMES[idx];
    const icon = `/icons/${item.slug}.png`;
    const hue = (b.rows * b.cols * 137) % 360;
    const key = `${b.rows}-${b.cols}`;
    const chainEntry = chainByBoard.get(key);

    // 9×9：独立封面宝物，不参与阅读链，名称固定为「星系殖民指南」
    if (b.rows === 9 && b.cols === 9) {
      return {
        rows: 9,
        cols: 9,
        name: '星系殖民指南',
        name_en: 'Galaxy Colonization Guide',
        icon: COVER_BACKUP_PATH,
        content: COVER_BACKUP_PATH,
        type: 'image',
        novel_index: -1,
        next_rows: 0,
        next_cols: 0,
        content_kind: 'item_lore',
        hue,
        icon_source: '',
        source_ip: '',
      };
    }

    if (chainEntry) {
      return {
        rows: b.rows,
        cols: b.cols,
        name: item.name,
        name_en: item.nameEn,
        icon,
        content: chainEntry.content,
        type: chainEntry.type,
        novel_index: chainEntry.novel_index,
        next_rows: chainEntry.next_rows,
        next_cols: chainEntry.next_cols,
        content_kind: chainEntry.content_kind,
        hue,
        icon_source: '',
        source_ip: item.ip,
      };
    }

    // 边缘格：道具说明，不参与阅读链
    return {
      rows: b.rows,
      cols: b.cols,
      name: item.name,
      name_en: item.nameEn,
      icon,
      content: itemLore(item.name, item.nameEn, item.ip),
      type: 'text',
      novel_index: -1,
      next_rows: 0,
      next_cols: 0,
      content_kind: 'item_lore',
      hue,
      icon_source: '',
      source_ip: item.ip,
    };
  });

  const header = '| rows | cols | name | name_en | source_ip | icon | type | novel_index | next_rows | next_cols | content_kind | hue | icon_source | content |';
  const sep = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const rows = artifacts.map(a =>
    `| ${a.rows} | ${a.cols} | ${escapeCell(a.name)} | ${escapeCell(a.name_en)} | ${escapeCell(a.source_ip)} | ${escapeCell(a.icon)} | ${a.type} | ${a.novel_index} | ${a.next_rows} | ${a.next_cols} | ${a.content_kind} | ${a.hue} | ${escapeCell(a.icon_source)} | ${escapeCell(a.content)} |`
  );

  const md = [
    '# 324 宝物资源表',
    '',
    '> 由 `node scripts/artifacts/build-artifacts.mjs` 自动生成，请勿手改。',
    '',
    header,
    sep,
    ...rows,
    '',
  ].join('\n');

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log(`[build-artifacts] wrote ${artifacts.length} entries -> ${OUT_MD}`);
}

main();
