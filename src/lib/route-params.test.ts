import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeRouteParam } from "@/lib/route-params";

// The two shapes Next hands the same URL segment to different consumers.
const HANZI = "尹舒姸的小狗";
const HANZI_ENCODED = "%E5%B0%B9%E8%88%92%E5%A7%B8%E7%9A%84%E5%B0%8F%E7%8B%97";
const HANGUL = "신비한하루";
const HANGUL_ENCODED = "%EC%8B%A0%EB%B9%84%ED%95%9C%ED%95%98%EB%A3%A8";

describe("decodeRouteParam", () => {
  it("decodes the encoded form page components receive", () => {
    assert.equal(decodeRouteParam(HANZI_ENCODED), HANZI);
    assert.equal(decodeRouteParam(HANGUL_ENCODED), HANGUL);
    assert.equal(decodeRouteParam("%40sjarkbean"), "@sjarkbean");
    assert.equal(decodeRouteParam("%F0%9F%90%B6"), "🐶");
  });

  it("is a no-op on the decoded form route handlers receive", () => {
    assert.equal(decodeRouteParam(HANZI), HANZI);
    assert.equal(decodeRouteParam(HANGUL), HANGUL);
    assert.equal(decodeRouteParam("🐶"), "🐶");
  });

  it("leaves plain ASCII nicknames untouched in either shape", () => {
    for (const nickname of ["sjarkbean", "some_user", "user-1", "a.b~c"]) {
      assert.equal(decodeRouteParam(nickname), nickname);
    }
  });

  it("does not mangle a literal percent escape inside a nickname", () => {
    // A route handler hands us "50%41love" already decoded. A bare
    // decodeURIComponent would turn it into "50Alove"; the round-trip check
    // rejects that because encodeURIComponent("50Alove") !== "50%41love".
    assert.equal(decodeRouteParam("50%41love"), "50%41love");
    // ...while the encoded form of that same nickname still decodes.
    assert.equal(decodeRouteParam("50%2541love"), "50%41love");
  });

  it("falls back to the input on a malformed escape instead of throwing", () => {
    assert.equal(decodeRouteParam("100%love"), "100%love");
    assert.equal(decodeRouteParam("%"), "%");
    assert.equal(decodeRouteParam("%E5%B0"), "%E5%B0");
  });

  it("round-trips every value encodeURIComponent produces", () => {
    for (const nickname of [HANZI, HANGUL, "@sjarkbean", "🐶", "a.b~c"]) {
      assert.equal(decodeRouteParam(encodeURIComponent(nickname)), nickname);
    }
  });
});
