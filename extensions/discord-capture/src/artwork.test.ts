import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkUrl,
  isArtUrl,
  LOOKUP_CAP,
  lookupArtwork,
  pickArtwork,
  readArtworkCache,
} from "./artwork";

const SEOYEON = { member: "SeoYeon", season: "Atom01", collectionNo: "101" };
const ART = "https://imagedelivery.net/abc/seoyeon-101/thumbnail";

function results(...rows: Record<string, unknown>[]) {
  return { results: rows };
}

test("asks the collection search for the code, without the variant letter", () => {
  const url = new URL(artworkUrl({ ...SEOYEON, collectionNo: "101Z" }));
  assert.equal(
    url.origin + url.pathname,
    "https://objekt.my/api/objekts/search",
  );
  assert.equal(url.searchParams.get("season"), "Atom01");
  assert.equal(url.searchParams.get("q"), "101");
  assert.equal(url.searchParams.get("member"), "SeoYeon");
});

test("picks the exact collection number, not a loose match on it", () => {
  const data = results(
    {
      member: "SeoYeon",
      collectionNo: "1010Z",
      thumbnailImage: `${ART}-wrong`,
    },
    { member: "SeoYeon", collectionNo: "101Z", thumbnailImage: ART },
  );
  assert.equal(pickArtwork(data, SEOYEON), ART);
  assert.equal(
    pickArtwork(
      results({ member: "Mayu", collectionNo: "101A", thumbnailImage: ART }),
      SEOYEON,
    ),
    null,
  );
  assert.equal(pickArtwork({ nope: true }, SEOYEON), null);
});

test("refuses art hosted anywhere objekt.my would not load it from", () => {
  assert.equal(isArtUrl(ART), true);
  assert.equal(isArtUrl("https://resources.cosmo.fans/x.png"), true);
  assert.equal(isArtUrl("http://imagedelivery.net/x"), false);
  assert.equal(isArtUrl("https://imagedelivery.net.evil.example/x"), false);
  assert.equal(isArtUrl("javascript:alert(1)"), false);
  assert.equal(
    pickArtwork(
      results({
        member: "SeoYeon",
        collectionNo: "101Z",
        thumbnailImage: "https://evil.example/x.png",
      }),
      SEOYEON,
    ),
    null,
  );
  assert.deepEqual(
    readArtworkCache({
      "seoyeon|atom01|101": { url: "https://evil.example/x", at: 1 },
      "mayu|atom01|101": { url: null, at: 1 },
    }),
    { "mayu|atom01|101": { url: null, at: 1 } },
  );
});

test("serves fresh entries from the cache and fetches the rest once", async () => {
  const calls: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal(init.credentials, "omit");
    return new Response(
      JSON.stringify(
        results({ member: "Mayu", collectionNo: "102A", thumbnailImage: ART }),
      ),
    );
  }) as typeof fetch;
  const now = 1_000_000_000_000;
  const { urls, cache } = await lookupArtwork(
    [
      SEOYEON,
      { member: "Mayu", season: "Atom01", collectionNo: "102" },
      { member: "Mayu", season: "Atom01", collectionNo: "102" },
      { member: "", season: "Atom01", collectionNo: "103" },
    ],
    { "seoyeon|atom01|101": { url: ART, at: now - 1000 } },
    { now, fetcher },
  );
  assert.equal(
    calls.length,
    1,
    "the cached card and the duplicate cost nothing",
  );
  assert.deepEqual(urls, { "seoyeon|atom01|101": ART, "mayu|atom01|102": ART });
  assert.deepEqual(cache["mayu|atom01|102"], { url: ART, at: now });
});

test("a failed request is not remembered as a miss", async () => {
  const fetcher = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  const { urls, cache } = await lookupArtwork([SEOYEON], {}, { fetcher });
  assert.deepEqual(urls, { "seoyeon|atom01|101": null });
  assert.deepEqual(cache, {});
});

test("a pasted catalogue is looked up a bounded amount at a time", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(JSON.stringify(results()));
  }) as typeof fetch;
  const items = Array.from({ length: LOOKUP_CAP + 25 }, (_, i) => ({
    member: "SeoYeon",
    season: "Atom01",
    collectionNo: String(100 + i),
  }));
  await lookupArtwork(items, {}, { fetcher });
  assert.equal(calls, LOOKUP_CAP);
});
