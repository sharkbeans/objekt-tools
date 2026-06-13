import { randomUUID } from "node:crypto";
import {
  activeTrade,
  activeTradeSide,
  cosmoAccount,
  tradeBan,
  tradePost,
  user,
} from "@/lib/db/schema";

type ActiveTradeStatus =
  | "pending"
  | "accepted"
  | "partial"
  | "completed"
  | "cancelled"
  | "countered"
  | "disputed";

async function db() {
  const { db: d } = await import("@/lib/db");
  return d;
}

export async function createUser(
  overrides: { id?: string; name?: string; email?: string } = {},
) {
  const d = await db();
  const id = overrides.id ?? randomUUID();
  const [row] = await d
    .insert(user)
    .values({
      id,
      name: overrides.name ?? `User-${id.slice(0, 8)}`,
      email: overrides.email ?? `${id.slice(0, 8)}@test.example`,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function createCosmoAccount(
  userId: string,
  overrides: { cosmoId?: number; address?: string } = {},
) {
  const d = await db();
  const [row] = await d
    .insert(cosmoAccount)
    .values({
      userId,
      address:
        overrides.address ?? `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      cosmoId: overrides.cosmoId ?? null,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function createTradePost(userId: string) {
  const d = await db();
  const [row] = await d.insert(tradePost).values({ userId }).returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function createActiveTrade(opts: {
  initiatorUserId: string;
  recipientUserId: string;
  status?: ActiveTradeStatus;
  createdAt?: Date;
  acceptedAt?: Date;
  counterOfferToId?: string | null;
}) {
  const d = await db();
  const [row] = await d
    .insert(activeTrade)
    .values({
      initiatorUserId: opts.initiatorUserId,
      recipientUserId: opts.recipientUserId,
      status: opts.status ?? "pending",
      counterOfferToId: opts.counterOfferToId ?? null,
      createdAt: opts.createdAt,
      acceptedAt: opts.acceptedAt,
    })
    .returning()
    .catch((e: unknown) => {
      const detail =
        e instanceof Error && "detail" in e
          ? ` PG detail: ${(e as { detail?: string }).detail}`
          : "";
      const code =
        e instanceof Error && "code" in e
          ? ` PG code: ${(e as { code?: string }).code}`
          : "";
      throw new Error(`createActiveTrade insert failed:${code}${detail}`, {
        cause: e,
      });
    });
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function createTradeSide(
  activeTradeId: string,
  userId: string,
  opts: { status?: "pending" | "sent" | "confirmed" } = {},
) {
  const d = await db();
  const [row] = await d
    .insert(activeTradeSide)
    .values({
      activeTradeId,
      userId,
      address: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      recipientAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
      objektId: randomUUID(),
      collectionId: randomUUID(),
      status: opts.status ?? "pending",
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function createBan(
  userId: string,
  activeTradeId: string,
  overrides: { cosmoId?: string; reason?: string } = {},
) {
  const d = await db();
  const [row] = await d
    .insert(tradeBan)
    .values({
      userId,
      activeTradeId,
      cosmoId: overrides.cosmoId ?? userId,
      reason: overrides.reason ?? "test ban",
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}
