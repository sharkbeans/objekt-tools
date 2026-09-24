import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HUNT_UNDO_MS,
  huntCount,
  huntIsFresh,
  huntNotice,
  huntWrite,
} from "./hunt";

const hunt = {
  id: "hunt-1",
  wants: "SeoYeon CC103\nSeoYeon CC104",
  nickname: "sjarkbean",
};

describe("huntWrite", () => {
  it("replaces a list, keeping the old one for Undo", () => {
    assert.deepEqual(huntWrite({ wants: "YooYeon AA101" }, hunt, 1000), {
      set: {
        wants: hunt.wants,
        huntId: "hunt-1",
        huntAt: 1000,
        removedWants: [],
        wantsBeforeHunt: "YooYeon AA101",
        nickname: "sjarkbean",
      },
      remove: [],
    });
  });

  it("offers no Undo over an empty list", () => {
    const write = huntWrite({ wants: "  \n" }, hunt, 1);
    assert.equal("wantsBeforeHunt" in write.set, false);
    assert.deepEqual(write.remove, ["wantsBeforeHunt"]);
    assert.deepEqual(huntWrite({}, hunt, 1).remove, ["wantsBeforeHunt"]);
  });

  it("never overwrites a nickname the user set in the extension", () => {
    const write = huntWrite({ wants: "", nickname: "mine" }, hunt, 1);
    assert.equal("nickname" in write.set, false);
    // Blank counts as unset.
    assert.equal(
      huntWrite({ nickname: " " }, hunt, 1).set.nickname,
      "sjarkbean",
    );
    // And a hunt without one leaves it alone.
    assert.equal(
      "nickname" in huntWrite({}, { ...hunt, nickname: "" }, 1).set,
      false,
    );
  });

  it("keeps the original list when the same wants arrive again", () => {
    const write = huntWrite(
      { wants: hunt.wants, huntId: "hunt-0" },
      { ...hunt, id: "hunt-2" },
      5,
    );
    assert.equal("wantsBeforeHunt" in write.set, false);
    assert.deepEqual(write.remove, []);
    assert.equal(write.set.huntId, "hunt-2");
  });

  it("writes nothing for a repeated delivery of one hunt", () => {
    assert.deepEqual(
      huntWrite({ wants: hunt.wants, huntId: hunt.id }, hunt, 9),
      { set: {}, remove: [] },
    );
  });
});

describe("hunt notice", () => {
  it("counts objekts and says what to do next", () => {
    assert.equal(huntCount("a\n\n b \n"), 2);
    assert.equal(
      huntNotice(4),
      "Hunt from objekt.my — 4 objekts. Scroll your trade channel or press Search.",
    );
    assert.match(huntNotice(1), /— 1 objekt\./);
  });

  it("stays up for a day", () => {
    assert.equal(huntIsFresh(1000, 1000 + HUNT_UNDO_MS - 1), true);
    assert.equal(huntIsFresh(1000, 1000 + HUNT_UNDO_MS), false);
    assert.equal(huntIsFresh(undefined, 1), false);
    assert.equal(huntIsFresh(5000, 1000), false);
  });
});
