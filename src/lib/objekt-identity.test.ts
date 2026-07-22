import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ObjektEntry } from "@/lib/cosmo/types";
import {
  getObjektInstanceKey,
  isSameObjektInstance,
} from "@/lib/objekt-identity";

function objekt(
  collectionId: string,
  serial: number,
  objektId?: string,
): ObjektEntry {
  return {
    collectionId,
    artist: "tripleS",
    member: "Xinyu",
    collectionNo: "319",
    season: "Cream01",
    class: "Special",
    serial,
    objektId,
  };
}

describe("objekt identity", () => {
  it("does not match different collections that share a serial", () => {
    assert.equal(
      isSameObjektInstance(
        objekt("tripleS-Xinyu-319", 1),
        objekt("tripleS-SeoYeon-319", 1),
      ),
      false,
    );
  });

  it("matches by objektId when both entries have one", () => {
    assert.equal(
      isSameObjektInstance(
        objekt("tripleS-Xinyu-319", 1, "objekt-1"),
        objekt("tripleS-Xinyu-319", 2, "objekt-1"),
      ),
      true,
    );
  });

  it("uses collection and serial as the fallback key", () => {
    assert.equal(
      getObjektInstanceKey(objekt("tripleS-Xinyu-319", 1)),
      "tripleS-Xinyu-319:1",
    );
  });
});
