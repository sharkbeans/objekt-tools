import { loadOwnedCollectionCountsByDbId } from "@/lib/indexer-owned-objekts";
import { getCached, getCachedStaleWhileRevalidate } from "@/lib/server-cache";

const OWNED_COLLECTION_COUNTS_TTL_MS = 90_000;

function ownedCollectionCountsKey(address: string) {
  return `progress:owned-counts:v1:${address.toLowerCase()}`;
}

/**
 * The ownership query returns counts for the entire wallet, not one member.
 * Keep one shared snapshot so the overview and every member page reuse the
 * same indexer result during normal collection navigation.
 */
export function getCachedOwnedCollectionCounts(address: string) {
  const normalizedAddress = address.toLowerCase();
  return getCachedStaleWhileRevalidate(
    ownedCollectionCountsKey(normalizedAddress),
    OWNED_COLLECTION_COUNTS_TTL_MS,
    () => loadOwnedCollectionCountsByDbId(normalizedAddress),
  );
}

/**
 * Background rollup rebuilds must wait for the refreshed ownership snapshot
 * rather than marking a stale nested snapshot as fresh for another TTL.
 */
export function getFreshOwnedCollectionCounts(address: string) {
  const normalizedAddress = address.toLowerCase();
  return getCached(
    ownedCollectionCountsKey(normalizedAddress),
    OWNED_COLLECTION_COUNTS_TTL_MS,
    () => loadOwnedCollectionCountsByDbId(normalizedAddress),
  );
}
