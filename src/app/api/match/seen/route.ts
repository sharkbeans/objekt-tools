import { and, eq, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { discordPasteSeen } from "@/lib/db/schema";
import { parseSeenId, type SeenKind } from "@/lib/match/seen-id";

export const dynamic = "force-dynamic";

// A day of a busy trade channel is roughly 1,300 distinct posts, so this leaves
// room for a first sync after signing in without inviting an unbounded insert.
const MAX_IDS = 500;

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

/** Read `{ ids: [...] }`, keeping only ids in the shape we write. */
async function readIds(
  request: NextRequest,
): Promise<{ kind: SeenKind; hash: string }[] | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || !("ids" in body))
    return null;
  if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS) return null;
  const parsed = body.ids
    .map(parseSeenId)
    .filter((id): id is { kind: SeenKind; hash: string } => id !== null);
  return parsed.length ? parsed : null;
}

// GET /api/match/seen — every triage id this user has stored.
export async function GET() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return unauthorized();
  }

  const rows = await db
    .select({ kind: discordPasteSeen.kind, hash: discordPasteSeen.hash })
    .from(discordPasteSeen)
    .where(eq(discordPasteSeen.userId, session.user.id));

  return NextResponse.json({ seen: rows.map((r) => `${r.kind}:${r.hash}`) });
}

// POST /api/match/seen — mark posts triaged or traders muted. Idempotent.
export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return unauthorized();
  }

  const ids = await readIds(request);
  if (!ids)
    return badRequest(`Body must be { ids: string[] }, at most ${MAX_IDS}`);

  await db
    .insert(discordPasteSeen)
    .values(
      ids.map(({ kind, hash }) => ({ userId: session.user.id, kind, hash })),
    )
    .onConflictDoNothing();

  return NextResponse.json({ stored: ids.length });
}

// DELETE /api/match/seen — un-hide specific ids, or clear the lot with
// `{ all: true }`.
export async function DELETE(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return unauthorized();
  }

  const cloned = request.clone();
  let all = false;
  try {
    const body: unknown = await cloned.json();
    all =
      typeof body === "object" &&
      body !== null &&
      "all" in body &&
      body.all === true;
  } catch {
    // Fall through to the id-list read, which reports its own error.
  }

  if (all) {
    await db
      .delete(discordPasteSeen)
      .where(eq(discordPasteSeen.userId, session.user.id));
    return NextResponse.json({ cleared: true });
  }

  const ids = await readIds(request);
  if (!ids) {
    return badRequest(`Body must be { ids: string[] } or { all: true }`);
  }

  await db
    .delete(discordPasteSeen)
    .where(
      and(
        eq(discordPasteSeen.userId, session.user.id),
        or(
          ...ids.map(({ kind, hash }) =>
            and(
              eq(discordPasteSeen.kind, kind),
              eq(discordPasteSeen.hash, hash),
            ),
          ),
        ),
      ),
    );

  return NextResponse.json({ removed: ids.length });
}
