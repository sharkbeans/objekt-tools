import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { cronAuthError } from "@/lib/cron-auth";

const savedSecret = process.env.CRON_SECRET;

const request = (authorization?: string) => ({
  headers: new Headers(authorization === undefined ? {} : { authorization }),
});

function restoreSecret() {
  if (savedSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = savedSecret;
  }
}

describe("cronAuthError without a configured secret", () => {
  afterEach(restoreSecret);

  it("refuses with 503 when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    for (const header of [undefined, "", "Bearer", "Bearer "]) {
      assert.equal(cronAuthError(request(header))?.status, 503);
    }
  });

  it("refuses with 503 when CRON_SECRET is blank", () => {
    for (const secret of ["", "   "]) {
      process.env.CRON_SECRET = secret;
      assert.equal(cronAuthError(request(`Bearer ${secret}`))?.status, 503);
    }
  });
});

describe("cronAuthError with a configured secret", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret-value";
  });
  afterEach(restoreSecret);

  it("lets the right bearer token through", () => {
    assert.equal(cronAuthError(request("Bearer s3cret-value")), null);
  });

  it("rejects a missing, wrong or malformed header with 401", () => {
    for (const header of [
      undefined,
      "",
      "Bearer",
      "Bearer s3cret-valuX",
      "Bearer s3cret-value-and-more",
      "bearer s3cret-value",
      "s3cret-value",
      "Bearer s3cret-valü",
    ]) {
      assert.equal(cronAuthError(request(header))?.status, 401, header);
    }
  });
});

describe("cron route handlers", () => {
  it("all authorize through cronAuthError", () => {
    const root = path.join(process.cwd(), "src", "app", "api", "cron");
    const routes = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "route.ts"));
    assert.ok(routes.length > 0);

    const offenders = routes.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        !/\bcronAuthError\(request\)/.test(source) ||
        /CRON_SECRET|authorization/i.test(source)
      );
    });
    assert.deepEqual(
      offenders.map((file) => path.relative(process.cwd(), file)),
      [],
      "Cron routes must call cronAuthError from @/lib/cron-auth, not compare CRON_SECRET themselves",
    );
  });
});
