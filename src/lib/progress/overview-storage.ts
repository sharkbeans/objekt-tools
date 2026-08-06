// Session-scoped cache of collection overview responses, keyed by wallet.
//
// React Query already caches the overview in memory, but that cache only
// survives while the app stays mounted and only for `gcTime` after the last
// observer unmounts — so hopping to someone else's collection and coming back
// can land on a cold cache and re-run the (slow) indexer scan. Persisting the
// response means a return visit paints instantly and revalidates in the
// background instead, and it survives a reload too.
//
// sessionStorage (not localStorage) on purpose: ownership counts go stale as
// soon as a trade lands, so the cache should not outlive the tab.

import type { ProgressOverviewResponse } from "./types";

const KEY_PREFIX = "collection-overview:address:";
// Enough for a bit of back-and-forth between profiles without hoarding.
const MAX_ENTRIES = 5;
// A hard ceiling on how old a painted-from-cache view may be. React Query
// revalidates on mount anyway (staleTime is 60s); this only bounds what a
// cold start is allowed to show before the refetch lands.
const MAX_AGE_MS = 60 * 60_000;

export type StoredOverview = {
  savedAt: number;
  data: ProgressOverviewResponse;
};

// Parsing a stored response twice per mount (initialData +
// initialDataUpdatedAt) is wasteful, so keep the last parse around.
const parsed = new Map<string, StoredOverview | null>();

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage disabled (private mode, blocked cookies) — degrade to no cache.
    return null;
  }
}

function storageKey(address: string): string {
  return `${KEY_PREFIX}${address.toLowerCase()}`;
}

function isOverview(value: unknown): value is ProgressOverviewResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProgressOverviewResponse>;
  return (
    typeof candidate.nickname === "string" &&
    typeof candidate.address === "string" &&
    Array.isArray(candidate.rollups)
  );
}

export function readStoredOverview(address: string): StoredOverview | null {
  const key = storageKey(address);
  const memo = parsed.get(key);
  if (memo !== undefined) return memo;

  const store = storage();
  if (!store) return null;

  let entry: StoredOverview | null = null;
  try {
    const raw = store.getItem(key);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      const savedAt = (value as Partial<StoredOverview>)?.savedAt;
      const data = (value as Partial<StoredOverview>)?.data;
      if (
        typeof savedAt === "number" &&
        Date.now() - savedAt < MAX_AGE_MS &&
        isOverview(data)
      ) {
        entry = { savedAt, data };
      } else {
        store.removeItem(key);
      }
    }
  } catch {
    // Corrupt entry — treat as a miss.
    entry = null;
  }

  parsed.set(key, entry);
  return entry;
}

// Drop the oldest entries until at most `keep` remain.
function evictOldest(store: Storage, keep: number) {
  const entries: { key: string; savedAt: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    let savedAt = 0;
    try {
      savedAt = JSON.parse(store.getItem(key) ?? "{}")?.savedAt ?? 0;
    } catch {
      savedAt = 0;
    }
    entries.push({ key, savedAt });
  }
  entries.sort((a, b) => b.savedAt - a.savedAt);
  for (const { key } of entries.slice(keep)) {
    store.removeItem(key);
    parsed.delete(key);
  }
}

export function writeStoredOverview(
  address: string,
  data: ProgressOverviewResponse,
) {
  const key = storageKey(address);
  const entry: StoredOverview = { savedAt: Date.now(), data };
  parsed.set(key, entry);

  const store = storage();
  if (!store) return;

  const serialized = JSON.stringify(entry);
  try {
    evictOldest(store, MAX_ENTRIES - 1);
    store.setItem(key, serialized);
  } catch {
    // Over quota — keep only this wallet and try once more.
    try {
      evictOldest(store, 0);
      store.setItem(key, serialized);
    } catch {
      // Still no room; the in-memory React Query cache is enough.
    }
  }
}
