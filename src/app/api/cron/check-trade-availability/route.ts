import { type NextRequest, NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";
import { verifyOpenTradesCron } from "@/lib/trade/trade-availability";

export async function GET(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const limit = Math.max(
    1,
    Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 40)),
  );

  const result = await verifyOpenTradesCron(limit);
  return NextResponse.json(result);
}
