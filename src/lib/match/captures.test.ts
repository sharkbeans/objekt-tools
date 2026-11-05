import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCapture,
  blockCaptures,
  type Capture,
  captureAge,
  captureLabel,
  coverageOf,
  deliveredCapture,
  filterLabel,
  formatAge,
  formatCoverage,
  formatPostTime,
  hiddenPosts,
  isStale,
  MAX_CAPTURE_NAME,
  manualCapture,
  type NewCapture,
  newPostsLabel,
  PASTE_CAPTURE,
  postCounts,
  postInstant,
  readCaptures,
  renameCapture,
  rescanWants,
  STALE_AFTER_MS,
  settleCaptures,
  staleCaptures,
} from "./captures";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const UTC = { locale: "en-GB", timeZone: "UTC", now: NOW };
/** `formatRange` separates with thin spaces; these tests read plain ones. */
const plain = (text: string | null) => text?.replace(/\u2009/g, " ") ?? text;

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "run-1",
    kind: "search",
    capturedAt: NOW - HOUR,
    from: NOW - 10 * HOUR,
    to: NOW - 2 * HOUR,
    filters: ["CC101", "CC102"],
    wants: ["SeoYeon CC101", "SeoYeon CC102"],
    active: true,
    ...overrides,
  };
}

function search(overrides: Partial<NewCapture> = {}): NewCapture {
  return {
    id: "run-2",
    kind: "search",
    capturedAt: NOW,
    filters: ["CC101", "CC102"],
    wants: [],
    ...overrides,
  };
}

const posted = (...times: (string | null)[]) => times.map((time) => ({ time }));

describe("deliveredCapture", () => {
  it("takes a current extension's own account of the run", () => {
    assert.deepEqual(
      deliveredCapture(
        {
          id: "abc-def-ghi",
          wants: "SeoYeon CC101\n\n Mayu CC102 ",
          capture: {
            run: "abc-def",
            capturedAt: NOW - 3 * HOUR,
            queries: ["CC101", "CC102"],
          },
        },
        NOW,
      ),
      {
        id: "abc-def",
        kind: "search",
        capturedAt: NOW - 3 * HOUR,
        filters: ["CC101", "CC102"],
        wants: ["SeoYeon CC101", "Mayu CC102"],
      },
    );
  });

  it("keeps a scan's real age, so an old search delivered today is still old", () => {
    const old = NOW - 4 * 24 * HOUR;
    const source = deliveredCapture(
      {
        id: "a-b-c",
        wants: "",
        capture: { run: "a-b", capturedAt: old, queries: ["CC101"] },
      },
      NOW,
    );
    assert.equal(source?.capturedAt, old);
  });

  it("never dates a capture in the future", () => {
    const source = deliveredCapture(
      {
        id: "a-b-c",
        wants: "",
        capture: { run: "a-b", capturedAt: NOW + HOUR, queries: [] },
      },
      NOW,
    );
    assert.equal(source?.capturedAt, NOW);
  });

  it("falls back to the want list when a run names no queries", () => {
    const source = deliveredCapture(
      {
        id: "a-b-c",
        wants: "SeoYeon CC101",
        capture: { run: "a-b", capturedAt: NOW, queries: [] },
      },
      NOW,
    );
    assert.deepEqual(source?.filters, ["SeoYeon CC101"]);
  });

  it("files an older extension's delivery under its run, dated on arrival", () => {
    assert.deepEqual(
      deliveredCapture({ id: "abc-def-ghi", wants: "SeoYeon CC101" }, NOW),
      {
        id: "abc-def",
        kind: "search",
        capturedAt: NOW,
        filters: ["SeoYeon CC101"],
        wants: ["SeoYeon CC101"],
      },
    );
  });

  it("gives two deliveries of one run the same capture", () => {
    const first = deliveredCapture({ id: "abc-def-111", wants: "" }, NOW);
    const second = deliveredCapture({ id: "abc-def-222", wants: "" }, NOW);
    assert.equal(first?.id, second?.id);
  });

  it("refuses the scrolled index an older extension sends before any search", () => {
    assert.equal(
      deliveredCapture({ id: "index-abc123", wants: "" }, NOW),
      null,
    );
  });
});

