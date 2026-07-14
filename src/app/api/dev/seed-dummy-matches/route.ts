import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  user as appUser,
  cosmoAccount,
  poster,
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";
import { syncPosterTradePost } from "@/lib/poster-trade-sync";

export const dynamic = "force-dynamic";

const DUMMY_PREFIX = "dummy-match";

type PosterItem = {
  collectionId: string | null;
  collectionNo: string | null;
  member: string | null;
  season: string | null;
  class: string | null;
  thumbnailUrl: string | null;
};

function pickItems<T>(items: T[], start: number, count: number) {
  return Array.from({ length: Math.min(count, items.length) }, (_, offset) => {
    return items[(start + offset) % items.length];
  });
}

function asHaveRow(tradePostId: string, item: PosterItem) {
  return {
    tradePostId,
    collectionId: item.collectionId!,
    collectionNo: item.collectionNo,
    member: item.member,
    season: item.season,
    class: item.class,
    thumbnailUrl: item.thumbnailUrl,
    serial: null,
    objektId: null,
  };
}

function asWantRow(tradePostId: string, item: PosterItem) {
  return {
    tradePostId,
    collectionId: item.collectionId!,
    collectionNo: item.collectionNo,
    member: item.member,
    season: item.season,
    class: item.class,
    thumbnailUrl: item.thumbnailUrl,
    isAny: false,
    artist: null,
  };
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(request.url);
  const posterIdParam = url.searchParams.get("posterId");
  const count = Math.min(
    25,
    Math.max(1, Number(url.searchParams.get("count") ?? 10)),
  );

  const posterRow = posterIdParam
    ? await db.query.poster.findFirst({
        where: eq(poster.id, posterIdParam),
        with: {
          haves: true,
          wants: true,
        },
      })
    : await db.query.poster.findFirst({
        orderBy: desc(poster.updatedAt),
        with: {
          haves: true,
          wants: true,
        },
      });

  if (!posterRow) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  if (!posterRow.userId) {
    return NextResponse.json(
      { error: "List must belong to a signed-in user" },
      { status: 400 },
    );
  }

  const haves = posterRow.haves.filter(
    (item): item is typeof item & { collectionId: string } =>
      item.collectionId !== null,
  );
  const wants = posterRow.wants.filter(
    (item): item is typeof item & { collectionId: string } =>
      item.collectionId !== null,
  );

  if (haves.length === 0 || wants.length === 0) {
    return NextResponse.json(
      { error: "List needs at least one resolved HAVE and WANT item" },
      { status: 400 },
    );
  }

  await syncPosterTradePost(posterRow.id);

  const userIds = Array.from(
    { length: count },
    (_, index) => `${DUMMY_PREFIX}-${posterRow.id}-${index + 1}`,
  );

  await db.transaction(async (tx) => {
    await tx.delete(appUser).where(inArray(appUser.id, userIds));

    for (let index = 0; index < count; index += 1) {
      const n = index + 1;
      const userId = userIds[index];
      const tradePostId = `${userId}-post`;
      const nickname = `dummytrader${String(n).padStart(2, "0")}`;
      const overlappingHaves = pickItems(wants, index, index % 3 === 0 ? 2 : 1);
      const overlappingWants = pickItems(haves, index, index % 4 === 0 ? 2 : 1);

      await tx.insert(appUser).values({
        id: userId,
        name: nickname,
        email: `${userId}@local.test`,
        emailVerified: true,
        image: null,
        discordId: `9000000000000000${String(n).padStart(2, "0")}`,
        discordUsername: `dummy_${String(n).padStart(2, "0")}`,
      });

      await tx.insert(cosmoAccount).values({
        userId,
        address: `0xdummy${posterRow.id}${String(n).padStart(2, "0")}`,
        nickname,
        cosmoId: 900000 + n,
      });

      await tx.insert(tradePost).values({
        id: tradePostId,
        userId,
        description: `Temporary dummy match ${n} for ${posterRow.id}`,
        status: "open",
        wantsOnly: false,
        source: "manual",
      });

      await tx
        .insert(tradePostHave)
        .values(overlappingHaves.map((item) => asHaveRow(tradePostId, item)));

      await tx
        .insert(tradePostWant)
        .values(overlappingWants.map((item) => asWantRow(tradePostId, item)));
    }
  });

  return NextResponse.json({
    ok: true,
    posterId: posterRow.id,
    count,
    dummyUserIds: userIds,
  });
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(request.url);
  const posterId = url.searchParams.get("posterId");

  if (!posterId) {
    return NextResponse.json(
      { error: "posterId is required" },
      { status: 400 },
    );
  }

  const userIds = Array.from(
    { length: 25 },
    (_, index) => `${DUMMY_PREFIX}-${posterId}-${index + 1}`,
  );

  await db.delete(appUser).where(inArray(appUser.id, userIds));

  return NextResponse.json({ ok: true, posterId });
}
