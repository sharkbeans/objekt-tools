import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  allOrigins,
  isRootOnlyPath,
  sectionAbsoluteUrl,
  sectionForHostname,
  sectionHref,
  sectionOrigin,
  subdomainsEnabled,
  toExternalPath,
  toInternalPath,
} from "@/lib/sections";

const savedRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function restoreEnv() {
  if (savedRootDomain === undefined) {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  } else {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = savedRootDomain;
  }
  if (savedAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  }
}

describe("sections (disabled mode)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_APP_URL = "https://objekt.my";
  });
  afterEach(restoreEnv);

  it("reports disabled", () => {
    assert.equal(subdomainsEnabled(), false);
  });

  it("sectionHref returns internal paths unchanged", () => {
    assert.equal(sectionHref("/trades/new"), "/trades/new");
    assert.equal(sectionHref("/active-trades/9"), "/active-trades/9");
    assert.equal(sectionHref("/collection/abc"), "/collection/abc");
    assert.equal(sectionHref("/notifications"), "/notifications");
    assert.equal(
      sectionHref("/trades?user=x", { currentSection: "trade" }),
      "/trades?user=x",
    );
  });

  it("sectionAbsoluteUrl uses the root app URL", () => {
    assert.equal(
      sectionAbsoluteUrl("/active-trades/9"),
      "https://objekt.my/active-trades/9",
    );
    assert.equal(sectionAbsoluteUrl("/trades/1"), "https://objekt.my/trades/1");
  });

  it("sectionForHostname matches nothing", () => {
    assert.equal(sectionForHostname("objekt.my"), null);
    assert.equal(sectionForHostname("trade.objekt.my"), null);
  });

  it("allOrigins is just the root origin", () => {
    assert.deepEqual(allOrigins(), ["https://objekt.my"]);
  });
});

