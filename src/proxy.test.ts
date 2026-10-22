import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const DISCORDBOT =
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";

const savedPassword = process.env.TEST_SITE_PASSWORD;
const savedRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

function restoreEnv() {
  for (const [key, value] of [
    ["TEST_SITE_PASSWORD", savedPassword],
    ["NEXT_PUBLIC_ROOT_DOMAIN", savedRootDomain],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function status(
  pathname: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return proxy(new NextRequest(`https://test.objekt.my${pathname}`, init))
    .status;
}

const asBot = (pathname: string, method = "GET") =>
  status(pathname, { method, headers: { "user-agent": DISCORDBOT } });

describe("preview gate", () => {
  beforeEach(() => {
    process.env.TEST_SITE_PASSWORD = "hunter2";
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });
  afterEach(restoreEnv);

  it("asks for the password", () => {
    assert.equal(status("/match"), 401);
    assert.equal(status("/api/health"), 401);
  });

  it("lets the right password through, and only that", () => {
    const basic = (secret: string) => ({
      headers: { authorization: `Basic ${btoa(`any:${secret}`)}` },
    });
    assert.equal(status("/match", basic("hunter2")), 200);
    assert.equal(status("/api/health", basic("hunter2")), 200);
    assert.equal(status("/match", basic("hunter3")), 401);
  });

  it("is off when no password is configured", () => {
    delete process.env.TEST_SITE_PASSWORD;
    assert.equal(status("/api/posters/mine"), 200);
  });

  it("lets Discord fetch a page and its preview image", () => {
    for (const pathname of [
      "/",
      "/match",
      "/opengraph-image?4a1b2c3d",
      "/match/opengraph-image?4a1b2c3d",
      "/list/abc123",
      "/list/abc123/og?v=3-2",
      "/collection/someone/Seoyeon/og/grid?season=Binary02",
      "/@someone/og?v=linked-2",
    ]) {
      assert.equal(asBot(pathname), 200, pathname);
    }
    assert.equal(asBot("/match", "HEAD"), 200);
  });

  it("does not let a Discordbot user agent reach the API", () => {
    for (const pathname of [
      "/api/posters/mine",
      "/api/auth/get-session",
      "/api/objekts/search?q=a",
      "/api/cron/sync-indexer",
    ]) {
      assert.equal(asBot(pathname), 401, pathname);
    }
  });

  it("does not let a Discordbot user agent write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      // A POST to a page path is how server actions are invoked.
      assert.equal(asBot("/match", method), 401, method);
      assert.equal(asBot("/api/posters", method), 401, method);
    }
  });

  it("does not let a Discordbot user agent fetch files", () => {
    for (const pathname of [
      "/sitemap.xml",
      "/robots.txt",
      "/tools-static/x.js",
    ]) {
      assert.equal(asBot(pathname), 401, pathname);
    }
  });

  it("does not open the API through an encoded path", () => {
    for (const pathname of ["/%61pi/posters/mine", "/api%2Fposters/mine"]) {
      assert.equal(asBot(pathname), 401, pathname);
    }
  });
});

// Every route handler outside src/app/api, and whether the bot may fetch it
// without the password. A new one fails the test below until it's listed
// here: let the bot through only if a link preview needs it.
const NON_API_ROUTES: Record<string, boolean> = {
  "/[address]/og": true, // profile preview image
  "/by-wallet/[address]": true, // 302 to a collection page
  "/collection/[nickname]/[member]/og": true,
  "/collection/[nickname]/[member]/og/grid": true,
  "/collection/[nickname]/og": true,
  "/list/[id]/og": true,
  "/robots.txt": false,
  "/sitemap.xml": false,
};

describe("route handlers outside /api", () => {
  beforeEach(() => {
    process.env.TEST_SITE_PASSWORD = "hunter2";
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });
  afterEach(restoreEnv);

  it("are each reachable by the bot only if a preview needs them", () => {
    const appDir = path.join(process.cwd(), "src", "app");
    const found: Record<string, boolean> = {};
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (full !== path.join(appDir, "api")) walk(full);
        } else if (/^route\.tsx?$/.test(entry.name)) {
          const route = `/${path
            .relative(appDir, dir)
            .split(path.sep)
            .filter((segment) => !/^\(.*\)$/.test(segment))
            .join("/")}`;
          const sample = route.replace(/\[([^\]]+)\]/g, "$1");
          found[route] = asBot(sample) !== 401;
        }
      }
    }
    walk(appDir);
    assert.deepEqual(found, NON_API_ROUTES);
  });
});
