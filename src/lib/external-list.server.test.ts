import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeExternalListItem,
  parseApolloListHtml,
} from "./external-list.server";

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
