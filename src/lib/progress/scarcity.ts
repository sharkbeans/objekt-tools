import { count, eq, sql } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";
import { deriveScarcityTier, type ScarcityTier } from "./scarcity-tier";

export type Scarcity = {
  supply: number; // total minted copies ("Copies")
  transferable: number; // copies that aren't locked/spun ("Non-Spin")
  tier: ScarcityTier;
};

/**
 * Per-collection on-chain scarcity for one member, keyed by the collection
 * UUID (`collection.id`). Global aggregate (not per-user), so it's cached
 * aggressively — same pattern as `progress:totals` / `progress:collections`.
 *
 * One grouped query over the (member-bounded) `objekt` table:
 *   supply       = total minted copies
 *   transferable = copies that aren't locked/spun (the rest are "Spin")
 */
export function getMemberScarcity(
  member: string,
): Promise<Map<string, Scarcity>> {
  return getCached(
    `progress:scarcity:v1:${member.toLowerCase()}`,
    10 * 60_000,
    async () => {
      const rows = await indexer
        .select({
          id: collections.id,
          supply: count(),
          transferable:
            sql<number>`count(*) filter (where ${objekts.transferable})`.mapWith(
              Number,
            ),
        })
        .from(objekts)
        .innerJoin(collections, eq(objekts.collectionId, collections.id))
        .where(eq(collections.member, member))
        .groupBy(collections.id);

      const map = new Map<string, Scarcity>();
      for (const row of rows) {
        map.set(row.id, {
          supply: row.supply,
          transferable: row.transferable,
          tier: deriveScarcityTier(row.supply),
        });
      }
      return map;
    },
  );
}
