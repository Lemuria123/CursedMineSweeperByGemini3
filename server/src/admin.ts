// Cursed Minesweeper — Admin Panel (:38002)
// Pure HTML + Tailwind CDN, no frontend framework.
// Shares the same SQLite database as the game API.

import express from 'express';
import cookieSession from 'cookie-session';
import { initDatabase, all, get, run } from './db';
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

// ── Helpers ──
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session?.admin) return next();
  res.redirect('/');
};

const top = (title: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — CMS Admin</title><script src="https://cdn.tailwindcss.com"></script></head>
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
<title>CMS Admin</title><script src="https://cdn.tailwindcss.com"></script></head>
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
<script src="https://cdn.tailwindcss.com"></script>
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
  const templates = all<{ id: string; rows: number; cols: number; name: string; name_en: string; icon: string; content: string; content_en: string; type: string; hue: number }>(
    'SELECT * FROM reward_templates ORDER BY rows, cols');
  const editId = (req.query.edit as string) || '';
  const editTemplate = editId ? templates.find(t => t.id === editId) : null;

  // 构建模板表格行
  const rows = templates.map(t => `
    <tr class="border-b border-gray-700 hover:bg-gray-800">
      <td class="py-3 px-3 font-mono text-sm text-amber-400">${t.rows}x${t.cols}</td>
      <td class="py-3 px-3 text-sm">${t.icon ? `<span class="text-lg mr-1">${esc(t.icon)}</span>` : ''}${esc(t.name) || '<span class="text-gray-600">未设置</span>'}</td>
      <td class="py-3 px-3 text-xs text-gray-400 max-w-[200px] truncate">${esc(t.content) || '<span class="text-gray-600">—</span>'}</td>
      <td class="py-3 px-3 text-xs"><span class="px-2 py-0.5 rounded text-[10px] ${t.type === 'image' ? 'bg-blue-900 text-blue-300' : t.type === 'glitch' ? 'bg-purple-900 text-purple-300' : 'bg-green-900 text-green-300'}">${esc(t.type)}</span></td>
      <td class="py-3 px-3 text-xs text-gray-500">${t.hue}°</td>
      <td class="py-3 px-3 flex gap-2">
        <a href="/reward-config?edit=${t.id}" class="text-purple-400 hover:underline text-xs">编辑</a>
        <form method="POST" action="/reward-config/delete" class="inline" onsubmit="return confirm('确认删除 ${escAttr(t.rows + 'x' + t.cols)} 的奖品模板？')">
          <input type="hidden" name="id" value="${t.id}" />
          <button type="submit" class="text-red-400 hover:underline text-xs">删除</button>
        </form>
      </td>
    </tr>`).join('');

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

<!-- 模板列表 -->
<h3 class="text-lg font-semibold mb-3 text-gray-300">现有模板 (${templates.length})</h3>
<div class="bg-gray-800 rounded-xl overflow-hidden mb-8">
  <table class="w-full"><thead><tr class="bg-gray-700 text-left text-xs text-gray-400 uppercase">
    <th class="py-3 px-3">棋盘</th><th class="py-3 px-3">名称</th><th class="py-3 px-3">文字</th><th class="py-3 px-3">类型</th><th class="py-3 px-3">色调</th><th class="py-3 px-3">操作</th>
  </tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="py-6 text-center text-gray-600">暂无奖品模板，请在下方新增</td></tr>'}</tbody></table>
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
    <label class="block text-sm text-gray-400 mb-1">图标 (Icon) — 支持 emoji</label>
    <input name="icon" type="text" maxlength="8" value="${escAttr(formIcon)}" placeholder="例如: 📖"
      class="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500 text-sm" />
  </div>
  <div>
    <label class="block text-sm text-gray-400 mb-1">描述文字 (Content)</label>
    <textarea name="content" rows="3" maxlength="500" placeholder="奖品描述文本..."
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
  <div class="flex gap-3">
    <button type="submit" class="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition text-sm">
      ${editTemplate ? '保存修改' : '新增模板'}
    </button>
    ${editTemplate ? `<a href="/reward-config" class="py-3 px-6 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition text-sm">取消编辑</a>` : ''}
  </div>
</form>
`));
});

// POST: 新增或更新奖品模板
app.post('/reward-config', requireAdmin, (req, res) => {
  const { id, rows, cols, name, name_en, icon, content, content_en, type, hue } = req.body;
  const r = parseInt(rows), c = parseInt(cols), h = parseInt(hue) || 0;

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

  run(
    'INSERT OR REPLACE INTO reward_templates (id, rows, cols, name, name_en, icon, content, content_en, type, hue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [templateId, r, c, name || '', name_en || '', icon || '', content || '', content_en || '', type || 'text', h],
  );

  res.redirect('/reward-config');
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
}

// Direct start (standalone: npx ts-node src/admin.ts)
if (require.main === module) {
  initDatabase().then(() => {
    startAdmin();
  }).catch(e => { console.error('[admin] failed:', e); process.exit(1); });
}
