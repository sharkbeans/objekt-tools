import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  currentPage,
  findNextPage,
  findSearchBox,
  runSearches,
  searchQueries,
  submitSearch,
  typeQuery,
} from "./search";

const SEARCH_BOX =
  '<div role="combobox" contenteditable="true" aria-label="Search tripleS"></div>';
// The message composer: same contenteditable shape, must never be typed into.
const COMPOSER =
  '<div role="textbox" contenteditable="true" aria-label="Message #objekt-trade"></div>';

function page(html = SEARCH_BOX) {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  // JSDOM has no execCommand; stand in for what a real editor does with the
  // insertText command so the calling contract can be tested.
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    writable: true,
    value: (command: string, _ui: boolean, text: string) => {
      if (command !== "insertText") return false;
      // Mimic Slate: nested spans plus a zero-width placeholder, so the
      // field's textContent never equals the typed string exactly.
      const target = doc.activeElement ?? doc.body;
      target.innerHTML = `<span data-slate-node="text"><span data-slate-string="true">${text}</span></span>\uFEFF`;
      return true;
    },
  });
  return doc;
}

test("searches the collection code, not the member name", () => {
  // The member is ~6x more common in real posts and does no filtering.
  assert.deepEqual(searchQueries("SeoYeon CC101\nMayu CC103"), [
    "CC101",
    "CC103",
  ]);
});

test("collapses the same code wanted for different members into one search", () => {
  assert.deepEqual(searchQueries("SeoYeon CC101\nMayu CC101\nHayeon CC101"), [
    "CC101",
  ]);
});

test("searches a variant suffix as its base code", () => {
  assert.deepEqual(searchQueries("SeoYeon CC101Z"), ["CC101"]);
});

test("expands ranges and dedupes repeats", () => {
  const queries = searchQueries("YooYeon CC101-103\nYooYeon CC102");
  assert.deepEqual(queries, ["CC101", "CC102", "CC103"]);
});

test("drops anything that did not resolve rather than searching blindly", () => {
  assert.deepEqual(searchQueries("not an objekt at all"), []);
  assert.deepEqual(searchQueries(""), []);
});

test("finds the search combobox, and reports when it is gone", () => {
  assert.ok(findSearchBox(page()));
  assert.equal(findSearchBox(page("<div>no search here</div>")), null);
});

test("never selects the message composer, which Enter would post", () => {
  // Composer alone: nothing is safe to type into.
  assert.equal(findSearchBox(page(COMPOSER)), null);
  // Both present: only the search combobox is chosen.
  const box = findSearchBox(page(COMPOSER + SEARCH_BOX));
  assert.equal(box?.getAttribute("role"), "combobox");
  assert.match(box?.getAttribute("aria-label") ?? "", /^Search/);
  // A combobox without a Search label is not trusted either.
  assert.equal(
    findSearchBox(
      page(
        '<div role="combobox" contenteditable="true" aria-label="Jump to"></div>',
      ),
    ),
    null,
  );
});

const now = async () => {};

test("types through insertText so Slate keeps the text", async () => {
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  // Verified on visible characters: Slate's zero-width padding must not read
  // as a rejected query.
  assert.deepEqual(await typeQuery(box, "SeoYeon CC101", now), {
    ok: true,
    seen: "SeoYeon CC101",
  });
  // A second query replaces the first rather than appending.
  assert.equal((await typeQuery(box, "Mayu CC103", now)).ok, true);
  assert.doesNotMatch(box.textContent ?? "", /SeoYeon/);
});

test("waits for Slate to commit before deciding the text was refused", async () => {
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  // React commits a tick later; a synchronous read would see nothing.
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: (_command: string, _ui: boolean, text: string) => {
      setTimeout(() => {
        box.textContent = `${text}\uFEFF`;
      }, 10);
      return true;
    },
  });
  const typed = await typeQuery(
    box,
    "SeoYeon CC101",
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  );
  assert.equal(typed.ok, true);
});

