import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { membersByArtist } from "@/lib/filters";
import { askingPrice, bidPrice, extractPricing, unitPrice } from "./price";

const MEMBERS = Object.values(membersByArtist).flat();
const price = (body: string) => extractPricing(body, MEMBERS);

describe("extractPricing", () => {
  it("reads both the prefix and suffix forms", () => {
    const a = price("Have\nHyerin CC336 $5.5");
    const b = price("Have\nYooYeon CC100 15$");
    assert.equal(unitPrice(a.byKey["hyerin|cream02|336"])?.amount, 5.5);
    assert.equal(unitPrice(b.byKey["yooyeon|cream02|100"])?.amount, 15);
  });

  it("does not read a collection number as a price", () => {
    // "CC337 $5.5" must not yield the price "337 $".
    const p = price("Have\nHyerin CC336 CC337 $5.5");
    assert.equal(unitPrice(p.byKey["hyerin|cream02|336"])?.amount, 5.5);
    assert.equal(unitPrice(p.byKey["hyerin|cream02|337"])?.amount, 5.5);
  });

  it("marks a set price as a set, not a unit price", () => {
    const p = price("Have\nChaewon CC334-338 set $32");
    const tags = p.byKey["chaewon|cream02|334"];
    assert.equal(tags?.[0].scope, "set");
    assert.equal(unitPrice(tags), null, "a set price is not a per-item price");
    // The range is expanded, so every objekt in the set carries it.
    assert.ok(p.byKey["chaewon|cream02|338"]);
  });

  it("does not mistake a set line for the post's headline price", () => {
    const p = price("Have\nChaewon CC334-338 set $32");
    assert.equal(p.fallback, null);
  });

  it("applies a post-wide price to objekts with none of their own", () => {
    const p = price(`WTS
Paypal f&f, wise
Each $2.3 / 3rd $2.6

Seoyeon d101 d102
Hyerin d104`);
    assert.equal(p.fallback?.amount, 2.3);
    assert.equal(askingPrice(p, "seoyeon|divine01|101")?.amount, 2.3);
    assert.equal(askingPrice(p, "seoyeon|divine01|101")?.scope, "post");
  });

  it("prefers a stated item price over the post-wide one", () => {
    const p = price(`WTS
Each $2.3

Kotone b202 12$`);
    assert.equal(askingPrice(p, "kotone|binary01|202")?.amount, 12);
    assert.equal(askingPrice(p, "kotone|binary01|202")?.scope, "item");
  });

  it("keeps a buying price out of the selling price", () => {
    // gogk sells CC202 for $8 and buys CC201/CC202 at $4. Merging the two
    // halves the asking price.
    const p = price(`Have
YooYeon  CC202  8$

Want
YooYeon CC201 CC202 (price / 4$)`);
    assert.equal(askingPrice(p, "yooyeon|cream02|202")?.amount, 8);
    assert.equal(bidPrice(p, "yooyeon|cream02|202")?.amount, 4);
    assert.equal(bidPrice(p, "yooyeon|cream02|201")?.amount, 4);
  });

  it("does not let a want-section price become the post default", () => {
    const p = price("Have\nSeoyeon cc101\n\nWant\nAny CC fco (price / 4$)");
    assert.equal(p.fallback, null);
  });

  it("flags QYOP and collects payment rails", () => {
    const p = price("WTS\n(Qyop accepted) PayPal\nWise / KR bank\nLynn cc311");
    assert.equal(p.qyop, true);
    assert.deepEqual(p.payment, ["PayPal", "Wise", "KR bank"]);
  });

  it("returns nothing for a pure trade post", () => {
    const p = price("WTT\nHave\nSullin aa372\nWant\nSullin bb337");
    assert.deepEqual(p.byKey, {});
    assert.equal(p.fallback, null);
    assert.equal(p.qyop, false);
    assert.equal(askingPrice(p, "sullin|atom02|372"), null);
  });

  it("keeps a two-line tier list working as a headline price", () => {
    const p = price("WTS\nSeoyeon d101\nEach $2.3\n3rd $2.6");
    assert.equal(p.fallback?.amount, 2.3);
  });

  it("refuses to pick a headline price out of a per-season price sheet", () => {
    // A real 428-objekt post opened with "SCO 1st $19" and then listed a dozen
    // more tiers. Taking the first unattached price priced every objekt in the
    // post at $19 when most were asking $2 — a confident, wrong number is
    // worse for a trader than no number.
    const p = price(`WTS
Seoyeon C101 C102
ATOM01
SCO 1st $19
BINARY
SCO 1st/2nd $18
CREAM
SCO 1st/2nd $15
DIVINE
SCO 1st/2nd $11
ATOM02
SCO 1st $6`);
    assert.equal(p.fallback, null);
    assert.equal(askingPrice(p, "seoyeon|cream01|101"), null);
  });

  it("reads the fullwidth ＄ CJK keyboards emit", () => {
    // "Each fco 2.5 ＄（Seoyoen's 4＄）" — without this a whole post's prices
    // silently read as absent.
    const p = price("Have\nSeoyeon C101 C102\nEach fco 2.5＄");
    assert.equal(p.fallback?.amount, 2.5);
  });
});

describe("ANY lines", () => {
  it("does not attribute an ANY price to the member named earlier", () => {
    // gogk lists YooYeon's stock, then bids on "Any CC201 CC202". The $4 is
    // for any member's CC202, not YooYeon's.
    const p = price(`Have
YooYeon  CC202  8$

Want
Any CC201 CC202 (price / 4$)`);
    assert.equal(bidPrice(p, "yooyeon|cream02|202"), null);
    assert.equal(askingPrice(p, "yooyeon|cream02|202")?.amount, 8);
  });

  it("still prices an ANY line that names a member itself", () => {
    const p = price("Want\nAny Mayu CC334 (price / 4$)");
    assert.equal(bidPrice(p, "mayu|cream02|334")?.amount, 4);
  });
});
