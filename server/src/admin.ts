// Cursed Minesweeper — Admin Panel (:38002)
// Pure HTML + Tailwind CDN, no frontend framework.
// Shares the same SQLite database as the game API.

import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import fs from 'fs';
import { initDatabase, all, get, run, saveDb, reloadDb, reloadFromDisk } from './db';
import { GameSubmission, GameAction } from './types';
import { decrypt } from './crypto';
import {
  createEmptyGrid,
  cloneGrid,
  revealCellLogic,
  getChordTargets,
  checkWin,
} from '../../shared/gameLogic';
import { deterministicPlaceMines, createRNG, hashSeed } from '../../shared/deterministicPlaceMines';
import { CellData } from '../../shared/types';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({ name: 'cms_admin', secret: process.env.ADMIN_TOKEN || 'change-me-in-production', maxAge: 24 * 60 * 60 * 1000 }));

// Serve static files from server/public/ (tailwind.min.css and other server assets)
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve static files (icon images, covers) from project public/ directory
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// ── Helpers ──
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session?.admin) return next();
  res.redirect('/');
};

const top = (title: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — CMS Admin</title><link rel="stylesheet" href="/tailwind.min.css"></head>
<body class="bg-gray-900 min-h-screen text-white">
<nav class="bg-gray-800 px-6 py-4 flex items-center justify-between">
  <a href="/dashboard" class="font-bold text-lg text-purple-400">CMS Admin</a>
  <div class="flex gap-4 text-sm">
    <a href="/dashboard" class="text-gray-400 hover:text-white">Dashboard</a>
    <a href="/users" class="text-gray-400 hover:text-white">Users</a>
    <a href="/records" class="text-gray-400 hover:text-white">Records</a>
    <a href="/rewards" class="text-gray-400 hover:text-white">Rewards</a>
    <a href="/submissions" class="text-gray-400 hover:text-white">Submissions</a>
    <a href="/maintenance" class="text-gray-400 hover:text-white">Maintenance</a>
    <a href="/config" class="text-gray-400 hover:text-white">Config</a>
    <a href="/reward-config" class="text-gray-400 hover:text-white">Reward Config</a>
    <a href="/logout" class="text-red-400 hover:text-white">Logout</a>
  </div>
</nav>
<main class="max-w-6xl mx-auto p-6">`;

const bottom = `</main></body></html>`;

function page(title: string, body: string) { return top(title) + body + bottom; }

// ── Login ──
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CMS Admin</title><link rel="stylesheet" href="/tailwind.min.css"></head>
<body class="bg-gray-900 min-h-screen flex items-center justify-center">
<form method="POST" action="/login" class="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm space-y-4">
  <h1 class="text-2xl font-bold text-white text-center">Cursed Minesweeper</h1>
  <p class="text-gray-400 text-center text-sm">Admin Panel</p>
  <input name="token" type="password" placeholder="Admin Token" required
    class="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500" />
  <button type="submit" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition">Sign In</button>
  <p class="text-gray-600 text-xs text-center">Default: admin</p>
</form></body></html>`);
});

app.post('/login', (req, res) => {
  if (req.body.token === (process.env.ADMIN_TOKEN || 'admin')) { req.session!.admin = true; res.redirect('/dashboard'); }
  else res.redirect('/');
});

app.get('/logout', (req, res) => { req.session = null; res.redirect('/'); });

// ── 自动处理状态（每20秒后台自动运行）──
let autoUnified = false;  // 统一自动处理开关：name_bad → 重找+补图, image_bad → 补图
let autoTimer: ReturnType<typeof setTimeout> | null = null;

// ── Dashboard ──
app.get('/dashboard', requireAdmin, (_req, res) => {
  const totalUsers = get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM accounts')?.cnt || 0;
  const totalRecords = get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM records WHERE validated = 1')?.cnt || 0;
  const totalRewards = get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM rewards')?.cnt || 0;
  const noncePool = get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM submission_nonces')?.cnt || 0;
  const todayActive = get<{ cnt: number }>('SELECT COUNT(DISTINCT account_id) as cnt FROM records WHERE submitted_at > ?', [Date.now() - 86400000])?.cnt || 0;

  res.send(page('Dashboard', `
<h2 class="text-xl font-semibold mb-6">Dashboard</h2>
<div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
  <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Users</div><div class="text-3xl font-bold text-purple-400">${totalUsers}</div></div>
  <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">ACE Records</div><div class="text-3xl font-bold text-amber-400">${totalRecords}</div></div>
  <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Rewards</div><div class="text-3xl font-bold text-green-400">${totalRewards}</div></div>
  <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Today Active</div><div class="text-3xl font-bold text-blue-400">${todayActive}</div></div>
  <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Nonce Pool</div><div class="text-3xl font-bold text-orange-400">${noncePool}</div></div>
</div>
<h3 class="text-lg font-semibold mb-3 text-gray-300">Quick Links</h3>
<div class="flex flex-wrap gap-2">
  <a href="/users" class="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-sm">Users</a>
  <a href="/records" class="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-sm">Records</a>
  <a href="/rewards" class="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-sm">Rewards</a>
  <a href="/submissions" class="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-sm">Submissions</a>
</div>`));
});

// ── Users List ──
app.get('/users', requireAdmin, (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;
  const total = get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM accounts')?.cnt || 0;

  const users = all<{ id: string; platform: string; nickname: string | null; created_at: number; record_count?: number }>(
    `SELECT a.*, (SELECT COUNT(*) FROM records WHERE account_id = a.id AND validated = 1) as record_count
     FROM accounts a ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );

  const rows = users.map(u => `
    <tr class="border-b border-gray-700 hover:bg-gray-800">
      <td class="py-3 px-4"><a href="/users/${u.id}" class="text-purple-400 hover:underline font-mono text-xs">${u.id.slice(0, 8)}...</a></td>
      <td class="py-3 px-4 text-sm">${esc(u.nickname) || '<span class="text-gray-600">—</span>'}</td>
      <td class="py-3 px-4 text-xs text-gray-400">${u.platform}</td>
      <td class="py-3 px-4 text-xs text-amber-400">${u.record_count || 0}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(u.created_at)}</td>
    </tr>`).join('');

  res.send(page('Users', `
<h2 class="text-xl font-semibold mb-4">Users (${total})</h2>
<div class="bg-gray-800 rounded-xl overflow-hidden">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-4">ID</th><th class="py-3 px-4">Nickname</th><th class="py-3 px-4">Platform</th><th class="py-3 px-4">ACEs</th><th class="py-3 px-4">Registered</th></tr></thead>
    <tbody>${rows}</tbody></table>
</div>
<div class="flex justify-between items-center mt-4 text-sm">
  <span class="text-gray-500">Page ${pageNum} / ${Math.ceil(total / pageSize)}</span>
  <div class="flex gap-2">
    ${pageNum > 1 ? `<a href="/users?page=${pageNum - 1}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">上一页</a>` : ''}
    ${pageNum * pageSize < total ? `<a href="/users?page=${pageNum + 1}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">下一页</a>` : ''}
  </div>
</div>`));
});

// ── User Detail ──
app.get('/users/:id', requireAdmin, (req, res) => {
  const user = get<{ id: string; platform: string; platform_id: string; nickname: string | null; created_at: number }>(
    'SELECT * FROM accounts WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).send(page('Not Found', '<p class="text-red-400">User not found.</p>'));

  const records = all<{ rows: number; cols: number; mines: number; time_ms: number; validated: number; submitted_at: number }>(
    'SELECT * FROM records WHERE account_id = ? ORDER BY submitted_at DESC LIMIT 50', [req.params.id]);
  const rewards = all<{ id: string; difficulty_name: string; title: string; submitted_at: number }>(
    'SELECT id, difficulty_name, title, submitted_at FROM rewards WHERE account_id = ? ORDER BY submitted_at DESC', [req.params.id]);

  const recRows = records.map(r => `
    <tr class="border-b border-gray-700">
      <td class="py-2 px-3 text-xs font-mono">${r.rows}x${r.cols}</td>
      <td class="py-2 px-3 text-xs">${r.mines}</td>
      <td class="py-2 px-3 text-xs font-mono text-amber-400">${r.time_ms}ms</td>
      <td class="py-2 px-3 text-xs">${r.validated ? '<span class="text-green-400">✓</span>' : '<span class="text-red-400">✗</span>'}</td>
      <td class="py-2 px-3 text-xs text-gray-500">${fmtDate(r.submitted_at)}</td>
    </tr>`).join('');

  const rewRows = rewards.map(rw => `
    <tr class="border-b border-gray-700">
      <td class="py-2 px-3 text-xs font-mono text-purple-400">${rw.id}</td>
      <td class="py-2 px-3 text-xs">${esc(rw.difficulty_name)}</td>
      <td class="py-2 px-3 text-xs">${esc(rw.title)}</td>
      <td class="py-2 px-3 text-xs text-gray-500">${fmtDate(rw.submitted_at)}</td>
    </tr>`).join('');

  res.send(page('User Detail', `
<h2 class="text-xl font-semibold mb-4">User Detail</h2>
<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-gray-800 rounded-xl p-4">
  <div><div class="text-xs text-gray-400">Nickname</div><div class="text-sm font-bold">${esc(user.nickname) || '—'}</div></div>
  <div><div class="text-xs text-gray-400">Platform</div><div class="text-sm">${user.platform}</div></div>
  <div><div class="text-xs text-gray-400">Platform ID</div><div class="text-sm font-mono text-xs text-gray-400">${user.platform_id.slice(0, 20)}...</div></div>
  <div><div class="text-xs text-gray-400">Registered</div><div class="text-sm">${fmtDate(user.created_at)}</div></div>
</div>
<h3 class="text-lg font-semibold mb-2 text-gray-300">Records (${records.length})</h3>
<div class="bg-gray-800 rounded-xl overflow-hidden mb-6">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-2 px-3">Size</th><th class="py-2 px-3">Mines</th><th class="py-2 px-3">Time</th><th class="py-2 px-3">Valid</th><th class="py-2 px-3">Date</th></tr></thead>
    <tbody>${recRows || '<tr><td colspan="5" class="py-4 text-center text-gray-600">No records</td></tr>'}</tbody></table>
</div>
<h3 class="text-lg font-semibold mb-2 text-gray-300">Rewards (${rewards.length})</h3>
<div class="bg-gray-800 rounded-xl overflow-hidden">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-2 px-3">ID</th><th class="py-2 px-3">Difficulty</th><th class="py-2 px-3">Title</th><th class="py-2 px-3">Date</th></tr></thead>
    <tbody>${rewRows || '<tr><td colspan="4" class="py-4 text-center text-gray-600">No rewards</td></tr>'}</tbody></table>
</div>
<a href="/users" class="inline-block mt-4 text-sm text-purple-400 hover:underline">← Back to Users</a>`));
});

// ── Records ──
app.get('/records', requireAdmin, (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;
  const filterRows = parseInt(req.query.rows as string) || 0;
  const filterCols = parseInt(req.query.cols as string) || 0;

  let where = 'WHERE r.validated = 1'; const params: any[] = [];
  if (filterRows > 0) { where += ' AND r.rows = ?'; params.push(filterRows); }
  if (filterCols > 0) { where += ' AND r.cols = ?'; params.push(filterCols); }

  const total = get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM records r ${where}`, params)?.cnt || 0;

  const records = all<any>(
    `SELECT r.*, a.nickname FROM records r LEFT JOIN accounts a ON r.account_id = a.id
     ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]);

  const rows = records.map(r => `
    <tr class="border-b border-gray-700 hover:bg-gray-800">
      <td class="py-3 px-4 text-sm">${esc(r.nickname) || `<span class="text-gray-600">Anon ${r.account_id.slice(-4)}</span>`}</td>
      <td class="py-3 px-4 text-xs font-mono">${r.rows}x${r.cols}</td>
      <td class="py-3 px-4 text-xs">${r.mines}</td>
      <td class="py-3 px-4 text-xs font-mono text-amber-400">${r.time_ms}ms</td>
      <td class="py-3 px-4 text-xs">${r.prayers_used === 0 ? '<span class="text-yellow-400 font-bold">★ ACE</span>' : `<span class="text-gray-500">${r.prayers_used >= 0 ? r.prayers_used + ' pray' : '?'}</span>`}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(r.submitted_at)}</td>
      <td class="py-3 px-4"><a href="/replay/${r.id}" class="text-purple-400 hover:underline text-xs">Replay</a></td>
    </tr>`).join('');

  res.send(page('Records', `
<h2 class="text-xl font-semibold mb-4">ACE Records (${total})</h2>
<form method="GET" class="flex gap-2 mb-4">
  <input name="rows" type="number" placeholder="Rows" value="${filterRows || ''}" min="5" max="25" class="w-20 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm" />
  <input name="cols" type="number" placeholder="Cols" value="${filterCols || ''}" min="5" max="25" class="w-20 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm" />
  <button type="submit" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-semibold">Filter</button>
  <a href="/records" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Clear</a>
</form>
<div class="bg-gray-800 rounded-xl overflow-hidden">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-4">Player</th><th class="py-3 px-4">Size</th><th class="py-3 px-4">Mines</th><th class="py-3 px-4">Time</th><th class="py-3 px-4">ACE</th><th class="py-3 px-4">Date</th><th class="py-3 px-4">Replay</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="py-6 text-center text-gray-600">No records found</td></tr>'}</tbody></table>
</div>
<div class="flex justify-between mt-4 text-sm">
  <span class="text-gray-500">Page ${pageNum} / ${Math.max(1, Math.ceil(total / pageSize))}</span>
  <div class="flex gap-2">
    ${pageNum > 1 ? `<a href="/records?page=${pageNum - 1}&rows=${filterRows}&cols=${filterCols}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">上一页</a>` : ''}
    ${pageNum * pageSize < total ? `<a href="/records?page=${pageNum + 1}&rows=${filterRows}&cols=${filterCols}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">下一页</a>` : ''}
  </div>
</div>`));
});

// ── Rewards ──
app.get('/rewards', requireAdmin, (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;
  const diffFilter = (req.query.difficulty as string) || '';

  let where = ''; const params: any[] = [];
  if (diffFilter) { where = 'WHERE r.difficulty_name = ?'; params.push(diffFilter); }

  const total = get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM rewards r ${where}`, params)?.cnt || 0;

  const rewards = all<any>(
    `SELECT r.*, a.nickname FROM rewards r LEFT JOIN accounts a ON r.account_id = a.id
     ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]);

  const rows = rewards.map(rw => `
    <tr class="border-b border-gray-700 hover:bg-gray-800">
      <td class="py-3 px-4 text-sm">${esc(rw.nickname) || `<span class="text-gray-600">Anon ${rw.account_id.slice(-4)}</span>`}</td>
      <td class="py-3 px-4 text-xs">${esc(rw.difficulty_name)}</td>
      <td class="py-3 px-4 text-xs">${esc(rw.title)}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(rw.submitted_at)}</td>
    </tr>`).join('');

  res.send(page('Rewards', `
