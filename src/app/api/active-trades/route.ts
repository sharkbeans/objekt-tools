import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { activeTrade } from "@/lib/db/schema";
import { or, eq, and, desc, not, inArray, count } from "drizzle-orm";

const PAGE_LIMIT = 12;

// GET /api/active-trades — list active trades for current user
export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_LIMIT;

  const where = and(
    or(
      eq(activeTrade.initiatorUserId, session.user.id),
      eq(activeTrade.recipientUserId, session.user.id),
    ),
    not(inArray(activeTrade.status, ["cancelled"])),
  );

  const [totalResult, trades] = await Promise.all([
    db.select({ count: count() }).from(activeTrade).where(where),
    db.query.activeTrade.findMany({
      where,
      with: {
        sides: {
          with: {
            user: {
              columns: { id: true, name: true, image: true },
              with: { cosmoAccount: { columns: { nickname: true } } },
            },
          },
        },
        initiator: {
          columns: { id: true, name: true, image: true },
          with: { cosmoAccount: { columns: { nickname: true } } },
        },
        recipient: {
          columns: { id: true, name: true, image: true },
          with: { cosmoAccount: { columns: { nickname: true } } },
        },
      },
      orderBy: [desc(activeTrade.updatedAt)],
      limit: PAGE_LIMIT,
      offset,
    }),
  ]);

  const total = totalResult[0]?.count ?? 0;

  // Flatten cosmo nicknames into user objects for convenience
  const mapped = trades.map((t) => ({
    ...t,
    initiator: {
      ...t.initiator,
      cosmoNickname: t.initiator.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    recipient: {
      ...t.recipient,
      cosmoNickname: t.recipient.cosmoAccount?.nickname ?? null,
      cosmoAccount: undefined,
    },
    sides: t.sides.map((s) => ({
      ...s,
      user: {
        ...s.user,
        cosmoNickname: s.user.cosmoAccount?.nickname ?? null,
        cosmoAccount: undefined,
      },
    })),
  }));

  return NextResponse.json({ trades: mapped, total, limit: PAGE_LIMIT, page });
}
