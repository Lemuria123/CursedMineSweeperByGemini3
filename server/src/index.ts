// Cursed Minesweeper — Game API Server (:38001)

import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';

import { initDatabase, run, get, all, reloadFromDisk } from './db';
import { decrypt } from './crypto';
import { isGameSubmission, verifySubmission } from './verify';
import { GameSubmission } from './types';
import { startAdmin } from './admin';
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function credentialHash(req: express.Request): string | null {
  const token = req.get('Authorization')?.match(/^Bearer ([0-9a-f-]+)$/i)?.[1];
  if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

function requireAccount(req: express.Request, res: express.Response, next: express.NextFunction) {
  const hash = credentialHash(req);
  const account = hash && get<{ id: string }>('SELECT id FROM accounts WHERE credential_hash = ?', [hash]);
  if (!account) {
    res.status(401).json({ error: 'account credential required' });
    return;
  }
  res.locals.accountId = account.id;
  next();
}

// ── Init DB before starting ──
export async function start() {
  await initDatabase();

  // ── Health check ──
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // 开发环境：外部脚本修改磁盘 DB 后，通知服务端从磁盘重新加载（非 restart）
  app.post('/api/dev/reload-db', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'not found' });
    }
    await reloadFromDisk();
    res.json({ ok: true });
  });

  // ── POST /api/auth — register or login ──
  app.post('/api/auth', (req, res) => {
    const { platform, platform_id } = req.body;
    if (typeof platform !== 'string' || !platform || typeof platform_id !== 'string' || !platform_id) {
      return res.status(400).json({ error: 'platform and platform_id required' });
    }
    const hash = credentialHash(req);
    if (!hash) return res.status(401).json({ error: 'account credential required' });

    const existing = get<{ id: string; nickname: string | null; created_at: number; credential_hash: string | null }>(
      'SELECT id, nickname, created_at, credential_hash FROM accounts WHERE platform = ? AND platform_id = ?',
      [platform, platform_id],
    );

    const credentialOwner = get<{ id: string }>('SELECT id FROM accounts WHERE credential_hash = ?', [hash]);
    if (credentialOwner && credentialOwner.id !== existing?.id) {
      return res.status(409).json({ error: 'credential already in use' });
    }
    if (existing) {
      if (existing.credential_hash === null) {
        // Existing browsers still hold their device ID. Bind a credential the first time they upgrade.
        run('UPDATE accounts SET credential_hash = ? WHERE id = ?', [hash, existing.id]);
      } else if (existing.credential_hash !== hash) {
        return res.status(401).json({ error: 'invalid account credential' });
      }
      return res.json({ account_id: existing.id, nickname: existing.nickname, created_at: existing.created_at });
    }

    const id = uuid();
    const now = Date.now();
    run('INSERT INTO accounts (id, platform, platform_id, credential_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, platform, platform_id, hash, now]);
    return res.json({ account_id: id, nickname: null, created_at: now });
  });

  // ── GET /api/auth/:id — get player info ──
  app.get('/api/auth/:id', (req, res) => {
    const row = get<{ id: string; platform: string; nickname: string | null; created_at: number }>(
      'SELECT id, platform, nickname, created_at FROM accounts WHERE id = ?', [req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'account not found' });
    res.json(row);
  });

  // ── PATCH /api/auth/:id/nickname — set nickname ──
  app.patch('/api/auth/:id/nickname', requireAccount, (req, res) => {
    if (req.params.id !== res.locals.accountId) return res.status(403).json({ error: 'account mismatch' });
    const { nickname } = req.body;
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'nickname required' });
    }
    const trimmed = nickname.trim().slice(0, 32);
    run('UPDATE accounts SET nickname = ? WHERE id = ?', [trimmed, res.locals.accountId]);
    res.json({ ok: true, nickname: trimmed });
  });

  // ── GET /api/nonce — get a one-time submission nonce ──
  app.get('/api/nonce', requireAccount, (req, res) => {
    const nonce = uuid();
    const id = uuid();
    const accountId = res.locals.accountId;
    if (req.query.account_id !== undefined && req.query.account_id !== accountId) {
      return res.status(403).json({ error: 'account mismatch' });
    }
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    run('INSERT INTO submission_nonces (id, nonce, account_id, expires_at) VALUES (?, ?, ?, ?)',
      [id, nonce, accountId, expiresAt]);

    res.json({ nonce, expires_at: expiresAt });
  });

  // ── POST /api/submit — submit encrypted game data ──
  app.post('/api/submit', requireAccount, (req, res) => {
    const { account_id, payload } = req.body;
    if (!account_id || typeof payload !== 'string' || !payload) {
      return res.status(400).json({ error: 'account_id and payload required' });
    }
    if (account_id !== res.locals.accountId) return res.status(403).json({ error: 'account mismatch' });

    // 1. Decrypt
    let submission: GameSubmission;
    try {
      const plaintext = decrypt(payload);
      const data: unknown = JSON.parse(plaintext);
      if (!isGameSubmission(data)) return res.status(400).json({ error: 'invalid game data' });
      submission = data;
    } catch (e: any) {
      return res.status(400).json({ error: 'decrypt failed', detail: e.message });
    }

    // 2. Validate nonce
    const nonceRow = get<{ id: string; expires_at: number }>(
      'SELECT id, expires_at FROM submission_nonces WHERE nonce = ? AND account_id = ?',
      [submission.nonce, res.locals.accountId],
    );
    if (!nonceRow) {
      return res.status(400).json({ error: 'invalid or already used nonce' });
    }
    if (nonceRow.expires_at < Date.now()) {
      run('DELETE FROM submission_nonces WHERE id = ?', [nonceRow.id]);
      return res.status(400).json({ error: 'nonce expired' });
    }

    // 3. Mark nonce as used (delete it)
    run('DELETE FROM submission_nonces WHERE id = ?', [nonceRow.id]);

    // 4. Verify game data
    let result: { valid: boolean; reason?: string };
    try {
      result = verifySubmission(submission);
    } catch (e: any) {
      console.error('[verify] exception:', e.message);
      result = { valid: false, reason: `verification error: ${e.message}` };
    }
    const now = Date.now();

    // 5. Store record
    run(
      'INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at, prayers_used, verify_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        res.locals.accountId,
        submission.grid.rows,
        submission.grid.cols,
        submission.grid.mines,
        submission.total_time_ms,
        payload,
        result.valid ? 1 : 0,
        now,
        submission.prayers_used,
        result.reason || null,
      ],
    );

    // 校验结果写入 records。祈祷阈值由前端决定是否提交，这里不再发放宝物。
    res.json({
      valid: result.valid,
      reason: result.reason || null,
    });
  });

  // ── GET /api/records/me/:account_id — personal bests (must be before :rows/:cols) ──
  app.get('/api/records/me/:account_id', (req, res) => {
    const records = all(
      `SELECT rows, cols, mines, MIN(time_ms) as time_ms, submitted_at
       FROM records
       WHERE account_id = ? AND validated = 1
       GROUP BY rows, cols
       ORDER BY rows, cols`,
      [req.params.account_id],
    );
    res.json(records);
  });

  // ── GET /api/records/:rows/:cols — leaderboard (top 100) ──
  app.get('/api/records/:rows/:cols', (req, res) => {
    const rows = parseInt(req.params.rows);
    const cols = parseInt(req.params.cols);
    if (isNaN(rows) || isNaN(cols)) {
      return res.status(400).json({ error: 'invalid rows/cols' });
    }

    const records = all(
      `SELECT r.id, r.account_id, a.nickname, r.rows, r.cols, r.mines, r.time_ms, r.submitted_at
       FROM records r
       LEFT JOIN accounts a ON r.account_id = a.id
       WHERE r.rows = ? AND r.cols = ? AND r.validated = 1
       ORDER BY r.time_ms ASC
       LIMIT 100`,
      [rows, cols],
    );

    const ranked = records.map((r: any, i: number) => ({
      rank: i + 1,
      nickname: r.nickname || `Anonymous ${r.account_id.slice(-4)}`,
      time_ms: r.time_ms,
      submitted_at: r.submitted_at,
      account_id: r.account_id,
    }));

    res.json(ranked);
  });

  // ── GET /api/config — 获取配置项（前端启动时调用） ──
  app.get('/api/config', (_req, res) => {
    const configs = all<{ key: string; value: string }>('SELECT key, value FROM config');
    // 转换为 key-value 对象返回
    const result: Record<string, string> = {};
    configs.forEach(c => { result[c.key] = c.value; });
    res.json(result);
  });

  // ── Start ──
  const PORT = process.env.GAME_API_PORT ? parseInt(process.env.GAME_API_PORT) : 38001;
  const server = app.listen(PORT, () => {
    console.log(`[game-api] listening on :${PORT}`);
  });

  // Also start admin panel on the same process (shared DB)
  return { server, admin: startAdmin() };
}

if (require.main === module) start().catch((e) => {
  console.error('[game-api] failed to start:', e);
  process.exit(1);
});

// Prevent sql.js WASM cleanup crash from killing the server
process.on('uncaughtException', (e: any) => {
  if (e.message?.includes?.('UV_HANDLE_CLOSING') || e.message?.includes?.('Assertion failed')) {
    // sql.js cleanup on exit — ignore, server is still running
    return;
  }
  console.error('[uncaught]', e);
});

export default app;
