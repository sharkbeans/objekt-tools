type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
  staleValue?: T;
};

type Store = Map<string, CacheEntry<unknown>>;

export type ServerCacheOptions = {
  /**
   * Most entries kept at once. In-flight loads are never evicted, so the store
   * can briefly exceed this while they settle.
   */
  maxEntries?: number;
  /**
   * How long an expired value stays around to be served as stale data — by
   * stale-while-revalidate, and by the backoff after a failed load.
   */
  staleRetentionMs?: number;
};

export interface ServerCache {
  getCached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;
  getCachedStaleWhileRevalidate<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T>;
  setCachedValue<T>(key: string, value: T, ttlMs: number): void;
}

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_STALE_RETENTION_MS = 15 * 60_000;

// Stores live on globalThis so dev-server module reloads keep their contents.
const globalStores = globalThis as typeof globalThis & {
  __serverTtlCaches?: Map<string, Store>;
};
const stores = globalStores.__serverTtlCaches ?? new Map<string, Store>();
globalStores.__serverTtlCaches = stores;

/**
 * An in-memory TTL cache with its own entry budget.
 *
 * Give a separate instance to anything that writes many cheap, distinct keys —
 * one per objekt, say. Every instance evicts only its own entries, so a burst
 * of those can't push an expensive progress snapshot out of the default cache.
 */
export function createServerCache(
  name: string,
  {
    maxEntries = DEFAULT_MAX_ENTRIES,
    staleRetentionMs = DEFAULT_STALE_RETENTION_MS,
  }: ServerCacheOptions = {},
): ServerCache {
  const cache: Store = stores.get(name) ?? new Map();
  stores.set(name, cache);

  // A Map iterates in insertion order. Re-inserting a key on every read and
  // write keeps the least recently used entries at the front, which is where
  // eviction starts.
  function touch(key: string, entry: CacheEntry<unknown>) {
    cache.delete(key);
    cache.set(key, entry);
  }

  function prune(now: number) {
    const cutoff = now - staleRetentionMs;
    for (const [key, entry] of cache) {
      if (entry.pending) {
        // A load that outlives its own TTL is treated as hung, so the next
        // caller starts a fresh one instead of waiting on it for ever. Any
        // stale value it was guarding is kept.
        if (entry.expiresAt > now) continue;
        if (entry.staleValue === undefined) cache.delete(key);
        else
          cache.set(key, {
            value: entry.staleValue,
            staleValue: entry.staleValue,
            expiresAt: entry.expiresAt,
          });
      } else if (entry.expiresAt <= cutoff) {
        cache.delete(key);
      }
    }

    // Expired entries are kept, not swept, until the budget needs the room.
    // Sweeping them on every write is what used to throw away the stale value
    // that stale-while-revalidate and the failure backoff exist to serve: one
    // unrelated write after a key expired, and its next read waited on a cold
    // load again.
    if (cache.size <= maxEntries) return;
    for (const [key, entry] of cache) {
      if (cache.size <= maxEntries) return;
      if (!entry.pending && entry.expiresAt <= now) cache.delete(key);
    }
    for (const [key, entry] of cache) {
      if (cache.size <= maxEntries) return;
      // Evicting an in-flight load would let a second caller start a duplicate.
      if (!entry.pending) cache.delete(key);
    }
  }

  function setCachedValue<T>(key: string, value: T, ttlMs: number) {
    touch(key, { value, expiresAt: Date.now() + ttlMs });
    prune(Date.now());
  }

  async function getCached<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const existing = cache.get(key) as CacheEntry<T> | undefined;

    if (existing?.value !== undefined && existing.expiresAt > now) {
      touch(key, existing);
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
          // Keep stale data so callers aren't broken while the remote is flaky,
          // and serve it for a minute before trying again.
          //
          // This has to be written as `value`, not only as `staleValue`. The
          // freshness check reads `value`, so an entry holding a stale value
          // under `staleValue` alone looks like a miss — and the minute this
          // clause exists to wait out never happened. Every request during an
          // outage went straight back to the remote, which is when it can least
          // afford them. `Date.now()` rather than `now`, because the backoff
          // starts when the failure happened and the load may have taken a while
          // to fail.
          cache.set(key, {
            value: stale,
            staleValue: stale,
            expiresAt: Date.now() + 60_000,
          });
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
  async function getCachedStaleWhileRevalidate<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const existing = cache.get(key) as CacheEntry<T> | undefined;

    if (existing?.value !== undefined && existing.expiresAt > now) {
      touch(key, existing);
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
            staleValue: stale,
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

  return { getCached, getCachedStaleWhileRevalidate, setCachedValue };
}

const defaultCache = createServerCache("default");

export const getCached = defaultCache.getCached;
export const getCachedStaleWhileRevalidate =
  defaultCache.getCachedStaleWhileRevalidate;
export const setCachedValue = defaultCache.setCachedValue;
