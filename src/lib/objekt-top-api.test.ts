import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  fetchCollectionsIfModified,
  fetchMintTransfers,
  fetchOwnedObjekts,
  ObjektTopApiError,
} from "@/lib/objekt-top-api";

const originalFetch = globalThis.fetch;

type Call = { url: URL; headers: Record<string, string> };

function stubFetch(responses: Response[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  }) as typeof fetch;
  return calls;
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("objekt.top API client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("follows owned-by cursors until the last page", async () => {
    const calls = stubFetch([
      json({
        objekts: [{ id: "1", tokenId: "1" }],
        nextCursor: { receivedAt: "2026-10-01T00:00:00.000Z", id: "1" },
      }),
      json({ objekts: [{ id: "2", tokenId: "2" }] }),
    ]);

    const objekts = await fetchOwnedObjekts("0xABC");

    assert.deepEqual(
      objekts.map((objekt) => objekt.id),
      ["1", "2"],
    );
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].url.pathname,
      "/api/v1/objekts/owned-by/0xabc",
      "address is lowercased",
    );
    assert.equal(calls[0].url.searchParams.has("cursor[id]"), false);
    assert.equal(
      calls[1].url.searchParams.get("cursor[receivedAt]"),
      "2026-10-01T00:00:00.000Z",
    );
    assert.equal(calls[1].url.searchParams.get("cursor[id]"), "1");
    assert.match(calls[0].headers["User-Agent"], /objekt\.my/);
  });

  it("sends If-Modified-Since and reports a 304 as not modified", async () => {
    const calls = stubFetch([new Response(null, { status: 304 })]);

    const result = await fetchCollectionsIfModified(
      "Fri, 30 Oct 2026 01:40:07 GMT",
    );

    assert.deepEqual(result, { notModified: true });
    assert.equal(
      calls[0].headers["If-Modified-Since"],
      "Fri, 30 Oct 2026 01:40:07 GMT",
    );
  });

  it("returns collections with the response's Last-Modified", async () => {
    stubFetch([
      json(
        { collections: [{ id: "c1" }] },
        {
          headers: {
            "content-type": "application/json",
            "last-modified": "Sat, 31 Oct 2026 00:00:00 GMT",
          },
        },
      ),
    ]);

    const result = await fetchCollectionsIfModified(null);

    assert.equal(result.notModified, false);
    if (result.notModified) return;
    assert.equal(result.lastModified, "Sat, 31 Oct 2026 00:00:00 GMT");
    assert.equal(result.collections.length, 1);
  });

  it("asks for mints with the filters and follows transfer cursors", async () => {
    const calls = stubFetch([
      json({
        results: [{ transfer: { id: "t1" } }],
        nextCursor: { timestamp: "2026-10-01T00:00:00.000Z", id: "t1" },
      }),
      json({ results: [{ transfer: { id: "t2" } }] }),
    ]);

    const results = await fetchMintTransfers("0xabc", {
      member: "SeoYeon",
      class: "Special",
      onOffline: "online",
    });

    assert.equal(results.length, 2);
    const params = calls[0].url.searchParams;
    assert.equal(params.get("type"), "mint");
    assert.equal(params.get("member"), "SeoYeon");
    assert.equal(params.get("class"), "Special");
    assert.equal(params.get("on_offline"), "online");
    assert.equal(calls[1].url.searchParams.get("cursor[id]"), "t1");
  });

  it("raises ObjektTopApiError with the status on an error response", async () => {
    stubFetch([new Response("slow down", { status: 429 })]);

    await assert.rejects(fetchOwnedObjekts("0xabc"), (error) => {
      assert.ok(error instanceof ObjektTopApiError);
      assert.equal(error.status, 429);
      return true;
    });
  });

  it("rejects a body without the expected list", async () => {
    stubFetch([json({ nope: true })]);
    await assert.rejects(fetchOwnedObjekts("0xabc"), ObjektTopApiError);
  });
});
