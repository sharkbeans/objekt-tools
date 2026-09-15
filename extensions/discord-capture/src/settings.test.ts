import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capturing,
  channelLabelFromTitle,
  formatChannelLabel,
} from "./settings";

test("capture is on in a channel unless it is paused", () => {
  assert.equal(capturing("123", []), true);
  assert.equal(capturing("123", ["456"]), true);
  assert.equal(capturing("123", ["123"]), false);
  assert.equal(capturing(null, []), false, "no channel is never capturing");
});

test("reads the channel and server out of Discord's tab title", () => {
  const expected = { channel: "#objekt-trade", server: "tripleS" };
  // The shapes the title has taken, which is why none of them is assumed.
  for (const title of [
    "#objekt-trade | tripleS",
    "Discord | #objekt-trade | tripleS",
    "#objekt-trade | tripleS | Discord",
    "#objekt-trade | tripleS - Discord",
    "(3) Discord | #objekt-trade | tripleS",
    "(99+) #objekt-trade | tripleS",
    "• Discord | #objekt-trade | tripleS",
  ])
    assert.deepEqual(channelLabelFromTitle(title), expected, title);
});

test("a thread keeps its parent channel and the server stays last", () => {
  assert.deepEqual(
    channelLabelFromTitle("WTS cream02 | #objekt-trade | tripleS"),
    { channel: "#objekt-trade", server: "tripleS" },
  );
});

test("a server name with a dash in it is not mistaken for the suffix", () => {
  assert.deepEqual(
    channelLabelFromTitle("#trade | tripleS - Official | Discord"),
    { channel: "#trade", server: "tripleS - Official" },
  );
});

test("a title with nothing to name gives nothing, not a guess", () => {
  assert.equal(channelLabelFromTitle("Discord"), null);
  assert.equal(channelLabelFromTitle(""), null);
  assert.equal(channelLabelFromTitle(undefined), null);
  // One part only: the channel, with no server to pair it with.
  assert.deepEqual(channelLabelFromTitle("#general"), {
    channel: "#general",
    server: null,
  });
});

test("formats as '#channel - server', or the channel alone", () => {
  assert.equal(
    formatChannelLabel({ channel: "#objekt-trade", server: "tripleS" }),
    "#objekt-trade - tripleS",
  );
  assert.equal(
    formatChannelLabel({ channel: "#general", server: null }),
    "#general",
  );
});
