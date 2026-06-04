// Device auth — auto-register on first visit.
// Stores account_id in localStorage, reuses across sessions.

const STORAGE_KEY = 'cms_account_id';

let cachedId: string | null = null;

export function getAccountId(): string {
  if (cachedId) return cachedId;

  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  cachedId = id;
  return id;
}
