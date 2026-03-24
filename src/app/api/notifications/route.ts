import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradeNotification } from "@/lib/db/schema";
import { eq, and, desc, inArray, count } from "drizzle-orm";

// GET /api/notifications — list all notifications (dismissed + undismissed) with pagination
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Math.floor(Number(params.get("page") ?? "1")) || 1);
  const limit = Math.min(Number(params.get("limit") ?? "20"), 50);
  const offset = (page - 1) * limit;

  const [notifications, [{ value: total }]] = await Promise.all([
    db.query.tradeNotification.findMany({
      where: eq(tradeNotification.userId, session.user.id),
      orderBy: [desc(tradeNotification.createdAt)],
      limit,
      offset,
    }),
    db
      .select({ value: count() })
      .from(tradeNotification)
      .where(eq(tradeNotification.userId, session.user.id)),
  ]);

  return NextResponse.json({ notifications, page, limit, total });
}

// POST /api/notifications/mark-all-read — dismiss all undismissed notifications
export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(tradeNotification)
    .set({ dismissed: true })
    .where(
      and(
        eq(tradeNotification.userId, session.user.id),
        eq(tradeNotification.dismissed, false),
      ),
    );

  return NextResponse.json({ success: true });
}
