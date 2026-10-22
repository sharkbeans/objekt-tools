import { type NextRequest, NextResponse } from "next/server";
import { refreshAccessTokenIfNeeded } from "@/lib/cosmo/client";
import { cronAuthError } from "@/lib/cron-auth";

// GET /api/cron/refresh-cosmo-token
// Called by the cron container every 2 minutes. Proactively refreshes the
// Cosmo access token before it expires, so the refresh token is always used
// well within its own lifetime and the chain never goes stale.
export async function GET(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  try {
    const result = await refreshAccessTokenIfNeeded();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cosmo token refresh failed:", error);
    return NextResponse.json(
      { error: "Failed to refresh Cosmo token" },
      { status: 502 },
    );
  }
}
