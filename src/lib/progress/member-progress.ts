import { eq } from "drizzle-orm";
import {
  CosmoUnavailableError,
  resolveNickname,
} from "@/lib/cosmo/resolve-nickname";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { compareSeasons } from "@/lib/filter-options";
import { membersByArtist } from "@/lib/filters";
import { loadOwnedCollectionCountsByDbId } from "@/lib/indexer-owned-objekts";
import { isCollectionProgressCountable } from "@/lib/progress/countable";
import {
  hasGlobalTradableCopy,
  loadCollectionTradabilityByDbId,
} from "@/lib/progress/tradability";
import { getCached } from "@/lib/server-cache";

export { CosmoUnavailableError };

function artistForMember(member: string): string {
  for (const [artist, members] of Object.entries(membersByArtist)) {
    if (members.includes(member)) return artist;
  }
  return "";
}

export type MemberProgressCollection = {
  collectionNo: string;
  season: string;
  class: string;
  onOffline: string;
  thumbnailImage: string;
  ownedCount: number;
  globalTotalCount: number;
  globalTradableCount: number;
  progressCountable: boolean;
};

export type MemberProgress = {
  nickname: string;
  address: string;
  artist: string;
  collections: MemberProgressCollection[];
};

/**
 * Data loader for the collection member OG image ONLY — deliberately kept
 * out of both generateMetadata() on the collection page and
 * /api/progress/[nickname]/[member]/route.ts. An earlier version wired this
 * same kind of loading into generateMetadata() directly, which made local
 * Next dev repeatedly re-request the page during navigation/RSC/metadata
 * handling. Calling this only from the OG route's own request (which the
 * browser/Discord fetches once, out-of-band from page navigation) is what
 * avoids that. Cache keys are namespaced with "og:" so this never shares
 * (or invalidates) the API route's own cache entries.
 */
export async function loadMemberProgress(
  nickname: string,
  member: string,
): Promise<MemberProgress | null> {
  const resolved = await resolveNickname(nickname);
  if (!resolved) return null;

  const artist = artistForMember(member);

  const [allCollections, ownedCounts] = await Promise.all([
    getCached(
      `og:progress:collections:v1:${member.toLowerCase()}`,
      10 * 60_000,
      () =>
        mirror
          .select({
            id: collections.id,
            collectionNo: collections.collectionNo,
            season: collections.season,
            class: collections.class,
            onOffline: collections.onOffline,
            thumbnailImage: collections.thumbnailImage,
          })
          .from(collections)
          .where(eq(collections.member, member)),
    ),
    getCached(`og:progress:owned:v1:${resolved.address}`, 90_000, () =>
      loadOwnedCollectionCountsByDbId(resolved.address),
    ),
  ]);

  const ownedMap = new Map<string, number>();
  for (const row of ownedCounts) {
    if (row.collectionDbId) ownedMap.set(row.collectionDbId, row.ownedCount);
  }

  const tradabilityById = await getCached(
    `og:progress:tradability:v1:${member.toLowerCase()}`,
    10 * 60_000,
    () => loadCollectionTradabilityByDbId(allCollections.map((c) => c.id)),
  );

  // A/Z dedup: collectionNo like "101A" and "101Z" are the same physical
  // card. Group by (season, numeric prefix); prefer Z, fall back to A.
  // Mirrors /api/progress/[nickname]/[member]/route.ts's own dedup so the
  // OG image's totals match what the page shows.
  type RawCollection = (typeof allCollections)[number];
  const azGroups = new Map<
    string,
    { a?: RawCollection; z?: RawCollection; other?: RawCollection }
  >();
  for (const c of allCollections) {
    const noUpper = c.collectionNo.toUpperCase();
    if (noUpper.endsWith("A") || noUpper.endsWith("Z")) {
      const base = `${c.season}::${noUpper.slice(0, -1)}`;
      const entry = azGroups.get(base) ?? {};
      if (noUpper.endsWith("Z")) entry.z = c;
      else entry.a = c;
      azGroups.set(base, entry);
    } else {
      const base = `${c.season}::${noUpper}`;
      const entry = azGroups.get(base) ?? {};
      entry.other = c;
      azGroups.set(base, entry);
    }
  }

  const deduped: RawCollection[] = [];
  for (const entry of azGroups.values()) {
    if (entry.other) {
      deduped.push(entry.other);
    } else {
      const pick = entry.z ?? entry.a;
      if (pick) deduped.push(pick);
    }
  }

  const result: MemberProgressCollection[] = deduped
    .map((c) => {
      const tradability = tradabilityById.get(c.id);
      return {
        collectionNo: c.collectionNo,
        season: c.season,
        class: c.class,
        onOffline: c.onOffline,
        thumbnailImage: c.thumbnailImage,
        ownedCount: ownedMap.get(c.id) ?? 0,
        globalTotalCount: tradability?.totalCount ?? 0,
        globalTradableCount: tradability?.tradableCount ?? 0,
        progressCountable:
          isCollectionProgressCountable(c) &&
          hasGlobalTradableCopy(tradability),
      };
    })
    .sort((a, b) => {
      const sc = compareSeasons(a.season, b.season);
      if (sc !== 0) return sc;
      return a.collectionNo.localeCompare(b.collectionNo, undefined, {
        numeric: true,
      });
    });

  return {
    nickname: resolved.nickname,
    address: resolved.address,
    artist,
    collections: result,
  };
}
