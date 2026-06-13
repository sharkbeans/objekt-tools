import { and, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradeNotification } from "@/lib/db/schema";

// GET — list notifications for current user
export async function GET() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await db.query.tradeNotification.findMany({
    where: and(
      eq(tradeNotification.userId, session.user.id),
      eq(tradeNotification.dismissed, false),
    ),
    orderBy: [desc(tradeNotification.createdAt)],
    limit: 50,
  });

  return NextResponse.json({ notifications });
}

// PATCH — dismiss notifications by IDs
export async function PATCH(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ids } = (await request.json()) as { ids: number[] };

  if (!ids?.length || ids.length > 100) {
    return NextResponse.json(
      { error: "Invalid notification IDs" },
      { status: 400 },
    );
  }

  await db
    .update(tradeNotification)
    .set({ dismissed: true })
    .where(
      and(
        eq(tradeNotification.userId, session.user.id),
        inArray(tradeNotification.id, ids),
      ),
    );

  return NextResponse.json({ success: true });
}
