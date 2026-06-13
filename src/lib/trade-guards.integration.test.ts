import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  createActiveTrade,
  createBan,
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

describe("trade-guards (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let guards!: typeof import("@/lib/trade-guards");
  let schema!: typeof import("@/lib/db/schema");

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    guards = await import("@/lib/trade-guards");
    schema = await import("@/lib/db/schema");
  });

  after(teardown);
  beforeEach(resetDb);

  it("issueBan is idempotent", async () => {
    const u = await createUser();
    const u2 = await createUser();
    const t = await createActiveTrade({
      initiatorUserId: u.id,
      recipientUserId: u2.id,
    });

    const ban1 = await guards.issueBan(u.id, u.id, t.id, "test");
    const ban2 = await guards.issueBan(u.id, u.id, t.id, "test");

    assert.ok(ban1, "first call returns a ban");
    assert.ok(ban2, "second call returns a ban");
    assert.equal(ban1!.id, ban2!.id, "both calls return the same ban");

    const db = await getDb();
    const bans = await db.query.tradeBan.findMany({
      where: and(
        eq(schema.tradeBan.userId, u.id),
        eq(schema.tradeBan.activeTradeId, t.id),
      ),
    });
    assert.equal(bans.length, 1, "exactly one ban in DB");
  });

  it("issueBan concurrent race condition", {
    todo: "documents real bug: no unique constraint on (userId, activeTradeId) — concurrent calls can insert duplicate bans",
  }, async () => {
    const u = await createUser();
    const u2 = await createUser();
    const t = await createActiveTrade({
      initiatorUserId: u.id,
      recipientUserId: u2.id,
    });

    await Promise.all([
      guards.issueBan(u.id, u.id, t.id, "test"),
      guards.issueBan(u.id, u.id, t.id, "test"),
    ]);

    const db = await getDb();
    const bans = await db.query.tradeBan.findMany({
      where: eq(schema.tradeBan.userId, u.id),
    });
    assert.equal(bans.length, 1, "exactly one ban despite concurrent calls");
  });

  it("propagateResolution walks the chain", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const a = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "countered",
    });
    const b = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      counterOfferToId: a.id,
      status: "countered",
    });
    const c = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      counterOfferToId: b.id,
    });

    await guards.propagateResolution(c.id);

    const db = await getDb();
    const [aRows, bRows, cRows] = await Promise.all([
      db
        .select({ resolvedByTradeId: schema.activeTrade.resolvedByTradeId })
        .from(schema.activeTrade)
        .where(eq(schema.activeTrade.id, a.id)),
      db
        .select({ resolvedByTradeId: schema.activeTrade.resolvedByTradeId })
        .from(schema.activeTrade)
        .where(eq(schema.activeTrade.id, b.id)),
      db
        .select({ resolvedByTradeId: schema.activeTrade.resolvedByTradeId })
        .from(schema.activeTrade)
        .where(eq(schema.activeTrade.id, c.id)),
    ]);

    assert.equal(aRows.length, 1, "A exists");
    assert.equal(bRows.length, 1, "B exists");
    assert.equal(cRows.length, 1, "C exists");
    assert.equal(aRows[0]!.resolvedByTradeId, c.id, "A resolved by C");
    assert.equal(bRows[0]!.resolvedByTradeId, c.id, "B resolved by C");
    assert.equal(cRows[0]!.resolvedByTradeId, null, "C itself unchanged");
  });

  it("propagateResolution is idempotent and respects existing resolution", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const other = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "completed",
    });
    const a = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "countered",
    });
    const b = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      counterOfferToId: a.id,
      status: "countered",
    });
    const c = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      counterOfferToId: b.id,
    });

    const db = await getDb();
    await db
      .update(schema.activeTrade)
      .set({ resolvedByTradeId: other.id })
      .where(eq(schema.activeTrade.id, a.id));

    await guards.propagateResolution(c.id);

    const sel = (id: string) =>
      db
        .select({ resolvedByTradeId: schema.activeTrade.resolvedByTradeId })
        .from(schema.activeTrade)
        .where(eq(schema.activeTrade.id, id))
        .then((rows) => rows[0]);

    const [aRow, bRow] = await Promise.all([sel(a.id), sel(b.id)]);
    assert.equal(
      aRow?.resolvedByTradeId,
      other.id,
      "A keeps its original resolution",
    );
    assert.equal(bRow?.resolvedByTradeId, c.id, "B resolved by C");

    // Run again — no change
    await guards.propagateResolution(c.id);
    const [aRow2, bRow2] = await Promise.all([sel(a.id), sel(b.id)]);
    assert.equal(
      aRow2?.resolvedByTradeId,
      other.id,
      "A still unchanged after second run",
    );
    assert.equal(
      bRow2?.resolvedByTradeId,
      c.id,
      "B still resolved by C after second run",
    );
  });

  it("propagateResolution depth cap: resolves 12 nearest, skips beyond", async () => {
    const u1 = await createUser();
    const u2 = await createUser();

    // Build chain of 14: trades[0] root, trades[13] terminal.
    // Intermediate trades are "countered" (real counter-offer chain state),
    // only the terminal is "pending". This avoids conflicting with the
    // partial unique index on (trade_post_id, matched_trade_post_id, initiator_user_id)
    // WHERE status = 'pending' when trade_post_id/matched_trade_post_id are both null.
    const trades: Array<{ id: string }> = [];
    for (let i = 0; i < 14; i++) {
      const isTerminal = i === 13;
      const t = await createActiveTrade({
        initiatorUserId: u1.id,
        recipientUserId: u2.id,
        counterOfferToId: i === 0 ? null : trades[i - 1]!.id,
        status: isTerminal ? "pending" : "countered",
      });
      trades.push(t);
    }

    await guards.propagateResolution(trades[13]!.id);

    const db = await getDb();

    const sel = (id: string) =>
      db
        .select({ resolvedByTradeId: schema.activeTrade.resolvedByTradeId })
        .from(schema.activeTrade)
        .where(eq(schema.activeTrade.id, id))
        .then((rows) => rows[0]);

    for (let i = 1; i <= 12; i++) {
      const row = await sel(trades[i]!.id);
      assert.equal(
        row?.resolvedByTradeId,
        trades[13]!.id,
        `trades[${i}] should be resolved`,
      );
    }

    const root = await sel(trades[0]!.id);
    assert.ok(root, "root exists");
    assert.equal(
      root.resolvedByTradeId,
      null,
      "root (13th ancestor) should not be resolved",
    );
  });

  it("getBlockingTradeId returns id for blocking trade, null otherwise", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const u3 = await createUser();
    const u4 = await createUser();

    // Accepted trade with pending side → blocks u1
    const t1 = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "accepted",
    });
    await createTradeSide(t1.id, u1.id, { status: "pending" });
    assert.equal(await guards.getBlockingTradeId(u1.id), t1.id);

    // All sides confirmed → not blocked
    const t2 = await createActiveTrade({
      initiatorUserId: u3.id,
      recipientUserId: u2.id,
      status: "accepted",
    });
    await createTradeSide(t2.id, u3.id, { status: "confirmed" });
    assert.equal(await guards.getBlockingTradeId(u3.id), null);

    // Completed trade → not blocked even with pending side
    const t3 = await createActiveTrade({
      initiatorUserId: u4.id,
      recipientUserId: u2.id,
      status: "completed",
    });
    await createTradeSide(t3.id, u4.id, { status: "pending" });
    assert.equal(await guards.getBlockingTradeId(u4.id), null);
  });

  it("checkTradeOfferQuota returns remaining and blocks at quota", async () => {
    const u1 = await createUser();
    const u2 = await createUser();

    // Default quota 10, 0 pending → 10 remaining
    const r1 = await guards.checkTradeOfferQuota(u1.id);
    assert.equal(r1.allowed, true);
    if (r1.allowed) assert.equal(r1.remaining, 10);

    // 9 pending trades initiated by u1
    for (let i = 0; i < 9; i++) {
      await createActiveTrade({
        initiatorUserId: u1.id,
        recipientUserId: u2.id,
        status: "pending",
      });
    }
    const r2 = await guards.checkTradeOfferQuota(u1.id);
    assert.equal(r2.allowed, true);
    if (r2.allowed) assert.equal(r2.remaining, 1);

    // 10th pending trade → at quota
    await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "pending",
    });
    const r3 = await guards.checkTradeOfferQuota(u1.id);
    assert.equal(r3.allowed, false);
    if (!r3.allowed) {
      assert.equal(r3.quota, 10);
      assert.equal(r3.used, 10);
    }
  });

  it("tryLiftBan lifts ban when all sides confirmed, leaves ban when any pending", async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    const u3 = await createUser();
    const db = await getDb();

    // All confirmed → ban lifted
    const t1 = await createActiveTrade({
      initiatorUserId: u1.id,
      recipientUserId: u2.id,
      status: "accepted",
    });
    await createTradeSide(t1.id, u1.id, { status: "confirmed" });
    await createBan(u1.id, t1.id);

    await guards.tryLiftBan(u1.id, t1.id);

    const ban1 = await db.query.tradeBan.findFirst({
      where: and(
        eq(schema.tradeBan.userId, u1.id),
        eq(schema.tradeBan.activeTradeId, t1.id),
      ),
    });
    assert.ok(ban1?.liftedAt, "ban should be lifted when all sides confirmed");

    // One pending side → ban stays
    const t2 = await createActiveTrade({
      initiatorUserId: u3.id,
      recipientUserId: u2.id,
      status: "accepted",
    });
    await createTradeSide(t2.id, u3.id, { status: "pending" });
    await createBan(u3.id, t2.id);

    await guards.tryLiftBan(u3.id, t2.id);

    const ban2 = await db.query.tradeBan.findFirst({
      where: and(
        eq(schema.tradeBan.userId, u3.id),
        eq(schema.tradeBan.activeTradeId, t2.id),
      ),
    });
    assert.ok(
      !ban2?.liftedAt,
      "ban should not be lifted when side is still pending",
    );
  });
});