test("reports what the box actually held when the text never lands", async () => {
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  box.textContent = "something else";
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: () => true,
  });
  const typed = await typeQuery(box, "SeoYeon CC101", now);
  assert.equal(typed.ok, false);
  assert.equal(typed.seen, "something else");
});

test("submits every query in order, pacing between them", async () => {
  const doc = page();
  const view = doc.defaultView;
  assert.ok(view);
  const submitted: string[] = [];
  doc.addEventListener("keydown", (event) => {
    if (event instanceof view.KeyboardEvent && event.key === "Enter")
      submitted.push(
        (findSearchBox(doc)?.textContent ?? "").replace(
          /[\u200B-\u200D\uFEFF]/g,
          "",
        ),
      );
  });
  const waits: number[] = [];
  const run = await runSearches(doc, ["A CC1", "B CC2", "C CC3"], {
    delayMs: 3000,
    signal: { cancelled: false },
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  assert.deepEqual(submitted, ["A CC1", "B CC2", "C CC3"]);
  assert.deepEqual(run, { done: 3, stopped: null });
  // One wait per page per query, including after the last: that pause is when
  // the results render and the capture observer sees them.
  assert.deepEqual(waits, [3000, 3000, 3000]);
});

test("stops immediately when cancelled", async () => {
  const doc = page();
  const signal = { cancelled: false };
  const run = await runSearches(doc, ["A CC1", "B CC2", "C CC3"], {
    delayMs: 0,
    signal,
    wait: async () => {
      signal.cancelled = true;
    },
  });
  assert.equal(run.done, 1);
  assert.equal(run.stopped, "Cancelled.");
});

test("stops rather than firing blind when the UI changes shape", async () => {
  const missing = await runSearches(page("<div></div>"), ["A CC1"], {
    delayMs: 0,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(missing.done, 0);
  assert.match(missing.stopped ?? "", /search box/);

  // An editor that discards the insert (Slate reverting) must also stop.
  const doc = page();
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: () => false,
  });
  const rejected = await runSearches(doc, ["A CC1"], {
    delayMs: 0,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(rejected.done, 0);
  assert.match(rejected.stopped ?? "", /did not accept "A CC1"/);
});

test("recognises Discord's hosts and channel URLs", async () => {
  const { channelFromUrl, isDiscordUrl } = await import("./settings");
  assert.equal(isDiscordUrl("https://discord.com/channels/1/2"), true);
  assert.equal(isDiscordUrl("https://canary.discord.com/channels/1/2"), true);
  assert.equal(isDiscordUrl("https://ptb.discord.com/app"), true);
  assert.equal(isDiscordUrl("https://notdiscord.com/channels/1/2"), false);
  assert.equal(isDiscordUrl(undefined), false);

  assert.equal(channelFromUrl("https://discord.com/channels/123/456"), "456");
  // Guild id is "@me" for DMs, and canary must resolve the same way.
  assert.equal(
    channelFromUrl("https://canary.discord.com/channels/@me/99"),
    "99",
  );
  assert.equal(channelFromUrl("https://discord.com/channels/@me"), null);
  assert.equal(channelFromUrl("https://evil.example/channels/1/2"), null);
});

test("Enter carries the legacy numeric codes some handlers still read", () => {
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  const view = doc.defaultView;
  assert.ok(view);
  const seen: { key: string; keyCode: number; type: string }[] = [];
  box.addEventListener("keydown", (event) => {
    if (event instanceof view.KeyboardEvent)
      seen.push({ key: event.key, keyCode: event.keyCode, type: event.type });
  });
  submitSearch(box);
  assert.deepEqual(seen, [{ key: "Enter", keyCode: 13, type: "keydown" }]);
});

// Discord's real pager markup: Next carries rel="next" and no accessible name,
// page numbers are role="button" divs labelled "Page N".
const pager = (current = 1, last = 400) =>
  `<button type="button" rel="prev"${current === 1 ? " disabled" : ""}></button>` +
  [1, 2, 3, last]
    .map(
      (n) =>
        `<div role="button" aria-label="Page ${n}"${
          n === current ? ' aria-current="page"' : ""
        }><span>${n}</span></div>`,
    )
    .join("") +
  `<button type="button" rel="next"${current === last ? " disabled" : ""}><span>Next</span></button>`;
const PAGER = pager();

test("finds Next by rel, since Discord gives it no accessible name", () => {
  const found = findNextPage(page(SEARCH_BOX + PAGER));
  assert.equal(found?.getAttribute("rel"), "next");
});

test("ignores the pager once Next is disabled at the last page", () => {
  assert.equal(findNextPage(page(SEARCH_BOX + pager(400, 400))), null);
  assert.equal(findNextPage(page(SEARCH_BOX)), null);
});

test("falls back to the numbered buttons if Next changes shape", () => {
  // Same pager with the rel="next" button removed.
  const html = PAGER.replace(
    /<button type="button" rel="next".*?<\/button>/,
    "",
  );
  const found = findNextPage(page(SEARCH_BOX + html));
  assert.equal(found?.getAttribute("aria-label"), "Page 2");
});

test("reads the current page from aria-current", () => {
  assert.equal(currentPage(page(SEARCH_BOX + pager(3))), 3);
  assert.equal(currentPage(page(SEARCH_BOX)), null);
});

test("stops paging when a click does not advance the pager", async () => {
  // A pager that never moves: clicking must not burn the whole page budget.
  const doc = page(SEARCH_BOX + PAGER);
  let clicks = 0;
  doc.querySelector('[rel="next"]')?.addEventListener("click", () => {
    clicks++;
  });
  await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 6,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(
    clicks,
    1,
    "should give up after the first click changed nothing",
  );
});

test("walks the requested number of result pages per query", async () => {
  const doc = page(SEARCH_BOX + PAGER);
  let current = 1;
  const clicks: number[] = [];
  doc.querySelector('[rel="next"]')?.addEventListener("click", () => {
    // Advance aria-current the way Discord does.
    doc.querySelector('[aria-current="page"]')?.removeAttribute("aria-current");
    current += 1;
    doc
      .querySelector(`[aria-label="Page ${current}"]`)
      ?.setAttribute("aria-current", "page");
    clicks.push(current);
  });
  const progress: (number | undefined)[] = [];
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    wait: async () => {},
    onProgress: (p) => progress.push(p.page),
  });
  assert.equal(run.done, 1);
  assert.deepEqual(clicks, [2, 3]);
  assert.deepEqual(progress, [1, 2, 3]);
});

test("a missing pager ends that query without abandoning the rest", async () => {
  const doc = page(SEARCH_BOX);
  const run = await runSearches(doc, ["CC101", "CC102"], {
    delayMs: 0,
    pages: 5,
    signal: { cancelled: false },
    wait: async () => {},
  });
  // Both queries still submitted, just one page each.
  assert.deepEqual(run, { done: 2, stopped: null });
});

test("stops paging the moment it is cancelled", async () => {
  const doc = page(SEARCH_BOX + PAGER);
  let current = 1;
  doc.querySelector('[rel="next"]')?.addEventListener("click", () => {
    doc.querySelector('[aria-current="page"]')?.removeAttribute("aria-current");
    current += 1;
    doc
      .querySelector(`[aria-label="Page ${current}"]`)
      ?.setAttribute("aria-current", "page");
  });
  const signal = { cancelled: false };
  let waits = 0;
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 10,
    signal,
    wait: async () => {
      if (++waits === 2) signal.cancelled = true;
    },
  });
  assert.equal(run.stopped, "Cancelled.");
  // Cancelled part way, not after exhausting all ten pages.
  assert.ok(current < 10, `stopped at page ${current}`);
});
