import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectDeskCards,
  indexDeskPosts,
  selectDeskPosts,
} from "./trade-desk";
import { parseTranscript } from "./transcript";

const posts = indexDeskPosts(
  parseTranscript(`Alice — 3:41 PM
HAVE
SeoYeon CC101 CC102
WANT
JiYeon CC102
Bob — 3:42 PM
HAVE
Mayu CC103
WANT
Xinyu CC101
Seller — 3:43 PM
WTS
Mayu CC103 $5
Buyer — 3:44 PM
WTB
JiYeon CC102 $4`),
);
const jiyeon = "jiyeon|cream02|102";
const seoyeon = "seoyeon|cream02|101";
const mayu = "mayu|cream02|103";
const empty = new Set<string>();

describe("trade desk selections", () => {
  it("selecting mine shows only offers from people who want it", () => {
    const hits = selectDeskPosts(posts, "trade", new Set([jiyeon]), empty);
    assert.deepEqual(
      hits.map((p) => p.message.author),
      ["Alice"],
    );
    assert.deepEqual(
      [...collectDeskCards(hits, "haves").keys()],
      [seoyeon, "seoyeon|cream02|102"],
    );
  });
  it("selecting theirs reveals what the same traders want from me", () => {
    const hits = selectDeskPosts(posts, "trade", empty, new Set([mayu]));
    assert.deepEqual(
      [...collectDeskCards(hits, "wants").keys()],
      ["xinyu|cream02|101"],
    );
  });
  it("never bridges unrelated traders or separate posts by the same author", () => {
    assert.equal(
      selectDeskPosts(posts, "trade", new Set([jiyeon]), new Set([mayu]))
        .length,
      0,
    );
    const split = indexDeskPosts(
      parseTranscript(`Alice — 3:41 PM
WTT
HAVE
SeoYeon CC101
Alice — 3:42 PM
WTT
WANT
JiYeon CC102`),
    );
    assert.equal(
      selectDeskPosts(split, "trade", new Set([jiyeon]), new Set([seoyeon]))
        .length,
      0,
    );
  });
  it("requires every selected card within a single post", () => {
    assert.equal(
      selectDeskPosts(
        posts,
        "trade",
        new Set([jiyeon]),
        new Set([seoyeon, "seoyeon|cream02|102"]),
      ).length,
      1,
    );
    assert.equal(
      selectDeskPosts(
        posts,
        "trade",
        new Set([jiyeon]),
        new Set([seoyeon, mayu]),
      ).length,
      0,
    );
  });
  it("credits every post offering the same objekt", () => {
    const shared = indexDeskPosts(
      parseTranscript(`Alice — 3:41 PM
HAVE
Mayu CC103
WANT
JiYeon CC102
Carol — 4:02 PM
HAVE
Mayu CC103
WANT
JiYeon CC102`),
    );
    const card = collectDeskCards(shared, "haves").get(mayu);
    assert.deepEqual(
      card?.posts.map((p) => p.message.author),
      ["Alice", "Carol"],
    );
  });
  it("buy shows sellers without requiring an inventory or a return leg", () => {
    assert.deepEqual(
      selectDeskPosts(posts, "buy", new Set([jiyeon]), new Set([mayu])).map(
        (p) => p.message.author,
      ),
      ["Seller"],
    );
  });
  it("sell shows cash buyers, not everyone who wants a swap", () => {
    assert.deepEqual(
      selectDeskPosts(posts, "sell", new Set([jiyeon]), new Set([mayu])).map(
        (p) => p.message.author,
      ),
      ["Buyer"],
    );
  });
});
