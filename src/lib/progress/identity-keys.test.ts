import assert from "node:assert/strict";
import { test } from "node:test";
import {
  progressMemberCatalogQueryKey,
  progressMemberOwnershipQueryKey,
  progressMemberQueryKey,
  progressMemberTradabilityQueryKey,
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
  assert.notDeepEqual(
    progressMemberOwnershipQueryKey(walletA, "SeoYeon"),
    progressMemberOwnershipQueryKey(walletB, "SeoYeon"),
  );
  assert.notEqual(
    progressSelectionStorageKey(walletA, "SeoYeon"),
    progressSelectionStorageKey(walletB, "SeoYeon"),
  );
});

test("shared member data is not keyed by wallet identity", () => {
  assert.deepEqual(progressMemberCatalogQueryKey("SeoYeon"), [
    "progress-member-catalog",
    "SeoYeon",
  ]);
  assert.deepEqual(progressMemberTradabilityQueryKey("SeoYeon"), [
    "progress-member-tradability",
    "SeoYeon",
  ]);
});
