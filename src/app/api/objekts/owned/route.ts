import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { loadTransferableInventoryRows } from "@/lib/indexer-owned-objekts";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

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

  const rows = await getCached(
    `objekts:owned:v1:${linked.address.toLowerCase()}`,
    30_000,
    () => loadTransferableInventoryRows(linked.address),
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
    objektId: r.objektId,
  }));

  return NextResponse.json({ results });
}