describe("postInstant and coverageOf", () => {
  it("reads only real dates", () => {
    assert.equal(
      postInstant("2026-11-01T10:30:00.000Z"),
      Date.parse("2026-11-01T10:30:00.000Z"),
    );
    assert.equal(postInstant(null), null);
    assert.equal(postInstant("3:41 PM"), null);
    // Day-first or month-first depending on the reader: not a date we can use.
    assert.equal(postInstant("09/05/2026 3:41 PM"), null);
    assert.equal(postInstant("2026-99-99Tnope"), null);
  });

  it("spans the oldest to the newest, skipping what has no date", () => {
    assert.deepEqual(
      coverageOf(
        posted(
          "2026-11-01T18:30:00.000Z",
          "3:41 PM",
          "2026-11-01T10:30:00.000Z",
          null,
        ),
      ),
      {
        from: Date.parse("2026-11-01T10:30:00.000Z"),
        to: Date.parse("2026-11-01T18:30:00.000Z"),
      },
    );
  });

  it("is empty when nothing has a date", () => {
    assert.deepEqual(coverageOf(posted("3:41 PM", null)), {
      from: null,
      to: null,
    });
  });
});

describe("addCapture", () => {
  const times = posted("2026-11-01T10:30:00.000Z", "2026-11-01T18:30:00.000Z");

  it("files a new search, on, with what its posts cover", () => {
    const { captures } = addCapture([], search(), times);
    assert.deepEqual(captures, [
      {
        ...search(),
        from: Date.parse("2026-11-01T10:30:00.000Z"),
        to: Date.parse("2026-11-01T18:30:00.000Z"),
        active: true,
        fresh: 0,
      },
    ]);
  });

  it("keeps several captures at once, newest first and the paste row last", () => {
    const paste = capture({
      id: PASTE_CAPTURE,
      kind: "paste",
      capturedAt: NOW,
      filters: [],
    });
    const older = capture({ id: "old", filters: ["CC301"], capturedAt: 5 });
    const { captures } = addCapture(
      [paste, older],
      search({ filters: ["CC401"] }),
      times,
    );
    assert.deepEqual(
      captures.map((entry) => entry.id),
      ["run-2", "old", PASTE_CAPTURE],
    );
  });

  it("replaces a run delivered again rather than listing it twice", () => {
    const first = capture({ id: "run-2", active: false, from: 1, to: 2 });
    const { captures } = addCapture([first], search(), times);
    assert.equal(captures.length, 1);
    assert.equal(captures[0].active, true);
    assert.equal(captures[0].from, Date.parse("2026-11-01T10:30:00.000Z"));
  });

  it("keeps the name a run was given when it is delivered again", () => {
    const first = capture({ id: "run-2", name: "SeoYeon grid" });
    const { captures } = addCapture([first], search(), times);
    assert.equal(captures[0].name, "SeoYeon grid");
  });

  it("counts what a capture brought, and keeps counting across deliveries", () => {
    const { captures } = addCapture([], search(), times, 12);
    assert.equal(captures[0].fresh, 12);
    const again = addCapture(captures, search(), times, 3);
    assert.equal(again.captures[0].fresh, 15);
    // Delivered again with nothing new: the count it earned is not lost.
    assert.equal(
      addCapture(captures, search(), times, 0).captures[0].fresh,
      12,
    );
  });

  it("lists each manual capture separately", () => {
    const first = addCapture([], manualCapture(NOW), times).captures;
    const { captures } = addCapture(first, manualCapture(NOW + 1), times);
    assert.equal(captures.length, 2);
    assert.ok(captures.every((entry) => entry.kind === "manual"));
  });

  it("turns off an older capture of the same search, keeping it", () => {
    const old = capture({ id: "old", capturedAt: NOW - 100 * HOUR });
    const { captures, replaced } = addCapture([old], search(), times);
    assert.deepEqual(
      replaced.map((entry) => entry.id),
      ["old"],
    );
    assert.equal(captures.find((entry) => entry.id === "old")?.active, false);
  });

  it("clears the stale warning a rescan was asked to answer", () => {
    const old = capture({ id: "old", capturedAt: NOW - 100 * HOUR });
    assert.equal(staleCaptures([old], NOW).length, 1);
    const { captures } = addCapture([old], search(), times);
    assert.deepEqual(staleCaptures(captures, NOW), []);
  });

  it("also turns off an older capture a wider search covers", () => {
    const old = capture({ id: "old", filters: ["cc101"], capturedAt: 5 });
    const { replaced } = addCapture([old], search(), times);
    assert.equal(replaced.length, 1);
  });

  it("leaves a capture that searched for something this one did not", () => {
    const old = capture({ id: "old", filters: ["CC101", "CC999"] });
    const { captures, replaced } = addCapture([old], search(), times);
    assert.deepEqual(replaced, []);
    assert.equal(captures.find((entry) => entry.id === "old")?.active, true);
  });

  it("leaves a newer capture, and the paste row, alone", () => {
    const newer = capture({ id: "newer", capturedAt: NOW + HOUR });
    const paste = capture({ id: PASTE_CAPTURE, kind: "paste", filters: [] });
    assert.deepEqual(addCapture([newer, paste], search(), times).replaced, []);
  });

  it("does not report a capture the user had already turned off", () => {
    const old = capture({ id: "old", active: false, capturedAt: 5 });
    assert.deepEqual(addCapture([old], search(), times).replaced, []);
  });
});

