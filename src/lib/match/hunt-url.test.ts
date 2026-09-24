import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDeskQuery } from "@/app/match/desk-search";
import {
  buildHuntHref,
  type HuntParams,
  huntLabel,
  MAX_HUNT_ITEMS,
  readHuntParams,
  stripHuntParams,
} from "@/lib/match/hunt-url";

function read(href: string) {
  return readHuntParams(new URL(href, "https://objekt.my").searchParams);
}

describe("hunt URL", () => {
  it("round-trips a wtt hunt", () => {
    const hunt: HuntParams = {
      mode: "wtt",
      wants: ["SeoYeon CC101", "SeoYeon CC105"],
      offers: ["SeoYeon CC203"],
      nickname: "sjarkbean",
    };
    const href = buildHuntHref(hunt);
    assert.ok(href.startsWith("/match?hunt=1&mode=wtt"));
    assert.deepEqual(read(href), hunt);
  });

  it("drops offers in wtb and omits an empty nickname", () => {
    const href = buildHuntHref({
      mode: "wtb",
      wants: ["Mayu AA101"],
      offers: ["Mayu AA102"],
      nickname: "",
    });
    assert.equal(href.includes("offer="), false);
    assert.equal(href.includes("nick="), false);
    assert.deepEqual(read(href), {
      mode: "wtb",
      wants: ["Mayu AA101"],
      offers: [],
      nickname: "",
    });
  });

  it("returns null without hunt=1", () => {
    assert.equal(read("/match?mode=wtt&want=SeoYeon%20CC101"), null);
    assert.equal(read("/match?hunt=0&want=SeoYeon%20CC101"), null);
    assert.equal(read("/match"), null);
  });

  it("treats an unknown mode as wtb and ignores its offers", () => {
    const hunt = read("/match?hunt=1&mode=wts&want=a&offer=b");
    assert.equal(hunt?.mode, "wtb");
    assert.deepEqual(hunt?.offers, []);
    assert.equal(read("/match?hunt=1")?.mode, "wtb");
  });

  it("caps entries at 40 and drops over-long or blank labels", () => {
    const many = Array.from({ length: 60 }, (_, i) => `SeoYeon CC${100 + i}`);
    const hunt = read(
      buildHuntHref({ mode: "wtb", wants: many, offers: [], nickname: "" }),
    );
    assert.equal(hunt?.wants.length, MAX_HUNT_ITEMS);

    const long = "x".repeat(65);
    const parsed = read(
      `/match?hunt=1&want=${long}&want=%20%20&want=SeoYeon%20%20CC101`,
    );
    assert.deepEqual(parsed?.wants, ["SeoYeon CC101"]);
  });

  it("strips only the hunt params", () => {
    assert.equal(
      stripHuntParams(
        "https://objekt.my/match?hunt=1&mode=wtt&want=a&offer=b&nick=c&x=1#top",
      ),
      "/match?x=1#top",
    );
    assert.equal(
      stripHuntParams("https://objekt.my/match?hunt=1&want=a"),
      "/match",
    );
  });

  // STOP 2 guard: the joined labels must be what /match's search box parses.
  it("labels parse as /match search alternatives", () => {
    const wants = [
      huntLabel({
        collectionId: "cream02-seoyeon-101z",
        member: "SeoYeon",
        season: "Cream02",
        collectionNo: "101Z",
      }),
      huntLabel({
        collectionId: "atom01-mayu-205a",
        member: "Mayu",
        season: "Atom01",
        collectionNo: "205A",
      }),
    ];
    assert.deepEqual(wants, ["SeoYeon CC101", "Mayu A205"]);
    const query = parseDeskQuery(wants.join(", "));
    assert.deepEqual(
      query.alternatives.map((item) => [
        item.member,
        item.season,
        item.collectionNo,
      ]),
      [
        ["SeoYeon", "Cream02", "101"],
        ["Mayu", "Atom01", "205"],
      ],
    );
  });
});
