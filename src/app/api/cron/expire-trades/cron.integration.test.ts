import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import {
  createActiveTrade,
  createCosmoAccount,
  createTradePost,
  createTradeSide,
  createUser,
} from "@/test/fixtures";
import {
  createIndexerTables,
  getDb,
  hasTestDb,
  migrateAppDb,
  resetDb,
  setupTestEnv,
  teardown,
} from "@/test/harness";

// Constructs a minimal Request compatible with the cron handler's usage.
// next/server's NextRequest is a subclass of Request; the handler only calls
// request.headers.get(), so a plain Request cast is sufficient outside the
// Next.js runtime.
function makeReq(auth: string): NextRequest {
  return new Request("http://test/api/cron/expire-trades", {
    headers: { authorization: auth },
  }) as unknown as NextRequest;
}

describe("cron/expire-trades (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let GET!: (req: NextRequest) => Promise<Response>;
  let schema!: typeof import("@/lib/db/schema");

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    const route = await import("@/app/api/cron/expire-trades/route");
    GET = route.GET;
    schema = await import("@/lib/db/schema");
  });

  after(teardown);
  beforeEach(resetDb);

  it("returns 401 for wrong or missing auth", async () => {
    const r1 = await GET(makeReq(""));
    assert.equal(r1.status, 401, "empty auth → 401");

    const r2 = await GET(makeReq("Bearer wrong-secret"));
    assert.equal(r2.status, 401, "wrong secret → 401");

    const r3 = await GET(makeReq("test-cron-secret"));
    assert.equal(r3.status, 401, "missing Bearer prefix → 401");
  });

  it("cancels pending trade >30 days and notifies once; idempotent on second run", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const t = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "pending",
      createdAt: old,
    });

    const db = await getDb();

    const r1 = await GET(makeReq("Bearer test-cron-secret"));
    assert.equal(r1.status, 200);

    const tradeRow = await db.query.activeTrade.findFirst({
      where: eq(schema.activeTrade.id, t.id),
    });
    assert.equal(tradeRow?.status, "cancelled");

    const notifs = await db.query.tradeNotification.findMany({
      where: eq(schema.tradeNotification.userId, u1.id),
    });
    assert.ok(notifs.length > 0, "notification inserted for initiator");
    const notifCount = notifs.length;

    // Second run — idempotent (trade already cancelled, no new notifications)
    await GET(makeReq("Bearer test-cron-secret"));
    const notifs2 = await db.query.tradeNotification.findMany({
      where: eq(schema.tradeNotification.userId, u1.id),
    });
    assert.equal(
      notifs2.length,
      notifCount,
      "no duplicate notifications on second run",
    );
  });

  it("closes old open trade post and notifies once; idempotent on second run", async () => {
    const u1 = await createUser();
    const post = await createTradePost(u1.id);

    const db = await getDb();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db
      .update(schema.tradePost)
      .set({ createdAt: old })
      .where(eq(schema.tradePost.id, post.id));

    const r1 = await GET(makeReq("Bearer test-cron-secret"));
    assert.equal(r1.status, 200);

    const postRow = await db.query.tradePost.findFirst({
      where: eq(schema.tradePost.id, post.id),
    });
    assert.equal(postRow?.status, "closed");

    const notifs = await db.query.tradeNotification.findMany({
      where: eq(schema.tradeNotification.userId, u1.id),
    });
    assert.ok(notifs.length > 0, "notification inserted");
    const notifCount = notifs.length;

    // Second run — idempotent (post already closed)
    await GET(makeReq("Bearer test-cron-secret"));
    const notifs2 = await db.query.tradeNotification.findMany({
      where: eq(schema.tradeNotification.userId, u1.id),
    });
    assert.equal(
      notifs2.length,
      notifCount,
      "no duplicate notifications on second run",
    );
  });

  it("bans user with unsent sides when other party fully confirmed; idempotent on second run", async () => {
    const u1 = await createUser(); // will confirm — not banned
    const u2 = await createUser(); // will not send — gets banned
    await createCosmoAccount(u2.id);
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const t = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "accepted",
      acceptedAt: old,
    });
    await createTradeSide(t.id, u1.id, { status: "confirmed" });
    await createTradeSide(t.id, u2.id, { status: "pending" });

    const db = await getDb();

    const r1 = await GET(makeReq("Bearer test-cron-secret"));
    assert.equal(r1.status, 200);

    const tradeRow = await db.query.activeTrade.findFirst({
      where: eq(schema.activeTrade.id, t.id),
    });
    assert.equal(tradeRow?.status, "cancelled");

    const u2Bans = await db.query.tradeBan.findMany({
      where: eq(schema.tradeBan.userId, u2.id),
    });
    assert.equal(u2Bans.length, 1, "u2 (pending) gets exactly one ban");

    const u1Bans = await db.query.tradeBan.findMany({
      where: eq(schema.tradeBan.userId, u1.id),
    });
    assert.equal(u1Bans.length, 0, "u1 (confirmed) gets no ban");

    // Second run — idempotent (issueBan deduplicates on same trade)
    await GET(makeReq("Bearer test-cron-secret"));
    const u2BansAfter = await db.query.tradeBan.findMany({
      where: eq(schema.tradeBan.userId, u2.id),
    });
    assert.equal(
      u2BansAfter.length,
      1,
      "still exactly one ban after second run",
    );
  });

  it("issues no bans when both parties ghosted (both pending)", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const t = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "accepted",
      acceptedAt: old,
    });
    await createTradeSide(t.id, u1.id, { status: "pending" });
    await createTradeSide(t.id, u2.id, { status: "pending" });

    const db = await getDb();

    await GET(makeReq("Bearer test-cron-secret"));

    const tradeRow = await db.query.activeTrade.findFirst({
      where: eq(schema.activeTrade.id, t.id),
    });
    assert.equal(tradeRow?.status, "cancelled");

    const bans = await db.query.tradeBan.findMany();
    assert.equal(bans.length, 0, "no bans when both sides ghosted");
  });
});
