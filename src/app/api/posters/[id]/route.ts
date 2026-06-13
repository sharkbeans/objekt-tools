import crypto from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth-server";
import { getClientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { poster, posterHave, posterWant } from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import { sanitizeNoteText } from "@/lib/sanitize-text";

interface PosterItemInput {
  collectionId?: string;
  collectionNo?: string;
  member?: string;
  season?: string;
  class?: string;
  thumbnailUrl?: string;
  serial?: number;
  objektId?: string;
  quantity?: number;
  freeform?: boolean;
  rawLabel?: string;
  onOffline?: string;
  position?: number;
}

const POSTER_CACHE_TTL = 60; // seconds

function posterCacheKey(id: string) {
  return `poster:${id}`;
}

// GET /api/posters/[id] — fetch poster + items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cached = await redis.get(posterCacheKey(id));
  if (cached) {
    return new NextResponse(cached as string, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Cache": "HIT",
      },
    });
  }

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    with: {
      haves: { orderBy: asc(posterHave.position) },
      wants: { orderBy: asc(posterWant.position) },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Never expose editToken in the public read response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { editToken: _et, createdByIp: _ip, ...safe } = row;

  const body = JSON.stringify(safe);
  await redis.set(posterCacheKey(id), body, "EX", POSTER_CACHE_TTL);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Cache": "MISS",
    },
  });
}

// PATCH /api/posters/[id] — update poster (always-live)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const ip = getClientIp(request);

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    columns: { id: true, userId: true, editToken: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Authorization
  let authorized = false;
  if (session && row.userId && session.user.id === row.userId) {
    authorized = true;
  } else if (!row.userId && row.editToken) {
    const token = request.headers.get("x-poster-edit-token") ?? "";
    // Constant-time compare to prevent timing attacks
    if (token.length > 0) {
      try {
        authorized = crypto.timingSafeEqual(
          Buffer.from(token),
          Buffer.from(row.editToken),
        );
      } catch {
        authorized = false;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limiting
  if (session) {
    const key = `rate-limit:poster-edit:${session.user.id}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 60);
    if (attempts > 20) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
  } else {
    const key = `rate-limit:poster-edit-ip:${ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 600);
    if (attempts > 10) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
  }

  const body = (await request.json()) as {
    username?: string;
    cosmoId?: string;
    notes?: string;
    theme?: string;
    groupByMember?: boolean;
    groupByNumbers?: boolean;
    colsPerRow?: number;
    haveTitle?: string;
    wantTitle?: string;
    haves?: PosterItemInput[];
    wants?: PosterItemInput[];
  };

  const { haves, wants, notes } = body;

  if ((haves?.length ?? 0) + (wants?.length ?? 0) > 200) {
    return NextResponse.json(
      { error: "Too many items (max 200 total)" },
      { status: 400 },
    );
  }

  const sanitizedNotes =
    notes !== undefined ? sanitizeNoteText(notes) || null : undefined;

  if (sanitizedNotes && sanitizedNotes.length > 500) {
    return NextResponse.json(
      { error: "Notes must be 500 characters or less" },
      { status: 400 },
    );
  }

  const updateValues: {
    username?: string;
    cosmoId?: string;
    theme?: string;
    groupByMember?: boolean;
    groupByNumbers?: boolean;
    colsPerRow?: number;
    haveTitle?: string;
    wantTitle?: string;
    notes?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (body.username !== undefined) updateValues.username = body.username;
  if (body.cosmoId !== undefined) updateValues.cosmoId = body.cosmoId;
  if (body.theme !== undefined) updateValues.theme = body.theme;
  if (body.groupByMember !== undefined)
    updateValues.groupByMember = body.groupByMember;
  if (body.groupByNumbers !== undefined)
    updateValues.groupByNumbers = body.groupByNumbers;
  if (body.colsPerRow !== undefined) updateValues.colsPerRow = body.colsPerRow;
  if (body.haveTitle !== undefined) updateValues.haveTitle = body.haveTitle;
  if (body.wantTitle !== undefined) updateValues.wantTitle = body.wantTitle;
  if (sanitizedNotes !== undefined) updateValues.notes = sanitizedNotes;

  const version = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(poster)
      .set({ ...updateValues, version: sql`${poster.version} + 1` })
      .where(eq(poster.id, id))
      .returning({ version: poster.version });

    // Replace items if provided
    if (haves !== undefined) {
      await tx.delete(posterHave).where(eq(posterHave.posterId, id));
      if (haves.length > 0) {
        await tx.insert(posterHave).values(
          haves.map((h, i) => ({
            posterId: id,
            collectionId: h.collectionId ?? null,
            collectionNo: h.collectionNo ?? null,
            member: h.member ?? null,
            season: h.season ?? null,
            class: h.class ?? null,
            thumbnailUrl: h.thumbnailUrl ?? null,
            serial: h.serial ?? null,
            objektId: h.objektId ?? null,
            quantity: h.quantity ?? 1,
            freeform: h.freeform ?? false,
            rawLabel: h.rawLabel ?? null,
            onOffline: h.onOffline ?? null,
            position: h.position ?? i,
          })),
        );
      }
    }

    if (wants !== undefined) {
      await tx.delete(posterWant).where(eq(posterWant.posterId, id));
      if (wants.length > 0) {
        await tx.insert(posterWant).values(
          wants.map((w, i) => ({
            posterId: id,
            collectionId: w.collectionId ?? null,
            collectionNo: w.collectionNo ?? null,
            member: w.member ?? null,
            season: w.season ?? null,
            class: w.class ?? null,
            thumbnailUrl: w.thumbnailUrl ?? null,
            serial: w.serial ?? null,
            objektId: w.objektId ?? null,
            quantity: w.quantity ?? 1,
            freeform: w.freeform ?? false,
            rawLabel: w.rawLabel ?? null,
            onOffline: w.onOffline ?? null,
            position: w.position ?? i,
          })),
        );
      }
    }

    return updated?.version ?? 1;
  });

  await redis.del(posterCacheKey(id));

  return NextResponse.json({ id, version });
}

// DELETE /api/posters/[id] — delete own poster
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    columns: { id: true, userId: true },
  });

  if (!row || row.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Not found or not yours" },
      { status: 404 },
    );
  }

  await db.delete(poster).where(eq(poster.id, id));
  await redis.del(posterCacheKey(id));

  return NextResponse.json({ success: true });
}
