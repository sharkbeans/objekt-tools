export const dynamic = "force-dynamic";

import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections, objekts } from "@/lib/db/indexer-schema";
import { cosmoAccount, poster, posterHave } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

// POST /api/posters/[id]/check-availability
// Checks poster haves against the owner's inventory. Server-side rate-limited
// to once per 5 minutes per poster so any visitor can trigger it safely.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: posterId } = await params;

  // Skip if checked recently
  const cooldownKey = `poster-avail-cooldown:${posterId}`;
  const recent = await redis.get(cooldownKey);
  if (recent) {
    return NextResponse.json({ skipped: true });
  }

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, posterId),
    columns: { id: true, userId: true, cosmoId: true },
    with: { haves: true },
  });

  if (!row || !row.userId) {
    return NextResponse.json(
      { error: "Not found or anonymous poster" },
      { status: 404 },
    );
  }

  // Only check real objekt haves (skip freeform / no collectionId)
  const checkable = row.haves.filter((h) => !h.freeform && h.collectionId);

  // Set cooldown regardless of outcome so we don't hammer the indexer
  await redis.set(cooldownKey, "1", "EX", 5 * 60);

  if (checkable.length === 0) {
    return NextResponse.json({ available: true, removed: 0, remaining: 0 });
  }

  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, row.userId),
  });

  if (!linked) {
    return NextResponse.json({ available: true, unverifiable: true });
  }

  // If the poster's cosmoId doesn't match the owner's linked nickname, the poster
  // was made for someone else (e.g. posting for a friend). Skip destructive check.
  if (
    row.cosmoId &&
    linked.nickname &&
    row.cosmoId.toLowerCase() !== linked.nickname.toLowerCase()
  ) {
    return NextResponse.json({ available: true, unverifiable: true });
  }

  const allCollectionIds = [...new Set(checkable.map((h) => h.collectionId!))];

  const ownedRows = await mirror
    .select({ collectionId: collections.collectionId, serial: objekts.serial })
    .from(objekts)
    .innerJoin(collections, eq(objekts.collectionId, collections.id))
    .where(
      and(
        eq(objekts.owner, linked.address),
        inArray(collections.collectionId, allCollectionIds),
      ),
    );

  const ownedSet = new Set(
    ownedRows.map((r) => `${r.collectionId}:${r.serial}`),
  );
  const ownedCollections = new Set(ownedRows.map((r) => r.collectionId));

  const available: typeof checkable = [];
  const unavailable: typeof checkable = [];

  for (const have of checkable) {
    const owned =
      have.serial != null
        ? ownedSet.has(`${have.collectionId}:${have.serial}`)
        : ownedCollections.has(have.collectionId!);
    (owned ? available : unavailable).push(have);
  }

  if (unavailable.length === 0) {
    return NextResponse.json({
      available: true,
      removed: 0,
      remaining: available.length,
    });
  }

  if (available.length === 0) {
    // All checkable haves gone — delete the poster
    await db.delete(poster).where(eq(poster.id, posterId));
    await redis.del(`poster:${posterId}`);
    return NextResponse.json({ deleted: true, removed: unavailable.length });
  }

  // Some gone — remove just those rows
  await db.delete(posterHave).where(
    inArray(
      posterHave.id,
      unavailable.map((h) => h.id),
    ),
  );
  await redis.del(`poster:${posterId}`);

  return NextResponse.json({
    available: false,
    removed: unavailable.length,
    remaining: available.length,
    deleted: false,
  });
}
