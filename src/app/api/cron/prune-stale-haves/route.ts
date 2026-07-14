import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { pruneStaleHaves } from "@/lib/poster-inventory-prune";

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

  const result = await pruneStaleHaves();
  return NextResponse.json(result);
}
