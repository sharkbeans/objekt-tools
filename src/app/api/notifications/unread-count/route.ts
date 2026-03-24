import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradeNotification } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";

// GET /api/notifications/unread-count — count undismissed notifications
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ value }] = await db
    .select({ value: count() })
    .from(tradeNotification)
    .where(
      and(
        eq(tradeNotification.userId, session.user.id),
        eq(tradeNotification.dismissed, false),
      ),
    );

  return NextResponse.json({ count: value });
}