<h2 class="text-xl font-semibold mb-4">Rewards (${total})</h2>
<form method="GET" class="flex gap-2 mb-4">
  <input name="difficulty" type="text" placeholder="Difficulty name" value="${escAttr(diffFilter)}" class="w-48 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm" />
  <button type="submit" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-semibold">Filter</button>
  <a href="/rewards" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Clear</a>
</form>
<div class="bg-gray-800 rounded-xl overflow-hidden">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-4">Player</th><th class="py-3 px-4">Difficulty</th><th class="py-3 px-4">Title</th><th class="py-3 px-4">Date</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="py-6 text-center text-gray-600">No rewards found</td></tr>'}</tbody></table>
</div>
<div class="flex justify-between mt-4 text-sm">
  <span class="text-gray-500">Page ${pageNum} / ${Math.max(1, Math.ceil(total / pageSize))}</span>
  <div class="flex gap-2">
    ${pageNum > 1 ? `<a href="/rewards?page=${pageNum - 1}&difficulty=${escAttr(diffFilter)}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">上一页</a>` : ''}
    ${pageNum * pageSize < total ? `<a href="/rewards?page=${pageNum + 1}&difficulty=${escAttr(diffFilter)}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">下一页</a>` : ''}
  </div>
</div>`));
});

// ── Submissions ──
app.get('/submissions', requireAdmin, (req, res) => {
  const pageNum = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;
  const vFilter = req.query.validated as string;

  let where = ''; const params: any[] = [];
  if (vFilter === '0' || vFilter === '1') { where = 'WHERE r.validated = ?'; params.push(parseInt(vFilter)); }

  const total = get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM records r ${where}`, params)?.cnt || 0;

  const submissions = all<any>(
    `SELECT r.*, a.nickname FROM records r LEFT JOIN accounts a ON r.account_id = a.id
     ${where} ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]);

  const rows = submissions.map(s => `
    <tr class="border-b border-gray-700 hover:bg-gray-800">
      <td class="py-3 px-4 text-sm">${esc(s.nickname) || `<span class="text-gray-600">Anon ${s.account_id.slice(-4)}</span>`}</td>
      <td class="py-3 px-4 text-xs font-mono">${s.rows}x${s.cols}</td>
      <td class="py-3 px-4 text-xs">${s.mines}</td>
      <td class="py-3 px-4 text-xs font-mono text-amber-400">${s.time_ms}ms</td>
      <td class="py-3 px-4 text-xs">${s.validated ? '<span class="text-green-400 font-bold">✓ Pass</span>' : `<span class="text-red-400 font-bold">✗ Fail</span>${s.verify_reason ? `<br><span class="text-red-500/70 text-[10px]">${esc(s.verify_reason)}</span>` : ''}`}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(s.submitted_at)}</td>
      <td class="py-3 px-4"><a href="/replay/${s.id}" class="text-purple-400 hover:underline text-xs">Replay</a></td>
    </tr>`).join('');

  res.send(page('Submissions', `
<h2 class="text-xl font-semibold mb-4">Submission Log (${total})</h2>
<div class="flex gap-2 mb-4 text-sm">
  <a href="/submissions?page=1" class="px-3 py-1 rounded ${!vFilter ? 'bg-purple-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}">All</a>
  <a href="/submissions?validated=1&page=1" class="px-3 py-1 rounded ${vFilter === '1' ? 'bg-green-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}">Passed</a>
  <a href="/submissions?validated=0&page=1" class="px-3 py-1 rounded ${vFilter === '0' ? 'bg-red-600 text-white' : 'bg-gray-800 hover:bg-gray-700'}">Failed</a>
</div>
<div class="bg-gray-800 rounded-xl overflow-hidden">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-4">Player</th><th class="py-3 px-4">Size</th><th class="py-3 px-4">Mines</th><th class="py-3 px-4">Time</th><th class="py-3 px-4">Result</th><th class="py-3 px-4">Date</th><th class="py-3 px-4">Replay</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="py-6 text-center text-gray-600">No submissions</td></tr>'}</tbody></table>
</div>
<div class="flex justify-between mt-4 text-sm">
  <span class="text-gray-500">Page ${pageNum} / ${Math.max(1, Math.ceil(total / pageSize))}</span>
  <div class="flex gap-2">
    ${pageNum > 1 ? `<a href="/submissions?page=${pageNum - 1}&validated=${vFilter || ''}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">上一页</a>` : ''}
    ${pageNum * pageSize < total ? `<a href="/submissions?page=${pageNum + 1}&validated=${vFilter || ''}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">下一页</a>` : ''}
  </div>
</div>`));
});

// ── API: Replay data ──
app.get('/api/admin/record/:id', requireAdmin, (req, res) => {
  const record = get<{ game_data: string; rows: number; cols: number; mines: number; validated: number; submitted_at: number }>(
    'SELECT game_data, rows, cols, mines, validated, submitted_at FROM records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ error: 'Record not found' });

  let submission: GameSubmission;
  try {
    submission = JSON.parse(decrypt(record.game_data));
  } catch (e: any) {
    return res.status(400).json({ error: `Decrypt failed: ${e.message}` });
  }

  const { grid: gridConfig, mine_seed, actions, prayers_used } = submission;
  if (!actions || actions.length === 0) {
    return res.status(400).json({ error: 'No actions in record' });
  }

  const firstAction = actions[0];
  let board = deterministicPlaceMines(gridConfig.rows, gridConfig.cols, gridConfig.mines, firstAction.row, firstAction.col, mine_seed);
  const cspRng = createRNG(hashSeed(mine_seed + '-csp'));

  // Replay and capture board state at each step
  const steps: { action: GameAction; board: any[][] }[] = [];
  let status: 'playing' | 'won' | 'lost' = 'playing';
  let prayerCount = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (status !== 'playing') break;

    switch (action.type) {
      case 'first_reveal': {
        const result = revealCellLogic(board, action.row, action.col, true, false, cspRng);
        board = result.grid;
        break;
      }
      case 'reveal': {
        const isPraying = action.prayed === true;
        const result = revealCellLogic(board, action.row, action.col, false, isPraying, cspRng);
        board = result.grid;
        if (result.prayerConsumed) prayerCount++;
        if (result.exploded) status = 'lost';
        break;
      }
      case 'flag': {
        board = board.map((r, ri) => r.map((c, ci) => {
          if (ri === action.row && ci === action.col) {
            if (c.status === 'hidden') return { ...c, status: 'flagged' as const };
            if (c.status === 'flagged') return { ...c, status: 'hidden' as const };
          }
          return c;
        }));
        break;
      }
      case 'chord': {
        const targets = getChordTargets(board, action.row, action.col);
        const isPraying = action.prayed === true;
        for (const t of targets) {
          const result = revealCellLogic(board, t.r, t.c, false, isPraying, cspRng);
          board = result.grid;
          if (result.exploded) { status = 'lost'; break; }
        }
        break;
      }
    }

    if (status === 'playing' && checkWin(board)) status = 'won';

    // Capture snapshot (deep-clone the board grid)
    const snapshot = board.map(row => row.map(cell => ({
      status: cell.status,
      isMine: cell.isMine,
      neighborMines: cell.neighborMines,
      isExploded: (cell as any).isExploded || false,
      isMisflagged: (cell as any).isMisflagged || false,
    })));
    steps.push({ action, board: snapshot });
  }

  // Also show initial board (before any action)
  const initialBoard = deterministicPlaceMines(gridConfig.rows, gridConfig.cols, gridConfig.mines, firstAction.row, firstAction.col, mine_seed);
  const initialSnapshot = initialBoard.map(row => row.map(cell => ({
    status: cell.status,
    isMine: cell.isMine,
    neighborMines: cell.neighborMines,
    isExploded: false,
    isMisflagged: false,
  })));

  res.json({
    id: req.params.id,
    grid: { rows: gridConfig.rows, cols: gridConfig.cols, mines: gridConfig.mines },
    mine_seed,
    validated: record.validated,
    submitted_at: record.submitted_at,
    prayers_used,
    prayers_replayed: prayerCount,
    status,
    initial: initialSnapshot,
    steps,
  });
});

// ── Replay page ──
app.get('/replay/:id', requireAdmin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Replay — CMS Admin</title>
<link rel="stylesheet" href="/tailwind.min.css">
<style>
  .cell { width: 24px; height: 24px; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid; cursor: default; user-select: none; transition: all 0.1s; }
  .cell-hidden { background: #334155; border-color: #475569 #1e293b #1e293b #475569; }
  .cell-hidden:hover { background: #3b4f6b; }
  .cell-revealed { background: #1e293b; border-color: #0f172a; }
  .cell-flagged { background: #334155; border-color: #475569 #1e293b #1e293b #475569; }
  .cell-mine { background: #dc2626; border-color: #991b1b; }
  .cell-exploded { background: #ef4444; border-color: #b91c1c; }
  .n0 { color: transparent; } .n1 { color: #60a5fa; } .n2 { color: #4ade80; }
  .n3 { color: #f87171; } .n4 { color: #c084fc; } .n5 { color: #fb923c; }
  .n6 { color: #22d3ee; } .n7 { color: #facc15; } .n8 { color: #f472b6; }
  .action-row { cursor: pointer; transition: background 0.15s; }
  .action-row:hover { background: #1e293b; }
  .action-row.active { background: #312e81; }
</style>
</head>
<body class="bg-gray-900 min-h-screen text-white">
<nav class="bg-gray-800 px-6 py-3 flex items-center justify-between">
  <a href="/dashboard" class="font-bold text-lg text-purple-400">CMS Admin</a>
  <div class="flex gap-4 text-sm">
    <a href="/dashboard" class="text-gray-400 hover:text-white">Dashboard</a>
    <a href="/records" class="text-gray-400 hover:text-white">Records</a>
    <a href="/submissions" class="text-gray-400 hover:text-white">Submissions</a>
    <a href="/maintenance" class="text-gray-400 hover:text-white">Maintenance</a>
    <a href="/logout" class="text-red-400 hover:text-white">Logout</a>
  </div>
</nav>
<main class="max-w-6xl mx-auto p-4">
  <div id="info" class="mb-4 text-sm text-gray-400">Loading replay data...</div>
  <div class="flex flex-col lg:flex-row gap-4">
    <!-- Board -->
    <div class="flex-shrink-0">
      <div id="board" class="inline-grid bg-gray-800 p-2 rounded-xl"></div>
      <div class="mt-2 flex gap-2 justify-center">
        <button onclick="stepTo(0)" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">⏮</button>
        <button onclick="stepPrev()" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">◀</button>
        <span id="stepLabel" class="px-3 py-1 text-xs text-gray-400">0 / 0</span>
        <button onclick="stepNext()" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▶</button>
        <button onclick="stepTo(-1)" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">⏭</button>
        <button onclick="toggleAuto()" id="autoBtn" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">▶ Play</button>
        <select id="speedSelect" class="px-2 py-1 bg-gray-700 rounded text-xs">
          <option value="1000">1x</option><option value="500" selected>2x</option>
          <option value="200">5x</option><option value="50">20x</option>
        </select>
      </div>
    </div>
    <!-- Action List -->
    <div class="flex-1 max-h-[70vh] overflow-y-auto bg-gray-800 rounded-xl p-2">
      <h3 class="text-sm font-semibold text-gray-300 px-2 py-1">Actions</h3>
      <div id="actionList" class="text-xs"></div>
    </div>
  </div>
</main>
<script>
const data = { steps: [], initial: null, grid: null, status: '', prayers_replayed: 0 };
let currentStep = -1;
let autoTimer = null;

async function load() {
  const id = location.pathname.split('/').pop();
  try {
    const r = await fetch('/api/admin/record/' + id);
    if (!r.ok) { document.getElementById('info').innerHTML = '<span class="text-red-400">Failed to load: ' + r.status + '</span>'; return; }
    const j = await r.json();
    if (j.error) { document.getElementById('info').innerHTML = '<span class="text-red-400">' + j.error + '</span>'; return; }
    Object.assign(data, j);
    document.getElementById('info').innerHTML =
      '<span class="text-purple-400 font-bold">Replay #' + j.id + '</span> &nbsp;' +
      j.grid.rows + 'x' + j.grid.cols + ' / ' + j.grid.mines + ' mines &nbsp;|&nbsp;' +
      'Prayers: ' + j.prayers_used + ' (replayed: ' + j.prayers_replayed + ') &nbsp;|&nbsp;' +
      'Status: <span class="' + (j.status === 'won' ? 'text-green-400' : 'text-red-400') + '">' + j.status.toUpperCase() + '</span> &nbsp;|&nbsp;' +
      fmtDate(j.submitted_at);
    renderActionList();
    setStep(-1); // show initial
  } catch(e) { document.getElementById('info').innerHTML = '<span class="text-red-400">Error: ' + e.message + '</span>'; }
}

function renderActionList() {
  const list = document.getElementById('actionList');
  list.innerHTML = data.steps.map((s,i) =>
    '<div class="action-row flex items-center gap-2 px-2 py-1 rounded text-xs border-b border-gray-700" onclick="highlightStep(' + i + ')">' +
      '<span class="text-gray-500 w-5 text-right">' + (i+1) + '</span>' +
      '<span class="w-12 ' + typeColor(s.action.type) + '">' + s.action.type.padEnd(12) + '</span>' +
      '<span class="text-gray-400 font-mono">(' + s.action.row + ',' + s.action.col + ')</span>' +
      (s.action.prayed ? '<span class="text-amber-400 ml-1">pray</span>' : '') +
      '<span class="text-gray-600 ml-auto">' + s.action.ts + 'ms</span>' +
    '</div>'
  ).join('');
}

function typeColor(t) {
  if (t === 'first_reveal') return 'text-green-400';
  if (t === 'reveal') return 'text-blue-400';
  if (t === 'flag') return 'text-red-400';
  if (t === 'chord') return 'text-yellow-400';
  return 'text-gray-400';
}

function setStep(n) {
  currentStep = Math.max(-1, Math.min(n, data.steps.length - 1));
  document.getElementById('stepLabel').textContent = (currentStep+1) + ' / ' + data.steps.length;
  highlightStep(currentStep);
  renderBoard();
}

function highlightStep(n) {
  currentStep = n;
  document.getElementById('stepLabel').textContent = (currentStep+1) + ' / ' + data.steps.length;
  const rows = document.querySelectorAll('.action-row');
  rows.forEach((r,i) => r.classList.toggle('active', i === currentStep));
  renderBoard();
}

function stepPrev() { setStep(currentStep - 1); }
function stepNext() { setStep(currentStep + 1); }
function stepTo(n) {
  if (n === 0) setStep(0);
  else if (n === -1) setStep(data.steps.length - 1);
}

function toggleAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; document.getElementById('autoBtn').textContent = '▶ Play'; return; }
  document.getElementById('autoBtn').textContent = '⏸ Pause';
  const speed = parseInt(document.getElementById('speedSelect').value);
  autoTimer = setInterval(() => {
    if (currentStep >= data.steps.length - 1) { toggleAuto(); return; }
    setStep(currentStep + 1);
  }, speed);
}

function renderBoard() {
  const g = data.grid;
  const board = document.getElementById('board');
  const boardData = currentStep >= 0 ? data.steps[currentStep].board : data.initial;
  board.style.gridTemplateColumns = 'repeat(' + g.cols + ', 24px)';
  board.style.gridTemplateRows = 'repeat(' + g.rows + ', 24px)';
  board.innerHTML = '';
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const cell = boardData[r][c];
      const div = document.createElement('div');
      div.className = 'cell';
      div.title = '(' + r + ',' + c + ')';

      if (cell.isExploded) {
        div.classList.add('cell-exploded');
        div.textContent = '💥';
      } else if (cell.status === 'flagged') {
        div.classList.add('cell-flagged');
        div.textContent = '🚩';
      } else if (cell.status === 'hidden') {
        div.classList.add('cell-hidden');
        div.textContent = '';
      } else if (cell.status === 'revealed') {
        div.classList.add('cell-revealed');
        if (cell.isMine) {
          div.classList.add('cell-mine');
          div.textContent = '💣';
        } else {
          div.classList.add('n' + cell.neighborMines);
          div.textContent = cell.neighborMines || '';
        }
      }

      if (cell.isMisflagged && cell.status === 'revealed') {
        div.textContent = '✕';
        div.style.color = '#f87171';
      }

      board.appendChild(div);
    }
  }
}

{ const speed = document.getElementById('speedSelect'); speed.onchange = () => { if (autoTimer) { toggleAuto(); toggleAuto(); } }; }

load();
</script>
</body>
</html>`);
});

