import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTranscript } from "@/lib/discord/transcript";
import type { Capture } from "@/lib/match/captures";
import { captureTraders } from "./capture-matches";

const { messages } = analyzeTranscript(`alpha — 3:41 PM
HAVE
SeoYeon CC101
beta — 3:42 PM
HAVE
Mayu CC103
alpha — 3:43 PM
HAVE
SeoYeon CC101
Xinyu CC104`);

function capture(overrides: Partial<Capture>): Capture {
  return {
    id: "run",
    kind: "search",
    capturedAt: 1,
    from: null,
    to: null,
    filters: [],
    wants: [],
    active: true,
    ...overrides,
  };
}

/** Every post in the one capture named `id`. */
const inOne = (id: string) =>
  new Map(messages.map((message) => [message.key, [id]]));

test("counts traders offering what the capture searched for", () => {
  const counts = captureTraders(
    [capture({ wants: ["Mayu CC103"] })],
    messages,
    inOne("run"),
    "",
  );
  assert.equal(counts.get("run"), 1);
});

test("a trader with two posts counts once", () => {
  const counts = captureTraders(
    [capture({ wants: ["SeoYeon CC101"] })],
    messages,
    inOne("run"),
    "",
  );
  assert.equal(counts.get("run"), 1);
});

test("reads a code alone as any member's card", () => {
  const counts = captureTraders(
    [capture({ filters: ["CC103"] })],
    messages,
    inOne("run"),
    "",
  );
  assert.equal(counts.get("run"), 1);
});

test("a capture with no list of its own is judged by the saved wants", () => {
  const counts = captureTraders(
    [capture({ kind: "manual" })],
    messages,
    inOne("run"),
    "Xinyu CC104",
  );
  assert.equal(counts.get("run"), 1);
});

test("with nothing to compare against there is no count, not a zero", () => {
  const counts = captureTraders(
    [capture({ kind: "manual" })],
    messages,
    inOne("run"),
    "",
  );
  assert.equal(counts.has("run"), false);
});

test("a search nobody answered is a real zero", () => {
  const counts = captureTraders(
    [capture({ wants: ["Nien CC999"] })],
    messages,
    inOne("run"),
    "",
  );
  assert.equal(counts.get("run"), 0);
});

test("only looks at that capture's own posts", () => {
  const counts = captureTraders(
    [capture({ id: "a", wants: ["Mayu CC103"] })],
    messages,
    inOne("b"),
    "",
  );
  assert.equal(counts.get("a"), 0);
});
