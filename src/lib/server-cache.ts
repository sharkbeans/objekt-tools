type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
  staleValue?: T;
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

export function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  pruneCache(Date.now());
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

  const stale = existing?.staleValue ?? existing?.value;

  const pending = load()
    .then((value) => {
      setCachedValue(key, value, ttlMs);
      return value;
    })
    .catch((error) => {
      if (stale !== undefined) {
        // Keep stale data so callers aren't broken while the remote is flaky.
        cache.set(key, { staleValue: stale, expiresAt: now + 60_000 });
        return stale;
      }
      cache.delete(key);
      throw error;
    });

  cache.set(key, { pending, expiresAt: now + ttlMs, staleValue: stale });
  return pending;
}

/**
 * Returns a fresh cached value when available. Once that value expires, the
 * stale value is returned immediately while one deduplicated refresh runs in
 * the background. A truly cold key still waits for its first load.
 */
export async function getCachedStaleWhileRevalidate<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  const stale = existing?.staleValue ?? existing?.value;

  if (existing?.pending) {
    return stale !== undefined ? stale : existing.pending;
  }

  const pending = load()
    .then((value) => {
      setCachedValue(key, value, ttlMs);
      return value;
    })
    .catch((error) => {
      if (stale !== undefined) {
        // Back off briefly after a failed refresh while continuing to serve
        // the last known value.
        cache.set(key, {
          value: stale,
          expiresAt: Date.now() + 60_000,
        });
        return stale;
      }
      cache.delete(key);
      throw error;
    });

  cache.set(key, { pending, expiresAt: now + ttlMs, staleValue: stale });
  return stale !== undefined ? stale : pending;
}
