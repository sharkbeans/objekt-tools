"use client";

import type { CatalogRow } from "@/lib/objekt-catalog";

let cached: { promise: Promise<CatalogRow[]>; expiresAt: number } | null = null;
const TTL_MS = 30 * 60_000;

/**
 * Fetches the full trimmed objekt catalog, memoized in-module for 30
 * minutes so concurrent callers (e.g. resolving haves and wants in
 * parallel) share one request. Framework-agnostic — usable outside React
 * (see poster-resolver.ts) as well as from the useObjektCatalog hook.
 */
export function fetchObjektCatalog(): Promise<CatalogRow[]> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetch("/api/objekts/catalog")
    .then((res) => (res.ok ? res.json() : { collections: [] }))
    .then((data) => (data.collections ?? []) as CatalogRow[])
    .catch(() => {
      cached = null;
      return [] as CatalogRow[];
    });

  cached = { promise, expiresAt: now + TTL_MS };
  return promise;
}
