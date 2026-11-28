import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickShowcase,
  SHOWCASE_FIRSTS,
  SHOWCASE_REWARDS,
  type ShowcaseRow,
  showcaseDay,
} from "@/lib/home/showcase";

let next = 0;
function row(
  season: string,
  member: string,
  collectionNo: string,
  cls: string,
  createdAt = "2026-11-01",
  artist = "triples",
): ShowcaseRow {
  next += 1;
  return {
    id: `id-${next}`,
    artist,
    season,
    member,
    collectionNo,
    class: cls,
    thumbnailImage: `https://img.example/${season}/${member}/${collectionNo}`,
    createdAt: new Date(createdAt),
  };
}

function fullGrid(season: string, member: string, createdAt?: string) {
  return [
    ...SHOWCASE_FIRSTS.map((no) => row(season, member, no, "First", createdAt)),
    ...SHOWCASE_REWARDS.map((no) =>
      row(season, member, no, "Special", createdAt),
    ),
  ];
}

describe("pickShowcase", () => {
  it("builds the grid in slot order with both rewards", () => {
    const rows = ["ChaeYeon", "DaHyun", "HyeRin", "JiWoo", "SeoYeon"].flatMap(
      (m) => fullGrid("Cream02", m),
    );
    const showcase = pickShowcase(rows, 0);
    assert.ok(showcase);
    assert.equal(showcase.grid.season, "Cream02");
    assert.deepEqual(
      showcase.grid.firsts.map((c) => c.collectionNo),
      [...SHOWCASE_FIRSTS],
    );
    assert.deepEqual(
      showcase.grid.rewards.map((c) => c.collectionNo),
      ["201Z", "202Z"],
    );
    assert.ok(
      showcase.grid.firsts.every((c) => c.member === showcase.grid.member),
    );
  });

  it("rotates the member by day and keeps them off the trade hands", () => {
    const members = ["ChaeYeon", "DaHyun", "HyeRin", "JiWoo"];
    const rows = members.flatMap((m) => fullGrid("Cream02", m));
    const a = pickShowcase(rows, 0);
    const b = pickShowcase(rows, 1);
    assert.ok(a && b);
    assert.notEqual(a.grid.member, b.grid.member);
    for (const card of [...a.mine, ...a.theirs]) {
      assert.notEqual(card.member, a.grid.member);
    }
  });

  it("skips a newer season that has too few whole grids", () => {
    const rows = [
      ...["ChaeYeon", "DaHyun", "HyeRin", "JiWoo"].flatMap((m) =>
        fullGrid("Cream02", m, "2026-10-01"),
      ),
      // Divine02 is newer but only one member's grid is out so far.
      ...fullGrid("Divine02", "YuBin", "2026-11-28"),
      row("Divine02", "SooMin", "101Z", "First", "2026-11-28"),
    ];
    assert.equal(pickShowcase(rows, 0)?.grid.season, "Cream02");
  });

  it("shows SeoYeon's grid from the newest season she has one in", () => {
    const rows = [
      ...["ChaeYeon", "DaHyun", "HyeRin", "JiWoo"].flatMap((m) =>
        fullGrid("Cream02", m, "2026-10-01"),
      ),
      ...fullGrid("Cream02", "SeoYeon", "2026-10-01"),
      // Her Divine02 grid is out even though few others' are.
      ...fullGrid("Divine02", "SeoYeon", "2026-11-28"),
      // A newer season where her grid isn't whole yet.
      row("Binary03", "SeoYeon", "101Z", "First", "2026-12-20"),
    ];
    for (const day of [0, 1, 20_420]) {
      const showcase = pickShowcase(rows, day);
      assert.equal(showcase?.grid.member, "SeoYeon");
      assert.equal(showcase?.grid.season, "Divine02");
    }
  });

  it("returns null when no season has enough whole grids", () => {
    const rows = [
      ...fullGrid("Cream02", "YooYeon"),
      // Missing 108Z, so not a whole grid.
      ...fullGrid("Cream02", "HyeRin").filter((r) => r.collectionNo !== "108Z"),
    ];
    assert.equal(pickShowcase(rows, 0), null);
  });

  const TRIPLES = [
    "ChaeYeon",
    "DaHyun",
    "HyeRin",
    "JiWoo",
    "Kaede",
    "Lynn",
    "Mayu",
    "Nien",
    "SeoAh",
    "ShiOn",
    "SooMin",
    "YuBin",
    "Xinyu",
    "JooBin",
  ];
  const ARTMS = ["HeeJin", "KimLip", "JinSoul", "Choerry", "HaSeul"];
  const IDNTT = ["HwanHee", "HeeJu", "DoHun", "JaeYoung", "TaeIn", "JiWoon"];
  const SEASONS: [string, string][] = [
    ["Divine02", "2026-11-20"],
    ["Cream02", "2026-09-20"],
    ["Binary02", "2026-03-20"],
  ];

  // Every class each artist prints, artwork-only ones included.
  function catalog({ artms = true, idntt = true } = {}) {
    return [
      ...SEASONS.flatMap(([season, at]) =>
        TRIPLES.flatMap((m) => [
          ...fullGrid(season, m, at),
          row(season, m, "301Z", "Double", at),
          row(season, m, "302Z", "Double", at),
          row(season, m, "203Z", "Special", at),
          row(season, m, "401Z", "Premier", at),
          row(season, m, "601Z", "Unit", at),
        ]),
      ),
      ...(artms
        ? [
            // ARTMS reuses tripleS season names.
            ["Atom02", "2026-07-20"],
            ["Ever01", "2026-04-20"],
          ].flatMap(([season, at]) =>
            ARTMS.flatMap((m) => [
              row(season, m, "101Z", "First", at, "artms"),
              row(season, m, "102Z", "First", at, "artms"),
              row(season, m, "201Z", "Special", at, "artms"),
              row(season, m, "309Z", "Double", at, "artms"),
            ]),
          )
        : []),
      ...(idntt
        ? [
            ["Autumn26", "2026-10-20"],
            ["Summer26", "2026-07-20"],
          ].flatMap(([season, at]) =>
            IDNTT.flatMap((m) => [
              row(season, m, "101Z", "Basic", at, "idntt"),
              row(season, m, "102Z", "Basic", at, "idntt"),
              row(season, m, "301Z", "Special", at, "idntt"),
              row(season, m, "401Z", "Unit", at, "idntt"),
            ]),
          )
        : []),
    ];
  }

  it("deals each side six tripleS, three ARTMS and three idntt cards", () => {
    const rows = catalog();
    // Real day numbers are large (about 20,000).
    for (const day of [3, 20_420, 20_421]) {
      const showcase = pickShowcase(rows, day);
      assert.ok(showcase);
      const { mine, theirs, grid } = showcase;
      for (const side of [mine, theirs]) {
        assert.equal(side.length, 12);
        const count = (artist: string) =>
          side.filter((c) => c.artist === artist).length;
        assert.deepEqual(
          [count("triples"), count("artms"), count("idntt")],
          [6, 3, 3],
        );
        assert.equal(new Set(side.map((c) => c.member)).size, 12);
        assert.ok(side.every((c) => c.member !== grid.member));
        const triples = side.filter((c) => c.artist === "triples");
        assert.ok(new Set(triples.map((c) => c.season)).size >= 2);
      }
      const ids = [...mine, ...theirs].map((c) => c.id);
      assert.equal(new Set(ids).size, 24);
      // The table mirrors their side, so each card faces the one in the
      // same spot on the other side, and only same-class cards trade.
      assert.deepEqual(
        mine.map((c) => c.class),
        theirs.map((c) => c.class),
      );
    }
  });

  it("only deals classes whose art is a photo of the member", () => {
    const rows = catalog();
    for (const day of [0, 20_420]) {
      const showcase = pickShowcase(rows, day);
      assert.ok(showcase);
      for (const card of [...showcase.mine, ...showcase.theirs]) {
        assert.ok(
          ["First", "Basic", "Special", "Premier"].includes(card.class),
          `${card.artist} ${card.class} ${card.collectionNo}`,
        );
      }
    }
  });

  it("fills a side from tripleS when another artist has no cards", () => {
    const showcase = pickShowcase(catalog({ idntt: false }), 20_420);
    assert.ok(showcase);
    for (const side of [showcase.mine, showcase.theirs]) {
      assert.equal(side.length, 12);
      assert.equal(side.filter((c) => c.artist === "idntt").length, 0);
      assert.equal(side.filter((c) => c.artist === "triples").length, 9);
    }
  });

  it("keeps the grid to tripleS when ARTMS shares a season name", () => {
    const rows = [
      ...["ChaeYeon", "DaHyun", "HyeRin", "JiWoo"].flatMap((m) =>
        fullGrid("Cream02", m, "2026-09-01"),
      ),
      // A whole, newer ARTMS grid in a season tripleS also has.
      ...ARTMS.flatMap((m) => [
        ...SHOWCASE_FIRSTS.map((no) =>
          row("Atom02", m, no, "First", "2026-11-01", "artms"),
        ),
        ...SHOWCASE_REWARDS.map((no) =>
          row("Atom02", m, no, "Special", "2026-11-01", "artms"),
        ),
      ]),
    ];
    const showcase = pickShowcase(rows, 0);
    assert.equal(showcase?.grid.season, "Cream02");
    assert.ok(showcase?.grid.firsts.every((c) => c.artist === "triples"));
  });
});

describe("showcaseDay", () => {
  it("turns over at midnight in Seoul", () => {
    // 14:59 UTC is 23:59 KST; 15:00 UTC is the next day in Seoul.
    const before = showcaseDay(Date.parse("2026-11-28T14:59:00Z"));
    const after = showcaseDay(Date.parse("2026-11-28T15:00:00Z"));
    assert.equal(after - before, 1);
  });
});
