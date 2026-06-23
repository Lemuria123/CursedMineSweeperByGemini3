// API client — wraps all backend calls.

const BASE_URL = 'http://localhost:38001';

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ──

export async function register(platform: string, platform_id: string) {
  return request<{ account_id: string; nickname: string | null; created_at: number }>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ platform, platform_id }),
  });
}

export async function setNickname(id: string, nickname: string) {
  return request<{ ok: boolean; nickname: string }>(`/api/auth/${id}/nickname`, {
    method: 'PATCH',
    body: JSON.stringify({ nickname }),
  });
}

// ── Nonce ──

export async function getNonce(accountId: string) {
  return request<{ nonce: string; expires_at: number }>(`/api/nonce?account_id=${encodeURIComponent(accountId)}`);
}

// ── Submit ──

export async function submitGame(accountId: string, payload: string) {
  return request<{ valid: boolean; reason: string | null; reward: { id: string; title: string } | null }>('/api/submit', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, payload }),
  });
}

// ── Records ──

export async function getLeaderboard(rows: number, cols: number) {
  return request<{ rank: number; nickname: string; time_ms: number; submitted_at: number }[]>(`/api/records/${rows}/${cols}`);
}

export async function getMyRecords(accountId: string) {
  return request<{ rows: number; cols: number; mines: number; time_ms: number; submitted_at: number }[]>(`/api/records/me/${accountId}`);
}

// ── Rewards ──

export async function getRewards(accountId: string) {
  return request<{ id: string; difficulty_name: string; rows: number; cols: number; mines: number; title: string; icon?: string; content: string; name_en?: string; content_en?: string; source_ip?: string; type: string; hue: number; novel_index?: number; next_rows?: number; next_cols?: number; content_kind?: string; submitted_at: number }[]>(`/api/rewards/${accountId}`);
}

// ── Config ──

/**
 * 获取后端配置项（前端启动时调用）
 * 返回包含 prayer_reward_threshold 等配置的键值对象
 */
export async function getConfig() {
  return request<Record<string, string>>('/api/config');
}

/**
 * 获取所有奖品模板（用于前端本地匹配棋盘尺寸）
 */
export async function getRewardTemplates() {
  return request<{ id: string; rows: number; cols: number; name: string; icon: string; content: string; name_en?: string; content_en?: string; type: string; hue: number; novel_index?: number; next_rows?: number; next_cols?: number; content_kind?: string; source_ip?: string }[]>('/api/reward-templates');
}
