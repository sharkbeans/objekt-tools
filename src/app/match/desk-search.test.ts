import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOffering } from "@/lib/discord/match";
import { deskLabel } from "@/lib/discord/trade-desk";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

const cards = parseOffering(
  "SeoYeon CC344 345 346\nMayu CC344\nMayu AA101\nSeoYeon AA101",
);
const find = (search: string) =>
  cards
    .filter((card) => matchesDeskQuery(card, parseDeskQuery(search)))
    .map(deskLabel);

test("multiple codes mean either card, preserving the member and season", () => {
  assert.deepEqual(find("seoyeon cc344 345"), [
    "SeoYeon CC344",
    "SeoYeon CC345",
  ]);
  assert.deepEqual(find("sy cc344-345"), find("seoyeon cc344 345"));
});

test("multi-member wants keep each member paired with their own codes", () => {
  const expected = ["SeoYeon CC344", "Mayu AA101"];
  assert.deepEqual(find("SeoYeon CC344\nMayu AA101"), expected);
  assert.deepEqual(find("SeoYeon CC344, Mayu AA101"), expected);
});

test("bare codes work without a member, and variants share collection identity", () => {
  assert.deepEqual(find("cc344 345"), [
    "SeoYeon CC344",
    "SeoYeon CC345",
    "Mayu CC344",
  ]);
  assert.deepEqual(find("sy cc344z"), ["SeoYeon CC344"]);
});

test("member, season, partial-code and empty searches still work", () => {
  assert.equal(find("sy").length, 4);
  assert.equal(find("aa").length, 2);
  assert.equal(find("34").length, 4);
  assert.equal(find("").length, cards.length);
  assert.deepEqual(find("unlisted"), []);
});