describe("settleCaptures", () => {
  it("drops a capture whose posts have all been trimmed", () => {
    assert.deepEqual(
      settleCaptures([capture()], [{ time: null, captures: ["other"] }]).map(
        (entry) => entry.id,
      ),
      [],
    );
  });

  it("gives posts from before captures a row of their own, on", () => {
    const [row] = settleCaptures(
      [],
      [
        { time: "2026-11-01T10:30:00.000Z" },
        { time: "2026-11-01T18:30:00.000Z" },
      ],
    );
    assert.equal(row.id, PASTE_CAPTURE);
    assert.equal(row.kind, "paste");
    assert.equal(row.active, true);
    assert.equal(row.from, Date.parse("2026-11-01T10:30:00.000Z"));
    // The newest post is the best anyone can say about when they were saved.
    assert.equal(row.capturedAt, Date.parse("2026-11-01T18:30:00.000Z"));
  });

  it("leaves such a row undated when none of its posts has a date", () => {
    const [row] = settleCaptures([], [{ time: "3:41 PM" }]);
    assert.equal(row.capturedAt, null);
    assert.deepEqual(staleCaptures([row], NOW), []);
  });

  it("does not touch a paste row that is already there", () => {
    const paste = capture({ id: PASTE_CAPTURE, kind: "paste", active: false });
    assert.deepEqual(settleCaptures([paste], [{ time: null }]), [paste]);
  });
});

describe("hiddenPosts", () => {
  const membership = new Map<string, readonly string[]>([
    ["only-a", ["a"]],
    ["only-b", ["b"]],
    ["both", ["a", "b"]],
    ["pasted", [PASTE_CAPTURE]],
  ]);
  const list = (...off: string[]) =>
    ["a", "b", PASTE_CAPTURE].map((id) =>
      capture({ id, active: !off.includes(id) }),
    );

  it("hides nothing while everything is on", () => {
    assert.equal(hiddenPosts(membership, list()).size, 0);
  });

  it("keeps a post another capture still has", () => {
    assert.deepEqual([...hiddenPosts(membership, list("a"))], ["only-a"]);
  });

  it("hides a shared post once all its captures are off", () => {
    assert.deepEqual([...hiddenPosts(membership, list("a", "b"))].sort(), [
      "both",
      "only-a",
      "only-b",
    ]);
  });

  it("controls pasted posts like any other capture", () => {
    assert.deepEqual(
      [...hiddenPosts(membership, list(PASTE_CAPTURE))],
      ["pasted"],
    );
  });

  it("shows a post naming a capture that no longer exists", () => {
    const ghost = new Map([["lost", ["gone"]]]);
    assert.equal(
      hiddenPosts(ghost, [capture({ id: "a", active: false })]).size,
      0,
    );
  });
});

describe("staleCaptures", () => {
  it("judges a capture the same whether or not it is on", () => {
    const old = capture({ capturedAt: 1, active: false });
    assert.equal(isStale(old, NOW), true);
    assert.equal(isStale(capture({ capturedAt: null }), NOW), false);
  });

  it("draws the line at 72 hours", () => {
    const at = (ms: number) => capture({ capturedAt: NOW - ms });
    assert.equal(STALE_AFTER_MS, 72 * HOUR);
    assert.deepEqual(staleCaptures([at(72 * HOUR)], NOW), []);
    assert.equal(staleCaptures([at(72 * HOUR + 1)], NOW).length, 1);
  });

  it("ignores what is off the desk and what has no date", () => {
    assert.deepEqual(
      staleCaptures(
        [
          capture({ capturedAt: 1, active: false }),
          capture({ capturedAt: null }),
        ],
        NOW,
      ),
      [],
    );
  });
});

describe("rescanWants", () => {
  it("merges want lists, without repeats", () => {
    assert.deepEqual(
      rescanWants([
        capture({ wants: ["SeoYeon CC101", "Mayu CC102"] }),
        capture({ wants: ["Mayu CC102", "Nien CC301"] }),
      ]),
      ["SeoYeon CC101", "Mayu CC102", "Nien CC301"],
    );
  });

  it("falls back to the codes, and is empty for pasted posts", () => {
    assert.deepEqual(rescanWants([capture({ wants: [] })]), ["CC101", "CC102"]);
    assert.deepEqual(
      rescanWants([capture({ wants: [], filters: [], kind: "paste" })]),
      [],
    );
  });
});