// ── Maintenance: Delete Test Data ──

// 检测账号是否为测试账号：
//   1. nickname 以 "Tester" 开头（所有测试脚本统一使用）
//   2. platform_id 不是标准 UUID 格式（36 字符，4 个连字符在固定位置）
// 真实玩家使用 crypto.randomUUID()，始终是标准 UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const IS_TEST_ACCOUNT_SQL = `(
  COALESCE(a.nickname, '') LIKE 'Tester%'
  OR a.platform_id NOT LIKE '________-____-____-____-____________'
)`;

app.get('/maintenance', requireAdmin, (_req, res) => {
  const testAccountCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM accounts a WHERE ${IS_TEST_ACCOUNT_SQL}`)?.cnt || 0;
  const testRecordCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM records r INNER JOIN accounts a ON r.account_id = a.id WHERE ${IS_TEST_ACCOUNT_SQL}`)?.cnt || 0;
  const testRewardCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM rewards rw INNER JOIN accounts a ON rw.account_id = a.id WHERE ${IS_TEST_ACCOUNT_SQL}`)?.cnt || 0;
  const testNonceCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM submission_nonces sn INNER JOIN accounts a ON sn.account_id = a.id WHERE ${IS_TEST_ACCOUNT_SQL}`)?.cnt || 0;

  const realAccountCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM accounts a WHERE NOT (${IS_TEST_ACCOUNT_SQL})`)?.cnt || 0;
  const realRecordCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM records r INNER JOIN accounts a ON r.account_id = a.id WHERE NOT (${IS_TEST_ACCOUNT_SQL})`)?.cnt || 0;
  const realRewardCount = get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM rewards rw INNER JOIN accounts a ON rw.account_id = a.id WHERE NOT (${IS_TEST_ACCOUNT_SQL})`)?.cnt || 0;

  const sampleAccounts = all<{ id: string; nickname: string | null; platform_id: string }>(
    `SELECT a.id, a.nickname, a.platform_id FROM accounts a WHERE ${IS_TEST_ACCOUNT_SQL} ORDER BY a.created_at DESC LIMIT 30`);

  const accountPreviewRows = sampleAccounts.map(a => `
    <tr class="border-b border-gray-700 text-xs">
      <td class="py-1 px-2 font-mono text-gray-400">${a.id.slice(0, 12)}...</td>
      <td class="py-1 px-2">${esc(a.nickname) || '<span class="text-gray-600">—</span>'}</td>
      <td class="py-1 px-2 font-mono text-gray-500">${esc(a.platform_id.slice(0, 40))}</td>
    </tr>`).join('');

  res.send(page('Maintenance', `
<h2 class="text-xl font-semibold mb-4">Maintenance — Delete Test Data</h2>

<p class="text-sm text-gray-400 mb-4">
  Test accounts are identified by non-UUID platform IDs (e.g. <code class="text-purple-400">comp-...</code>, <code class="text-purple-400">t-...</code>, <code class="text-purple-400">forge-...</code>)
  or nicknames starting with <code class="text-purple-400">Tester</code>.
  Real players use <code class="text-green-400">crypto.randomUUID()</code> which always produces standard UUID format.
</p>

<div class="grid grid-cols-2 gap-4 mb-6">
  <div class="bg-gray-800 rounded-xl p-4">
    <h3 class="text-sm font-semibold text-red-400 mb-3">🧪 Test Data (to be deleted)</h3>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div><span class="text-gray-400">Accounts:</span> <span class="text-red-400 font-bold">${testAccountCount}</span></div>
      <div><span class="text-gray-400">Records:</span> <span class="text-red-400 font-bold">${testRecordCount}</span></div>
      <div><span class="text-gray-400">Rewards:</span> <span class="text-red-400 font-bold">${testRewardCount}</span></div>
      <div><span class="text-gray-400">Nonces:</span> <span class="text-red-400 font-bold">${testNonceCount}</span></div>
    </div>
  </div>
  <div class="bg-gray-800 rounded-xl p-4">
    <h3 class="text-sm font-semibold text-green-400 mb-3">✅ Real Players (will keep)</h3>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div><span class="text-gray-400">Accounts:</span> <span class="text-green-400 font-bold">${realAccountCount}</span></div>
      <div><span class="text-gray-400">Records:</span> <span class="text-green-400 font-bold">${realRecordCount}</span></div>
      <div><span class="text-gray-400">Rewards:</span> <span class="text-green-400 font-bold">${realRewardCount}</span></div>
    </div>
  </div>
</div>

${testAccountCount > 0 ? `
<div class="bg-gray-800 rounded-xl p-4 mb-6">
  <h3 class="text-sm font-semibold text-gray-300 mb-2">Test Account Preview (newest ${Math.min(sampleAccounts.length, 30)})</h3>
  <div class="max-h-64 overflow-y-auto">
    <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400">
      <th class="py-1 px-2">Account ID</th><th class="py-1 px-2">Nickname</th><th class="py-1 px-2">Platform ID</th>
    </tr></thead><tbody>${accountPreviewRows}</tbody></table>
  </div>
</div>

<form method="POST" action="/maintenance/delete-test-data" onsubmit="return confirm('Are you sure you want to delete ALL test data?\\n\\nThis will permanently remove:\\n• ${testAccountCount} test accounts\\n• ${testRecordCount} test records\\n• ${testRewardCount} test rewards\\n• ${testNonceCount} nonces\\n\\nReal player data will NOT be affected.\\n\\nThis action CANNOT be undone.')">
  <button type="submit" class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition text-lg">
    🗑 Delete All Test Data
  </button>
</form>
` : `
<div class="bg-gray-800 rounded-xl p-6 text-center">
  <p class="text-gray-400">No test data found. Database is clean!</p>
</div>
`}
`));
});

app.post('/maintenance/delete-test-data', requireAdmin, (req, res) => {
  const delRecords = run(
    `DELETE FROM records WHERE account_id IN (SELECT a.id FROM accounts a WHERE ${IS_TEST_ACCOUNT_SQL})`);
  const delRewards = run(
    `DELETE FROM rewards WHERE account_id IN (SELECT a.id FROM accounts a WHERE ${IS_TEST_ACCOUNT_SQL})`);
  const delNonces = run(
    `DELETE FROM submission_nonces WHERE account_id IN (SELECT a.id FROM accounts a WHERE ${IS_TEST_ACCOUNT_SQL})`);
  const delAccounts = run(
    `DELETE FROM accounts AS a WHERE ${IS_TEST_ACCOUNT_SQL}`);

  res.send(page('Maintenance — Done', `
<h2 class="text-xl font-semibold mb-4">Test Data Deleted</h2>
<div class="bg-gray-800 rounded-xl p-6 space-y-2 text-sm">
  <p><span class="text-red-400 font-bold">🗑 ${delAccounts}</span> test accounts removed</p>
  <p><span class="text-red-400 font-bold">🗑 ${delRecords}</span> test records removed</p>
  <p><span class="text-red-400 font-bold">🗑 ${delRewards}</span> test rewards removed</p>
  <p><span class="text-red-400 font-bold">🗑 ${delNonces}</span> test nonces removed</p>
  <p class="text-green-400 mt-2">✅ Real player data was NOT affected.</p>
</div>
<div class="mt-4">
  <a href="/dashboard" class="text-purple-400 hover:underline text-sm">← Back to Dashboard</a>
</div>
`));
});

// ── Config Management ──
app.get('/config', requireAdmin, (_req, res) => {
  // 读取当前所有配置项
  const configs = all<{ key: string; value: string }>('SELECT key, value FROM config');
  const prayerThreshold = configs.find(c => c.key === 'prayer_reward_threshold')?.value || '0';

  // 构建配置项表格行
  const configRows = configs.map(c => `
    <tr class="border-b border-gray-700">
      <td class="py-3 px-4 font-mono text-sm text-purple-400">${esc(c.key)}</td>
      <td class="py-3 px-4 font-mono text-sm text-amber-400">${esc(c.value)}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${c.key === 'prayer_reward_threshold' ? '玩家祈祷次数 ≤ 此值时获得奖励（0 = 必须零祈祷 ACE）' : ''}</td>
    </tr>`).join('');

  res.send(page('Config', `
<h2 class="text-xl font-semibold mb-4">Config — 配置管理</h2>

<div class="bg-gray-800 rounded-xl overflow-hidden mb-8">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-4">配置项</th><th class="py-3 px-4">当前值</th><th class="py-3 px-4">说明</th>
  </tr></thead>
    <tbody>${configRows || '<tr><td colspan="3" class="py-6 text-center text-gray-600">暂无配置项</td></tr>'}</tbody></table>
</div>

<h3 class="text-lg font-semibold mb-4 text-gray-300">修改祈祷奖励阈值</h3>
<p class="text-sm text-gray-400 mb-4">
  设定玩家最多可用多少次祈祷仍然能获得奖励。<br>
  默认值 <code class="text-purple-400">0</code> 表示必须零祈祷（ACE）才能获得奖励。<br>
  例如设为 <code class="text-purple-400">3</code> 表示使用 ≤ 3 次祈祷也可获得奖励。
</p>

<form method="POST" action="/config" class="bg-gray-800 rounded-xl p-6 space-y-4 max-w-md">
  <div>
    <label class="block text-sm text-gray-400 mb-2">prayer_reward_threshold（祈祷奖励阈值）</label>
    <input name="prayer_reward_threshold" type="number" min="0" max="999" value="${escAttr(prayerThreshold)}" required
      class="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500" />
  </div>
  <button type="submit" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition">
    保存配置
  </button>
</form>
`));
});

app.post('/config', requireAdmin, (req, res) => {
  const threshold = parseInt(req.body.prayer_reward_threshold, 10);
  if (isNaN(threshold) || threshold < 0) {
    return res.send(page('Config — Error', `
<h2 class="text-xl font-semibold mb-4 text-red-400">配置更新失败</h2>
<p class="text-gray-400 mb-4">无效的阈值：必须是非负整数。</p>
<a href="/config" class="text-purple-400 hover:underline text-sm">← 返回配置</a>
`));
  }

  // 更新配置（INSERT OR REPLACE）
  run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['prayer_reward_threshold', String(threshold)]);

  res.send(page('Config — Updated', `
<h2 class="text-xl font-semibold mb-4 text-green-400">配置已更新</h2>
<div class="bg-gray-800 rounded-xl p-6 space-y-2 text-sm mb-4">
  <p><span class="text-gray-400">prayer_reward_threshold =</span> <span class="text-amber-400 font-bold font-mono">${threshold}</span></p>
  <p class="text-gray-300 mt-2">玩家祈祷次数 ≤ <span class="text-amber-400 font-bold">${threshold}</span> 时将获得奖励。</p>
  ${threshold === 0
    ? '<p class="text-yellow-400 text-xs mt-1">→ 当前为 ACE 模式：必须零祈祷。</p>'
    : `<p class="text-yellow-400 text-xs mt-1">→ 当前为宽松模式：最多允许 ${threshold} 次祈祷。</p>`}
</div>
<a href="/config" class="text-purple-400 hover:underline text-sm">← 返回配置</a>
`));
});

