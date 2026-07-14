export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { verifyOpenTradesForUser } from "@/lib/trade-availability";

export async function POST() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await verifyOpenTradesForUser(session.user.id);
  return NextResponse.json(result);
}
