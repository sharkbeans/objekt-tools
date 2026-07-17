import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, isNull } from "drizzle-orm";
import { createTradePost, createUser } from "@/test/fixtures";
import {
  createIndexerTables,
  getDb,
  hasTestDb,
  migrateAppDb,
  resetDb,
  setupTestEnv,
  teardown,
} from "@/test/harness";

describe("trade post completion (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let completion!: typeof import("@/lib/trade-post-completion");
  let schema!: typeof import("@/lib/db/schema");

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    completion = await import("@/lib/trade-post-completion");
    schema = await import("@/lib/db/schema");
  });

  after(teardown);
  beforeEach(resetDb);

  it("keeps a partially filled post open and consumes only matched rows", async () => {
    const [user1, user2] = await Promise.all([createUser(), createUser()]);
    const [post1, post2] = await Promise.all([
      createTradePost(user1.id),
      createTradePost(user2.id),
    ]);
    const db = await getDb();

    const post1Haves = await db
      .insert(schema.tradePostHave)
      .values([
        {
          tradePostId: post1.id,
          collectionId: "A",
          objektId: "objekt-a",
          serial: 1,
        },
        {
          tradePostId: post1.id,
          collectionId: "B",
          objektId: "objekt-b",
          serial: 2,
        },
      ])
      .returning();
    const post1Wants = await db
      .insert(schema.tradePostWant)
      .values([
        { tradePostId: post1.id, collectionId: "E" },
        { tradePostId: post1.id, collectionId: "F" },
      ])
      .returning();
    await db.insert(schema.tradePostHave).values([
      {
        tradePostId: post2.id,
        collectionId: "E",
        objektId: "objekt-e",
        serial: 3,
      },
      {
        tradePostId: post2.id,
        collectionId: "G",
        objektId: "objekt-g",
        serial: 4,
      },
    ]);
    await db.insert(schema.tradePostWant).values([
      { tradePostId: post2.id, collectionId: "A" },
      { tradePostId: post2.id, collectionId: "H" },
    ]);

    await db.transaction((tx) =>
      completion.finalizeCompletedTradePosts(tx, {
        tradePostId: post1.id,
        matchedTradePostId: post2.id,
        initiatorUserId: user1.id,
        recipientUserId: user2.id,
        sides: [
          {
            userId: user1.id,
            objektId: "objekt-a",
            collectionId: "A",
            serial: 1,
          },
          {
            userId: user2.id,
            objektId: "objekt-e",
            collectionId: "E",
            serial: 3,
          },
        ],
      }),
    );

    const [freshPost1, liveHaves, liveWants, consumedHave, retainedWant] =
      await Promise.all([
        db.query.tradePost.findFirst({
          where: eq(schema.tradePost.id, post1.id),
        }),
        db.query.tradePostHave.findMany({
          where: isNull(schema.tradePostHave.deletedAt),
        }),
        db.query.tradePostWant.findMany({
          where: isNull(schema.tradePostWant.deletedAt),
        }),
        db.query.tradePostHave.findFirst({
          where: eq(schema.tradePostHave.id, post1Haves[0].id),
        }),
        db.query.tradePostWant.findFirst({
          where: eq(schema.tradePostWant.id, post1Wants[0].id),
        }),
      ]);

    assert.equal(freshPost1?.status, "open");
    assert.equal(consumedHave?.deletedAt instanceof Date, true);
    assert.equal(retainedWant?.deletedAt, null);
    assert.deepEqual(
      liveHaves
        .filter((row) => row.tradePostId === post1.id)
        .map((row) => row.collectionId),
      ["B"],
    );
    assert.deepEqual(
      liveWants
        .filter((row) => row.tradePostId === post1.id)
        .map((row) => row.collectionId),
      ["E", "F"],
    );
  });

  it("closes a post when its final have is consumed without removing wants", async () => {
    const [user1, user2] = await Promise.all([createUser(), createUser()]);
    const post = await createTradePost(user1.id);
    const db = await getDb();

    await db.insert(schema.tradePostHave).values({
      tradePostId: post.id,
      collectionId: "A",
      objektId: "objekt-a",
      serial: 1,
    });
    await db.insert(schema.tradePostWant).values({
      tradePostId: post.id,
      collectionId: "E",
    });

    await db.transaction((tx) =>
      completion.finalizeCompletedTradePosts(tx, {
        tradePostId: post.id,
        matchedTradePostId: null,
        initiatorUserId: user1.id,
        recipientUserId: user2.id,
        sides: [
          {
            userId: user1.id,
            objektId: "objekt-a",
            collectionId: "A",
            serial: 1,
          },
          {
            userId: user2.id,
            objektId: "objekt-e",
            collectionId: "E",
            serial: 2,
          },
        ],
      }),
    );

    const freshPost = await db.query.tradePost.findFirst({
      where: eq(schema.tradePost.id, post.id),
    });
    const retainedWant = await db.query.tradePostWant.findFirst({
      where: eq(schema.tradePostWant.tradePostId, post.id),
    });
    assert.equal(freshPost?.status, "closed");
    assert.equal(retainedWant?.deletedAt, null);
  });
});