describe("filterLabel", () => {
  const codes = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `CC${from + i}`);

  it("folds a run of codes the way a person writes it", () => {
    assert.equal(filterLabel(codes(101, 120)), "CC101–120");
  });

  it("splits at a gap, in order, whatever order they came in", () => {
    assert.equal(
      filterLabel(["CC105", "CC101", "CC103", "CC102"]),
      "CC101–103, CC105",
    );
  });

  it("keeps members apart", () => {
    assert.equal(
      filterLabel(["SeoYeon CC101", "SeoYeon CC102", "Mayu CC103"]),
      "SeoYeon CC101–102, Mayu CC103",
    );
  });

  it("does not fold across seasons", () => {
    assert.equal(filterLabel(["CC101", "DD102"]), "CC101, DD102");
  });

  it("ignores repeats", () => {
    assert.equal(filterLabel(["CC101", "CC101", "CC102"]), "CC101–102");
  });

  it("keeps what is not a plain code as written", () => {
    assert.equal(filterLabel(["AA301Z", "CC101"]), "AA301Z, CC101");
  });

  it("says how much it left out", () => {
    assert.equal(
      filterLabel(["CC101", "CC103", "CC105", "CC107", "CC109", "CC111"]),
      "CC101, CC103, CC105, CC107 +2 more",
    );
  });

  it("is empty for no filters", () => {
    assert.equal(filterLabel([]), "");
  });
});

describe("captureLabel", () => {
  it("names each kind", () => {
    assert.equal(captureLabel(capture()), "CC101–102");
    assert.equal(captureLabel(capture({ filters: [] })), "Discord search");
    assert.equal(captureLabel(capture({ kind: "paste" })), "Earlier capture");
    assert.equal(
      captureLabel(
        capture({
          kind: "manual",
          capturedAt: Date.parse("2026-11-06T04:00:00.000Z"),
        }),
        UTC,
      ),
      "Manual capture, 6 Nov",
    );
    assert.equal(
      captureLabel(capture({ kind: "manual", capturedAt: null })),
      "Manual capture",
    );
  });

  it("puts the user's own name first", () => {
    for (const kind of ["search", "manual", "paste"] as const)
      assert.equal(captureLabel(capture({ kind, name: "Mine" })), "Mine");
  });
});

describe("manualCapture", () => {
  it("is dated and has nothing to search again", () => {
    assert.deepEqual(manualCapture(NOW), {
      id: `manual-${NOW.toString(36)}`,
      kind: "manual",
      capturedAt: NOW,
      filters: [],
      wants: [],
    });
    assert.deepEqual(rescanWants([capture(manualCapture(NOW))]), []);
  });

  it("takes a name, ignoring one that is blank", () => {
    assert.equal(manualCapture(NOW, " Mine ").name, "Mine");
    assert.equal("name" in manualCapture(NOW, "   "), false);
  });
});

describe("renameCapture", () => {
  const list = [capture({ id: "a" }), capture({ id: "b" })];

  it("renames only that capture", () => {
    const renamed = renameCapture(list, "b", "  SeoYeon grid ");
    assert.equal(renamed[1].name, "SeoYeon grid");
    assert.equal("name" in renamed[0], false);
  });

  it("goes back to the automatic name when cleared", () => {
    const named = renameCapture(list, "a", "Mine");
    assert.equal("name" in renameCapture(named, "a", "  ")[0], false);
  });

  it("caps how long a name can be", () => {
    const [renamed] = renameCapture(list, "a", "x".repeat(200));
    assert.equal(renamed.name?.length, MAX_CAPTURE_NAME);
  });
});

describe("newPostsLabel", () => {
  it("says what a rescan found", () => {
    assert.equal(newPostsLabel({ fresh: 12 }, 214), "12 new");
  });

  it("stays quiet when the number would mean nothing", () => {
    assert.equal(newPostsLabel({}, 214), null);
    assert.equal(newPostsLabel({ fresh: 0 }, 214), null);
    // A first capture is all new, which says nothing about what changed.
    assert.equal(newPostsLabel({ fresh: 214 }, 214), null);
  });
});

describe("captureAge", () => {
  it("gives a scan's age, and no invented one for older posts", () => {
    assert.equal(
      captureAge(capture({ capturedAt: NOW - 5 * HOUR }), NOW),
      "5h ago",
    );
    assert.equal(
      captureAge(capture({ kind: "paste", capturedAt: NOW - HOUR }), NOW),
      "no scan date",
    );
    assert.equal(
      captureAge(capture({ capturedAt: null }), NOW),
      "no scan date",
    );
  });
});

