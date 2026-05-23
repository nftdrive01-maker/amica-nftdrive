const USER_ID_STORAGE_KEY = 'amica_persistent_user_id';

function generateAnonymousUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `anon:${crypto.randomUUID()}`;
  }

  return `anon:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getPersistentUserId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const created = generateAnonymousUserId();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, created);
  return created;
}