// ── Reward Config Management ──

// GET: 显示所有奖品模板列表 + 新增/编辑表单
app.get('/reward-config', requireAdmin, (req, res) => {
  const templates = all<{ id: string; rows: number; cols: number; name: string; name_en: string; source_ip: string; icon: string; content: string; content_en: string; type: string; hue: number; novel_index: number; next_rows: number; next_cols: number; content_kind: string; quality_status: string; image_candidates: string }>(
    // 最近更新（updated_at 非空）排最前，其次未验收排前，再按棋盘大小倒序
    `SELECT * FROM reward_templates ORDER BY (CASE WHEN updated_at != '' THEN 0 ELSE 1 END), updated_at DESC, (CASE WHEN quality_status NOT LIKE '%ok%' THEN 0 ELSE 1 END), rows DESC, cols DESC`);
  const editId = (req.query.edit as string) || '';
  const editTemplate = editId ? templates.find(t => t.id === editId) : null;
  // 筛选：?qs=name_bad|image_bad|ok 按质量状态筛选；?unreviewed=1 只显示未验收
  const qsFilter = (req.query.qs as string) || '';
  const showUnreviewed = req.query.unreviewed === '1';
  const filteredTemplates = (() => {
    let list = templates;
    if (showUnreviewed) {
      // 未验收 = quality_status 为空（三个单选项均未选择）
      list = list.filter(t => !(t.quality_status || ''));
    } else if (qsFilter) {
      list = list.filter(t => (t.quality_status || '') === qsFilter);
    }
    return list;
  })();

  // 当前筛选标签文本
  const filterLabel = showUnreviewed ? '未验收' : (qsFilter === 'name_bad' ? '名称简单' : (qsFilter === 'image_bad' ? '图片不对' : (qsFilter === 'ok' ? '验收通过' : '全部')));

  // 构建模板表格行
  const rows = filteredTemplates.map(t => {
    const kindLabel = ({ cover: '封面', preface: '自序', novel: '小说', item_lore: '道具' } as Record<string, string>)[t.content_kind] || t.content_kind || '—';
    const nextLabel = t.next_rows ? `${t.next_rows}×${t.next_cols}` : '—';
    // 质量状态：三个独立复选框，根据 quality_status 解析勾选状态
    const qs = t.quality_status || '';
    const isOk = qs.includes('ok');
    const isNameBad = qs.includes('name_bad');
    const isImageBad = qs.includes('image_bad');
    // 如果已验收通过，整行加绿色背景
    const rowBg = isOk ? ' bg-green-950/20' : '';
    const qsCheckboxes = `
      <div class="flex flex-col gap-1">
        <label class="flex items-center gap-1 text-[10px] text-amber-400 cursor-pointer hover:text-amber-300 whitespace-nowrap">
          <input type="radio" name="qs_${t.id}" value="name_bad" ${isNameBad ? 'checked' : ''} onchange="toggleQuality('${t.id}', 'name_bad', this)" class="cursor-pointer" /> 名称简单
        </label>
        <label class="flex items-center gap-1 text-[10px] text-blue-400 cursor-pointer hover:text-blue-300 whitespace-nowrap">
          <input type="radio" name="qs_${t.id}" value="image_bad" ${isImageBad ? 'checked' : ''} onchange="toggleQuality('${t.id}', 'image_bad', this)" class="cursor-pointer" /> 图片不对
        </label>
        <label class="flex items-center gap-1 text-[10px] text-green-400 cursor-pointer hover:text-green-300 whitespace-nowrap font-semibold">
          <input type="radio" name="qs_${t.id}" value="ok" ${isOk ? 'checked' : ''} onchange="toggleQuality('${t.id}', 'ok', this)" class="cursor-pointer" /> 验收通过
        </label>
      </div>`;
    // 候选图：v3.0 从 image_candidates JSON 字段读取（不再检查本地文件）
    // 当 icon 为空或格式不规范时，用 rows×cols 生成 fallback slug（保证候选图能正常显示）
    let iconSlug = t.icon ? (t.icon.match(/\/icons\/(.+)\.png$/)?.[1] || '') : '';
    if (!iconSlug && t.image_candidates) {
      iconSlug = `item-${t.rows}-${t.cols}`;
    }
    let candidateHTML = '';
    if (iconSlug && t.image_candidates) {
      try {
        const imgCands = JSON.parse(t.image_candidates);
        if (Array.isArray(imgCands) && imgCands.length > 0) {
          const items = [];
          for (let k = 0; k < Math.min(imgCands.length, 10); k++) {
            const c = imgCands[k];
            const srcLabel = c.source === 'wiki' ? 'Wiki' : c.source === 'ddg' ? 'DDG' : c.source === 'google' ? 'Google' : 'Bing';
            const rows = t.rows || 0;
            const cols = t.cols || 0;
            items.push(`<div class="relative group flex flex-col items-center gap-0.5">
              <img src="${escAttr(c.url)}" loading="lazy" referrerpolicy="no-referrer"
                class="w-[60px] h-[60px] object-cover rounded border border-gray-600 bg-gray-900 cursor-pointer hover:border-purple-400 transition-colors opacity-80 hover:opacity-100"
                onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
                onclick="event.stopPropagation();showZoom(this.src,'${escAttr(iconSlug)}',0)" />
              <span class="text-[9px] text-gray-500 truncate text-center">${srcLabel}</span>
              <div class="flex gap-0.5">
                <form method="POST" action="/reward-config/fetch-candidate" class="inline" onsubmit="event.stopPropagation();this.querySelector('button').disabled=true;this.querySelector('button').textContent='...'">
                  <input type="hidden" name="slug" value="${escAttr(iconSlug)}" />
                  <input type="hidden" name="url" value="${escAttr(c.url)}" />
                  <input type="hidden" name="rows" value="${rows}" />
                  <input type="hidden" name="cols" value="${cols}" />
                  <input type="hidden" name="noremgb" value="1" />
                  <button type="submit" class="text-[9px] bg-blue-700 hover:bg-blue-600 text-white px-1 py-0.5 rounded cursor-pointer leading-tight">选中</button>
                </form>
                <form method="POST" action="/reward-config/fetch-candidate" class="inline" onsubmit="event.stopPropagation();this.querySelector('button').disabled=true;this.querySelector('button').textContent='...'">
                  <input type="hidden" name="slug" value="${escAttr(iconSlug)}" />
                  <input type="hidden" name="url" value="${escAttr(c.url)}" />
                  <input type="hidden" name="rows" value="${rows}" />
                  <input type="hidden" name="cols" value="${cols}" />
                  <button type="submit" class="text-[9px] bg-purple-700 hover:bg-purple-600 text-white px-1.5 py-0.5 rounded cursor-pointer leading-tight">扣底</button>
                </form>
              </div>
            </div>`);
          }
          candidateHTML = `<div class="flex gap-1 mt-1" style="flex-wrap:wrap">${items.join('')}</div>
            <div class="text-[10px] text-gray-500 mt-1">${imgCands.length} 个候选 —「选中」设为图标 |「扣底」去背景 → 查看效果后手动「验收通过」</div>`;
        }
      } catch {}
    }

    return `
    <tr class="border-b border-gray-700 hover:bg-gray-800${rowBg}">
      <td class="py-3 px-3 font-mono text-sm text-amber-400">${t.rows}x${t.cols}</td>
      <td class="py-3 px-3 text-sm">
        <div class="flex flex-col gap-0">
          <div class="flex items-center gap-2">
            ${t.icon ? `<img src="${escAttr(t.icon)}" loading="lazy" data-slug="${escAttr(iconSlug)}" data-index="1" class="w-[200px] object-contain rounded border border-gray-600 bg-gray-900 cursor-pointer hover:scale-105 transition-transform" onerror="this.style.display='none'" onclick="event.stopPropagation();showZoom(this.src, '${escAttr(iconSlug)}', 1)" />` : ''}
            <span>${esc(t.name) || '<span class="text-gray-600">未设置</span>'}</span>
          </div>
          ${candidateHTML}
        </div>
      </td>
      <td class="py-3 px-3 text-xs text-gray-400">${esc(t.source_ip) || '—'}</td>
      <td class="py-3 px-3 text-xs text-gray-400 max-w-[120px] truncate">${esc(t.content) || '<span class="text-gray-600">—</span>'}</td>
      <td class="py-3 px-3 text-xs"><span class="px-2 py-0.5 rounded text-[10px] ${t.type === 'image' ? 'bg-blue-900 text-blue-300' : t.type === 'glitch' ? 'bg-purple-900 text-purple-300' : 'bg-green-900 text-green-300'}">${esc(t.type)}</span></td>
      <td class="py-3 px-3 text-xs text-gray-500">${t.hue}°</td>
      <td class="py-3 px-3 text-xs text-gray-400 font-mono">${t.novel_index >= 0 ? '#' + t.novel_index : '—'}</td>
      <td class="py-3 px-3 text-xs text-gray-400 font-mono">${kindLabel}</td>
      <td class="py-3 px-3 text-xs text-gray-400">${nextLabel}</td>
      <td class="py-3 px-3">${qsCheckboxes}</td>
      <td class="py-3 px-3 flex gap-2">
        <a href="/reward-config?edit=${t.id}" class="text-purple-400 hover:underline text-xs">编辑</a>
        <form method="POST" action="/reward-config/delete" class="inline" onsubmit="return confirm('确认删除 ${escAttr(t.rows + 'x' + t.cols)} 的奖品模板？')">
          <input type="hidden" name="id" value="${t.id}" />
          <button type="submit" class="text-red-400 hover:underline text-xs">删除</button>
        </form>
      </td>
    </tr>`;}).join('');

  // 编辑模式下预填值
  const formTitle = editTemplate ? `编辑奖品模板: ${editTemplate.rows}x${editTemplate.cols}` : '新增奖品模板';
  const formId = editTemplate?.id ?? '';
  const formRows = editTemplate?.rows ?? '';
  const formCols = editTemplate?.cols ?? '';
  const formName = editTemplate?.name ?? '';
  const formNameEn = editTemplate?.name_en ?? '';
  const formIcon = editTemplate?.icon ?? '';
  const formContent = editTemplate?.content ?? '';
  const formContentEn = editTemplate?.content_en ?? '';
  const formType = editTemplate?.type ?? 'text';
  const formHue = editTemplate?.hue ?? 0;
  const rowsColsReadonly = editTemplate ? 'readonly' : '';

  const typeOptions = ['text', 'image', 'glitch'].map(v =>
    `<option value="${v}" ${formType === v ? 'selected' : ''}>${v}</option>`).join('');

  res.send(page('Reward Config', `
<h2 class="text-xl font-semibold mb-4">Reward Config — 奖品模板配置</h2>

<p class="text-sm text-gray-400 mb-6">
  为每种棋盘尺寸配置奖品信息。玩家达成条件后，将从对应模板读取名称、图标和文字内容写入奖品记录。<br>
  模板为空时，默认使用「ACE」作为奖品标题。
</p>

<!-- 字段说明 -->
<div class="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-4 text-xs text-gray-400 space-y-1">
  <p><span class="text-purple-400 font-semibold">类型</span> — <code>text</code> 文本 / <code>image</code> 图片（如9×9封面）/ <code>glitch</code> 故障风文字特效</p>
  <p><span class="text-purple-400 font-semibold">色调</span> — 宝物卡片背景色相 (0-360)，控制卡片颜色风格</p>
  <p><span class="text-purple-400 font-semibold">阅读#</span> — 在小说阅读链中的序号；<code>-1</code> 表示不参与阅读链（边缘格）</p>
  <p><span class="text-purple-400 font-semibold">分类</span> — <code>cover</code> 封面 / <code>preface</code> 自序 / <code>novel</code> 小说段落 / <code>item_lore</code> 道具说明</p>
  <p><span class="text-purple-400 font-semibold">下一章</span> — 阅读链中下一个宝物的棋盘尺寸；<code>0×0</code> 表示已是最后一章或无阅读链</p>
</div>

  <!-- 模板列表 -->
<h3 class="text-lg font-semibold mb-3 text-gray-300 flex items-center gap-2 flex-wrap">
  现有模板 (${filteredTemplates.length}${showUnreviewed || qsFilter ? ' / 共' + templates.length : ''})
  <span class="text-xs text-gray-500">|</span>
  <span class="text-xs text-gray-400">${filterLabel}</span>
  <a href="/reward-config" class="text-xs ${!showUnreviewed && !qsFilter ? 'bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} px-2 py-1 rounded font-normal transition-colors">全部</a>
  <a href="/reward-config?unreviewed=1" class="text-xs ${showUnreviewed ? 'bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} px-2 py-1 rounded font-normal transition-colors">未验收</a>
  <a href="/reward-config?qs=name_bad" class="text-xs ${qsFilter === 'name_bad' ? 'bg-amber-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} px-2 py-1 rounded font-normal transition-colors">名称简单</a>
  <a href="/reward-config?qs=image_bad" class="text-xs ${qsFilter === 'image_bad' ? 'bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} px-2 py-1 rounded font-normal transition-colors">图片不对</a>
  <a href="/reward-config?qs=ok" class="text-xs ${qsFilter === 'ok' ? 'bg-green-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} px-2 py-1 rounded font-normal transition-colors">验收通过</a>
  <span class="text-xs text-gray-500">|</span>
  <form method="GET" action="/reward-config/fetch-next" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='补图中…';" style="display:inline">
    <button type="submit" class="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1 rounded font-normal transition-colors cursor-pointer">🔧 补图</button>
  </form>
  <form method="GET" action="/reward-config/refix-names" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='重找中…';" style="display:inline">
    <button type="submit" class="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded font-normal transition-colors cursor-pointer">🔧 重找</button>
  </form>
  <span class="text-xs text-gray-500">|</span>
  <button type="button" onclick="bulkMarkNameBad(event)" class="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded font-normal transition-colors cursor-pointer">📋 全标名简</button>
  <span class="text-xs text-gray-500">| 自动</span>
  <span id="autoUnifiedLabel" class="text-xs cursor-pointer select-none px-2 py-1 rounded" style="background:#${autoUnified ? '22c55e' : '374151'}" onclick="fetch('/reward-config/auto-unified/toggle').then(r=>r.json()).then(d=>{document.getElementById('autoUnifiedLabel').style.background=d.on?'#22c55e':'#374151';document.getElementById('autoUnifiedLabel').textContent='自动处理'+(d.on?' ✓':'')})">自动处理${autoUnified ? ' ✓' : ''}</span>
</h3>
<!-- 子进程监控面板，每 5 秒自动刷新 -->
<div id="procMonitor" style="background:#1f2937;border-radius:0.5rem;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#9ca3af;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
  <span>🔄 加载中…</span>
</div>
<script>
(function(){const el=document.getElementById('procMonitor');let tmr;
function fmtTime(t){if(!t)return'--';const d=new Date(t);const h=String(d.getHours()).padStart(2,'0');const m=String(d.getMinutes()).padStart(2,'0');const s=String(d.getSeconds()).padStart(2,'0');return h+':'+m+':'+s;}
function okBadge(ok){return ok?'<span style="color:#22c55e">✓</span>':'<span style="color:#ef4444">✗</span>';}
function activeBadge(n,label){return n>0?'<span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold">'+n+' '+label+'运行中</span>':'<span style="color:#6b7280">0 '+label+'</span>';}
function refresh(){fetch('/reward-config/process-status').then(r=>r.json()).then(d=>{
const parts=[
'<b style="color:#e5e7eb">子进程:</b>',
activeBadge(d.refixActive,'重找'),
activeBadge(d.fetchActive,'图标下载'),
'<b style="color:#e5e7eb;margin-left:6px">累计:</b> <span style="color:#fbbf24">重找'+d.refixDone+'</span> <span style="color:#fbbf24">补图'+d.fetchDone+'</span>',
'<b style="color:#e5e7eb;margin-left:6px">待处理:</b> <span style="color:#f87171">name_bad '+d.nameBadCount+'</span> <span style="color:#f87171">需补图 '+d.imageBadCount+'</span>',
'<span style="color:#6b7280;margin-left:6px">上次重找 '+okBadge(d.lastRefixOk)+' '+fmtTime(d.lastRefixAt)+'</span>',
'<span style="color:#6b7280">上次补图 '+okBadge(d.lastFetchOk)+' '+fmtTime(d.lastFetchAt)+'</span>',
];
el.innerHTML=parts.join(' ');
}).catch(()=>{el.innerHTML='<span style="color:#ef4444">⚠ 获取状态失败</span>';});
tmr=setTimeout(refresh,5000);}
refresh();
})();</script>
<div class="bg-gray-800 rounded-xl overflow-hidden mb-8">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-3">棋盘</th><th class="py-3 px-3">名称</th><th class="py-3 px-3">来源</th><th class="py-3 px-3">文字</th><th class="py-3 px-3">类型</th><th class="py-3 px-3">色调</th><th class="py-3 px-3">阅读#</th><th class="py-3 px-3">分类</th><th class="py-3 px-3">下一章</th><th class="py-3 px-3">质量</th><th class="py-3 px-3">操作</th>
  </tr></thead>
    <tbody>${rows || '<tr><td colspan="11" class="py-6 text-center text-gray-600">暂无奖品模板，请在下方新增</td></tr>'}</tbody></table>
</div>

<!-- 新增/编辑表单 -->
<h3 class="text-lg font-semibold mb-4 text-gray-300">${formTitle}</h3>
<form method="POST" action="/reward-config" class="bg-gray-800 rounded-xl p-6 space-y-4 max-w-lg">
  ${formId ? `<input type="hidden" name="id" value="${escAttr(formId)}" />` : ''}
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="block text-sm text-gray-400 mb-1">行数 (Rows)</label>
      <input name="rows" type="number" min="8" max="25" value="${formRows}" ${rowsColsReadonly} required
        class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
    </div>
    <div>
      <label class="block text-sm text-gray-400 mb-1">列数 (Cols)</label>
      <input name="cols" type="number" min="8" max="25" value="${formCols}" ${rowsColsReadonly} required
        class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
    </div>
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">奖品名称 (Name)</label>
    <input name="name" type="text" maxlength="64" value="${escAttr(formName)}" placeholder="例如: 火之魔典"
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">英文名称 (Name EN)</label>
    <input name="name_en" type="text" maxlength="128" value="${escAttr(formNameEn)}" placeholder="例如: Tome of Fire"
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">来源游戏 (Source IP)</label>
    <input name="source_ip" type="text" maxlength="64" value="${escAttr(editTemplate?.source_ip ?? '')}" placeholder="例如: 魔兽世界"
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">图标 (Icon) — 图片路径</label>
    <input name="icon" id="iconInput" type="text" maxlength="128" value="${escAttr(formIcon)}" placeholder="例如: /icons/wow-thunderfury.png"
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
      oninput="document.getElementById('iconPreview').src=this.value||'';document.getElementById('iconPreviewWrap').style.display=this.value?'block':'none'" />
    <div id="iconPreviewWrap" class="mt-2 ${formIcon ? '' : 'hidden'}" style="display:${formIcon ? 'block' : 'none'}">
      <img id="iconPreview" src="${escAttr(formIcon)}" class="w-16 h-16 object-contain rounded border border-gray-600 bg-gray-900 cursor-pointer hover:scale-110 transition-transform" onerror="this.parentElement.style.display='none'" onclick="showZoom(this.src, '', 1)" />
      <span class="text-xs text-gray-500 ml-1">预览</span>
    </div>
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">描述文字 (Content)</label>
    <textarea name="content" rows="6" maxlength="3000" placeholder="奖品描述文本或阅读篇章..."
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm resize-none">${esc(formContent)}</textarea>
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">英文描述文字 (Content EN)</label>
    <textarea name="content_en" rows="3" maxlength="1000" placeholder="English description..."
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm resize-none">${esc(formContentEn)}</textarea>
  </div>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="block text-sm text-gray-400 mb-1">显示类型 (Type)</label>
      <select name="type" class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm">${typeOptions}</select>
    </div>
    <div>
      <label class="block text-sm text-gray-400 mb-1">色调 (Hue 0-360)</label>
      <input name="hue" type="number" min="0" max="360" value="${formHue}"
        class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
    </div>
  </div>
  ${editTemplate ? `
  <!-- 生成字段（只读，由脚本自动填充） -->
  <div class="bg-gray-900/50 border border-gray-700 rounded-lg p-3 space-y-2">
    <p class="text-xs text-gray-500 uppercase tracking-wide">生成字段（只读）</p>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">阅读链序号:</span> <span class="text-amber-400 font-mono">${editTemplate.novel_index >= 0 ? '#' + editTemplate.novel_index : '—'}</span></div>
      <div><span class="text-gray-500">内容分类:</span> <span class="text-purple-400 font-mono">${editTemplate.content_kind || '—'}</span></div>
      <div><span class="text-gray-500">下一章:</span> <span class="text-green-400 font-mono">${editTemplate.next_rows ? editTemplate.next_rows + '×' + editTemplate.next_cols : '—'}</span></div>
    </div>
  </div>
  ` : ''}
  <div class="flex gap-3">
    <button type="submit" class="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition text-sm">
      ${editTemplate ? '保存修改' : '新增模板'}
    </button>
    ${editTemplate ? `<a href="/reward-config" class="py-3 px-6 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition text-sm">取消编辑</a>` : ''}
  </div>
</form>

<!-- 图片放大预览遮罩层：点击图标后可全屏查看大图，支持滚轮缩放 + 下方左右切换候选图 -->
<div id="zoomOverlay" class="hidden fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm" onclick="hideZoom()">
  <button class="absolute top-4 right-4 text-white bg-black/50 p-3 rounded-full hover:bg-black/80 z-10 text-xl leading-none" onclick="event.stopPropagation();hideZoom()">✕</button>
  <img id="zoomImage" src="" class="rounded-lg shadow-2xl" style="max-width:90vw;max-height:80vh;object-fit:contain;transition:transform 0.1s ease" />
  <!-- 控制栏：下方一行，◀ 序号 ▶，点击不关闭遮罩 -->
  <div class="flex items-center gap-6 mt-4" onclick="event.stopPropagation()">
    <button id="zoomPrev" class="text-white bg-white/10 hover:bg-white/25 px-4 py-2 rounded-full z-10 text-xl leading-none transition-colors hidden" onclick="event.stopPropagation();zoomNavigate(-1)">◀</button>
    <span id="zoomIndex" class="text-white/70 text-sm z-10 hidden"></span>
    <button id="zoomNext" class="text-white bg-white/10 hover:bg-white/25 px-4 py-2 rounded-full z-10 text-xl leading-none transition-colors hidden" onclick="event.stopPropagation();zoomNavigate(1)">▶</button>
    <!-- 选这张按钮：把当前预览的候选图设为主图标 -->
    <button id="zoomSelect" class="text-white bg-green-600 hover:bg-green-500 px-5 py-2 rounded-full z-10 text-sm font-bold transition-colors hidden" onclick="event.stopPropagation();selectFromZoom()">✓ 选这张</button>
  </div>
</div>
<script>
  // 鼠标滚轮缩放：在预览图片上滚动即可放大/缩小
  let zoomScale = 1;
  let zoomSlug = '';       // 当前预览的宝物 slug
  let zoomIndex = 1;       // 当前预览的候选图序号 (1~5)
  document.getElementById('zoomImage').addEventListener('wheel', function(e) {
    e.preventDefault();
    e.stopPropagation();
    zoomScale = Math.max(0.5, Math.min(5, zoomScale - e.deltaY * 0.002));
    this.style.transform = 'scale(' + zoomScale + ')';
  });

  /** 更新箭头的显示/隐藏 */
  function updateZoomArrows() {
    var hasSlug = zoomSlug && zoomSlug.length > 0;
    document.getElementById('zoomPrev').classList.toggle('hidden', !hasSlug || zoomIndex <= 1);
    document.getElementById('zoomNext').classList.toggle('hidden', !hasSlug || zoomIndex >= 5);
    // 选这张按钮：只要有候选图就显示
    document.getElementById('zoomSelect').classList.toggle('hidden', !hasSlug);
    var idxEl = document.getElementById('zoomIndex');
    if (hasSlug) {
      idxEl.textContent = zoomIndex + ' / 5';
      idxEl.classList.remove('hidden');
    } else {
      idxEl.classList.add('hidden');
    }
  }

  /** 从缩放预览中选取当前候选图作为主图标 */
  async function selectFromZoom() {
    if (!zoomSlug || zoomIndex < 1 || zoomIndex > 5) return;
    try {
      var r = await fetch('/reward-config/icon-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: zoomSlug, index: zoomIndex }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // 刷新页面上该宝物的主图标（200px 大图）
      var mainImg = document.querySelector('img[data-slug="' + zoomSlug + '"][data-index="1"]');
      if (mainImg) {
        mainImg.src = '/icons/' + zoomSlug + '.png?' + Date.now();
      }
      // 更新该宝物所有候选缩略图的边框高亮
      document.querySelectorAll('img[data-slug="' + zoomSlug + '"]').forEach(function(img) {
        var idx = parseInt(img.getAttribute('data-index'));
        if (idx === zoomIndex) {
          img.className = img.className.replace(/border-gray-600|border-green-400/g, '') + ' border-green-400 shadow-green-500/30 shadow opacity-100';
        } else {
          img.className = img.className.replace(/border-gray-600|border-green-400/g, '') + ' border-gray-600 opacity-70';
        }
      });
      // 关闭缩放预览
      hideZoom();
    } catch(e) {
      alert('选取失败: ' + e.message);
    }
  }

  /** 切换到上一张或下一张候选图 */
  function zoomNavigate(delta) {
    var newIdx = zoomIndex + delta;
    if (newIdx < 1 || newIdx > 5) return;
    var src = '/icons/' + zoomSlug + '_' + newIdx + '.png';
    var img = document.getElementById('zoomImage');
    // 先试着加载，失败则跳过继续尝试
    var testImg = new Image();
    testImg.onload = function() {
      zoomIndex = newIdx;
      zoomScale = 1;
      img.src = src;
      img.style.transform = 'scale(1)';
      updateZoomArrows();
    };
    testImg.onerror = function() {
      // 当前序号不存在，继续向同方向跳
      zoomIndex = newIdx; // 推进索引以免死循环
      zoomNavigate(delta);
    };
    testImg.src = src;
  }

  function showZoom(src, slug, idx) {
    zoomScale = 1;
    zoomSlug = slug || '';
    zoomIndex = idx || 1;
    var img = document.getElementById('zoomImage');
    img.src = src;
    img.style.transform = 'scale(1)';
    updateZoomArrows();
    document.getElementById('zoomOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function hideZoom() {
    document.getElementById('zoomOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { hideZoom(); return; }
    if (e.key === 'ArrowLeft')  { zoomNavigate(-1); return; }
    if (e.key === 'ArrowRight') { zoomNavigate(1); return; }
  });
  // 候选图选取：POST 到服务器，把 {slug}_N.png 复制为 {slug}.png
  async function selectCandidate(slug, index, el) {
    try {
      const r = await fetch('/reward-config/icon-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, index }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // 刷新主图标（不刷新整页，只替换同行的主图 src）
      const row = el.closest('tr');
      const mainImg = row.querySelector('img:not([data-index])');
      if (mainImg) mainImg.src = '/icons/' + slug + '.png?' + Date.now();
      // 更新候选图边框高亮
      row.querySelectorAll('img[data-slug="' + slug + '"]').forEach(img => {
        const idx = parseInt(img.getAttribute('data-index'));
        if (idx === index) {
          img.className = img.className.replace(/border-gray-600|border-green-400/g, '') + ' border-green-400 shadow-green-500/30 shadow opacity-100';
        } else {
          img.className = img.className.replace(/border-gray-600|border-green-400/g, '') + ' border-gray-600 opacity-70';
        }
      });
    } catch(e) {
      alert('选取失败: ' + e.message);
    }
  }
  // 单选切换质量标记：三选一（名称简单 / 图片不对 / 验收通过），每个 id 只能有一个状态
  async function toggleQuality(id, tag, radio) {
    // 如果点击的是已选中的单选按钮 → 取消选择（设为 ''）
    const row = radio.closest('tr');
    const status = radio.checked ? tag : '';
    // 如果取消选中，需要手动清空 radio group
    if (!radio.checked) {
      row.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
    }
    try {
      const r = await fetch('/reward-config/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // 非空时刷新页面以更新行背景色等
      location.reload();
    } catch(e) {
      alert('保存失败: ' + e.message);
      location.reload();
    }
  }
  // 批量将所有未验收宝物标记为「名称简单」
  async function bulkMarkNameBad(event) {
    // 按钮置灰防连点
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '标记中…';
    // 二次确认
    if (!confirm('确定要将所有「未验收」的宝物全部标记为「名称简单」吗？\\n\\n旧名称会被加入黑名单，之后可通过「自动处理」或手动「重找」来替换名称。')) {
      btn.disabled = false;
      btn.textContent = '📋 全标名简';
      return;
    }
    try {
      const r = await fetch('/reward-config/bulk-name-bad', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
      alert('已完成：' + d.count + ' 个宝物标记为名称简单，黑名单新增 ' + d.blacklistAdded + ' 个名称');
      location.reload();
    } catch(e) {
      alert('批量标记失败: ' + e.message);
      btn.disabled = false;
      btn.textContent = '📋 全标名简';
    }
  }
</script>
`));
});

