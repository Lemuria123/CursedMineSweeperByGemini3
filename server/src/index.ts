// Cursed Minesweeper — Game API Server (:38001)

import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';

import { initDatabase, getDb, run, get, all } from './db';
import { decrypt } from './crypto';
import { verifySubmission } from './verify';
import { GameSubmission } from './types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Init DB before starting ──
async function start() {
  await initDatabase();

  // ── Health check ──
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // ── POST /api/auth — register or login ──
  app.post('/api/auth', (req, res) => {
    const { platform, platform_id } = req.body;
    if (!platform || !platform_id) {
      return res.status(400).json({ error: 'platform and platform_id required' });
    }

    const existing = get<{ id: string; nickname: string | null; created_at: number }>(
      'SELECT id, nickname, created_at FROM accounts WHERE platform = ? AND platform_id = ?',
      [platform, platform_id],
    );

    if (existing) {
      return res.json({ account_id: existing.id, nickname: existing.nickname, created_at: existing.created_at });
    }

    const id = uuid();
    const now = Date.now();
    run('INSERT INTO accounts (id, platform, platform_id, created_at) VALUES (?, ?, ?, ?)',
      [id, platform, platform_id, now]);
    return res.json({ account_id: id, nickname: null, created_at: now });
  });

  // ── GET /api/auth/:id — get player info ──
  app.get('/api/auth/:id', (req, res) => {
    const row = get<{ id: string; platform: string; nickname: string | null; created_at: number }>(
      'SELECT * FROM accounts WHERE id = ?', [req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'account not found' });
    res.json(row);
  });

  // ── PATCH /api/auth/:id/nickname — set nickname ──
  app.patch('/api/auth/:id/nickname', (req, res) => {
    const { nickname } = req.body;
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return res.status(400).json({ error: 'nickname required' });
    }
    const trimmed = nickname.trim().slice(0, 32);
    const existing = get('SELECT id FROM accounts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'account not found' });

    run('UPDATE accounts SET nickname = ? WHERE id = ?', [trimmed, req.params.id]);
    res.json({ ok: true, nickname: trimmed });
  });

  // ── GET /api/nonce — get a one-time submission nonce ──
  app.get('/api/nonce', (req, res) => {
    const nonce = uuid();
    const id = uuid();
    const accountId = (req.query.account_id as string) || 'anonymous';
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    run('INSERT INTO submission_nonces (id, nonce, account_id, expires_at) VALUES (?, ?, ?, ?)',
      [id, nonce, accountId, expiresAt]);

    res.json({ nonce, expires_at: expiresAt });
  });

  // ── POST /api/submit — submit encrypted game data ──
  app.post('/api/submit', (req, res) => {
    const { account_id, payload } = req.body;
    if (!account_id || !payload) {
      return res.status(400).json({ error: 'account_id and payload required' });
    }

    // 1. Decrypt
    let submission: GameSubmission;
    try {
      const plaintext = decrypt(payload);
      submission = JSON.parse(plaintext);
    } catch (e: any) {
      return res.status(400).json({ error: 'decrypt failed', detail: e.message });
    }

    // 2. Validate nonce
    if (!submission.nonce) {
      return res.status(400).json({ error: 'missing nonce in payload' });
    }
    const nonceRow = get<{ id: string; expires_at: number }>(
      'SELECT id, expires_at FROM submission_nonces WHERE nonce = ?', [submission.nonce],
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
    const result = verifySubmission(submission);
    const now = Date.now();

    // 5. Store record
    run(
      'INSERT INTO records (account_id, rows, cols, mines, time_ms, game_data, validated, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        account_id,
        submission.grid.rows,
        submission.grid.cols,
        submission.grid.mines,
        submission.total_time_ms,
        payload, // store original encrypted payload
        result.valid ? 1 : 0,
        now,
      ],
    );

    // 6. If valid and ACE'd (zero prayers), write reward
    let reward: any = null;
    if (result.valid && submission.prayers_used === 0) {
      // Check if reward already exists for this (account, rows, cols, mines)
      const rewardId = `${submission.grid.rows}-${submission.grid.cols}-${submission.grid.mines}`;
      const existingReward = get('SELECT id FROM rewards WHERE id = ? AND account_id = ?', [rewardId, account_id]);
      if (!existingReward) {
        reward = {
          id: rewardId,
          difficulty_name: `${submission.grid.rows}x${submission.grid.cols}`,
          rows: submission.grid.rows,
          cols: submission.grid.cols,
          mines: submission.grid.mines,
          title: 'ACE',
          content: '',
          type: 'text',
          hue: 0,
        };
        run(
          'INSERT INTO rewards (id, account_id, difficulty_name, rows, cols, mines, title, content, type, hue, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            reward.id, account_id, reward.difficulty_name, reward.rows, reward.cols, reward.mines,
            reward.title, reward.content, reward.type, reward.hue, now,
          ],
        );
      }
    }

    res.json({
      valid: result.valid,
      reason: result.reason || null,
      reward: reward ? { id: reward.id, title: reward.title } : null,
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
    }));

    res.json(ranked);
  });

  // ── GET /api/rewards/:account_id — player rewards ──
  app.get('/api/rewards/:account_id', (req, res) => {
    const rewards = all(
      'SELECT id, difficulty_name, rows, cols, mines, title, content, type, hue, submitted_at FROM rewards WHERE account_id = ? ORDER BY submitted_at DESC',
      [req.params.account_id],
    );
    res.json(rewards);
  });

  // ── Start ──
  const PORT = process.env.GAME_API_PORT ? parseInt(process.env.GAME_API_PORT) : 38001;
  app.listen(PORT, () => {
    console.log(`[game-api] listening on :${PORT}`);
  });
}

start().catch((e) => {
  console.error('[game-api] failed to start:', e);
  process.exit(1);
});

export default app;
