import assert from "node:assert/strict";
import test from "node:test";
import { inventoryRows, loadInventory } from "./inventory";

test("inventory retains only collection identity", () => {
  assert.deepEqual(
    inventoryRows([
      {
        member: "YooYeon",
        season: "Cream",
        collectionNo: "101",
        serial: 123,
        address: "ignored",
      },
    ]),
    [{ member: "YooYeon", season: "Cream", collectionNo: "101" }],
  );
  assert.throws(() => inventoryRows([{ member: "YooYeon" }]), /invalid/);
});
test("lookup is bounded to the app endpoint and preserves failures", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://objekt.my/api/objekts/by-nickname/test-user");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    return new Response(JSON.stringify({ unavailable: true, results: [] }));
  });
  await assert.rejects(loadInventory("bad nickname"), /nickname/);
  assert.equal(calls, 0);
  await assert.rejects(loadInventory("test-user"), /temporarily unavailable/);
  assert.equal(calls, 1);
});
test("429 stops at one request; no retry loop", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 429 });
  });
  await assert.rejects(loadInventory("alice"), /Wait a minute/);
  assert.equal(calls, 1);
});
