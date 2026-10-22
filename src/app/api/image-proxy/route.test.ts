import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "./route";

const realFetch = globalThis.fetch;
const fetched: string[] = [];

// Answers each URL from `responses`, recording what the route asked for.
function stubFetch(responses: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input.toString();
    fetched.push(url);
    const respond = responses[url];
    if (!respond) throw new Error(`unexpected fetch: ${url}`);
    return respond();
  }) as typeof fetch;
}

const proxy = (target: string) =>
  GET(
    new Request(
      `https://objekt.my/api/image-proxy?url=${encodeURIComponent(target)}`,
    ),
  );

const image = (type = "image/webp") =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": type },
  });

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

afterEach(() => {
  globalThis.fetch = realFetch;
  fetched.length = 0;
});

describe("image proxy", () => {
  it("serves an image from an allowed host, sandboxed", async () => {
    stubFetch({ "https://imagedelivery.net/a/b": () => image() });
    const response = await proxy("https://imagedelivery.net/a/b");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /sandbox/,
    );
  });

  it("serves cosmo.fans subdomains", async () => {
    stubFetch({ "https://abc123.cosmo.fans/x.png": () => image("image/png") });
    const response = await proxy("https://abc123.cosmo.fans/x.png");
    assert.equal(response.status, 200);
  });

  it("refuses look-alike hosts that only end with an allowed name", async () => {
    stubFetch({});
    for (const host of [
      "evilimagedelivery.net",
      "imagedelivery.net.evil.com",
      "evilcosmo.fans",
    ]) {
      const response = await proxy(`https://${host}/x`);
      assert.equal(response.status, 403, host);
    }
    assert.deepEqual(fetched, []);
  });

  it("refuses plain http", async () => {
    stubFetch({});
    const response = await proxy("http://imagedelivery.net/a");
    assert.equal(response.status, 403);
    assert.deepEqual(fetched, []);
  });

  it("follows a redirect that stays on allowed hosts", async () => {
    stubFetch({
      "https://imagedelivery.net/a": () =>
        redirect("https://cdn.cosmo.fans/a.webp"),
      "https://cdn.cosmo.fans/a.webp": () => image(),
    });
    const response = await proxy("https://imagedelivery.net/a");
    assert.equal(response.status, 200);
  });

  it("does not follow a redirect to an internal address", async () => {
    stubFetch({
      "https://imagedelivery.net/a": () =>
        redirect("http://169.254.169.254/latest/meta-data/"),
    });
    const response = await proxy("https://imagedelivery.net/a");
    assert.equal(response.status, 403);
    assert.deepEqual(fetched, ["https://imagedelivery.net/a"]);
  });

  it("refuses HTML and SVG from an allowed host", async () => {
    for (const type of ["text/html; charset=utf-8", "image/svg+xml"]) {
      stubFetch({ "https://imagedelivery.net/a": () => image(type) });
      const response = await proxy("https://imagedelivery.net/a");
      assert.equal(response.status, 415, type);
    }
  });
});
