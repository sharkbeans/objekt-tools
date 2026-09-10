import assert from "node:assert/strict";
import { test } from "node:test";
import { clampGeometry, readPanelState, UNPLACED } from "./panel-geometry";

const screen = { width: 1440, height: 900 };

test("an unplaced panel opens in the top right, clear of the edge", () => {
  const placed = clampGeometry(readPanelState(undefined), screen);
  assert.equal(placed.x + placed.width, screen.width - 12);
  assert.equal(placed.y, 12);
});

test("geometry saved on a bigger screen still fits on a smaller one", () => {
  const wide = { ...UNPLACED, x: 2400, y: 1300, width: 900, height: 1200 };
  const placed = clampGeometry(wide, { width: 900, height: 600 });
  assert.ok(placed.width <= 900 - 24, `width ${placed.width}`);
  assert.ok(placed.height <= 600 - 24, `height ${placed.height}`);
  // The titlebar has to stay grabbable: on screen horizontally, and never
  // pushed past the bottom edge.
  assert.ok(placed.x < 900 - 79, `x ${placed.x}`);
  assert.ok(placed.y + 34 <= 600, `y ${placed.y}`);
});

test("a panel dragged off the top or the left can still be grabbed", () => {
  const off = clampGeometry(
    { ...UNPLACED, x: -5000, y: -400, width: 384, height: 640 },
    screen,
  );
  assert.ok(off.y >= 0);
  // At least part of the titlebar is within reach of the pointer.
  assert.ok(off.x + off.width >= 80);
});

test("collapsed panels are held to the titlebar, not the full height", () => {
  const collapsed = clampGeometry(
    { x: 10, y: 880, width: 384, height: 640, collapsed: true },
    screen,
  );
  // 880 + 34 fits in 900, so it stays where it was put.
  assert.equal(collapsed.y, 866);
  const expanded = clampGeometry(
    { x: 10, y: 880, width: 384, height: 640, collapsed: false },
    screen,
  );
  assert.equal(expanded.y, 260);
});

test("nothing in storage can produce a NaN size", () => {
  const junk = readPanelState({
    x: "left",
    y: null,
    width: Number.NaN,
    height: Infinity,
    collapsed: "yes",
    open: 1,
  });
  assert.deepEqual(junk, UNPLACED);
  const placed = clampGeometry(junk, screen);
  for (const value of [placed.x, placed.y, placed.width, placed.height])
    assert.ok(Number.isFinite(value), `${value}`);
});

test("an open flag survives a round trip, and anything else reads as closed", () => {
  assert.equal(readPanelState({ ...UNPLACED, open: true }).open, true);
  assert.equal(readPanelState({ open: "true" }).open, false);
});
