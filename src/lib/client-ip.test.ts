import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { getClientIp } from "@/lib/client-ip";

const request = (headers: Record<string, string>) => ({
  headers: new Headers(headers),
});

describe("getClientIp", () => {
  it("takes the hop nginx appended, not what the client sent", () => {
    assert.equal(
      getClientIp(request({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })),
      "203.0.113.7",
    );
  });

  it("gives a rotating spoofed prefix the same key every time", () => {
    const keys = new Set(
      ["1.1.1.1", "2.2.2.2", "garbage, 3.3.3.3"].map((spoofed) =>
        getClientIp(request({ "x-forwarded-for": `${spoofed}, 203.0.113.7` })),
      ),
    );
    assert.deepEqual([...keys], ["203.0.113.7"]);
  });

  it("reads a single-hop header", () => {
    assert.equal(
      getClientIp(request({ "x-forwarded-for": "203.0.113.7" })),
      "203.0.113.7",
    );
  });

  it("falls back to X-Real-IP when the forwarded header is missing or blank", () => {
    assert.equal(
      getClientIp(request({ "x-real-ip": "203.0.113.7" })),
      "203.0.113.7",
    );
    assert.equal(
      getClientIp(
        request({ "x-forwarded-for": " ", "x-real-ip": "203.0.113.7" }),
      ),
      "203.0.113.7",
    );
  });

  it("reports unknown rather than an empty key", () => {
    assert.equal(getClientIp(request({})), "unknown");
    assert.equal(getClientIp(request({ "x-forwarded-for": "" })), "unknown");
  });
});

describe("route handlers", () => {
  it("never read forwarding headers directly", () => {
    const root = path.join(process.cwd(), "src", "app");
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          /x-forwarded-for|x-real-ip/i.test(readFileSync(full, "utf8"))
        ) {
          offenders.push(path.relative(process.cwd(), full));
        }
      }
    }
    walk(root);
    assert.deepEqual(
      offenders,
      [],
      "Use getClientIp from @/lib/client-ip; the raw header is client-controlled",
    );
  });
});
