import type { SQL } from "drizzle-orm";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

function normalizeCacheKey(params: URLSearchParams) {
  const normalized = new URLSearchParams();
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(key).sort()) {
      normalized.append(key, value);
    }
  }
  return normalized.toString();
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") || "";
  if (q && q.length > 200) {
    return NextResponse.json(
      { error: "Search query too long" },
      { status: 400 },
    );
  }

  const artists = params.getAll("artist");
  const members = params.getAll("member");
  const seasons = params.getAll("season");
  const classes = params.getAll("class");
  const onOffline = params.getAll("on_offline");
  const collectionIds = params.getAll("collection_id");

  const maxFilterItems = 20;
  if (
    artists.length > maxFilterItems ||
    members.length > maxFilterItems ||
    seasons.length > maxFilterItems ||
    classes.length > maxFilterItems
  ) {
    return NextResponse.json(
      { error: "Too many filter values" },
      { status: 400 },
    );
  }
  if (collectionIds.length > 100) {
    return NextResponse.json(
      { error: "Too many collection ids" },
      { status: 400 },
    );
  }

  const conditions: SQL[] = [];

  if (q.trim()) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(collections.member, pattern),
        ilike(collections.collectionId, pattern),
        ilike(collections.season, pattern),
        ilike(collections.collectionNo, pattern),
      ) as SQL,
    );
  }

  const hasFilters =
    artists.length ||
    members.length ||
    seasons.length ||
    classes.length ||
    onOffline.length ||
    collectionIds.length;

  if (!q.trim() && !hasFilters) {
    return NextResponse.json({ results: [] });
  }

  if (collectionIds.length) {
    conditions.push(inArray(collections.collectionId, collectionIds));
  }
  if (artists.length) conditions.push(inArray(collections.artist, artists));
  if (members.length) conditions.push(inArray(collections.member, members));
  if (seasons.length) conditions.push(inArray(collections.season, seasons));
  if (classes.length) conditions.push(inArray(collections.class, classes));
  if (
    onOffline.length === 1 &&
    (onOffline[0] === "online" || onOffline[0] === "offline")
  ) {
    conditions.push(eq(collections.onOffline, onOffline[0]));
  }

  const rows = await getCached(
    `objekts:search:v2:${normalizeCacheKey(params)}`,
    5 * 60_000,
    () =>
      indexer
        .select({
          collectionId: collections.collectionId,
          artist: collections.artist,
          member: collections.member,
          collectionNo: collections.collectionNo,
          season: collections.season,
          class: collections.class,
          frontImage: collections.frontImage,
          thumbnailImage: collections.thumbnailImage,
        })
        .from(collections)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(200),
  );

  return NextResponse.json(
    { results: rows },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    },
  );
}
