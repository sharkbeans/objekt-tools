import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
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

interface CreatePosterBody {
  username?: string;
  cosmoId?: string;
  notes?: string;
  theme?: string;
  groupByMember?: boolean;
  groupByNumbers?: boolean;
  colsPerRow?: number;
  haveTitle?: string;
  wantTitle?: string;
  haves: PosterItemInput[];
  wants: PosterItemInput[];
}

// POST /api/posters — create a poster (requires auth)
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Sign in to save your poster" },
      { status: 401 },
    );
  }

  const key = `rate-limit:poster-create:${session.user.id}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, 60);
  if (attempts > 10) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json()) as CreatePosterBody;
  const {
    haves = [],
    wants = [],
    username,
    cosmoId,
    notes,
    theme,
    groupByMember,
    groupByNumbers,
    colsPerRow,
    haveTitle,
    wantTitle,
  } = body;

  if (haves.length + wants.length > 200) {
    return NextResponse.json(
      { error: "Too many items (max 200 total)" },
      { status: 400 },
    );
  }

  const sanitizedNotes = notes
    ? sanitizeNoteText(notes) || undefined
    : undefined;
  if (sanitizedNotes && sanitizedNotes.length > 500) {
    return NextResponse.json(
      { error: "Notes must be 500 characters or less" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(poster)
    .values({
      userId: session.user.id,
      editToken: null,
      createdByIp: null,
      username: username ?? null,
      cosmoId: cosmoId ?? null,
      notes: sanitizedNotes ?? null,
      theme: theme ?? "dark",
      groupByMember: groupByMember ?? false,
      groupByNumbers: groupByNumbers ?? true,
      colsPerRow: colsPerRow ?? 5,
      haveTitle: haveTitle ?? "Have",
      wantTitle: wantTitle ?? "Want",
    })
    .returning();

  if (haves.length > 0) {
    await db.insert(posterHave).values(
      haves.map((h, i) => ({
        posterId: row.id,
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

  if (wants.length > 0) {
    await db.insert(posterWant).values(
      wants.map((w, i) => ({
        posterId: row.id,
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

  return NextResponse.json({ id: row.id }, { status: 201 });
}
