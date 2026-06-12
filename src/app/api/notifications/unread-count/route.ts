import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradeNotification } from "@/lib/db/schema";

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
