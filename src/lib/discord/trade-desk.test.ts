import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectDeskCards,
  deskLabelLines,
  indexDeskPosts,
  latestDeskPosts,
  selectDeskPosts,
} from "./trade-desk";
import { collect, parseMessageTime, parseTranscript } from "./transcript";

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
    const hits = selectDeskPosts(posts, "wtt", new Set([jiyeon]), empty);
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
    const hits = selectDeskPosts(posts, "wtt", empty, new Set([mayu]));
    assert.deepEqual(
      [...collectDeskCards(hits, "wants").keys()],
      ["xinyu|cream02|101"],
    );
  });
  it("never bridges unrelated traders or separate posts by the same author", () => {
    assert.equal(
      selectDeskPosts(posts, "wtt", new Set([jiyeon]), new Set([mayu])).length,
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
      selectDeskPosts(split, "wtt", new Set([jiyeon]), new Set([seoyeon]))
        .length,
      0,
    );
  });
  it("requires every selected card within a single post", () => {
    assert.equal(
      selectDeskPosts(
        posts,
        "wtt",
        new Set([jiyeon]),
        new Set([seoyeon, "seoyeon|cream02|102"]),
      ).length,
      1,
    );
    assert.equal(
      selectDeskPosts(posts, "wtt", new Set([jiyeon]), new Set([seoyeon, mayu]))
        .length,
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
      selectDeskPosts(posts, "wtb", new Set([jiyeon]), new Set([mayu])).map(
        (p) => p.message.author,
      ),
      ["Seller"],
    );
  });
  it("sell shows cash buyers, not everyone who wants a swap", () => {
    assert.deepEqual(
      selectDeskPosts(posts, "wts", new Set([jiyeon]), new Set([mayu])).map(
        (p) => p.message.author,
      ),
      ["Buyer"],
    );
  });
});

/** Posts as the capture extension delivers them: one block each, ISO-stamped. */
function stamped(...blocks: [author: string, time: string, body: string][]) {
  return indexDeskPosts(
    collect(
      blocks.map(([author, time, body]) => ({
        author,
        body,
        time: parseMessageTime(time),
      })),
    ),
  );
}

const FULL =
  "WTT\nHAVE\nHyeRin BB206 JiWoo CC201 YooYeon CC202 NaKyoung CC201\nWANT\nSeoYeon CC203 CC204";

describe("a trader's updated list", () => {
  it("replaces the list it updated, and says how many it replaced", () => {
    const latest = latestDeskPosts(
      stamped(
        ["M31WAV", "2026-09-13T11:22:47.764Z", FULL],
        ["M31WAV", "2026-09-13T17:06:03.374Z", `${FULL} CC205`],
        [
          "M31WAV",
          "2026-09-14T01:08:47.180Z",
          FULL.replace(" NaKyoung CC201", ""),
        ],
      ),
    );
    assert.equal(latest.length, 1);
    assert.equal(latest[0].message.time?.raw, "2026-09-14T01:08:47.180Z");
    assert.equal(latest[0].replaced, 2);
  });
  it("keeps a list split across two messages, which share no cards", () => {
    const latest = latestDeskPosts(
      stamped(
        [
          "Alice",
          "2026-09-13T11:00:00.000Z",
          "WTT\nHAVE\nSeoYeon CC101 CC102 CC103",
        ],
        [
          "Alice",
          "2026-09-13T11:00:05.000Z",
          "WTT\nHAVE\nJiYeon CC201 CC202 CC203",
        ],
      ),
    );
    assert.equal(latest.length, 2);
  });
  it("never lets one trader's post replace another's", () => {
    const latest = latestDeskPosts(
      stamped(
        ["Alice", "2026-09-13T11:00:00.000Z", FULL],
        ["Bob", "2026-09-13T12:00:00.000Z", FULL],
      ),
    );
    assert.equal(latest.length, 2);
  });
  it("keeps both when a sell post follows a trade post", () => {
    const latest = latestDeskPosts(
      stamped(
        ["Alice", "2026-09-13T11:00:00.000Z", "WTT\nHAVE\nSeoYeon CC101 CC102"],
        ["Alice", "2026-09-13T12:00:00.000Z", "WTS\nSeoYeon CC101 CC102 $5"],
      ),
    );
    assert.equal(latest.length, 2);
  });
  it("keeps both when it cannot be sure which is newer", () => {
    // 9 AM today is later than 11 PM yesterday, and earlier on the clock.
    const latest = latestDeskPosts(
      stamped(
        ["Alice", "Yesterday at 11:00 PM", FULL],
        ["Alice", "Today at 9:00 AM", FULL.replace(" CC204", "")],
      ),
    );
    assert.equal(latest.length, 2);
  });
  it("orders clock times under the same day word", () => {
    const latest = latestDeskPosts(
      stamped(
        ["Alice", "Today at 9:00 AM", FULL],
        ["Alice", "Today at 11:00 AM", FULL.replace(" CC204", "")],
      ),
    );
    assert.deepEqual(
      latest.map((post) => post.message.time?.raw),
      ["Today at 11:00 AM"],
    );
  });
});

describe("card names", () => {
  it("put the member and the code on a line each", () => {
    const [item] = parseTranscript("Alice — 3:41 PM\nHAVE\nSeoYeon E317")[0]
      .haves;
    assert.deepEqual(deskLabelLines(item), ["SeoYeon", "E317"]);
  });
});
