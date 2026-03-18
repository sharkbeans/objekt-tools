import { eq, and, asc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { indexer } from "@/lib/db/indexer";
import { objekts, collections } from "@/lib/db/indexer-schema";

// GET /api/objekts/user/[address]
// Returns transferable objekts owned by the given Cosmo address.
// Requires authentication but can query any address.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address } = await params;

  if (!address || address.length < 10) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const rows = await indexer
    .select({
      collectionId: collections.collectionId,
      artist: collections.artist,
      member: collections.member,
      collectionNo: collections.collectionNo,
      season: collections.season,
      class: collections.class,
      thumbnailImage: collections.thumbnailImage,
      serial: objekts.serial,
      objektId: objekts.id,
    })
    .from(objekts)
    .innerJoin(collections, eq(objekts.collectionId, collections.id))
    .where(
      and(
        eq(objekts.owner, address),
        eq(objekts.transferable, true),
      ),
    )
    .orderBy(asc(collections.member), asc(collections.collectionNo))
    .limit(500);

  const results = rows.map((r) => ({
    collectionId: r.collectionId,
    artist: r.artist,
    member: r.member,
    collectionNo: r.collectionNo,
    season: r.season,
    class: r.class,
    thumbnailImage: r.thumbnailImage,
    serial: r.serial,
    objektId: r.objektId,
  }));

  return NextResponse.json({ results });
}
