import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { indexOwned } from "@/lib/discord/match";
import { parsePastedTrade } from "@/lib/paste-parser";
import { buildVerification, checkClaims, suppliesPicked } from "./verify";

function owned(
  member: string,
  season: string,
  collectionNo: string,
  serial = 1,
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

const claimed = parsePastedTrade(`HAVE
Seoyeon CC112
Mayu CC103
Jiyeon CC110`).haves;

describe("checkClaims", () => {
  it("separates claims the trader still holds from stale ones", () => {
    const index = indexOwned([
      owned("SeoYeon", "Cream02", "112"),
      owned("Mayu", "Cream02", "103"),
    ]);
    const { confirmed, stale } = checkClaims(claimed, index);
    assert.deepEqual(
      confirmed.map((i) => i.collectionNo),
      ["112", "103"],
    );
    assert.deepEqual(
      stale.map((i) => i.collectionNo),
      ["110"],
    );
  });

  it("treats an unkeyable claim as confirmed rather than stale", () => {
    // Freeform/ANY entries carry no single collection, so they cannot be
    // disproved — flagging them stale would accuse honest posters.
    const anyWants = parsePastedTrade("WANT\nAny Xinyu CC fco").wants;
    const { confirmed, stale } = checkClaims(anyWants, indexOwned([]));
    assert.equal(stale.length, 0);
    assert.equal(confirmed.length, anyWants.length);
  });

  it("matches across A/Z twins", () => {
    const twin = parsePastedTrade("HAVE\nSeoyeon CC112Z").haves;
    const index = indexOwned([owned("SeoYeon", "Cream02", "112")]);
    assert.equal(checkClaims(twin, index).stale.length, 0);
  });
});

describe("buildVerification", () => {
  it("reports a fully stale list without throwing", () => {
    const v = buildVerification(claimed, []);
    assert.equal(v.status, "verified");
    assert.equal(v.confirmed.length, 0);
    assert.equal(v.stale.length, 3);
  });

  it("keeps the inventory for later matching", () => {
    const v = buildVerification(claimed, [owned("SeoYeon", "Cream02", "112")]);
    assert.equal(v.inventory.length, 1);
    assert.equal(v.index.total, 1);
  });
});

describe("suppliesPicked", () => {
  it("finds which of the viewer's picks a trader can actually supply", () => {
    const index = indexOwned([
      owned("SeoYeon", "Cream02", "112"),
      owned("Nien", "Cream02", "104"),
    ]);
    const picked = new Set(["seoyeon|cream02|112", "kaede|cream02|999"]);
    assert.deepEqual(suppliesPicked(index, picked), ["seoyeon|cream02|112"]);
  });

  it("returns nothing when the viewer has picked nothing", () => {
    const index = indexOwned([owned("SeoYeon", "Cream02", "112")]);
    assert.deepEqual(suppliesPicked(index, new Set()), []);
  });
});
