import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  applyMark,
  clearAllMarks,
  clearMark,
  MARK_ATTRIBUTE,
  type MatchMark,
  matchMark,
  setMarkTheme,
} from "./match-mark";

const hits = (count: number) => Array.from({ length: count }, () => ({}));
const have: MatchMark = { tone: "have", text: "objekt.my · has 2 you want" };

function page(rootClass = "theme-dark") {
  const { document } = new JSDOM(
    `<!doctype html><html class="${rootClass}"><head></head><body><ol><li id="row-1"></li><li id="row-2"></li></ol></body></html>`,
  ).window;
  return {
    document,
    row: document.getElementById("row-1") as Element,
    other: document.getElementById("row-2") as Element,
  };
}

const badgeOf = (row: Element) => row.querySelector("objekt-match-badge");

test("a post with nothing for you is not marked", () => {
  assert.equal(matchMark(undefined), null);
  assert.equal(
    matchMark({ isMutual: false, theyWantYouHave: [], theyHaveYouWant: [] }),
    null,
  );
});

test("each kind of match says what it is", () => {
  assert.deepEqual(
    matchMark({
      isMutual: false,
      theyWantYouHave: [],
      theyHaveYouWant: hits(3),
    }),
    { tone: "have", text: "objekt.my · has 3 you want" },
  );
  assert.deepEqual(
    matchMark({
      isMutual: false,
      theyWantYouHave: hits(2),
      theyHaveYouWant: [],
    }),
    { tone: "want", text: "objekt.my · wants 2 of yours" },
  );
  assert.deepEqual(
    matchMark({
      isMutual: true,
      theyWantYouHave: hits(2),
      theyHaveYouWant: hits(3),
    }),
    { tone: "mutual", text: "objekt.my · mutual: wants 2, has 3 you want" },
  );
});

test("a match marks the whole row, not just a pill under it", () => {
  const { row } = page();
  applyMark(row, have);
  assert.equal(row.getAttribute(MARK_ATTRIBUTE), "have");
  assert.ok(badgeOf(row));
});

test("the row styling is added once, however many rows are marked", () => {
  const { document, row, other } = page();
  applyMark(row, have);
  applyMark(other, { tone: "mutual", text: "x" });
  applyMark(row, have);
  const styles = document.querySelectorAll("#objekt-match-rows");
  assert.equal(styles.length, 1);
  for (const tone of ["have", "mutual", "want"])
    assert.match(
      styles[0].textContent ?? "",
      new RegExp(`\\[${MARK_ATTRIBUTE}="${tone}"\\]`),
    );
});

test("row styling never changes the row's size", () => {
  const { document, row } = page();
  applyMark(row, have);
  const css = document.getElementById("objekt-match-rows")?.textContent ?? "";
  // Discord's virtualised list measures its rows.
  assert.doesNotMatch(
    css,
    /(^|[{;\s])(margin|padding|height|border(?!-radius))[-:]/,
  );
});

test("the tint lets clicks through to the message under it", () => {
  const { document, row } = page();
  applyMark(row, have);
  const css = document.getElementById("objekt-match-rows")?.textContent ?? "";
  assert.match(css, /::after\{[^}]*pointer-events:none/);
});

test("marking a row again replaces its mark", () => {
  const { row } = page();
  applyMark(row, have);
  applyMark(row, { tone: "mutual", text: "x" });
  assert.equal(row.getAttribute(MARK_ATTRIBUTE), "mutual");
  assert.equal(row.querySelectorAll("objekt-match-badge").length, 1);
});

test("a row that stops matching loses both halves of its mark", () => {
  const { row } = page();
  applyMark(row, have);
  applyMark(row, null);
  assert.equal(row.hasAttribute(MARK_ATTRIBUTE), false);
  assert.equal(badgeOf(row), null);
});

test("clearing one row leaves the others marked", () => {
  const { row, other } = page();
  applyMark(row, have);
  applyMark(other, have);
  clearMark(row);
  assert.equal(row.hasAttribute(MARK_ATTRIBUTE), false);
  assert.equal(other.getAttribute(MARK_ATTRIBUTE), "have");
  assert.ok(badgeOf(other));
});

test("clearing the page takes every mark off", () => {
  const { document, row, other } = page();
  applyMark(row, have);
  applyMark(other, have);
  clearAllMarks(document);
  assert.equal(document.querySelectorAll(`[${MARK_ATTRIBUTE}]`).length, 0);
  assert.equal(document.querySelectorAll("objekt-match-badge").length, 0);
});

test("the pill picks up Discord's theme, and follows it", () => {
  const light = page("theme-light");
  applyMark(light.row, have);
  assert.equal(
    (badgeOf(light.row) as HTMLElement | null)?.dataset.theme,
    "light",
  );
  setMarkTheme(light.document, "dark");
  assert.equal(
    (badgeOf(light.row) as HTMLElement | null)?.dataset.theme,
    "dark",
  );
});
