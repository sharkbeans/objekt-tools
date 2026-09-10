import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptAutomation,
  acceptCapture,
  automationAllowed,
  CONSENT_VERSION,
  captureAllowed,
  readConsent,
} from "./consent";

test("nothing is allowed before anything is agreed to", () => {
  for (const value of [undefined, null, {}, "yes", 1, []]) {
    assert.equal(captureAllowed(value), false);
    assert.equal(automationAllowed(value), false);
  }
});

test("capture consent does not carry automation consent", () => {
  const consent = acceptCapture(undefined);
  assert.equal(captureAllowed(consent), true);
  assert.equal(automationAllowed(consent), false);
});

test("automation consent implies capture consent", () => {
  const consent = acceptAutomation(undefined);
  assert.equal(captureAllowed(consent), true);
  assert.equal(automationAllowed(consent), true);
});

test("agreeing to capture again keeps the automation agreement", () => {
  const automation = acceptAutomation(undefined, new Date("2026-01-01"));
  const again = acceptCapture(automation, new Date("2026-02-01"));
  assert.equal(again.automationAt, automation.automationAt);
  // The original acceptance date is what was agreed to; re-agreeing does not
  // rewrite history.
  assert.equal(again.acceptedAt, automation.acceptedAt);
});

test("a record from a different disclosure version does not count", () => {
  const consent = { ...acceptCapture(undefined), version: CONSENT_VERSION + 1 };
  assert.equal(readConsent(consent), null);
  assert.equal(captureAllowed(consent), false);
});

test("a record with an unusable timestamp does not count", () => {
  assert.equal(
    captureAllowed({ version: CONSENT_VERSION, acceptedAt: "whenever" }),
    false,
  );
  // A broken automation stamp falls back to "not agreed", not to "agreed".
  const partial = {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    automationAt: "soon",
  };
  assert.equal(captureAllowed(partial), true);
  assert.equal(automationAllowed(partial), false);
});