describe("sections (enabled)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "objekt.my";
    process.env.NEXT_PUBLIC_APP_URL = "https://objekt.my";
  });
  afterEach(restoreEnv);

  it("sectionForHostname classifies hosts", () => {
    assert.equal(sectionForHostname("objekt.my"), "root");
    assert.equal(sectionForHostname("www.objekt.my"), "root");
    assert.equal(sectionForHostname("trade.objekt.my"), "trade");
    assert.equal(sectionForHostname("collect.objekt.my"), "collect");
    assert.equal(sectionForHostname("list.objekt.my"), "list");
    assert.equal(sectionForHostname("create.objekt.my"), "create");
    assert.equal(sectionForHostname("TRADE.OBJEKT.MY"), "trade");
    assert.equal(sectionForHostname("trade.objekt.my:3000"), "trade");
    // Internal/unknown hosts pass through
    assert.equal(sectionForHostname("app"), null);
    assert.equal(sectionForHostname("127.0.0.1"), null);
    assert.equal(sectionForHostname("localhost"), null);
    assert.equal(sectionForHostname("evil-objekt.my"), null);
    assert.equal(sectionForHostname("x.trade.objekt.my"), null);
  });

  it("toExternalPath maps internal paths to clean section paths", () => {
    assert.deepEqual(toExternalPath("/trades"), { section: "trade", path: "/" });
    assert.deepEqual(toExternalPath("/trades/new"), {
      section: "trade",
      path: "/new",
    });
    assert.deepEqual(toExternalPath("/active-trades/9"), {
      section: "trade",
      path: "/active/9",
    });
    assert.deepEqual(toExternalPath("/active-trades"), {
      section: "trade",
      path: "/active",
    });
    assert.deepEqual(toExternalPath("/collection"), {
      section: "collect",
      path: "/",
    });
    assert.deepEqual(toExternalPath("/collection/nick/member"), {
      section: "collect",
      path: "/nick/member",
    });
    assert.deepEqual(toExternalPath("/list/abc/og"), {
      section: "list",
      path: "/abc/og",
    });
    assert.deepEqual(toExternalPath("/objekt-maker"), {
      section: "create",
      path: "/",
    });
    // Root-owned and non-matching paths
    assert.equal(toExternalPath("/"), null);
    assert.equal(toExternalPath("/notifications"), null);
    assert.equal(toExternalPath("/tradesfoo"), null);
    assert.equal(toExternalPath("/listing"), null);
  });

  it("toInternalPath is the inverse mapping", () => {
    assert.equal(toInternalPath("trade", "/"), "/trades");
    assert.equal(toInternalPath("trade", "/new"), "/trades/new");
    assert.equal(toInternalPath("trade", "/abc123"), "/trades/abc123");
    assert.equal(toInternalPath("trade", "/active/9"), "/active-trades/9");
    assert.equal(toInternalPath("trade", "/active"), "/active-trades");
    assert.equal(toInternalPath("collect", "/"), "/collection");
    assert.equal(toInternalPath("collect", "/nick"), "/collection/nick");
    assert.equal(toInternalPath("list", "/abc/og"), "/list/abc/og");
    assert.equal(toInternalPath("create", "/"), "/objekt-maker");
  });

  it("round-trips every mapping", () => {
    for (const internal of [
      "/trades",
      "/trades/new",
      "/trades/abc?x=1".split("?")[0],
      "/active-trades/9",
      "/collection/nick/member",
      "/list/abc",
      "/objekt-maker",
    ]) {
      const ext = toExternalPath(internal);
      assert.ok(ext, internal);
      assert.equal(toInternalPath(ext.section, ext.path), internal);
    }
  });

  it("isRootOnlyPath", () => {
    assert.equal(isRootOnlyPath("/notifications"), true);
    assert.equal(isRootOnlyPath("/link"), true);
    assert.equal(isRootOnlyPath("/proofshot"), true);
    assert.equal(isRootOnlyPath("/spin"), true);
    assert.equal(isRootOnlyPath("/sign-in"), true);
    assert.equal(isRootOnlyPath("/@nick"), true);
    assert.equal(isRootOnlyPath("/%40nick"), true);
    assert.equal(isRootOnlyPath("/"), false);
    assert.equal(isRootOnlyPath("/linkage"), false);
    assert.equal(isRootOnlyPath("/trades"), false);
  });

  it("sectionOrigin builds subdomain origins", () => {
    assert.equal(sectionOrigin("trade"), "https://trade.objekt.my");
    assert.equal(sectionOrigin("collect"), "https://collect.objekt.my");
  });

  it("allOrigins lists root + all section origins", () => {
    assert.deepEqual(allOrigins(), [
      "https://objekt.my",
      "https://trade.objekt.my",
      "https://collect.objekt.my",
      "https://list.objekt.my",
      "https://create.objekt.my",
    ]);
  });

  it("sectionHref: same section → clean relative path", () => {
    assert.equal(
      sectionHref("/trades/new", { currentSection: "trade" }),
      "/new",
    );
    assert.equal(
      sectionHref("/active-trades/9", { currentSection: "trade" }),
      "/active/9",
    );
    assert.equal(sectionHref("/trades", { currentSection: "trade" }), "/");
    assert.equal(
      sectionHref("/trades?user=x", { currentSection: "trade" }),
      "/?user=x",
    );
  });

  it("sectionHref: other section → absolute URL", () => {
    assert.equal(sectionHref("/trades/new"), "https://trade.objekt.my/new");
    assert.equal(sectionHref("/trades"), "https://trade.objekt.my/");
    assert.equal(
      sectionHref("/active-trades/9"),
      "https://trade.objekt.my/active/9",
    );
    assert.equal(
      sectionHref("/collection/nick", { currentSection: "trade" }),
      "https://collect.objekt.my/nick",
    );
    assert.equal(
      sectionHref("/trades?user=x"),
      "https://trade.objekt.my/?user=x",
    );
  });

  it("sectionHref: root-owned paths — relative on root, absolute from a section", () => {
    assert.equal(sectionHref("/notifications"), "/notifications");
    assert.equal(sectionHref("/"), "/");
    assert.equal(
      sectionHref("/link", { currentSection: "collect" }),
      "https://objekt.my/link",
    );
    assert.equal(
      sectionHref("/", { currentSection: "trade" }),
      "https://objekt.my/",
    );
    assert.equal(
      sectionHref("/@nick", { currentSection: "trade" }),
      "https://objekt.my/@nick",
    );
  });

  it("sectionAbsoluteUrl points at the owning host", () => {
    assert.equal(
      sectionAbsoluteUrl("/active-trades/9"),
      "https://trade.objekt.my/active/9",
    );
    assert.equal(
      sectionAbsoluteUrl("/trades/1"),
      "https://trade.objekt.my/1",
    );
    assert.equal(
      sectionAbsoluteUrl("/list/abc/og?v=2"),
      "https://list.objekt.my/abc/og?v=2",
    );
    assert.equal(
      sectionAbsoluteUrl("/notifications"),
      "https://objekt.my/notifications",
    );
  });
});

describe("sections (enabled, local dev via lvh.me)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "lvh.me";
    process.env.NEXT_PUBLIC_APP_URL = "http://lvh.me:3000";
  });
  afterEach(restoreEnv);

  it("keeps protocol and port from the app URL", () => {
    assert.equal(sectionOrigin("trade"), "http://trade.lvh.me:3000");
    assert.equal(sectionForHostname("trade.lvh.me"), "trade");
    assert.equal(sectionForHostname("lvh.me"), "root");
    assert.equal(
      sectionHref("/trades/new"),
      "http://trade.lvh.me:3000/new",
    );
  });
});
