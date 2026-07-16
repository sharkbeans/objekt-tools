// Transfer matching for active trades, keyed by collection rather than the
// pinned objektId. The indexer's per-serial data is unreliable, so a side is
// considered fulfilled when ANY objekt of the right collection moves between
// the right two addresses — not specifically the serial the parties picked
// when creating the trade.
import { and, gte, inArray } from "drizzle-orm";
// Stays on the remote indexer, never the mirror — matches sides against the
// live `transfer` feed, which the mirror doesn't carry. `fetchSerials` also
// stays remote here since fresh mints may not be in the mirror yet. See
// Part 2 plan, Phase 6.
import { indexer } from "@/lib/db/indexer";
import { collections, objekts, transfers } from "@/lib/db/indexer-schema";

export interface CollectionTransferEvent {
  objektId: string;
  from: string;
  to: string;
  timestamp: Date;
  collectionSlug: string;
}

// Resolves collection slugs (e.g. "cream02-101-z") to indexer UUIDs.
export async function resolveCollectionUuids(
  slugs: string[],
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await indexer
    .select({ id: collections.id, collectionId: collections.collectionId })
    .from(collections)
    .where(inArray(collections.collectionId, [...new Set(slugs)]));
  return new Map(rows.map((r) => [r.collectionId, r.id]));
}

// Fetches transfer events for a set of collections, scoped to the given
// addresses and a time cutoff, with each event tagged by collection slug.
export async function fetchCollectionTransferEvents({
  collectionSlugs,
  addresses,
  since,
}: {
  collectionSlugs: string[];
  addresses: string[];
  since?: Date | null;
}): Promise<CollectionTransferEvent[]> {
  if (collectionSlugs.length === 0 || addresses.length === 0) return [];

  const uuidBySlug = await resolveCollectionUuids(collectionSlugs);
  const collectionUuids = [...uuidBySlug.values()];
  if (collectionUuids.length === 0) return [];

  const slugByUuid = new Map(
    [...uuidBySlug.entries()].map(([slug, id]) => [id, slug]),
  );

  const rows = await indexer
    .select({
      objektId: transfers.objektId,
      from: transfers.from,
      to: transfers.to,
      timestamp: transfers.timestamp,
      collectionId: transfers.collectionId,
    })
    .from(transfers)
    .where(
      and(
        inArray(transfers.collectionId, collectionUuids),
        inArray(transfers.from, addresses),
        inArray(transfers.to, addresses),
        since ? gte(transfers.timestamp, since) : undefined,
      ),
    );

  const events: CollectionTransferEvent[] = [];
  for (const r of rows) {
    if (!r.objektId || !r.collectionId) continue;
    const collectionSlug = slugByUuid.get(r.collectionId);
    if (!collectionSlug) continue;
    events.push({
      objektId: r.objektId,
      from: r.from,
      to: r.to,
      timestamp: r.timestamp,
      collectionSlug,
    });
  }
  return events;
}

// Deterministically picks the earliest matching, unclaimed transfer for a
// side. Sorting by (timestamp, objektId) keeps repeated polls stable so the
// same side always claims the same transfer once one is available.
export function pickTransferForSide(
  events: CollectionTransferEvent[],
  {
    from,
    to,
    collectionSlug,
    excludeObjektIds,
  }: {
    from: string;
    to: string;
    collectionSlug: string;
    excludeObjektIds: ReadonlySet<string>;
  },
): CollectionTransferEvent | undefined {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  const candidates = events
    .filter(
      (e) =>
        e.collectionSlug === collectionSlug &&
        e.from.toLowerCase() === fromLower &&
        e.to.toLowerCase() === toLower &&
        !excludeObjektIds.has(e.objektId),
    )
    .sort((a, b) => {
      const t = a.timestamp.getTime() - b.timestamp.getTime();
      if (t !== 0) return t;
      return a.objektId.localeCompare(b.objektId);
    });
  return candidates[0];
}

// Looks up current serials for a batch of objekt IDs (for transfer-log display).
export async function fetchSerials(
  objektIds: string[],
): Promise<Map<string, number>> {
  if (objektIds.length === 0) return new Map();
  const rows = await indexer
    .select({ id: objekts.id, serial: objekts.serial })
    .from(objekts)
    .where(inArray(objekts.id, [...new Set(objektIds)]));
  return new Map(rows.map((r) => [r.id, r.serial]));
}
