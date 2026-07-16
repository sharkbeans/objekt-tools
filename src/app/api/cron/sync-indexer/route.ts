import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { syncIndexerMirror } from "@/lib/indexer-mirror-sync";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-indexer
// Called by the cron container every 2 minutes. Pulls collection/objekt
// changes from the remote indexer into the local mirror DB — see
// syncIndexerMirror's header comment for why this runs out-of-band instead
// of on the request path. A no-op 502 until MIRROR_DATABASE_URL is set (see
// Part 2 plan) — safe to deploy ahead of the mirror DB existing.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  let authorized = false;
  try {
    authorized =
      authHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    authorized = false;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncIndexerMirror();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Indexer mirror sync failed:", error);
    return NextResponse.json(
      { error: "Failed to sync indexer mirror" },
      { status: 502 },
    );
  }
}
