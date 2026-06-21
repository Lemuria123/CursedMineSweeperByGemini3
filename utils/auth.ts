// Device auth — separates device fingerprint (platform_id) from server account_id.
// platform_id: stable per-device UUID sent to POST /api/auth as platform_id.
// account_id: server-assigned UUID used for all other API calls.

import { register } from './api';

const PLATFORM_STORAGE_KEY = 'cms_platform_id';
const ACCOUNT_STORAGE_KEY = 'cms_account_id';

let cachedPlatformId: string | null = null;
let cachedAccountId: string | null = null;
let ensurePromise: Promise<{ accountId: string; nickname: string | null }> | null = null;

/**
 * 迁移旧版 localStorage：原先 cms_account_id 存的是设备指纹而非服务端账号 ID。
 * 将旧值迁移到 cms_platform_id，清除后由 ensureAccount 写入真正的服务端 ID。
 */
function migrateLegacyStorage(): void {
  const platformId = localStorage.getItem(PLATFORM_STORAGE_KEY);
  if (platformId) return;

  const legacy = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (legacy) {
    localStorage.setItem(PLATFORM_STORAGE_KEY, legacy);
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  }
}

/** 设备指纹 — 仅用于 register 的 platform_id 参数 */
export function getPlatformId(): string {
  migrateLegacyStorage();
  if (cachedPlatformId) return cachedPlatformId;

  let id = localStorage.getItem(PLATFORM_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLATFORM_STORAGE_KEY, id);
  }
  cachedPlatformId = id;
  return id;
}

/** 持久化服务端返回的 account_id */
export function setServerAccountId(id: string): void {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, id);
  cachedAccountId = id;
}

/**
 * 返回已持久化的服务端 account_id；若尚未注册则返回 null。
 * 异步场景请优先使用 ensureAccount()。
 */
export function getAccountId(): string | null {
  if (cachedAccountId) return cachedAccountId;
  const id = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (id) {
    cachedAccountId = id;
    return id;
  }
  return null;
}

/**
 * 确保账号已在服务端注册，返回服务端 account_id 与昵称。
 * 并发调用共享同一 Promise，避免重复注册。
 */
export async function ensureAccount(): Promise<{ accountId: string; nickname: string | null }> {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const platformId = getPlatformId();
    const info = await register('auto', platformId);
    setServerAccountId(info.account_id);
    return { accountId: info.account_id, nickname: info.nickname };
  })();

  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}
