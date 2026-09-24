import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { readHuntInput } from "@/lib/hunts/hunt-input";
import { listSavedHunts, saveHunt } from "@/lib/hunts/saved-hunts";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// GET /api/hunts — my saved hunts, each with wants recomputed from current
// ownership (see lib/hunts/saved-hunts.ts).
export async function GET() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return unauthorized();
  }
  return NextResponse.json({ hunts: await listSavedHunts(session.user.id) });
}

// PUT /api/hunts — save the hunt for one grid, replacing any earlier one for
// the same member/season/edition. Only for the user's own linked account.
export async function PUT(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return unauthorized();
  }

  if (await isRateLimited(`rate-limit:hunts:${session.user.id}`, 30, 60))
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = readHuntInput(body);
  if (typeof input === "string")
    return NextResponse.json({ error: input }, { status: 400 });

  const result = await saveHunt(session.user.id, input);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  return NextResponse.json({ id: result.id });
}
