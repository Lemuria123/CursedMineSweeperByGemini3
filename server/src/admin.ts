import express from 'express';
import cookieSession from 'cookie-session';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: 'cms_admin',
    secret: process.env.ADMIN_TOKEN || 'change-me-in-production',
    maxAge: 24 * 60 * 60 * 1000, // 24h
  }),
);

// ── Auth middleware ──
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.session?.admin) return next();
  res.redirect('/');
};

// ── Login page ──
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cursed Minesweeper Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen flex items-center justify-center">
  <form method="POST" action="/login" class="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm space-y-4">
    <h1 class="text-2xl font-bold text-white text-center">Cursed Minesweeper</h1>
    <p class="text-gray-400 text-center text-sm">Admin Panel</p>
    <input name="token" type="password" placeholder="Admin Token" required
      class="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-500" />
    <button type="submit"
      class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition">
      Sign In
    </button>
  </form>
</body>
</html>`);
});

// ── Login action ──
app.post('/login', (req, res) => {
  const expected = process.env.ADMIN_TOKEN || 'admin';
  if (req.body.token === expected) {
    req.session!.admin = true;
    res.redirect('/dashboard');
  } else {
    res.redirect('/');
  }
});

// ── Logout ──
app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// ── Dashboard (placeholder) ──
app.get('/dashboard', requireAdmin, (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — CMS Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen text-white">
  <nav class="bg-gray-800 px-6 py-4 flex items-center justify-between">
    <span class="font-bold text-lg">CMS Admin</span>
    <a href="/logout" class="text-sm text-gray-400 hover:text-white">Logout</a>
  </nav>
  <main class="max-w-6xl mx-auto p-6">
    <h2 class="text-xl font-semibold mb-6">Dashboard</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Users</div><div class="text-2xl font-bold">—</div></div>
      <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">ACE Records</div><div class="text-2xl font-bold">—</div></div>
      <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Rewards</div><div class="text-2xl font-bold">—</div></div>
      <div class="bg-gray-800 rounded-xl p-4"><div class="text-sm text-gray-400">Nonce Pool</div><div class="text-2xl font-bold">—</div></div>
    </div>
    <nav class="flex gap-4 text-sm">
      <a href="/users" class="text-purple-400 hover:underline">Users</a>
      <a href="/records" class="text-purple-400 hover:underline">Records</a>
      <a href="/rewards" class="text-purple-400 hover:underline">Rewards</a>
      <a href="/submissions" class="text-purple-400 hover:underline">Submissions</a>
    </nav>
  </main>
</body>
</html>`);
});

// ── Placeholder pages ──
const placeholder = (title: string) => (_req: express.Request, res: express.Response) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — CMS Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 min-h-screen text-white">
  <nav class="bg-gray-800 px-6 py-4 flex items-center justify-between">
    <a href="/dashboard" class="font-bold text-lg">CMS Admin</a>
    <a href="/logout" class="text-sm text-gray-400 hover:text-white">Logout</a>
  </nav>
  <main class="max-w-6xl mx-auto p-6">
    <h2 class="text-xl font-semibold mb-4">${title}</h2>
    <p class="text-gray-400">Coming soon — Stage 6 implementation.</p>
  </main>
</body>
</html>`);
};

app.get('/users', requireAdmin, placeholder('Users'));
app.get('/users/:id', requireAdmin, placeholder('User Detail'));
app.get('/records', requireAdmin, placeholder('Records'));
app.get('/rewards', requireAdmin, placeholder('Rewards'));
app.get('/submissions', requireAdmin, placeholder('Submissions'));

const PORT = process.env.ADMIN_PORT ? parseInt(process.env.ADMIN_PORT) : 38002;

app.listen(PORT, () => {
  console.log(`[admin] listening on :${PORT}`);
});

export default app;
