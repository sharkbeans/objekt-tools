import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTranscript } from "@/lib/discord/transcript";

// Shapes taken from a real tripleS trade channel: a quarter of the posts are
// sales rather than swaps, and several are both at once.
function intentsFor(body: string): string[] {
  const [message] = parseTranscript(`trader — 3:41 PM\n${body}`);
  return message?.intent.intents ?? [];
}

describe("classifyIntent", () => {
  it("reads a swap from an explicit WTT", () => {
    assert.deepEqual(
      intentsFor("WTT\nHave\nSullin aa372\nWant\nSullin bb337"),
      ["wtt"],
    );
  });

  it("reads a swap from a filled-in have/want with no acronym", () => {
    assert.deepEqual(intentsFor("HAVE\nSeoyeon cc101\nWANT\nJiyeon cc102"), [
      "wtt",
    ]);
  });

  it("reads a sale from prices alone", () => {
    const intents = intentsFor("Have\nKotone b202 12$\nKotone b206 8$");
    assert.ok(intents.includes("wts"));
  });

  it("reads a sale from a payment rail with no WTS token", () => {
    const intents = intentsFor(
      "QUITTING SALE\nPayPal / WISE\nAny 4 Objekts for $5",
    );
    assert.ok(intents.includes("wts"));
  });

  it("reads a purchase from WTB", () => {
    assert.deepEqual(intentsFor("WTB\nSeoyeon cc341\nNien cc341\nDm plz"), [
      "wtb",
    ]);
  });

  it("carries every flag for a post that is all three", () => {
    const intents = intentsFor(`HAVE
Dahyun a335
WANT
Nakyoung a335

Have / WTS
(Qyop accepted) PayPal
SeoYeon bb339

WTB
Dahyun d207`);
    assert.deepEqual(intents, ["wtt", "wts", "wtb"]);
  });

  it("does not call a cash-only want a trade", () => {
    const [message] = parseTranscript(`trader — 3:41 PM
WTS
Have
Jiwoo BB322

Want
Money $$$ Paypal, Krbank
Offer DM Plz`);
    assert.equal(message.intent.wantsMoney, true);
    assert.deepEqual(message.intent.intents, ["wts"]);
  });

  it("still classifies a link-only trader with both headers", () => {
    const intents = intentsFor(
      "HAVE\nhttps://apollo.cafe/@somebody\n\nWANT\nhttps://objekt.top/list/abc",
    );
    assert.ok(intents.includes("wtt"));
  });

  it("never leaves a post with items unclassified", () => {
    assert.deepEqual(intentsFor("Have\nSeoyeon cc101"), ["wtt"]);
  });

  it("reads a sale from the fullwidth ＄ CJK keyboards emit", () => {
    const intents = intentsFor("Have\nSeoyeon cc101\nEach dco 3＄");
    assert.ok(intents.includes("wts"));
  });
});
