import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { tradePost } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// PATCH /api/trades/[id]/renew — reset expiration to 7 days from now
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tradeId = Number(id);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [updated] = await db
    .update(tradePost)
    .set({
      expiresAt,
      status: "open",
      updatedAt: new Date(),
    })
    .where(
      and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id))
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Trade not found or not yours" },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}
