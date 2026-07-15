"use client";

import { useQuery } from "@tanstack/react-query";
import type { CatalogRow } from "@/lib/objekt-catalog";
import { fetchObjektCatalog } from "@/lib/objekt-catalog-client";
import { makeObjektSearchTags } from "@/lib/objekt-search";

export type CatalogEntry = CatalogRow & { tags: string[] };

/**
 * The full objekt catalog with search tags precomputed once per fetch
 * (not per keystroke). Cached indefinitely client-side — new collections
 * appear after a reload, bounded by the 30min server-side cache.
 */
export function useObjektCatalog() {
  return useQuery<CatalogEntry[]>({
    queryKey: ["objekt-catalog"],
    queryFn: async () => {
      const rows = await fetchObjektCatalog();
      return rows.map((row) => ({ ...row, tags: makeObjektSearchTags(row) }));
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
