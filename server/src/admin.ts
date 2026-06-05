// Cursed Minesweeper — Admin Panel (:38002)
// Pure HTML + Tailwind CDN, no frontend framework.
// Shares the same SQLite database as the game API.

import express from 'express';
import cookieSession from 'cookie-session';
import { initDatabase, all, get, run } from './db';

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
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(r.submitted_at)}</td>
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
    <th class="py-3 px-4">Player</th><th class="py-3 px-4">Size</th><th class="py-3 px-4">Mines</th><th class="py-3 px-4">Time</th><th class="py-3 px-4">Date</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="py-6 text-center text-gray-600">No records found</td></tr>'}</tbody></table>
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
      <td class="py-3 px-4 text-xs">${s.validated ? '<span class="text-green-400 font-bold">✓ Pass</span>' : '<span class="text-red-400 font-bold">✗ Fail</span>'}</td>
      <td class="py-3 px-4 text-xs text-gray-500">${fmtDate(s.submitted_at)}</td>
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
    <th class="py-3 px-4">Player</th><th class="py-3 px-4">Size</th><th class="py-3 px-4">Mines</th><th class="py-3 px-4">Time</th><th class="py-3 px-4">Result</th><th class="py-3 px-4">Date</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="py-6 text-center text-gray-600">No submissions</td></tr>'}</tbody></table>
</div>
<div class="flex justify-between mt-4 text-sm">
  <span class="text-gray-500">Page ${pageNum} / ${Math.max(1, Math.ceil(total / pageSize))}</span>
  <div class="flex gap-2">
    ${pageNum > 1 ? `<a href="/submissions?page=${pageNum - 1}&validated=${vFilter || ''}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">上一页</a>` : ''}
    ${pageNum * pageSize < total ? `<a href="/submissions?page=${pageNum + 1}&validated=${vFilter || ''}" class="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700">下一页</a>` : ''}
  </div>
</div>`));
});

// ── Helpers ──
function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s: string): string { return s.replace(/"/g, '&quot;'); }
function fmtDate(ts: number): string { return new Date(ts).toISOString().slice(0, 19).replace('T', ' '); }

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
