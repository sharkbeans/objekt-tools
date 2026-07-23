import assert from "node:assert/strict";
import test from "node:test";
import { isCollectionProgressCountable } from "./countable";

test("collection progress excludes Welcome class objekts", () => {
  assert.equal(
    isCollectionProgressCountable({
      class: "Welcome",
      collectionNo: "001A",
    }),
    false,
  );
});

test("collection progress excludes 100Z objekts", () => {
  assert.equal(
    isCollectionProgressCountable({
      class: "First",
      collectionNo: "100Z",
    }),
    false,
  );
});

test("collection progress includes normal collection objekts", () => {
  assert.equal(
    isCollectionProgressCountable({
      class: "First",
      collectionNo: "101Z",
    }),
    true,
  );
});
