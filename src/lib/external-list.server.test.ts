import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { redis } from "@/lib/redis";
import {
  ExternalListImportError,
  normalizeExternalListItem,
  parseApolloListHtml,
  readCappedText,
} from "./external-list.server";

// The module imports the shared ioredis client, which connects eagerly and
// would otherwise keep the runner alive after these network-free tests.
after(() => {
  redis.disconnect();
});

describe("normalizeExternalListItem", () => {
  it("strips A/Z from the matcher number and preserves the variant", () => {
    assert.deepEqual(
      normalizeExternalListItem({
        member: "SeoYeon",
        season: "Binary02",
        collectionNo: "322Z",
        onOffline: "offline",
        thumbnailImage: "https://media.objekt.top/collections/example.webp",
      }),
      {
        member: "SeoYeon",
        season: "Binary02",
        collectionNo: "322",
        onOffline: "offline",
        imageUrl: "https://media.objekt.top/collections/example.webp",
      },
    );
  });

  it("does not forward arbitrary image hosts to the browser", () => {
    const item = normalizeExternalListItem({
      member: "Mayu",
      season: "Cream01",
      collectionNo: "101",
      thumbnailImage: "https://example.test/not-an-image.webp",
    });
    assert.equal(item?.imageUrl, null);
  });
});

describe("parseApolloListHtml", () => {
  it("reads Apollo's public server-rendered first page and marks a continuation", () => {
    const html = `before objekts:$R[8]=[$R[9]={total:122,hasNext:!0,nextStartAfter:1,objekts:$R[10]=[$R[11]={id:"a",collectionId:"Binary02 SeoYeon 322Z",season:"Binary02",member:"SeoYeon",artist:"triples",collectionNo:"322Z",class:"Double",thumbnailImage:"https://imagedelivery.net/demo/card/thumbnail",frontImage:"https://imagedelivery.net/demo/card/original",onOffline:"offline",entryQuantity:1}]}],pageParams:$R[12]=[0] after`;
    assert.deepEqual(parseApolloListHtml(html), {
      total: 122,
      partial: true,
      items: [
        {
          member: "SeoYeon",
          season: "Binary02",
          collectionNo: "322",
          onOffline: "offline",
          imageUrl: "https://imagedelivery.net/demo/card/thumbnail",
        },
      ],
    });
  });
});

describe("readCappedText", () => {
  const tooLarge = (error: unknown) =>
    error instanceof ExternalListImportError &&
    error.message === "Apollo returned a list too large to import.";

  it("reads a normal-sized body", async () => {
    assert.equal(
      await readCappedText(new Response("x".repeat(140_000)), "Apollo"),
      "x".repeat(140_000),
    );
  });

  it("refuses a declared length past the cap without reading the body", async () => {
    const response = new Response("small", {
      headers: { "content-length": "2000000" },
    });
    await assert.rejects(readCappedText(response, "Apollo"), tooLarge);
  });

  it("stops reading once an undeclared body passes the cap", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(400_000));
      },
    });
    await assert.rejects(
      readCappedText(new Response(body), "Apollo"),
      tooLarge,
    );
    assert.ok(pulls <= 4, "an endless body is abandoned, not read to the end");
  });
});
