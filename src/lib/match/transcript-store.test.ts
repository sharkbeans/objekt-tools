import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeBlocks } from "./transcript-blocks";
import { decodeBlocks, encodeBlocks } from "./transcript-store";

const SAMPLE = `traderA — 3:41 PM
WTS ALL
Seoyeon CC112
🧋trader_C *2k* [WAV],  — 3:45 PM
Jiwoo D325`;

describe("transcript codec", () => {
  it("round-trips blocks through gzip", async () => {
    const blocks = mergeBlocks([], SAMPLE);
    const payload = await encodeBlocks(blocks);
    assert.equal(payload.gz, true);
    assert.deepEqual(await decodeBlocks(payload), blocks);
  });

  it("round-trips a headerless paste and a null timestamp", async () => {
    const blocks = mergeBlocks([], "Have\nSeoyeon CC112");
    assert.equal(blocks[0].time, null);
    assert.deepEqual(await decodeBlocks(await encodeBlocks(blocks)), blocks);
  });

  it("round-trips an empty store", async () => {
    assert.deepEqual(await decodeBlocks(await encodeBlocks([])), []);
  });

  it("compresses a repetitive transcript well below its raw size", async () => {
    // Trade posts are highly repetitive, which is the whole premise here.
    const blocks = mergeBlocks(
      [],
      Array.from(
        { length: 200 },
        (_, i) =>
          `trader${i} — 3:4${i % 10} PM\nWTS\nSeoyeon CC112\nMayu CC103`,
      ).join("\n"),
    );
    const raw = JSON.stringify(blocks).length;
    const { data } = await encodeBlocks(blocks);
    assert.ok(
      data.size < raw / 4,
      `expected under ${Math.round(raw / 4)} bytes, got ${data.size}`,
    );
  });

  it("reads anything that is not a stored payload as empty", async () => {
    assert.deepEqual(await decodeBlocks(undefined), []);
    assert.deepEqual(await decodeBlocks({ gz: true }), []);
    assert.deepEqual(await decodeBlocks("nonsense"), []);
  });

  it("rejects a payload whose contents are not blocks", async () => {
    const payload = {
      gz: false,
      data: new Blob([JSON.stringify([{ author: 1 }])]),
    };
    assert.deepEqual(await decodeBlocks(payload), []);
  });

  it("survives a corrupt gzip body", async () => {
    const payload = { gz: true, data: new Blob(["not gzip at all"]) };
    assert.deepEqual(await decodeBlocks(payload), []);
  });
});
