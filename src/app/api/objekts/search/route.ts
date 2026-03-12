import { NextRequest, NextResponse } from "next/server";
import { ilike, or, inArray, and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") || "";
  const artists = params.getAll("artist");
  const members = params.getAll("member");
  const seasons = params.getAll("season");
  const classes = params.getAll("class");
  const onOffline = params.getAll("on_offline");

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
    artists.length || members.length || seasons.length || classes.length || onOffline.length;

  if (!q.trim() && !hasFilters) {
    return NextResponse.json({ results: [] });
  }

  if (artists.length) conditions.push(inArray(collections.artist, artists));
  if (members.length) conditions.push(inArray(collections.member, members));
  if (seasons.length) conditions.push(inArray(collections.season, seasons));
  if (classes.length) conditions.push(inArray(collections.class, classes));
  if (onOffline.length === 1) {
    conditions.push(eq(collections.onOffline, onOffline[0] as "online" | "offline"));
  }

  const rows = await indexer
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
    .limit(200);

  return NextResponse.json({ results: rows });
}
