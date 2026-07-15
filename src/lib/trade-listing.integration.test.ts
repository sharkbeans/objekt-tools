import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { defaultFilters, type ObjektFilterState } from "@/lib/objekt-filters";
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

describe("trade-listing (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let schema!: typeof import("@/lib/db/schema");
  let listing!: typeof import("@/lib/trade-listing");

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    schema = await import("@/lib/db/schema");
    listing = await import("@/lib/trade-listing");
  });

  after(teardown);
  beforeEach(resetDb);

  async function seedPosts() {
    const d = await getDb();
    const user = await createUser();

    // 1: tripleS SeoYeon Cream02 Double, offline (066Z)
    const p1 = await createTradePost(user.id);
    await d.insert(schema.tradePostHave).values({
      tradePostId: p1.id,
      collectionId: "tripleS-Cream02-066Z",
      collectionNo: "066Z",
      member: "SeoYeon",
      season: "Cream02",
      class: "Double",
    });
    await d.insert(schema.tradePostWant).values({
      tradePostId: p1.id,
      collectionId: "tripleS-Atom01-001A",
      collectionNo: "001A",
      member: "HyeRin",
      season: "Atom01",
      class: "First",
    });

    // 2: artms HeeJin Cream02 Double, online (identical season/class name
    // to post 1 but a different artist — grouped-value scoping test)
    const p2 = await createTradePost(user.id);
    await d.insert(schema.tradePostHave).values({
      tradePostId: p2.id,
      collectionId: "artms-Cream02-010A",
      collectionNo: "010A",
      member: "HeeJin",
      season: "Cream02",
      class: "Double",
    });
    await d.insert(schema.tradePostWant).values({
      tradePostId: p2.id,
      collectionId: "artms-Binary01-020A",
      collectionNo: "020A",
      member: "HaSeul",
      season: "Binary01",
      class: "Special",
    });

    // 3: isAny want (no specific objekt) scoped to idntt, no member
    const p3 = await createTradePost(user.id);
    await d.insert(schema.tradePostHave).values({
      tradePostId: p3.id,
      collectionId: "idntt-Spring25-005A",
      collectionNo: "005A",
      member: "Towa",
      season: "Spring25",
      class: "Basic",
    });
    await d.insert(schema.tradePostWant).values({
      tradePostId: p3.id,
      collectionId: "",
      isAny: true,
      artist: "idntt",
    });

    return { p1: p1.id, p2: p2.id, p3: p3.id };
  }

  async function referenceMatch(
    filters: ObjektFilterState,
    filterMode: "haves" | "wants" | "both",
    postIds: string[],
  ) {
    const d = await getDb();
    const { tradeMatchesFilters } = await import("@/lib/objekt-filters");
    const matched: string[] = [];
    for (const id of postIds) {
      const haves = await d
        .select()
        .from(schema.tradePostHave)
        .where(eq(schema.tradePostHave.tradePostId, id));
      const wants = await d
        .select()
        .from(schema.tradePostWant)
        .where(eq(schema.tradePostWant.tradePostId, id));
      if (tradeMatchesFilters({ haves, wants }, filters, filterMode)) {
        matched.push(id);
      }
    }
    return matched;
  }

  async function runFiltered(
    filters: ObjektFilterState,
    filterMode: "haves" | "wants" | "both",
  ) {
    const { trades } = await listing.listTradesPage({
      filters,
      filterMode,
      sort: "newest",
      page: 1,
      limit: 50,
    });
    return trades.map((t) => t.id).sort();
  }

  it("filters by a grouped season value scoped to the resolved artist (SQL matches JS oracle)", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      season: ["tripleS::Cream02"],
    };

    const sqlResult = await runFiltered(filters, "haves");
    const jsResult = (
      await referenceMatch(filters, "haves", [p1, p2, p3])
    ).sort();

    assert.deepEqual(sqlResult, jsResult);
    assert.deepEqual(sqlResult, [p1]);
  });

  it("rejects the same season value scoped to a different artist", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      season: ["artms::Cream02"],
    };

    const sqlResult = await runFiltered(filters, "haves");
    const jsResult = (
      await referenceMatch(filters, "haves", [p1, p2, p3])
    ).sort();

    assert.deepEqual(sqlResult, jsResult);
    assert.deepEqual(sqlResult, [p2]);
  });

  it("matches isAny want rows (null member) via the artist column", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      artist: ["idntt"],
    };

    const sqlResult = await runFiltered(filters, "wants");
    const jsResult = (
      await referenceMatch(filters, "wants", [p1, p2, p3])
    ).sort();

    assert.deepEqual(sqlResult, jsResult);
    assert.deepEqual(sqlResult, [p3]);
  });

  it("filterMode 'both' matches on either haves or wants", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      member: ["HaSeul"],
    };

    const sqlResult = await runFiltered(filters, "both");
    const jsResult = (
      await referenceMatch(filters, "both", [p1, p2, p3])
    ).sort();

    assert.deepEqual(sqlResult, jsResult);
    assert.deepEqual(sqlResult, [p2]);
  });

  it("filters by on_offline via the collectionNo z-suffix", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      on_offline: ["offline"],
    };

    const sqlResult = await runFiltered(filters, "haves");
    const jsResult = (
      await referenceMatch(filters, "haves", [p1, p2, p3])
    ).sort();

    assert.deepEqual(sqlResult, jsResult);
    assert.deepEqual(sqlResult, [p1]);
  });

  it("combines structural filters with the text-search grammar", async () => {
    const { p1, p2, p3 } = await seedPosts();
    const filters: ObjektFilterState = {
      ...defaultFilters,
      season: ["tripleS::Cream02"],
      search: "sy",
    };

    const { trades, total } = await listing.listTradesPage({
      filters,
      filterMode: "haves",
      sort: "newest",
      page: 1,
      limit: 50,
    });

    assert.deepEqual(
      trades.map((t) => t.id),
      [p1],
    );
    assert.equal(total, 1);
    void p2;
    void p3;
  });
});
