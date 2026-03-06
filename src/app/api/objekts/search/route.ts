import { NextRequest, NextResponse } from "next/server";
import { ilike, or } from "drizzle-orm";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${q}%`;

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
    .where(
      or(
        ilike(collections.member, pattern),
        ilike(collections.collectionId, pattern),
        ilike(collections.season, pattern),
        ilike(collections.collectionNo, pattern),
      ),
    )
    .limit(20);

  return NextResponse.json({ results: rows });
}
