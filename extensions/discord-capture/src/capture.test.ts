import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
import { readMessage } from "./dom";
import { capture, clear, entries } from "./store";

function fixture(extra = "") {
  return new JSDOM(
    `<ol><li id="chat-messages-123-456" aria-labelledby="message-username-456"><span id="message-username-456">Trader</span><time datetime="2026-09-09T03:41:00.000Z"></time><div id="message-content-456">HAVE<br>YooYeon CC101-108<br>WANT<br>Yooyeon CC109${extra}</div></li></ol>`,
  ).window.document;
}
test("reads stable anchors, line breaks and exact timestamp", () => {
  const doc = fixture();
  const message = readMessage(doc.querySelector("li") as Element, "123");
  assert.equal(message?.author, "Trader");
  assert.equal(message?.time.raw, "2026-09-09T03:41:00.000Z");
  assert.match(message?.body ?? "", /HAVE\nYooYeon/);
});
test("missing authors and channel mismatches fail closed; replies do not supply authors", () => {
  const doc = fixture();
  const li = doc.querySelector("li") as Element;
  assert.equal(readMessage(li, "999"), null);
  doc.getElementById("message-username-456")?.remove();
  li.insertAdjacentHTML(
    "afterbegin",
    '<span id="message-username-999">Reply author</span>',
  );
  assert.equal(readMessage(li, "123"), null);
});
test("grouped posts use explicit author references, never previous siblings", () => {
  const doc = fixture();
  const li = doc.querySelector("li") as Element;
  doc
    .getElementById("message-username-456")
    ?.setAttribute("id", "message-username-455");
  li.setAttribute("aria-labelledby", "message-username-455");
  assert.equal(readMessage(li, "123")?.author, "Trader");
  doc.getElementById("message-username-455")?.remove();
  assert.equal(readMessage(li, "123"), null);
});
test("index survives reopen, dedupes concurrent captures and uses shared range parser", async () => {
  await clear();
  const doc = fixture();
  const message = readMessage(doc.querySelector("li") as Element, "123");
  assert.ok(message);
  const block = { ...message, time: message.time.raw };
  await Promise.all([capture(block), capture(block), capture(block)]);
  const stored = await entries();
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].block, block);
  assert.equal(stored[0].parsed.haves.length, 8);
  await clear();
  assert.equal((await entries()).length, 0);
});
