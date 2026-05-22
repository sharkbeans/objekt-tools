type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

const globalCache = globalThis as typeof globalThis & {
  __serverTtlCache?: Map<string, CacheEntry<unknown>>;
};

const cache =
  globalCache.__serverTtlCache ?? new Map<string, CacheEntry<unknown>>();
globalCache.__serverTtlCache = cache;

const MAX_CACHE_ENTRIES = 500;

function pruneCache(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

export async function getCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.pending) {
    return existing.pending;
  }

  const pending = load()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      pruneCache(Date.now());
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { pending, expiresAt: now + ttlMs });
  return pending;
}
