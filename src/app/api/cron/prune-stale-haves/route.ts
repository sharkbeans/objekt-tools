import { type NextRequest, NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";
import { pruneStaleHaves } from "@/lib/poster/poster-inventory-prune";

export async function GET(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const result = await pruneStaleHaves();
  return NextResponse.json(result);
}
