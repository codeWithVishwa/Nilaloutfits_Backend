// Tiny in-memory TTL cache. Sufficient for a single-instance deployment (the
// current VPS setup). If the app is ever scaled horizontally, swap this for a
// shared store (Redis) without changing call sites.

const store = new Map();

export const getCached = (key) => {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
};

export const setCached = (key, value, ttlMs) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};

// Pass no key to clear everything. Supports a prefix match so related entries
// (e.g. all 'bestSelling:*') can be invalidated together.
export const clearCached = (key) => {
  if (!key) {
    store.clear();
    return;
  }
  if (key.endsWith('*')) {
    const prefix = key.slice(0, -1);
    for (const existingKey of store.keys()) {
      if (existingKey.startsWith(prefix)) store.delete(existingKey);
    }
    return;
  }
  store.delete(key);
};
