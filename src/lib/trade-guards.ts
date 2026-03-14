import { db } from "@/lib/db";
import { activeTrade, activeTradeSide } from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

/**
 * Returns the blocking active trade ID if the user has an accepted/partial trade
 * where they have NOT yet sent all their objekts. Returns null if the user is free to act.
 */
export async function getBlockingTradeId(userId: string): Promise<string | null> {
  const trades = await db.query.activeTrade.findMany({
    where: and(
      or(
        eq(activeTrade.initiatorUserId, userId),
        eq(activeTrade.recipientUserId, userId),
      ),
      inArray(activeTrade.status, ["accepted", "partial"]),
    ),
    with: {
      sides: true,
    },
  });

  for (const trade of trades) {
    const userSides = trade.sides.filter((s) => s.userId === userId);
    const hasUnsent = userSides.some((s) => s.status === "pending");
    if (hasUnsent) {
      return trade.id;
    }
  }

  return null;
}