// POST: 新增或更新奖品模板
app.post('/reward-config', requireAdmin, (req, res) => {
  const { id, rows, cols, name, name_en, source_ip, icon, content, content_en, type, hue, novel_index, next_rows, next_cols, content_kind } = req.body;
  const r = parseInt(rows), c = parseInt(cols), h = parseInt(hue) || 0;
  const ni = parseInt(novel_index) ?? -1;
  const nr = parseInt(next_rows) || 0;
  const nc = parseInt(next_cols) || 0;

  if (isNaN(r) || isNaN(c) || r < 8 || c < 8 || r > 25 || c > 25) {
    return res.send(page('Reward Config — Error', `
<h2 class="text-xl font-semibold mb-4 text-red-400">操作失败</h2>
<p class="text-gray-400 mb-4">无效的行列值（范围 8-25）。</p>
<a href="/reward-config" class="text-purple-400 hover:underline text-sm">← 返回</a>`));
  }

  // 如果是编辑已有模板，使用原 id；否则生成新 id
  const templateId = id || `${r}-${c}`;

  // 检查该尺寸是否已有其他模板（防止新增重复）
  if (!id) {
    const existing = get('SELECT id FROM reward_templates WHERE rows = ? AND cols = ?', [r, c]);
    if (existing) {
      return res.send(page('Reward Config — Error', `
<h2 class="text-xl font-semibold mb-4 text-red-400">操作失败</h2>
<p class="text-gray-400 mb-4">棋盘 ${r}x${c} 已有奖品模板，请编辑而非新增。</p>
<a href="/reward-config" class="text-purple-400 hover:underline text-sm">← 返回</a>`));
    }
  }

  if (id) {
    // 编辑已有模板：仅更新管理员可修改字段，保留生成字段
    run(
      `UPDATE reward_templates SET rows=?, cols=?, name=?, name_en=?, source_ip=?, icon=?, content=?, content_en=?, type=?, hue=?
       WHERE id=?`,
      [r, c, name || '', name_en || '', source_ip || '', icon || '', content || '', content_en || '', type || 'text', h, templateId],
    );
  } else {
    // 新增模板：生成字段留默认值
    run(
      `INSERT INTO reward_templates (id, rows, cols, name, name_en, source_ip, icon, content, content_en, type, hue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [templateId, r, c, name || '', name_en || '', source_ip || '', icon || '', content || '', content_en || '', type || 'text', h],
    );
  }

  res.redirect('/reward-config');
});

// POST: 选图 — 用户从候选图中选取一张作为主图标
app.post('/reward-config/icon-select', requireAdmin, (req, res) => {
  const { slug, index } = req.body;
  if (!slug || typeof index !== 'number' || index < 1 || index > 5) {
    return res.status(400).json({ error: 'slug + index (1~5) required' });
  }
  const srcDir = path.join(__dirname, '..', '..', 'resource', 'icons');
  const pubDir = path.join(__dirname, '..', '..', 'public', 'icons');
  const candSrc = path.join(srcDir, `${slug}_${index}.png`);
  const targetSrc = path.join(srcDir, `${slug}.png`);
  const targetPub = path.join(pubDir, `${slug}.png`);
  if (!fs.existsSync(candSrc)) return res.status(404).json({ error: '候选图不存在' });
  try {
    fs.copyFileSync(candSrc, targetSrc);
    fs.copyFileSync(candSrc, targetPub);
    console.log(`[icon-select] ${slug} ← 候选${index}`);
    res.json({ ok: true, icon: `/icons/${slug}.png` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST: 单独更新质量标记（AJAX）
app.post('/reward-config/quality', requireAdmin, (req, res) => {
  const { id, status } = req.body;
  const allowed = ['', 'ok', 'name_bad', 'image_bad'];
  if (!id || !allowed.includes(status)) {
    return res.status(400).json({ error: '无效参数' });
  }
  // 若选择了「验收通过」且之前不是：清理 resource/icons/ 中所有相关文件，public/icons/ 只保留主图标
  if (status === 'ok') {
    const old = get('SELECT quality_status, icon FROM reward_templates WHERE id = ?', [id]) as { quality_status?: string; icon?: string } | undefined;
    if (old && !(old.quality_status || '').includes('ok')) {
      const slug = (old.icon || '').match(/\/icons\/(.+)\.png$/)?.[1];
      if (slug) {
        const resourceDir = path.join(__dirname, '..', '..', 'resource', 'icons');
        const publicDir = path.join(__dirname, '..', '..', 'public', 'icons');
        let del = 0;
        // 删除 resource/icons/ 下所有相关文件（主图标 + 候选图 _1～_5），验收通过后 resource/ 可安全删除
        for (const suffix of ['', ...Array.from({length: 5}, (_, i) => `_${i + 1}`)]) {
          const fp = path.join(resourceDir, `${slug}${suffix}.png`);
          try { if (fs.existsSync(fp)) { fs.unlinkSync(fp); del++; } } catch {}
        }
        // 删除 public/icons/ 下的候选图（_1～_5），保留主图标作为永久存储
        for (let k = 1; k <= 5; k++) {
          const fp = path.join(publicDir, `${slug}_${k}.png`);
          try { if (fs.existsSync(fp)) { fs.unlinkSync(fp); del++; } } catch {}
        }
        if (del > 0) console.log(`[quality] 验收通过，已清理资源文件: ${slug} (删除${del}个文件，主图标保留在 public/icons/ 中)`);
      }
    }
  }
  // 若选择了「名称简单」且之前不是：将该宝物名加入黑名单
  if (status === 'name_bad') {
    const old = get('SELECT quality_status, name FROM reward_templates WHERE id = ?', [id]) as { quality_status?: string; name?: string } | undefined;
    if (old && !(old.quality_status || '').includes('name_bad') && old.name) {
      const BL_PATH = path.join(__dirname, '..', '..', 'scripts', 'artifacts', '_name_blacklist.json');
      let bl = [];
      try { bl = JSON.parse(fs.readFileSync(BL_PATH, 'utf-8')); } catch {}
      if (!bl.includes(old.name)) {
        bl.push(old.name);
        fs.writeFileSync(BL_PATH, JSON.stringify(bl, null, 2), 'utf-8');
        console.log(`[quality] 黑名单 +1: ${old.name}`);
      }
    }
  }
  // 验收通过时清除 image_candidates 和资源文件
  if (status === 'ok') {
    run(`UPDATE reward_templates SET quality_status = 'ok', image_candidates = '' WHERE id = ?`, [id]);
  } else if (status === 'image_bad') {
    // 标记图片不对：保留 icon 字段供搜图参考，保留 image_candidates 供重搜排除旧 URL
    // quality_status = image_bad，自动补图 worker 识别后读取旧候选 URL 加入 --exclude-urls 重搜
    run(`UPDATE reward_templates SET quality_status = 'image_bad', updated_at = datetime('now') WHERE id = ?`, [id]);
  } else {
    run('UPDATE reward_templates SET quality_status = ? WHERE id = ?', [status, id]);
  }
  saveDb();
  res.json({ ok: true });
});

// POST: 批量将所有「未验收」宝物标记为「名称简单」
// 遍历 quality_status 为空的所有宝物，将其名称加入黑名单并设置 quality_status = 'name_bad'
app.post('/reward-config/bulk-name-bad', requireAdmin, (req, res) => {
  try {
    // 查询所有未验收的宝物（quality_status 为空字符串或 NULL）
    const unreviewed = all(
      `SELECT id, name, rows, cols FROM reward_templates WHERE quality_status IS NULL OR quality_status = ''`
    ) as { id: string; name: string; rows: number; cols: number }[];

    if (unreviewed.length === 0) {
      return res.json({ ok: true, count: 0, message: '没有未验收的宝物' });
    }

    // 读取黑名单
    const BL_PATH = path.join(__dirname, '..', '..', 'scripts', 'artifacts', '_name_blacklist.json');
    let bl: string[] = [];
    try { bl = JSON.parse(fs.readFileSync(BL_PATH, 'utf-8')); } catch {}

    let addedCount = 0;
    for (const t of unreviewed) {
      if (!t.name) continue;
      // 已存在的不重复添加
      if (!bl.includes(t.name)) {
        bl.push(t.name);
        addedCount++;
      }
      // 标记为 name_bad
      run(`UPDATE reward_templates SET quality_status = 'name_bad', updated_at = datetime('now') WHERE id = ?`, [t.id]);
    }

    // 写回黑名单
    fs.writeFileSync(BL_PATH, JSON.stringify(bl, null, 2), 'utf-8');
    saveDb();

    console.log(`[bulk-name-bad] 共 ${unreviewed.length} 个未验收宝物 → name_bad，黑名单新增 ${addedCount} 个名称`);
    res.json({ ok: true, count: unreviewed.length, blacklistAdded: addedCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET: 补图 — 每次只处理 1 个「图片不对」宝物，删旧图 → 搜候选 → 下载首图 → 更新 → 刷新
// v3.0: fetch-real-icons.mjs 只输出 CANDIDATES JSON（不写文件），本路由负责解析并下载
app.get('/reward-config/fetch-next', requireAdmin, async (_req, res) => {
  const { execSync } = require('child_process') as typeof import('child_process');
  const root = path.join(__dirname, '..', '..');
  const sharp = require('sharp');

  try {
    // 优先 image_bad（用户明确标记），其次空状态（无图标，无需用户手动点图片不对）
    // 排除 image_processing，避免和自动补图 worker 冲突
    // 需要 rows/cols 用于精确 DB 更新（避免 slug 碰撞导致多行命中）
    const rows = all(`SELECT rows, cols, icon, quality_status FROM reward_templates WHERE (quality_status LIKE '%image_bad%' OR quality_status IS NULL OR quality_status = '') AND quality_status != 'image_processing' ORDER BY (CASE WHEN quality_status LIKE '%image_bad%' THEN 0 ELSE 1 END), (CASE WHEN updated_at = '' THEN 0 ELSE 1 END), updated_at ASC, rows DESC, cols DESC LIMIT 1`) as { rows: number; cols: number; icon: string; quality_status: string }[];
    if (rows.length === 0) return res.redirect('/reward-config?unreviewed=1');
    const row = rows[0];
    const slug = row.icon.match(/\/icons\/(.+)\.png$/)?.[1];
    if (!slug) return res.redirect('/reward-config?unreviewed=1');
    console.log(`[fetch-next] 补图: ${row.rows}×${row.cols} (${slug})`);

    // 删旧图标主文件 + 所有候选图文件（1-5），避免残留
    for (const dir of ['resource/icons', 'public/icons']) {
      for (const suffix of ['', ...Array.from({length: 5}, (_, i) => `_${i + 1}`)]) {
        const fp = path.join(root, dir, `${slug}${suffix}.png`);
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
      }
    }

    // v3.0: 调用 fetch-real-icons.mjs 搜索候选 URL（只用 --coords 精确定位，避免占位图 slug 碰撞）
    // stderr 含日志，stdout 含 CANDIDATES JSON
    const stdout = execSync(`node --max-old-space-size=512 scripts/artifacts/fetch-real-icons.mjs --coords="${row.rows}-${row.cols}"`, {
      cwd: root, timeout: 120000, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, env: { ...process.env }
    });

    // 解析 CANDIDATES JSON 行（取最后一条，防止多行干扰）
    const lines = stdout.trim().split('\n').filter(l => l.startsWith('CANDIDATES='));
    const lastLine = lines[lines.length - 1] || '';
    const candidatesStr = lastLine.startsWith('CANDIDATES=') ? lastLine.substring(11) : '';

    if (!candidatesStr) {
      // 无候选 URL：标记 image_bad，避免无限重试
      run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
      saveDb();
      return res.status(500).send(`补图无结果: ${slug}（无 Wiki 覆盖且搜索引擎均无结果）`);
    }

    const data = JSON.parse(candidatesStr);

    // 坐标交叉校验：防止子进程因 slug 碰撞返回错误宝物的候选图（串货防护）
    const verifyCoords = `${data.rows}-${data.cols}`;
    const expectCoords = `${row.rows}-${row.cols}`;
    if (verifyCoords !== expectCoords) {
      console.log(`[fetch-next] 串货警报: 期望 ${expectCoords} 实际 ${verifyCoords} (${data.slug}), 丢弃`);
      run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
      saveDb();
      return res.status(500).send(`串货警报: 子进程返回错误坐标 ${verifyCoords}，期望 ${expectCoords}`);
    }

    const candidates = (data.candidates || []) as { url: string; source: string }[];
    if (candidates.length === 0) {
      run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
      saveDb();
      return res.status(500).send(`补图无结果: ${slug}（候选列表为空）`);
    }

    // 存入 image_candidates 字段（保留所有候选供用户备用选择）
    run(`UPDATE reward_templates SET image_candidates = ?, updated_at = datetime('now') WHERE rows=? AND cols=?`,
      [JSON.stringify(candidates), row.rows, row.cols]);
    saveDb();

    // 自动下载第一个候选图（复用 fetch-candidate 的 httpGetBuffer → rembg → sharp 流水线）
    console.log(`[fetch-next] 尝试下载候选: ${candidates[0].url}`);
    const body = await httpGetBuffer(candidates[0].url, 20000);
    if (!body || body.length < 200) {
      // 下载失败但候选已存 DB，用户可手动选别的候选
      return res.redirect('/reward-config?unreviewed=1');
    }

    // 保存临时下载原图
    const tmpDir = path.join(root, 'resource', 'icons');
    fs.mkdirSync(tmpDir, { recursive: true });
    const pubDir = path.join(root, 'public', 'icons');
    fs.mkdirSync(pubDir, { recursive: true });
    const tmpRaw = path.join(tmpDir, `_dl_${Date.now()}.png`);
    const tmpRemoved = path.join(tmpDir, `_bg_${Date.now()}.png`);
    const outPath = path.join(tmpDir, `${slug}.png`);
    const pubPath = path.join(pubDir, `${slug}.png`);
    fs.writeFileSync(tmpRaw, body);

    // rembg 扣底（失败不致命，直接缩放原图）
    let sourceForResize = tmpRaw;
    try {
      execSync(`rembg i "${tmpRaw}" "${tmpRemoved}"`, { timeout: 60000, stdio: 'pipe' });
      if (fs.existsSync(tmpRemoved) && fs.statSync(tmpRemoved).size > 500) {
        sourceForResize = tmpRemoved;
      }
    } catch { /* rembg 失败不致命，继续用原图 */ }

    // sharp 缩放为 500×500 透明 PNG
    await sharp(sourceForResize)
      .resize(500, 500, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    fs.copyFileSync(outPath, pubPath);

    // 清理临时文件
    try { fs.unlinkSync(tmpRaw); } catch {}
    if (sourceForResize !== tmpRaw) try { fs.unlinkSync(sourceForResize); } catch {}

    // 更新 DB：保存图标路径 + 清除候选链接
    run(`UPDATE reward_templates SET icon = ?, image_candidates = '', updated_at = datetime('now'), quality_status = '' WHERE rows=? AND cols=?`,
      [`/icons/${slug}.png`, row.rows, row.cols]);
    saveDb();
    console.log(`[fetch-next] 补图完成: ${slug}`);

    return res.redirect('/reward-config?unreviewed=1');
  } catch (e: any) {
    return res.status(500).send(`补图失败: ${e.message || e}`);
  }
});
/** 简易 HTTP/HTTPS GET 下载（返回 Buffer），供 fetch-candidate 路由使用 */
async function httpGetBuffer(urlStr: string, timeout = 20000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = urlStr.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(urlStr, { timeout, headers: { 'User-Agent': 'CursedMinesweeper/1.0' } }, (res: any) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}
// POST: 下载候选图 → rembg 扣底 → sharp 缩放 → 保存为默认图标（Admin 面板用）
// 参数 noremgb=1 时跳过 rembg，仅下载+缩放（用于「选中」按钮）
app.post('/reward-config/fetch-candidate', requireAdmin, async (req, res) => {
  const { execSync } = require('child_process') as typeof import('child_process');
  const root = path.join(__dirname, '..', '..');
  const slug = (req.body.slug || '').trim();
  const url = (req.body.url || '').trim();
  const rows = parseInt(req.body.rows || '0', 10);
  const cols = parseInt(req.body.cols || '0', 10);
  const noRembg = req.body.noremgb === '1';
  if (!slug || !url) return res.status(400).send('缺少 slug 或 url');
  try {
    // 坐标交叉校验：从 DB 查询当前 icon 提取真实 slug，防御前端传错 slug 导致文件写错位置
    let realSlug = slug;
    if (rows > 0 && cols > 0) {
      const dbRow = get(`SELECT icon FROM reward_templates WHERE rows=? AND cols=?`, [rows, cols]) as { icon?: string } | undefined;
      const dbSlug = dbRow?.icon?.match(/\/icons\/(.+)\.png$/)?.[1];
      if (dbSlug && dbSlug !== slug) {
        console.log(`[fetch-candidate] slug 不匹配: 请求 ${slug} DB 中为 ${dbSlug}，以 DB 为准`);
        realSlug = dbSlug;
      }
    }

    const tmpDir = path.join(root, 'resource', 'icons');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpRaw = path.join(tmpDir, `_dl_${Date.now()}.png`);
    const tmpRemoved = path.join(tmpDir, `_bg_${Date.now()}.png`);
    const outPath = path.join(tmpDir, `${realSlug}.png`);
    const pubPath = path.join(root, 'public', 'icons', `${realSlug}.png`);
    fs.mkdirSync(path.join(root, 'public', 'icons'), { recursive: true });
    // 1. 下载原图
    const body = await httpGetBuffer(url, 20000);
    if (!body || body.length < 200) return res.status(500).send('下载失败或图片太小');
    fs.writeFileSync(tmpRaw, body);
    // 2. rembg 扣底（可跳过）
    let sourceForResize = tmpRaw;
    if (!noRembg) {
      try {
        execSync(`rembg i "${tmpRaw}" "${tmpRemoved}"`, { timeout: 60000, stdio: 'pipe' });
        if (fs.existsSync(tmpRemoved) && fs.statSync(tmpRemoved).size > 500) {
          sourceForResize = tmpRemoved;
        }
      } catch { /* rembg 失败不致命 */ }
    }
    // 3. sharp 缩放为 500×500 透明 PNG
    const sharp = require('sharp');
    await sharp(sourceForResize)
      .resize(500, 500, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    fs.copyFileSync(outPath, pubPath);
    // 4. 清理临时文件
    try { fs.unlinkSync(tmpRaw); } catch {}
    if (sourceForResize !== tmpRaw) try { fs.unlinkSync(sourceForResize); } catch {}
    // 5. 更新 DB — 保存图标 + 清除候选链接（已选定此图）
    if (rows > 0 && cols > 0) {
      run(`UPDATE reward_templates SET icon = ?, image_candidates = '', updated_at = datetime('now') WHERE rows=? AND cols=?`,
        [`/icons/${realSlug}.png`, rows, cols]);
    } else {
      run(`UPDATE reward_templates SET icon = ?, image_candidates = '', updated_at = datetime('now') WHERE icon = ?`,
        [`/icons/${realSlug}.png`, `/icons/${realSlug}.png`]);
    }
    saveDb();
    console.log(`[fetch-candidate] ${realSlug} 已选定，待人工验收`);
    return res.redirect('/reward-config?unreviewed=1');
  } catch (e: any) {
    return res.status(500).send(`下载处理失败: ${e.message || e}`);
  }
});

// GET: 重找宝物 — 每次只处理 1 个「名称简单」宝物，改名 → 搜图 → 下载 → 刷新
// v3.0: fetch-real-icons.mjs 只输出 CANDIDATES JSON（不写文件），本路由负责解析并下载
app.get('/reward-config/refix-names', requireAdmin, async (_req, res) => {
  const { execSync } = require('child_process') as typeof import('child_process');
  const root = path.join(__dirname, '..', '..');
  const sharp = require('sharp');

  try {
    const rows = all(`SELECT rows, cols FROM reward_templates WHERE quality_status LIKE '%name_bad%' ORDER BY (CASE WHEN updated_at = '' THEN 0 ELSE 1 END), updated_at ASC, rows DESC, cols DESC LIMIT 1`) as { rows: number; cols: number }[];
    if (rows.length === 0) return res.redirect('/reward-config');
    const r = rows[0];
    const coords = `${r.rows}-${r.cols}`;
    console.log(`[refix-names] 重找: ${r.rows}×${r.cols}`);

    // 改名 + 删旧图标 + 直接写 DB，pipe 读输出提取新 slug（先保存防止覆盖）
    saveDb();
    const refixOut = execSync(`node --max-old-space-size=512 scripts/artifacts/_refix-names.mjs --coords="${coords}"`, {
      cwd: root, timeout: 60000, encoding: 'utf-8', stdio: 'pipe', maxBuffer: 8 * 1024 * 1024, env: { ...process.env }
    });
    const newSlugMatch = refixOut.match(/new=([^\s]+)/);
    const newSlug = newSlugMatch ? newSlugMatch[1] : '';
    console.log(`[refix-names] 新slug: ${newSlug}`);

    // _refix-names.mjs 已直接写磁盘 DB，服务器只需要 reload 同步
    await reloadFromDisk();

    // v3.0: 调用 fetch-real-icons.mjs 搜索候选 URL（只用 --coords 精确定位）
    if (newSlug) {
      const fetchOut = execSync(`node --max-old-space-size=512 scripts/artifacts/fetch-real-icons.mjs --coords="${coords}"`, {
        cwd: root, timeout: 120000, encoding: 'utf-8', maxBuffer: 2 * 1024 * 1024, env: { ...process.env }
      });

      // 解析 CANDIDATES JSON 行
      const lines = fetchOut.trim().split('\n').filter(l => l.startsWith('CANDIDATES='));
      const lastLine = lines[lines.length - 1] || '';
      const candidatesStr = lastLine.startsWith('CANDIDATES=') ? lastLine.substring(11) : '';

      if (candidatesStr) {
        const data = JSON.parse(candidatesStr);

        // 坐标交叉校验：防止子进程因 slug 碰撞返回错误宝物的候选图（串货防护）
        const verifyCoords = `${data.rows}-${data.cols}`;
        if (verifyCoords !== coords) {
          console.log(`[refix-names] 串货警报: 期望 ${coords} 实际 ${verifyCoords} (${data.slug}), 丢弃`);
          return res.status(500).send(`串货警报: 子进程返回错误坐标 ${verifyCoords}，期望 ${coords}`);
        }

        const candidates = (data.candidates || []) as { url: string; source: string }[];
        if (candidates.length > 0) {
          // 存入 image_candidates 字段（保留所有候选供用户备用）
          run(`UPDATE reward_templates SET image_candidates = ?, updated_at = datetime('now') WHERE rows=? AND cols=?`,
            [JSON.stringify(candidates), r.rows, r.cols]);
          saveDb();

          // 自动下载第一个候选图
          console.log(`[refix-names] 尝试下载候选: ${candidates[0].url}`);
          const body = await httpGetBuffer(candidates[0].url, 20000);
          if (body && body.length >= 200) {
            const tmpDir = path.join(root, 'resource', 'icons');
            fs.mkdirSync(tmpDir, { recursive: true });
            const pubDir = path.join(root, 'public', 'icons');
            fs.mkdirSync(pubDir, { recursive: true });
            const tmpRaw = path.join(tmpDir, `_dl_${Date.now()}.png`);
            const tmpRemoved = path.join(tmpDir, `_bg_${Date.now()}.png`);
            const outPath = path.join(tmpDir, `${newSlug}.png`);
            const pubPath = path.join(pubDir, `${newSlug}.png`);
            fs.writeFileSync(tmpRaw, body);

            // rembg 扣底（失败不致命）
            let sourceForResize = tmpRaw;
            try {
              execSync(`rembg i "${tmpRaw}" "${tmpRemoved}"`, { timeout: 60000, stdio: 'pipe' });
              if (fs.existsSync(tmpRemoved) && fs.statSync(tmpRemoved).size > 500) {
                sourceForResize = tmpRemoved;
              }
            } catch { /* rembg 失败不致命 */ }

            // sharp 缩放为 500×500 透明 PNG
            await sharp(sourceForResize)
              .resize(500, 500, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .png()
              .toFile(outPath);
            fs.copyFileSync(outPath, pubPath);

            // 清理临时文件
            try { fs.unlinkSync(tmpRaw); } catch {}
            if (sourceForResize !== tmpRaw) try { fs.unlinkSync(sourceForResize); } catch {}

            // 更新 DB：保存图标 + 清除候选
            run(`UPDATE reward_templates SET icon = ?, image_candidates = '', updated_at = datetime('now') WHERE rows=? AND cols=?`,
              [`/icons/${newSlug}.png`, r.rows, r.cols]);
            saveDb();
            console.log(`[refix-names] 图标下载完成: ${newSlug}`);
          }
        }
      }
    }

    // 标记最近更新
    run(`UPDATE reward_templates SET updated_at = datetime('now') WHERE rows=? AND cols=?`, [r.rows, r.cols]);
    saveDb();

  return res.redirect('/reward-config?unreviewed=1');
  } catch (e: any) {
    const detail = [e.stderr, e.stdout?.substring?.(0, 300) || '', e.message].filter(Boolean).join(' | ');
    console.log(`[refix-names] 手动重找失败: ${detail}`);
    return res.status(500).send(`重找失败: ${e.message || e}`);
  }
});

// GET: 切换「统一自动处理」开关（返回 JSON）
app.get('/reward-config/auto-unified/toggle', requireAdmin, (_req, res) => {
  autoUnified = !autoUnified;
  return res.json({ on: autoUnified });
});

// POST: 删除奖品模板
app.post('/reward-config/delete', requireAdmin, (req, res) => {
  const { id } = req.body;
  if (id) {
    run('DELETE FROM reward_templates WHERE id = ?', [id]);
  }
  res.redirect('/reward-config');
});

// ── Helpers ──
function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s: string): string { return s.replace(/"/g, '&quot;'); }
function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Start ──
const PORT = process.env.ADMIN_PORT ? parseInt(process.env.ADMIN_PORT) : 38002;

// Export for use by index.ts (shared process, shared DB)
export function startAdmin() {
  app.listen(PORT, () => {
    console.log(`[admin] listening on :${PORT}`);
  });

  // ═════════════════════ 历史数据迁移：清理已验收宝物的 resource/icons/ 文件 ═════════════════════
  // 遍历所有 quality_status 包含 'ok' 的宝物，删除 resource/icons/ 中的图标副本
  // 迁移后 resource/ 目录可以安全删除，已验收图标仅保留在 public/icons/ 中
  const root = path.join(__dirname, '..', '..');
  (function migrateAcceptedIcons() {
    try {
      const acceptedTemplates = all<{ icon: string }>(
        `SELECT icon FROM reward_templates WHERE quality_status LIKE '%ok%'`
      );
      if (acceptedTemplates.length === 0) return;
      const resourceDir = path.join(root, 'resource', 'icons');
      let cleaned = 0;
      for (const t of acceptedTemplates) {
        const slug = (t.icon || '').match(/\/icons\/(.+)\.png$/)?.[1];
        if (!slug) continue;
        // 删除 resource/icons/ 下该 slug 的所有文件（主图标 + 候选图 _1～_5）
        for (const suffix of ['', ...Array.from({length: 5}, (_, i) => `_${i + 1}`)]) {
          const fp = path.join(resourceDir, `${slug}${suffix}.png`);
          try { if (fs.existsSync(fp)) { fs.unlinkSync(fp); cleaned++; } } catch {}
        }
      }
      if (cleaned > 0) {
        console.log(`[migrate] 历史数据清理完成：${acceptedTemplates.length} 个已验收宝物，删除 ${cleaned} 个 resource/ 文件，图标仅保留在 public/icons/ 中`);
      }
    } catch (e: any) {
      console.log(`[migrate] 历史数据清理失败（不影响服务运行）: ${e.message}`);
    }
  })();

  // ═════════════════════ 自动处理调度器 v2 — 每轮批量 2 件 + 并行下载 ═════════════════════
  const { execSync } = require('child_process') as typeof import('child_process');
  const REFIX_BATCH = 10;    // 重找改名：一次取 10 件，合并为单次 --coords 调用
  const FETCH_BATCH = 5;     // 补图每次 5 个并行
  const CYCLE_DELAY = 500;   // 每轮间隔 0.5 秒（改名极快，瓶颈在图标下载）
  const FETCH_TIMEOUT = 180;  // 图标下载超时 3 分钟（Bing 搜索 + 下载 + rembg 处理需要较长时间）
  const REFIX_TIMEOUT = 60;  // _refix-names 批量处理超时

  /** 子进程监控追踪器，供管理员面板查看 */
  const procTracker = {
    refixActive: 0,         // 正在运行的重找子进程数
    fetchActive: 0,          // 正在运行的图标下载子进程数
    lastRefixAt: null as string | null,
    lastFetchAt: null as string | null,
    lastRefixOk: true,
    lastFetchOk: true,
    refixDone: 0,           // 累计完成数（自启动以来）
    fetchDone: 0,
  };

  // GET: 子进程监控状态（返回 JSON，供前端轮询）—— 必须在 startAdmin 作用域内才能访问 procTracker
  app.get('/reward-config/process-status', requireAdmin, (_req, res) => {
    const now = new Date().toISOString();
    const nameBadCount = (get(`SELECT COUNT(*) as cnt FROM reward_templates WHERE quality_status LIKE '%name_bad%'`) as any)?.cnt || 0;
    const imageBadCount = (get(`SELECT COUNT(*) as cnt FROM reward_templates WHERE quality_status LIKE '%image_bad%' OR quality_status IS NULL OR quality_status = ''`) as any)?.cnt || 0;
    return res.json({
      autoUnified,
      refixActive: procTracker.refixActive,
      fetchActive: procTracker.fetchActive,
      lastRefixAt: procTracker.lastRefixAt,
      lastFetchAt: procTracker.lastFetchAt,
      lastRefixOk: procTracker.lastRefixOk,
      lastFetchOk: procTracker.lastFetchOk,
      refixDone: procTracker.refixDone,
      fetchDone: procTracker.fetchDone,
      nameBadCount,
      imageBadCount,
      serverTime: now,
    });
  });

  /** 子进程通用选项：pipe + maxBuffer + --max-old-space-size 防 OOM */
  const CHILD_OPTS = (timeoutSec: number, extraBufferMb = 2) => ({
    cwd: root, stdio: 'pipe' as const, timeout: timeoutSec * 1000,
    maxBuffer: extraBufferMb * 1024 * 1024, encoding: 'utf-8' as const,
    env: { ...process.env }, // 显式传递代理等环境变量
  });

  /** 同步子进程 */
  function runNode(script: string, extraArgs: string, timeoutSec: number, extraBufferMb = 2): string {
    return execSync(`node --max-old-space-size=512 ${script} ${extraArgs}`, CHILD_OPTS(timeoutSec, extraBufferMb)) as string;
  }

  /** 异步子进程（返回 Promise，用于并行下载）—— spawn + 丢弃输出，无 maxBuffer 问题 */
  function runNodeAsync(script: string, extraArgs: string, timeoutSec: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const { PassThrough } = require('stream');
      // spawn 直接传参，不经过 shell 避免 Windows 转义问题
      const args = ['--max-old-space-size=512', script, ...extraArgs.replace(/"/g, '').split(/\s+/).filter(Boolean)];
      const child = spawn('node', args, { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      // 立即消费 stdout/stderr 防止管道缓冲区阻塞子进程
      const discard = new PassThrough();
      child.stdout.pipe(discard);
      child.stderr.pipe(discard);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutSec * 1000);
      child.on('close', (code: number) => {
        clearTimeout(timer);
        if (timedOut) reject(new Error('timeout ' + timeoutSec + 's'));
        else if (code !== 0) reject(new Error('exit code ' + code));
        else resolve('ok');
      });
      child.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    });
  }

  /**
   * 异步子进程（捕获 stdout 版本）—— 用于 fetch-real-icons.mjs v3.0 读取 CANDIDATES JSON
   * stderr 仍丢弃（日志用），只收集 stdout 中的结构化输出
   */
  function runNodeAsyncCapture(script: string, extraArgs: string, timeoutSec: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const { PassThrough } = require('stream');
      const args = ['--max-old-space-size=512', script, ...extraArgs.replace(/"/g, '').split(/\s+/).filter(Boolean)];
      const child = spawn('node', args, { cwd: root, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      // stderr 丢弃（fetch-real-icons.mjs 的日志输出）
      const discard = new PassThrough();
      child.stderr.pipe(discard);
      // stdout 收集（CANDIDATES JSON）
      const stdoutChunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutSec * 1000);
      child.on('close', (code: number) => {
        clearTimeout(timer);
        if (timedOut) reject(new Error('timeout ' + timeoutSec + 's'));
        else if (code !== 0) reject(new Error('exit code ' + code));
        else resolve(Buffer.concat(stdoutChunks).toString('utf8'));
      });
      child.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    });
  }

  // ── 统一自动处理：每轮先处理 name_bad（重找名称 + 后续补图），再处理 image_bad / 空状态（补图）──
  // 完成后统一放回未验收状态（quality_status=''），等待用户审核图片候选
  let unifiedPoolActive = false;

  async function stepAutoUnified() {
    if (!autoUnified || unifiedPoolActive) return;
    unifiedPoolActive = true;

    try {
      // ═════ 第一步：name_bad — 调用 _refix-names.mjs 重找非黑名单名称 ═════
      // _refix-names.mjs 会直接写磁盘 DB（改名 + 更新 icon + 清空 quality_status + 加旧名到黑名单）
      const nameBadRows = all(
        `SELECT rows, cols FROM reward_templates 
         WHERE quality_status LIKE '%name_bad%' 
         ORDER BY (CASE WHEN updated_at = '' THEN 0 ELSE 1 END), updated_at ASC, rows DESC, cols DESC 
         LIMIT ${REFIX_BATCH}`
      ) as { rows: number; cols: number }[];

      if (nameBadRows.length > 0) {
        const coordsStr = nameBadRows.map(r => `${r.rows}-${r.cols}`).join(',');
        console.log(`[auto-unified] 重找名称 ${nameBadRows.length} 件: ${coordsStr}`);

        procTracker.refixActive++;
        procTracker.lastRefixAt = new Date().toISOString();
        try {
          runNode('scripts/artifacts/_refix-names.mjs', `--coords="${coordsStr}"`, REFIX_TIMEOUT, 8);
          procTracker.lastRefixOk = true;
          procTracker.refixDone += nameBadRows.length;
        } catch (e: any) {
          procTracker.lastRefixOk = false;
          const detail = [e.stderr, e.stdout, e.message].filter(Boolean).map((s: string) => s.substring(0, 500)).join(' | ');
          console.log(`[auto-unified] 重找名称失败: ${detail}`);
        } finally {
          procTracker.refixActive--;
        }

        // _refix-names.mjs 已直接写磁盘 DB，必须 reload 才能看到改名结果
        await reloadFromDisk();
        console.log(`[auto-unified] 重找名称完成，DB 已同步`);
      }

      // ═════ 第二步：补图 — 处理 image_bad + 空状态（含刚改名的 name_bad 项，它们现在是 ''）═════
      // 跳过 icon 为空的项（用户手动点「图片不对」已清空 icon，不需要自动搜图）
      // 跳过已有候选图的空状态项（image_candidates 非空 = 已搜过等待验收，不需要重搜）
      const fetchRows = all(
        `SELECT rows, cols, icon, quality_status FROM reward_templates
         WHERE (quality_status LIKE '%image_bad%' OR quality_status IS NULL OR quality_status = '')
           AND quality_status != 'image_processing'
           AND icon IS NOT NULL AND icon != ''
           AND (quality_status LIKE '%image_bad%' OR image_candidates IS NULL OR image_candidates = '' OR image_candidates = '[]')
         ORDER BY (CASE WHEN quality_status LIKE '%image_bad%' THEN 0 ELSE 1 END),
                  (CASE WHEN updated_at = '' THEN 0 ELSE 1 END),
                  updated_at ASC, rows DESC, cols DESC
         LIMIT ${FETCH_BATCH}`
      ) as { rows: number; cols: number; icon: string; quality_status: string }[];

      if (fetchRows.length === 0) return;

      // 立即标记为 image_processing，阻止并行冲突
      for (const r of fetchRows) {
        run(`UPDATE reward_templates SET quality_status = 'image_processing', updated_at = datetime('now') WHERE rows=? AND cols=?`, [r.rows, r.cols]);
      }
      saveDb();

      // 并行 worker：每个 item 调用 fetch-real-icons.mjs v3.0 收集候选 URL
      // 若之前是 image_bad（重搜），加 --retry 参数改变搜索引擎查询词，避免返回相同结果
      const worker = async (row: { rows: number; cols: number; icon: string; quality_status: string }) => {
        const slug = row.icon.match(/\/icons\/(.+)\.png$/)?.[1] || `item-${row.rows}-${row.cols}`;
        const coords = `${row.rows}-${row.cols}`;
        const isRetry = (row.quality_status || '').includes('image_bad');
        console.log(`[auto-unified] 搜图${isRetry ? ' [重搜]' : ''}: ${coords} (${slug})`);

        // 清理旧图标文件
        for (const dir of ['resource/icons', 'public/icons']) {
          for (const suffix of ['', ...Array.from({ length: 5 }, (_, i) => `_${i + 1}`)]) {
            try { const fp = path.join(root, dir, `${slug}${suffix}.png`); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { }
          }
        }

        // 重搜时：读取旧 image_candidates，提取 URL 传给 fetch-real-icons 排除（防返回相同图片）
        let excludeArg = '';
        if (isRetry) {
          const oldCandidates = get('SELECT image_candidates FROM reward_templates WHERE rows=? AND cols=?', [row.rows, row.cols]) as { image_candidates?: string } | undefined;
          try {
            const oldList = JSON.parse(oldCandidates?.image_candidates || '[]');
            const oldUrls = oldList.map((c: any) => c.url).filter(Boolean);
            if (oldUrls.length > 0) {
              excludeArg = ` --exclude-urls="${oldUrls.join(' ')}"`;
              console.log(`[auto-unified] ${coords} 排除旧图: ${oldUrls.length} 个 URL`);
            }
          } catch {}
        }

        procTracker.lastFetchAt = new Date().toISOString();
        procTracker.fetchActive++;
        try {
          const stdout = await runNodeAsyncCapture('scripts/artifacts/fetch-real-icons.mjs', `--coords="${coords}"${isRetry ? ' --retry' : ''}${excludeArg}`, 90);
          const lines = stdout.trim().split('\n').filter(l => l.startsWith('CANDIDATES='));
          const lastLine = lines[lines.length - 1] || '';
          const candidatesStr = lastLine.startsWith('CANDIDATES=') ? lastLine.substring(11) : '';
          if (candidatesStr) {
            const data = JSON.parse(candidatesStr);
            const verifyCoords = `${data.rows}-${data.cols}`;
            if (verifyCoords !== coords) {
              console.log(`[auto-unified] ⚠ 串货警报: 期望 ${coords} 实际 ${verifyCoords} (${data.slug}), 丢弃`);
              run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
              saveDb();
              return;
            }
            const candidates = data.candidates || [];
            // 存入 image_candidates，清空 quality_status 放回未验收供用户审核
            run(`UPDATE reward_templates SET image_candidates = ?, updated_at = datetime('now'), quality_status = '' WHERE rows=? AND cols=?`,
              [JSON.stringify(candidates), row.rows, row.cols]);
            procTracker.fetchDone++;
            procTracker.lastFetchOk = true;
            console.log(`[auto-unified] ${coords} 收集 ${candidates.length} 个候选 → 未验收`);
          } else {
            // 无候选 URL：恢复为 image_bad
            run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
            console.log(`[auto-unified] ${coords} 无候选，保持 image_bad`);
          }
        } catch (e: any) {
          run(`UPDATE reward_templates SET updated_at = datetime('now'), quality_status = 'image_bad' WHERE rows=? AND cols=?`, [row.rows, row.cols]);
          console.log(`[auto-unified] ${coords} 搜图失败: ${e.message?.substring(0, 200)}`);
        }
        procTracker.fetchActive--;
        saveDb();
      };

      await Promise.all(fetchRows.map(r => worker(r)));
    } finally {
      unifiedPoolActive = false;
    }
  }

  /** 递归调度：每轮完成后等 CYCLE_DELAY 再启动下一轮 */
  function scheduleNext() {
    autoTimer = setTimeout(async () => {
      await stepAutoUnified();
      scheduleNext();
    }, CYCLE_DELAY);
  }
  scheduleNext();
  console.log(`[admin] 统一自动处理: ${autoUnified ? '✅ 运行中' : '⏹ 已关闭'} | 周期: ${CYCLE_DELAY / 1000}s`);
}

// Direct start (standalone: npx ts-node src/admin.ts)
if (require.main === module) {
  initDatabase().then(() => {
    startAdmin();
  }).catch(e => { console.error('[admin] failed:', e); process.exit(1); });
}
