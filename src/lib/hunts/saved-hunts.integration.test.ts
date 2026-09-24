import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { createUser } from "@/test/fixtures";
import {
  createIndexerTables,
  getDb,
  hasTestDb,
  migrateAppDb,
  resetDb,
  setupTestEnv,
  teardown,
} from "@/test/harness";

const ZERO = "0x0000000000000000000000000000000000000000";
const SEASON = "Cream02";
const MEMBER = "SeoYeon";

/**
 * Fixed database ids, so the member catalog cached by one test (it is cached
 * in-process for ten minutes) still points at the rows the next test inserts.
 */
const dbId = (no: number) =>
  `00000000-0000-4000-8000-${String(no).padStart(12, "0")}`;
const SLOTS = [101, 102, 103, 104, 105, 106, 107, 108];

describe("saved hunts (integration)", {
  skip: !hasTestDb && "TEST_DATABASE_URL not set",
}, () => {
  let hunts: typeof import("@/lib/hunts/saved-hunts");
  let schema: typeof import("@/lib/db/schema");
  let indexerPool: typeof import("@/lib/db/indexer").indexerPool;

  before(async () => {
    setupTestEnv();
    await migrateAppDb();
    await createIndexerTables();
    ({ indexerPool } = await import("@/lib/db/indexer"));
    // The shared harness DDL predates this column; the catalog reads it.
    await indexerPool.query(
      `ALTER TABLE collection ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT ''`,
    );
    hunts = await import("@/lib/hunts/saved-hunts");
    schema = await import("@/lib/db/schema");
  });

  after(teardown);

  beforeEach(async () => {
    await resetDb();
    for (const no of [...SLOTS, 201])
      await indexerPool.query(
        `INSERT INTO collection (id, collection_id, season, member, artist,
           collection_no, class, thumbnail_image, front_image, back_image,
           on_offline)
         VALUES ($1, $2, $3, $4, 'tripleS', $5, $6, '', '', '', $7)`,
        [
          dbId(no),
          `${SEASON.toLowerCase()}-${MEMBER.toLowerCase()}-${no}z`,
          SEASON,
          MEMBER,
          `${no}Z`,
          no >= 200 ? "Special" : "First",
          no >= 200 ? "online" : "offline",
        ],
      );
  });

  /** A wallet holding `counts[slot]` copies of each slot, all transferable. */
  async function wallet(counts: Record<number, number>, gridded = 0) {
    const address = `0x${randomUUID().replace(/-/g, "")}`.slice(0, 42);
    for (const [slot, copies] of Object.entries(counts))
      for (let i = 0; i < copies; i++)
        await indexerPool.query(
          `INSERT INTO objekt (id, owner, serial, transferable, collection_id)
           VALUES ($1, $2, $3, true, $4)`,
          [randomUUID(), address, i + 1, dbId(Number(slot))],
        );
    for (let i = 0; i < gridded; i++) {
      const objekt = randomUUID();
      await indexerPool.query(
        `INSERT INTO objekt (id, owner, serial, transferable, collection_id)
         VALUES ($1, $2, $3, false, $4)`,
        [objekt, address, 900 + i, dbId(201)],
      );
      await indexerPool.query(
        `INSERT INTO transfer (id, "from", "to", "timestamp", token_id, hash,
           objekt_id, collection_id)
         VALUES ($1, $2, $3, now(), '1', '0x', $4, $5)`,
        [randomUUID(), ZERO, address, objekt, dbId(201)],
      );
    }
    return address;
  }

  async function linkedUser(nickname: string, address: string) {
    const user = await createUser();
    const db = await getDb();
    await db
      .insert(schema.cosmoAccount)
      .values({ userId: user.id, address, nickname });
    return user;
  }

  const grid = {
    nickname: "sjarkbean",
    member: MEMBER,
    season: SEASON,
    edition: 1 as const,
  };

  it("computes wants and offers from owned counts", async () => {
    const address = await wallet({ 101: 3, 102: 2, 106: 1, 108: 1 });
    const user = await linkedUser("sjarkbean", address);
    const saved = await hunts.saveHunt(user.id, {
      ...grid,
      mode: "wtt",
      skipped: [`cream02-seoyeon-105z`],
      offers: [`cream02-seoyeon-101z`, `cream02-seoyeon-106z`],
    });
    assert.equal(saved.ok, true);

    const [hunt] = await hunts.listSavedHunts(user.id);
    assert.equal(hunt.available, true);
    assert.deepEqual(hunt.wants, [
      "SeoYeon CC103",
      "SeoYeon CC104",
      "SeoYeon CC107",
    ]);
    // 106's only copy stays with the grid being built; 101 has spares.
    assert.deepEqual(hunt.offers, ["SeoYeon CC101"]);
  });

  it("aims at the next grid once one has been redeemed", async () => {
    // Every slot held twice, one grid already crafted: one usable copy each,
    // so one more grid is craftable and the next one needs every slot again —
    // except 101, which has a spare.
    const address = await wallet(
      Object.fromEntries(SLOTS.map((no) => [no, no === 101 ? 3 : 2])),
      1,
    );
    const user = await linkedUser("sjarkbean", address);
    await hunts.saveHunt(user.id, {
      ...grid,
      mode: "wtb",
      skipped: [],
      offers: [],
    });
    const [hunt] = await hunts.listSavedHunts(user.id);
    assert.deepEqual(
      hunt.wants,
      SLOTS.filter((no) => no !== 101).map((no) => `SeoYeon CC${no}`),
    );
    assert.deepEqual(hunt.offers, []);
  });

  it("keeps one hunt per grid, and only for the user's own account", async () => {
    const address = await wallet({ 101: 1 });
    const user = await linkedUser("sjarkbean", address);
    const input = { ...grid, mode: "wtb" as const, skipped: [], offers: [] };
    const first = await hunts.saveHunt(user.id, input);
    const second = await hunts.saveHunt(user.id, {
      ...input,
      nickname: "SJARKBEAN",
      mode: "wtt",
    });
    assert.ok(first.ok && second.ok);
    assert.equal(first.id, second.id, "an upsert, not a second row");
    const listed = await hunts.listSavedHunts(user.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].mode, "wtt");

    const other = await hunts.saveHunt(user.id, {
      ...input,
      nickname: "someoneelse",
    });
    assert.deepEqual(other.ok ? null : other.status, 403);

    const unlinked = await createUser();
    const refused = await hunts.saveHunt(unlinked.id, input);
    assert.equal(refused.ok, false);
  });

  it("refuses an unknown season and the 21st hunt", async () => {
    const address = await wallet({});
    const user = await linkedUser("sjarkbean", address);
    const missing = await hunts.saveHunt(user.id, {
      ...grid,
      season: "Atom01",
      mode: "wtb",
      skipped: [],
      offers: [],
    });
    assert.deepEqual(missing.ok ? null : missing.status, 404);

    const db = await getDb();
    await db.insert(schema.hunt).values(
      Array.from({ length: 20 }, (_, i) => ({
        userId: user.id,
        nickname: "sjarkbean",
        member: MEMBER,
        season: `Filler${i + 10}`,
        edition: 1,
        mode: "wtb" as const,
      })),
    );
    const capped = await hunts.saveHunt(user.id, {
      ...grid,
      mode: "wtb",
      skipped: [],
      offers: [],
    });
    assert.deepEqual(capped.ok ? null : capped.status, 409);
  });

  it("deletes only the user's own hunt", async () => {
    const address = await wallet({});
    const owner = await linkedUser("sjarkbean", address);
    const saved = await hunts.saveHunt(owner.id, {
      ...grid,
      mode: "wtb",
      skipped: [],
      offers: [],
    });
    assert.ok(saved.ok);
    const stranger = await createUser();
    assert.equal(await hunts.deleteHunt(stranger.id, saved.id), false);
    assert.equal(await hunts.deleteHunt(owner.id, saved.id), true);
    assert.deepEqual(await hunts.listSavedHunts(owner.id), []);
  });
});
