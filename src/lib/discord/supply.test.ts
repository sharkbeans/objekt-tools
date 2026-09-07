import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { parseTranscript } from "@/lib/discord/transcript";
import {
  buildVerification,
  type VerificationState,
} from "@/lib/discord/verify";
import {
  buildDemandIndex,
  buildSupplyIndex,
  searchDemand,
  searchSupply,
  suppliersForPicks,
} from "./supply";

function owned(
  member: string,
  season: string,
  collectionNo: string,
  serial: number,
): OwnedEntry {
  return {
    collectionId: `${season}-${collectionNo}`.toLowerCase(),
    artist: "tripleS",
    member,
    collectionNo,
    season,
    class: "Double",
    serial,
    objektId: `${season}-${collectionNo}-${serial}`,
  };
}

// A link-only poster and a typed-list poster — the two shapes a dump contains.
const TRANSCRIPT = `linkonly — 3:41 PM
WTS ALL
https://objekt.top/@bigtrader
typed — 3:44 PM
Have
Nien CC301
Seoyeon CC112`;

const messages = parseTranscript(TRANSCRIPT);

describe("buildSupplyIndex", () => {
  it("gives a link-only poster supply once verified", () => {
    const before = buildSupplyIndex(messages, new Map());
    // Unverified, the link-only poster contributes nothing — they typed no list.
    assert.equal(
      [...before.values()].some((e) =>
        e.suppliers.some((s) => s.message.author === "linkonly"),
      ),
      false,
    );

    const verified = new Map<string, VerificationState>([
      [
        "bigtrader",
        buildVerification(
          [],
          [
            owned("Nien", "Cream02", "301", 1),
            owned("Nien", "Cream02", "301", 2),
          ],
        ),
      ],
    ]);
    const after = buildSupplyIndex(messages, verified);
    const nien = after.get("nien|cream02|301");
    assert.ok(nien, "Nien CC301 should be in the index");
    const fromLink = nien.suppliers.find(
      (s) => s.message.author === "linkonly",
    );
    assert.equal(fromLink?.source, "verified");
    assert.equal(fromLink?.copies, 2, "both copies counted");
  });

  it("indexes typed lists as listed, not verified", () => {
    const index = buildSupplyIndex(messages, new Map());
    const seoyeon = index.get("seoyeon|cream02|112");
    assert.equal(seoyeon?.suppliers.length, 1);
    assert.equal(seoyeon?.suppliers[0].source, "listed");
  });

  it("supersedes a trader's typed list with their real inventory", () => {
    const withLink = parseTranscript(`both — 3:41 PM
Have
Seoyeon CC112
https://objekt.top/@bigtrader`);
    const verified = new Map<string, VerificationState>([
      [
        "bigtrader",
        buildVerification([], [owned("Nien", "Cream02", "301", 1)]),
      ],
    ]);
    const index = buildSupplyIndex(withLink, verified);
    // The claim they no longer back is dropped in favour of what they hold.
    assert.equal(index.has("seoyeon|cream02|112"), false);
    assert.equal(
      index.get("nien|cream02|301")?.suppliers[0].source,
      "verified",
    );
  });
});

describe("searchSupply", () => {
  const index = buildSupplyIndex(messages, new Map());

  it("matches terms in any order", () => {
    assert.equal(searchSupply(index, "nien cc301").length, 1);
    assert.equal(searchSupply(index, "cc301 nien").length, 1);
  });

  it("matches on member alone", () => {
    assert.equal(searchSupply(index, "seoyeon")[0]?.collectionNo, "112");
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchSupply(index, "   "), []);
  });

  it("ranks verified supply above listed", () => {
    const verified = new Map<string, VerificationState>([
      [
        "bigtrader",
        buildVerification([], [owned("Nien", "Cream02", "301", 1)]),
      ],
    ]);
    const withVerified = buildSupplyIndex(messages, verified);
    const hits = searchSupply(withVerified, "cream02");
    assert.ok(
      hits[0].suppliers.some((s) => s.source === "verified"),
      "verified supply should rank first",
    );
  });
});

describe("suppliersForPicks", () => {
  it("returns only picks somebody can actually supply", () => {
    const index = buildSupplyIndex(messages, new Map());
    const picks = new Set(["nien|cream02|301", "kaede|cream02|999"]);
    const found = suppliersForPicks(index, picks);
    assert.deepEqual(
      found.map((e) => e.key),
      ["nien|cream02|301"],
    );
  });
});

// The mirror question: a trader holding a spare wants to know who will take
// it. Answering only the supply half returns the opposite of what they asked.
const DEMAND = parseTranscript(`alice — 3:41 PM
Have
Seoyeon CC101
Want
Jiyeon CC102
bob — 3:44 PM
Want
Jiyeon CC102
Any Xinyu CC fco`);

describe("buildDemandIndex", () => {
  it("indexes every poster asking for an objekt", () => {
    const index = buildDemandIndex(DEMAND);
    const entry = [...index.values()].find((e) => e.collectionNo === "102");
    assert.deepEqual(
      entry?.wanters.map((m) => m.author),
      ["alice", "bob"],
    );
  });

  it("leaves ANY-filter wants out rather than inventing a hit", () => {
    const index = buildDemandIndex(DEMAND);
    assert.ok([...index.values()].every((e) => e.member !== null));
    assert.equal(index.size, 1);
  });

  it("does not confuse a poster's haves with their wants", () => {
    const index = buildDemandIndex(DEMAND);
    assert.equal(
      [...index.values()].some((e) => e.collectionNo === "101"),
      false,
    );
  });
});

describe("searchDemand", () => {
  it("finds takers for a spare, in either term order", () => {
    const index = buildDemandIndex(DEMAND);
    for (const query of ["jiyeon cc102", "cc102 jiyeon", "jiyeon 102"]) {
      const hits = searchDemand(index, query);
      assert.equal(hits.length, 1, query);
      assert.equal(hits[0].wanters.length, 2, query);
    }
  });

  it("returns nothing for an objekt nobody asked for", () => {
    assert.deepEqual(searchDemand(buildDemandIndex(DEMAND), "nien cc301"), []);
  });
});
