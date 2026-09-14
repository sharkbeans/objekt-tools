import assert from "node:assert/strict";
import { test } from "node:test";
import { hostPattern } from "./app-origin";

test("a host pattern leaves the port out, which Firefox requires", () => {
  assert.equal(hostPattern("http://localhost:3000"), "http://localhost/*");
  assert.equal(
    hostPattern("http://localhost:3000", "/match?*"),
    "http://localhost/match?*",
  );
  assert.equal(hostPattern("https://objekt.my"), "https://objekt.my/*");
});
