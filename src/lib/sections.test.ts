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
    assert.equal(sectionHref("/list/abc"), "/list/abc");
    assert.equal(sectionHref("/collection/abc"), "/collection/abc");
    assert.equal(sectionHref("/notifications"), "/notifications");
    assert.equal(
      sectionHref("/list/mine?x=1", { currentSection: "list" }),
      "/list/mine?x=1",
    );
  });

  it("sectionAbsoluteUrl uses the root app URL", () => {
    assert.equal(sectionAbsoluteUrl("/list/abc"), "https://objekt.my/list/abc");
    assert.equal(sectionAbsoluteUrl("/match"), "https://objekt.my/match");
  });

  it("sectionForHostname matches nothing", () => {
    assert.equal(sectionForHostname("objekt.my"), null);
    assert.equal(sectionForHostname("list.objekt.my"), null);
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
    assert.equal(sectionForHostname("collect.objekt.my"), "collect");
    assert.equal(sectionForHostname("list.objekt.my"), "list");
    assert.equal(sectionForHostname("create.objekt.my"), "create");
    assert.equal(sectionForHostname("LIST.OBJEKT.MY"), "list");
    assert.equal(sectionForHostname("list.objekt.my:3000"), "list");
    // Retired trade section: no longer a section host (src/proxy.ts bounces
    // it to /match before section routing).
    assert.equal(sectionForHostname("trade.objekt.my"), null);
    // Internal/unknown hosts pass through
    assert.equal(sectionForHostname("app"), null);
    assert.equal(sectionForHostname("127.0.0.1"), null);
    assert.equal(sectionForHostname("localhost"), null);
    assert.equal(sectionForHostname("evil-objekt.my"), null);
    assert.equal(sectionForHostname("x.list.objekt.my"), null);
  });

  it("toExternalPath maps internal paths to clean section paths", () => {
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
    assert.equal(toExternalPath("/listing"), null);
    // Retired trade paths belong to no section (next.config.ts redirects
    // them to /match).
    assert.equal(toExternalPath("/trades"), null);
    assert.equal(toExternalPath("/active-trades/9"), null);
  });

  it("toInternalPath is the inverse mapping", () => {
    assert.equal(toInternalPath("collect", "/"), "/collection");
    assert.equal(toInternalPath("collect", "/nick"), "/collection/nick");
    assert.equal(toInternalPath("list", "/abc/og"), "/list/abc/og");
    assert.equal(toInternalPath("create", "/"), "/objekt-maker");
  });

  it("round-trips every mapping", () => {
    for (const internal of [
      "/collection",
      "/collection/nick/member",
      "/list",
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
    // The extension store listings and the extension's own panel link here —
    // one stable URL. Before this was root-only it fell through to the
    // [address] profile route and rendered an empty profile with a 200.
    assert.equal(isRootOnlyPath("/extension-privacy"), true);
    assert.equal(isRootOnlyPath("/"), false);
    assert.equal(isRootOnlyPath("/linkage"), false);
    assert.equal(isRootOnlyPath("/list"), false);
  });

  it("sectionOrigin builds subdomain origins", () => {
    assert.equal(sectionOrigin("collect"), "https://collect.objekt.my");
    assert.equal(sectionOrigin("list"), "https://list.objekt.my");
  });

  it("allOrigins lists root + all section origins", () => {
    assert.deepEqual(allOrigins(), [
      "https://objekt.my",
      "https://collect.objekt.my",
      "https://list.objekt.my",
      "https://create.objekt.my",
    ]);
  });

  it("sectionHref: same section → clean relative path", () => {
    assert.equal(
      sectionHref("/list/abc/edit", { currentSection: "list" }),
      "/abc/edit",
    );
    assert.equal(sectionHref("/list", { currentSection: "list" }), "/");
    assert.equal(
      sectionHref("/list/mine?x=1", { currentSection: "list" }),
      "/mine?x=1",
    );
  });

  it("sectionHref: other section → absolute URL", () => {
    assert.equal(sectionHref("/list/abc"), "https://list.objekt.my/abc");
    assert.equal(sectionHref("/list"), "https://list.objekt.my/");
    assert.equal(
      sectionHref("/collection/nick", { currentSection: "list" }),
      "https://collect.objekt.my/nick",
    );
    assert.equal(
      sectionHref("/list/mine?x=1"),
      "https://list.objekt.my/mine?x=1",
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
      sectionHref("/", { currentSection: "list" }),
      "https://objekt.my/",
    );
    assert.equal(
      sectionHref("/@nick", { currentSection: "list" }),
      "https://objekt.my/@nick",
    );
    assert.equal(
      sectionHref("/match", { currentSection: "list" }),
      "https://objekt.my/match",
    );
  });

  it("sectionAbsoluteUrl points at the owning host", () => {
    assert.equal(
      sectionAbsoluteUrl("/collection/nick"),
      "https://collect.objekt.my/nick",
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
    assert.equal(sectionOrigin("list"), "http://list.lvh.me:3000");
    assert.equal(sectionForHostname("list.lvh.me"), "list");
    assert.equal(sectionForHostname("lvh.me"), "root");
    assert.equal(sectionHref("/list/abc"), "http://list.lvh.me:3000/abc");
  });
});
