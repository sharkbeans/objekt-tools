import { type NextRequest, NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";
import { syncIndexerMirror } from "@/lib/indexer-mirror-sync";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-indexer
// Called by the cron container every 2 minutes. Pulls collection metadata
// from the remote indexer into the local mirror DB — see
// syncIndexerMirror's header comment for why this runs out-of-band instead
// of on the request path. A no-op 502 until MIRROR_DATABASE_URL is set —
// safe to deploy ahead of the mirror DB existing.
export async function GET(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

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