describe("formatCoverage", () => {
  const at = (iso: string) => Date.parse(iso);

  it("gives the times for a span inside a day", () => {
    assert.equal(
      formatCoverage(
        {
          from: at("2026-11-01T10:30:00.000Z"),
          to: at("2026-11-01T18:30:00.000Z"),
        },
        UTC,
      ),
      "1 Nov, 10:30–18:30",
    );
  });

  it("gives just the dates for a span across days", () => {
    assert.equal(
      plain(
        formatCoverage(
          {
            from: at("2026-10-31T23:15:00.000Z"),
            to: at("2026-11-01T00:45:00.000Z"),
          },
          UTC,
        ),
      ),
      "31 Oct – 1 Nov",
    );
  });

  it("gives one time for a single post", () => {
    const only = at("2026-11-01T10:30:00.000Z");
    assert.equal(formatCoverage({ from: only, to: only }, UTC), "1 Nov, 10:30");
  });

  it("names the month, so a date reads the same in any locale", () => {
    const span = {
      from: at("2026-10-08T10:30:00.000Z"),
      to: at("2026-10-08T12:30:00.000Z"),
    };
    assert.match(
      formatCoverage(span, { ...UTC, locale: "en-US" }) ?? "",
      /^Oct 8,/,
    );
  });

  it("adds the year only when it is not this one", () => {
    assert.equal(
      formatCoverage(
        {
          from: at("2025-11-01T10:30:00.000Z"),
          to: at("2025-11-01T18:30:00.000Z"),
        },
        UTC,
      ),
      "1 Nov 2025, 10:30–18:30",
    );
  });

  it("decides what counts as one day in the reader's zone", () => {
    assert.equal(
      formatCoverage(
        {
          from: at("2026-10-31T23:15:00.000Z"),
          to: at("2026-11-01T00:45:00.000Z"),
        },
        { ...UTC, timeZone: "Asia/Kuala_Lumpur" },
      ),
      "1 Nov, 07:15–08:45",
    );
  });

  it("has nothing to say without dates", () => {
    assert.equal(formatCoverage({ from: null, to: null }), null);
  });
});

describe("formatPostTime", () => {
  it("dresses an ISO stamp and leaves the rest as Discord showed it", () => {
    assert.equal(
      formatPostTime("2026-11-01T10:30:00.000Z", UTC),
      "1 Nov, 10:30",
    );
    assert.equal(formatPostTime("3:41 PM", UTC), "3:41 PM");
    assert.equal(
      formatPostTime("Yesterday at 3:41 PM", UTC),
      "Yesterday at 3:41 PM",
    );
  });
});

describe("formatAge", () => {
  it("reads naturally at each scale", () => {
    assert.equal(formatAge(NOW - 5_000, NOW), "just now");
    assert.equal(formatAge(NOW - 40 * 60_000, NOW), "40 min ago");
    assert.equal(formatAge(NOW - 5 * HOUR, NOW), "5h ago");
    assert.equal(formatAge(NOW - 47 * HOUR, NOW), "47h ago");
    assert.equal(formatAge(NOW - 73 * HOUR, NOW), "3 days ago");
  });

  it("treats a time slightly ahead of the clock as now", () => {
    assert.equal(formatAge(NOW + 60_000, NOW), "just now");
  });
});

describe("blockCaptures and postCounts", () => {
  it("reads a post with no list as pasted", () => {
    assert.deepEqual(blockCaptures({}), [PASTE_CAPTURE]);
    assert.deepEqual(blockCaptures({ captures: [] }), [PASTE_CAPTURE]);
    assert.deepEqual(blockCaptures({ captures: ["a"] }), ["a"]);
  });

  it("counts a post once per capture that saw it", () => {
    assert.deepEqual([...postCounts([["a"], ["a", "b"]])].sort(), [
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("readCaptures", () => {
  it("keeps whole captures and drops the rest", () => {
    const good = capture();
    const manual = capture({ kind: "manual", name: "Mine", fresh: 3 });
    assert.deepEqual(
      readCaptures([
        good,
        manual,
        null,
        "x",
        { ...good, kind: "scroll" },
        { ...good, capturedAt: "soon" },
        { ...good, filters: [1] },
        { ...good, active: "yes" },
        { ...good, name: 7 },
        { ...good, fresh: "lots" },
      ]),
      [good, manual],
    );
  });

  it("reads anything else as empty", () => {
    assert.deepEqual(readCaptures(undefined), []);
    assert.deepEqual(readCaptures({ id: "a" }), []);
  });
});
