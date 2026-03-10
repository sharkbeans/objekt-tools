import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";
import { or, eq, and, desc, not, inArray } from "drizzle-orm";

// GET /api/active-trades — list active trades for current user
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trades = await db.query.activeTrade.findMany({
    where: and(
      or(
        eq(activeTrade.initiatorUserId, session.user.id),
        eq(activeTrade.recipientUserId, session.user.id),
      ),
      not(inArray(activeTrade.status, ["cancelled"])),
    ),
    with: {
      sides: {
        with: { user: { columns: { id: true, name: true, image: true } } },
      },
      initiator: { columns: { id: true, name: true, image: true } },
      recipient: { columns: { id: true, name: true, image: true } },
    },
    orderBy: [desc(activeTrade.updatedAt)],
  });

  return NextResponse.json({ trades });
}
