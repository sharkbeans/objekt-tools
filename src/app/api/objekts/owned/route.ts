import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";1
import { cosmoAccount } from "@/lib/db/schema";
import { indexer } from "@/lib/db/indexer";
import { objekts, collections } from "@/lib/db/indexer-schema";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });

  if (!linked) {
    return NextResponse.json(
      { error: "Cosmo account not linked" },
      { status: 404 },
    );
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
    })
    .from(objekts)
    .innerJoin(collections, eq(objekts.collectionId, collections.id))
    .where(
      and(
        eq(objekts.owner, linked.address),
        eq(objekts.transferable, true),
      ),
    );

  const results = rows.map((r) => ({
    collectionId: r.collectionId,
    artist: r.artist,
    member: r.member,
    collectionNo: r.collectionNo,
    season: r.season,
    class: r.class,
    thumbnailImage: r.thumbnailImage,
    serial: r.serial,
  }));

  return NextResponse.json({ results });
}
