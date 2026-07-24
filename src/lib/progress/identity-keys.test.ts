import assert from "node:assert/strict";
import { test } from "node:test";
import {
  progressMemberQueryKey,
  progressOverviewQueryKey,
  progressSelectionStorageKey,
} from "@/lib/progress/identity-keys";

const walletA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const walletB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("progress identity keys normalize address casing", () => {
  assert.deepEqual(
    progressOverviewQueryKey(walletA.toUpperCase()),
    progressOverviewQueryKey(walletA),
  );
  assert.equal(
    progressSelectionStorageKey(walletA.toUpperCase(), "SeoYeon"),
    progressSelectionStorageKey(walletA, "seoyeon"),
  );
});

test("reused nicknames cannot share wallet-scoped progress state", () => {
  assert.notDeepEqual(
    progressOverviewQueryKey(walletA),
    progressOverviewQueryKey(walletB),
  );
  assert.notDeepEqual(
    progressMemberQueryKey(walletA, "SeoYeon"),
    progressMemberQueryKey(walletB, "SeoYeon"),
  );
  assert.notEqual(
    progressSelectionStorageKey(walletA, "SeoYeon"),
    progressSelectionStorageKey(walletB, "SeoYeon"),
  );
});
