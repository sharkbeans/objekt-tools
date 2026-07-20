import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createCosmoAccount, createUser } from "@/test/fixtures";
import {
  createIndexerTables,
  getDb,
  hasTestDb,
  migrateAppDb,
  resetDb,
  setupTestEnv,
  teardown,
} from "@/test/harness";

describe("syncPosterTradePost (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let sync: typeof import("@/lib/poster-trade-sync");
  let schema: typeof import("@/lib/db/schema");

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    sync = await import("@/lib/poster-trade-sync");
    schema = await import("@/lib/db/schema");
  });

  after(teardown);
  beforeEach(resetDb);

  async function createPoster(userId: string) {
    const db = await getDb();
    const [row] = await db.insert(schema.poster).values({ userId }).returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  }

  async function addHave(posterId: string) {
    const db = await getDb();
    await db.insert(schema.posterHave).values({
      posterId,
      collectionId: "collection-a",
      quantity: 1,
    });
  }

  async function clearItems(posterId: string) {
    const db = await getDb();
    await db
      .delete(schema.posterHave)
      .where(eq(schema.posterHave.posterId, posterId));
    await db
      .delete(schema.posterWant)
      .where(eq(schema.posterWant.posterId, posterId));
  }

  async function getMirror(posterId: string) {
    const db = await getDb();
    return db.query.tradePost.findFirst({
      where: eq(schema.tradePost.linkedPosterId, posterId),
    });
  }

  it("reopens a mirror the sync itself closed once items return", async () => {
    const user = await createUser();
    await createCosmoAccount(user.id);
    const poster = await createPoster(user.id);
    await addHave(poster.id);

    await sync.syncPosterTradePost(poster.id);
    const created = await getMirror(poster.id);
    assert.equal(created?.status, "open");
    assert.equal(created?.closedBySync, false);

    await clearItems(poster.id);
    await sync.syncPosterTradePost(poster.id);
    const closed = await getMirror(poster.id);
    assert.equal(closed?.status, "closed");
    assert.equal(closed?.closedBySync, true);

    await addHave(poster.id);
    // Compare against a client-side timestamp, not `closed.createdAt`
    // (DB-computed via defaultNow()) — the two can be serialized in
    // different timezone frames for a `timestamp` (no tz) column, which
    // makes a cross-source comparison unreliable independent of wall-clock
    // ordering.
    const beforeReopen = new Date();
    await sync.syncPosterTradePost(poster.id);
    const reopened = await getMirror(poster.id);
    assert.equal(reopened?.status, "open");
    assert.equal(reopened?.closedBySync, false);
    assert.ok(
      reopened && reopened.createdAt.getTime() >= beforeReopen.getTime(),
      "createdAt should be bumped on reopen so the 30-day expiry cron doesn't immediately re-close it",
    );
  });

  it("does not reopen a mirror closed for a reason other than the sync", async () => {
    const user = await createUser();
    await createCosmoAccount(user.id);
    const poster = await createPoster(user.id);
    await addHave(poster.id);
    await sync.syncPosterTradePost(poster.id);

    const db = await getDb();
    const mirror = await getMirror(poster.id);
    if (!mirror) throw new Error("expected mirror to exist");
    // Simulate a close that wasn't caused by the sync (user close, cron
    // expiry, trade completion) — closedBySync stays false.
    await db
      .update(schema.tradePost)
      .set({ status: "closed", closedBySync: false })
      .where(eq(schema.tradePost.id, mirror.id));

    await sync.syncPosterTradePost(poster.id);
    const stillClosed = await getMirror(poster.id);
    assert.equal(stillClosed?.status, "closed");
  });

  it("does not touch status when the mirror is in_trade", async () => {
    const user = await createUser();
    await createCosmoAccount(user.id);
    const poster = await createPoster(user.id);
    await addHave(poster.id);
    await sync.syncPosterTradePost(poster.id);

    const db = await getDb();
    const mirror = await getMirror(poster.id);
    if (!mirror) throw new Error("expected mirror to exist");
    await db
      .update(schema.tradePost)
      .set({ status: "in_trade" })
      .where(eq(schema.tradePost.id, mirror.id));

    await sync.syncPosterTradePost(poster.id);
    const stillInTrade = await getMirror(poster.id);
    assert.equal(stillInTrade?.status, "in_trade");
  });

  it("does not create a mirror for an unlinked user", async () => {
    const user = await createUser();
    const poster = await createPoster(user.id);
    await addHave(poster.id);

    await sync.syncPosterTradePost(poster.id);

    const mirror = await getMirror(poster.id);
    assert.equal(mirror, undefined);
  });

  it("closes an open mirror when the user is no longer linked", async () => {
    const user = await createUser();
    await createCosmoAccount(user.id);
    const poster = await createPoster(user.id);
    await addHave(poster.id);
    await sync.syncPosterTradePost(poster.id);

    const db = await getDb();
    await db
      .delete(schema.cosmoAccount)
      .where(eq(schema.cosmoAccount.userId, user.id));

    await sync.syncPosterTradePost(poster.id);

    const closed = await getMirror(poster.id);
    assert.equal(closed?.status, "closed");
    assert.equal(closed?.closedBySync, true);
  });
});
