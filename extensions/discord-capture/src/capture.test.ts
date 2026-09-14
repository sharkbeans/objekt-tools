import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";
import { readMessage } from "./dom";
import { capture, clear, count, entries } from "./store";

function fixture(extra = "") {
  return new JSDOM(
    `<ol><li id="chat-messages-123-456" aria-labelledby="message-username-456"><span id="message-username-456">Trader</span><time datetime="2026-09-09T03:41:00.000Z"></time><div id="message-content-456">HAVE<br>YooYeon CC101-108<br>WANT<br>Yooyeon CC109${extra}</div></li></ol>`,
  ).window.document;
}
test("reads stable anchors, line breaks and exact timestamp", () => {
  const doc = fixture();
  const message = readMessage(doc.querySelector("li") as Element);
  assert.equal(message?.author, "Trader");
  assert.equal(message?.time.raw, "2026-09-09T03:41:00.000Z");
  assert.match(message?.body ?? "", /HAVE\nYooYeon/);
});
test("missing authors and channel mismatches fail closed; replies do not supply authors", () => {
  const doc = fixture();
  const li = doc.querySelector("li") as Element;
  assert.equal(readMessage(li)?.channel, "123");
  doc.getElementById("message-username-456")?.remove();
  li.insertAdjacentHTML(
    "afterbegin",
    '<span id="message-username-999">Reply author</span>',
  );
  assert.equal(readMessage(li), null);
});
test("grouped posts use explicit author references, never previous siblings", () => {
  const doc = fixture();
  const li = doc.querySelector("li") as Element;
  doc
    .getElementById("message-username-456")
    ?.setAttribute("id", "message-username-455");
  li.setAttribute("aria-labelledby", "message-username-455");
  assert.equal(readMessage(li)?.author, "Trader");
  doc.getElementById("message-username-455")?.remove();
  assert.equal(readMessage(li), null);
});
test("index survives reopen, dedupes concurrent captures and uses shared range parser", async () => {
  await clear();
  const doc = fixture();
  const message = readMessage(doc.querySelector("li") as Element);
  assert.ok(message);
  // Match what the content script actually sends: no channel on the block.
  const block = {
    author: message.author,
    body: message.body,
    time: message.time.raw,
  };
  await Promise.all([
    capture(block, "123-456"),
    capture(block, "123-456"),
    capture(block, "123-456"),
  ]);
  const stored = await entries();
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].block, block);
  assert.equal(stored[0].parsed.haves.length, 8);
  await clear();
  assert.equal((await entries()).length, 0);
});

test("ambiguous or invalid timestamps fail closed", () => {
  const doc = fixture();
  const li = doc.querySelector("li") as Element;
  li.insertAdjacentHTML(
    "afterbegin",
    '<time datetime="2026-09-08T00:00:00Z"></time>',
  );
  assert.equal(readMessage(li), null);
  li.querySelector("time")?.remove();
  li.querySelector("time")?.setAttribute("datetime", "not-a-date");
  assert.equal(readMessage(li), null);
});
test("reposts refresh timestamps without duplicating; edited lists stay distinct", async () => {
  await clear();
  const block = {
    author: "Trader",
    body: "HAVE\nYooYeon CC101",
    time: "2026-09-08T23:59:00.000Z",
  };
  await capture(block, "123-456");
  await capture({ ...block, time: "2026-09-09T00:01:00.000Z" }, "123-456");
  await capture(block, "123-456");
  let stored = await entries();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].parsed.time?.raw, "2026-09-09T00:01:00.000Z");
  await capture({ ...block, body: "HAVE\nYooYeon CC102" }, "123-999");
  stored = await entries();
  assert.equal(stored.length, 2);
  await clear();
});

test("the same message keeps one row when Discord appends a server tag", async () => {
  await clear();
  const body = "HAVE\nYooYeon CC101";
  const time = "2026-09-09T07:54:18.783Z";
  // The row hydrates: the author gains a clan tag on a later read.
  await capture({ author: "pbrihuWAV", body, time }, "123-777");
  await capture({ author: "pbrihu", body, time }, "123-777");
  const stored = await entries();
  assert.equal(stored.length, 1);
  // The shorter reading wins: the tag is appended to the display name.
  assert.equal(stored[0].block.author, "pbrihu");
  assert.equal(stored[0].parsed.author, "pbrihu");
  await clear();
});

// A search result as Discord actually renders it: a plain <li> with no
// chat-messages wrapper, so no channel in the row id — the shape that made an
// entire index turn out to contain nothing but the open channel.
function searchResult(
  link = '<a href="/channels/700/800/456">#objekt-trade</a>',
) {
  return new JSDOM(
    `<ol><li>${link}<span id="message-username-456">Trader</span><span id="message-timestamp-456"><time datetime="2026-09-09T03:41:00.000Z"></time></span><div id="message-content-456">HAVE<br>YooYeon CC101</div></li></ol>`,
  ).window.document;
}

test("reads a search result that has no chat-messages wrapper", () => {
  const message = readMessage(searchResult().querySelector("li") as Element);
  assert.equal(message?.source, "search");
  assert.equal(message?.id, "456");
  assert.equal(message?.author, "Trader");
  assert.equal(message?.time.raw, "2026-09-09T03:41:00.000Z");
  assert.match(message?.body ?? "", /HAVE\nYooYeon CC101/);
  // The channel survives only through the link back to where it was posted —
  // /channels/<guild>/<channel>/<message>, so the second segment.
  assert.equal(message?.channel, "800");
});

test("a result still reads when Discord links no channel", () => {
  // Captured anyway: the user searched for it, so there is no channel filter to
  // apply. Only the channel it came from is lost.
  const message = readMessage(searchResult("").querySelector("li") as Element);
  assert.equal(message?.source, "search");
  assert.equal(message?.channel, null);
  assert.equal(message?.author, "Trader");
});

test("channel rows keep naming their own channel", () => {
  const message = readMessage(fixture().querySelector("li") as Element);
  assert.equal(message?.source, "channel");
  assert.equal(message?.channel, "123");
});

test("a container holding several messages is not read as one row", () => {
  // Fail closed: two bodies means this is a list, and attributing either one to
  // the other's author or timestamp would fabricate a post.
  const doc = searchResult();
  doc
    .querySelector("li")
    ?.insertAdjacentHTML(
      "beforeend",
      '<div id="message-content-457">other</div>',
    );
  assert.equal(readMessage(doc.querySelector("li") as Element), null);
});

test("scopes posts to the search run that found them", async () => {
  await clear();
  const message = readMessage(fixture().querySelector("li") as Element);
  assert.ok(message);
  const block = {
    author: message.author,
    body: message.body,
    time: message.time.raw,
  };
  // Browsing a channel tags nothing: those posts are not part of any search.
  await capture(block, "123-456");
  assert.equal(await count(), 1);
  assert.equal(await count("run-a"), 0);

  // The same post surfaced by a search belongs to that search, even though it
  // was already in the index — otherwise a re-found post would be missing from
  // the export of the run that found it.
  await capture(block, "123-456", "run-a");
  assert.equal(await count(), 1, "must not duplicate the post");
  assert.equal(await count("run-a"), 1);

  // A later run takes it over; the earlier run's export is not the current one.
  await capture(block, "123-456", "run-b");
  assert.equal(await count("run-a"), 0);
  assert.equal(await count("run-b"), 1);
  const stored = await entries();
  assert.equal(stored[0].run, "run-b");
});
