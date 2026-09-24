import { and, count, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradeNotification, tradePost } from "@/lib/db/schema";

// GET /api/notifications — list all notifications (dismissed + undismissed) with pagination
export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
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

  // Trade pages are gone (plan 039): a notification can only link to the List
  // its trade post mirrors (source = "list"). Manual-post and active-trade
  // notifications get listId = null and render without a link.
  const tradePostIds = [
    ...new Set(
      notifications.flatMap((n) => (n.tradePostId ? [n.tradePostId] : [])),
    ),
  ];
  const listIdByTradePost = new Map<string, string>();
  if (tradePostIds.length > 0) {
    const posts = await db
      .select({ id: tradePost.id, linkedPosterId: tradePost.linkedPosterId })
      .from(tradePost)
      .where(
        and(inArray(tradePost.id, tradePostIds), eq(tradePost.source, "list")),
      );
    for (const post of posts) {
      if (post.linkedPosterId)
        listIdByTradePost.set(post.id, post.linkedPosterId);
    }
  }

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      ...n,
      listId: n.tradePostId
        ? (listIdByTradePost.get(n.tradePostId) ?? null)
        : null,
    })),
    page,
    limit,
    total,
  });
}

// POST /api/notifications/mark-all-read — dismiss all undismissed notifications
export async function POST() {
  let session: Awaited<ReturnType<typeof requireSession>>;
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
