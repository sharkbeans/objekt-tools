import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { verifyOpenTradesCron } from "@/lib/trade-availability";

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

  const limit = Math.max(
    1,
    Math.min(200, Number(request.nextUrl.searchParams.get("limit") ?? 40)),
  );

  const result = await verifyOpenTradesCron(limit);
  return NextResponse.json(result);
}
