import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { rowKey } from "./dom";
import {
  type CaptureProbe,
  commitSearch,
  currentPage,
  findNextPage,
  findSearchBox,
  findSubmitOption,
  pagerCensus,
  resultRows,
  resultsPanel,
  rowCount,
  rowSignature,
  rowsTurnedOver,
  runSearches,
  searchQueries,
  searchSafe,
  settlePage,
  submitSearch,
  typeQuery,
} from "./search";

// Discord paints a placeholder inside the editable whenever Slate's model is
// empty, and hides it as soon as the model has content. That is the only signal
// there is for whether the editor took what was typed, so the fixture has to
// have one or the tests are checking markup the real thing does not have.
const PLACEHOLDER = '<span data-slate-placeholder="true">Search tripleS</span>';
const SEARCH_BOX = `<div role="combobox" contenteditable="true" aria-label="Search tripleS">${PLACEHOLDER}</div>`;
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
      const target = doc.activeElement ?? doc.body;
      const selection = doc.defaultView?.getSelection();
      // Mimic Slate: nested spans plus a zero-width placeholder, so the
      // field's textContent never equals the typed string exactly.
      const write = (value: string) => {
        target.innerHTML = `${value ? "" : PLACEHOLDER}<span data-slate-node="text"><span data-slate-string="true">${value}</span></span>\uFEFF`;
        // The caret ends up after what was written, so the next insert appends
        // rather than replacing — which is what makes per-character typing
        // spell a word instead of leaving only its last letter.
        selection?.removeAllRanges();
      };
      if (command === "delete") {
        write("");
        return true;
      }
      if (command !== "insertText") return false;
      const replacing =
        (selection?.rangeCount ?? 0) > 0 && selection?.isCollapsed === false;
      const existing = replacing
        ? ""
        : (
            target.querySelector('[data-slate-string="true"]')?.textContent ??
            ""
          ).replace(/[\u200B-\u200D\uFEFF]/g, "");
      write(existing + text);
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
  // The composer is excluded by role, not by name, so it stays excluded in a
  // client running in any language.
  assert.equal(
    findSearchBox(
      page(
        COMPOSER +
          '<div role="combobox" contenteditable="true" aria-label="Suchen"></div>',
      ),
    )?.getAttribute("aria-label"),
    "Suchen",
  );
});

test("finds the search box in a Discord that is not in English", () => {
  // Requiring the name to start with "Search" made the whole feature
  // English-only: every other client reported the box as missing.
  for (const label of ["Rechercher", "検索", "Поиск", "Buscar tripleS"])
    assert.equal(
      findSearchBox(
        page(
          `<div role="combobox" contenteditable="true" aria-label="${label}"></div>`,
        ),
      )?.getAttribute("aria-label"),
      label,
    );
  // A name this build does not recognise is still accepted when it is the only
  // combobox there is — the composer is excluded by role either way.
  assert.ok(
    findSearchBox(
      page(
        COMPOSER +
          '<div role="combobox" contenteditable="true" aria-label="Cerchi qualcosa"></div>',
      ),
    ),
  );
  // Two unrecognised candidates is ambiguity, and ambiguity fails closed.
  assert.equal(
    findSearchBox(
      page(
        '<div role="combobox" contenteditable="true" aria-label="Vai a"></div>' +
          '<div role="combobox" contenteditable="true" aria-label="Cerchi qualcosa"></div>',
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
    via: "insertText",
    index: 0,
    tried: ["insertText"],
    unfocused: false,
  });
  // A second query replaces the first rather than appending.
  assert.equal((await typeQuery(box, "Mayu CC103", now)).ok, true);
  assert.doesNotMatch(box.textContent ?? "", /SeoYeon/);
});

test("never types into whatever else has focus", async () => {
  // The hazard this guards: execCommand acts on the document's selection, not
  // on the element it was handed. A field that cannot take focus therefore
  // sends the query wherever focus actually is — and the other contenteditable
  // in this document is the message composer.
  const doc = page(SEARCH_BOX + COMPOSER);
  const box = findSearchBox(doc);
  const composer = doc.querySelector('[role="textbox"]') as HTMLElement;
  assert.ok(box);
  // A field detached mid-run is the realistic version: Discord re-renders the
  // search bar, and the reference the run is holding stops being in the page.
  box.remove();
  composer.focus();
  const typed = await typeQuery(box, "SeoYeon CC101", now);
  assert.equal(typed.ok, false);
  assert.equal(typed.unfocused, true);
  assert.equal(typed.tried.length, 0);
  assert.equal(composer.textContent, "", "the composer must be left alone");
});

test("will not press Enter at a field that does not hold focus", async () => {
  const doc = page(SEARCH_BOX + COMPOSER);
  const box = findSearchBox(doc);
  const composer = doc.querySelector('[role="textbox"]') as HTMLElement;
  assert.ok(box);
  const keys: string[] = [];
  doc.addEventListener("keydown", (event) => {
    keys.push((event as KeyboardEvent).key);
  });
  composer.focus();
  assert.equal(submitSearch(box), false);
  assert.equal(await commitSearch(box, "AA101", now), "blocked");
  assert.deepEqual(keys, [], "no Enter reaches the page from a blurred field");
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
  assert.deepEqual(run, {
    done: 3,
    stopped: null,
    pagesWalked: 3,
    pagerNote: null,
    posts: 0,
    unsettled: 0,
    unchanged: 0,
    settleNote: null,
    submittedBy: { option: 0, enter: 3, blocked: 0 },
    retried: 0,
    empty: 0,
    emptyQueries: [],
    closed: 0,
    typedBy: { insertText: 3 },
  });
  // One pacing wait per page per query, including after the last: that pause is
  // when the results render and the capture observer sees them. The shorter
  // waits mixed in are the poll for Discord's "Search for …" row and the
  // retype that follows when it never appears.
  assert.deepEqual(
    waits.filter((ms) => ms === 3000),
    [3000, 3000, 3000],
  );
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
  assert.match(rejected.stopped ?? "", /would not take "A CC1"/);
  // Names every insertion it actually tried, which is the difference between
  // "Discord changed" and "this browser needs a different one". The order
  // rotates with the attempt, so assert on membership rather than sequence.
  // The paste path is absent because jsdom has no DataTransfer to build the
  // event with — an insertion this browser cannot perform is not reported as
  // one that was tried and refused.
  for (const insertion of ["insertText", "beforeinput"])
    assert.match(rejected.stopped ?? "", new RegExp(insertion));
  assert.doesNotMatch(rejected.stopped ?? "", /paste/);
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
  box.focus();
  assert.equal(submitSearch(box), true);
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
  assert.equal(run.done, 2);
  assert.equal(run.stopped, null);
  // One page each, and it says why it went no further.
  assert.equal(run.pagesWalked, 2);
  assert.match(run.pagerNote ?? "", /no Next control/);
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

test("counts the pages it really walked, not the ones requested", async () => {
  const doc = page(SEARCH_BOX + PAGER);
  let current = 1;
  const mark = () => {
    doc.querySelector('[aria-current="page"]')?.removeAttribute("aria-current");
    doc
      .querySelector(`[aria-label="Page ${current}"]`)
      ?.setAttribute("aria-current", "page");
  };
  doc.querySelector('[rel="next"]')?.addEventListener("click", () => {
    current += 1;
    mark();
  });
  // A new query resets the pager to page one, the way Discord does.
  doc.addEventListener("keydown", () => {
    current = 1;
    mark();
  });
  const run = await runSearches(doc, ["CC101", "CC102"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 6);
  assert.equal(run.pagerNote, null);
});

test("says so when the pager refuses to advance", async () => {
  // Pager present but frozen: the run must not silently report success.
  const run = await runSearches(page(SEARCH_BOX + PAGER), ["CC101"], {
    delayMs: 0,
    pages: 4,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 1);
  assert.match(run.pagerNote ?? "", /did not leave page 1/);
});

// Discord's real markup, as measured on a live results page: a channel row is
// an <li id="chat-messages-<channel>-<id>">, while a search result is a plain
// <li> with no channel anywhere in it. Both carry a message body whose id
// embeds the message id, and that is the only anchor they share.
const CHANNEL_ROW = (id: string) =>
  `<li id="chat-messages-111-${id}"><div id="message-content-${id}"></div></li>`;
const RESULT_ROW = (id: string) =>
  `<li><div id="message-content-${id}"></div></li>`;
const rowId = (id: string) => `message-content-${id}`;
const panel = (ids: string[], current = 1) =>
  `<div id="search-results">${ids.map(RESULT_ROW).join("")}${pager(current, 3)}</div>`;
const probeOf = (recorded: Set<string>): CaptureProbe => ({
  account: (rows) => {
    const tally = { recorded: 0, pending: 0, unreadable: 0 };
    for (const row of rows)
      if (recorded.has(rowKey(row))) tally.recorded++;
      else tally.pending++;
    return tally;
  },
  posts: () => recorded.size,
});

test("settles on the results panel, not the channel list behind it", () => {
  // A busy trade channel takes new posts the whole time a run is going; waiting
  // on those would mean no page ever looks finished.
  const doc = page(
    SEARCH_BOX +
      `<div id="channel">${CHANNEL_ROW("900")}</div>` +
      panel(["1", "2"]),
  );
  assert.equal(resultsPanel(doc)?.id, "search-results");
  // Result rows carry no id of their own, so they are keyed by their body.
  assert.deepEqual(resultRows(doc).map(rowKey), [rowId("1"), rowId("2")]);
});

test("finds the results panel through the pager when the id is gone", () => {
  // No class names: the pager only ever renders inside the panel, so its
  // nearest ancestor holding messages is the panel.
  const doc = page(
    `${SEARCH_BOX}<div id="channel">${CHANNEL_ROW("900")}</div><aside><div>${RESULT_ROW("1")}${pager()}</div></aside>`,
  );
  const found = resultsPanel(doc);
  assert.ok(found);
  assert.deepEqual(
    [...found.querySelectorAll('[id^="message-content-"]')].map(
      (row) => row.id,
    ),
    [rowId("1")],
  );
});

test("holds the page open until every post on it is recorded", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const recorded = new Set<string>();
  let polls = 0;
  const settled = await settlePage(doc, {
    page: 1,
    before: "",
    probe: probeOf(recorded),
    wait: async () => {
      // Capture lands late, which is exactly what a fixed delay used to page
      // straight past.
      if (++polls === 3) {
        recorded.add(rowId("1"));
        recorded.add(rowId("2"));
      }
    },
  });
  assert.deepEqual(settled, {
    panel: true,
    rendered: 2,
    recorded: 2,
    unreadable: 0,
    outstanding: 0,
    settled: true,
    changed: true,
  });
  assert.ok(polls >= 4, `settled after only ${polls} polls`);
});

test("gives up on a page it cannot confirm, and says how much was left", async () => {
  let polls = 0;
  const settled = await settlePage(page(SEARCH_BOX + panel(["1", "2"])), {
    page: 1,
    before: "",
    probe: probeOf(new Set()),
    wait: async () => {
      polls++;
    },
    pollMs: 100,
    budgetMs: 500,
  });
  assert.deepEqual(settled, {
    panel: true,
    rendered: 2,
    recorded: 0,
    unreadable: 0,
    outstanding: 2,
    settled: false,
    changed: true,
  });
  assert.equal(polls, 5, "should stop at the budget, not poll forever");
});

test("will not call a page done while the pager is still on the last one", async () => {
  // Everything on screen is recorded — but it is the *previous* page's rows,
  // which survive the click for a frame. Settling here would fire Next again
  // and skip page two entirely.
  const settled = await settlePage(page(SEARCH_BOX + panel(["1", "2"], 1)), {
    page: 2,
    before: "",
    probe: probeOf(new Set([rowId("1"), rowId("2")])),
    wait: async () => {},
    pollMs: 100,
    budgetMs: 400,
  });
  assert.equal(settled.settled, false);
});

test("settles once the pager arrives on the page it was sent to", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"], 1));
  let polls = 0;
  const settled = await settlePage(doc, {
    page: 2,
    before: "",
    probe: probeOf(new Set([rowId("1"), rowId("2")])),
    wait: async () => {
      if (++polls !== 2) return;
      doc
        .querySelector('[aria-current="page"]')
        ?.removeAttribute("aria-current");
      doc
        .querySelector('[aria-label="Page 2"]')
        ?.setAttribute("aria-current", "page");
    },
  });
  assert.equal(settled.settled, true);
});

test("waits out the grace period when Discord returns the same list", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  let polls = 0;
  const settled = await settlePage(doc, {
    page: 1,
    before: rowSignature(doc),
    probe: probeOf(new Set([rowId("1"), rowId("2")])),
    wait: async () => {
      polls++;
    },
    pollMs: 100,
    graceMs: 500,
    budgetMs: 5000,
  });
  // Rows that never turn over are accepted, but only after the grace window —
  // and the run is told, because that is also what rate-limiting looks like.
  assert.deepEqual(settled, {
    panel: true,
    rendered: 2,
    recorded: 2,
    unreadable: 0,
    outstanding: 0,
    settled: true,
    changed: false,
  });
  assert.equal(polls, 5);
});

test("scrolls the results list to the bottom before calling the page done", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const list = doc.getElementById("search-results");
  assert.ok(list);
  // jsdom has no layout, so stand in for a list taller than its viewport.
  let scrollTop = 0;
  Object.defineProperty(list, "clientHeight", { value: 100 });
  Object.defineProperty(list, "scrollHeight", { value: 300 });
  Object.defineProperty(list, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  const settled = await settlePage(doc, {
    page: 1,
    before: "",
    probe: probeOf(new Set([rowId("1"), rowId("2")])),
    wait: async () => {},
  });
  assert.equal(settled.settled, true);
  // Discord fills the list lazily: a page confirmed without reaching the bottom
  // would be confirmed on rows it never rendered.
  assert.equal(scrollTop, 200);
});

test("a run does not page on while posts on the current page are unrecorded", async () => {
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set<string>();
  const render = (ids: string[], current: number) => {
    list.innerHTML = ids.map(RESULT_ROW).join("") + pager(current, 3);
  };
  // Stand in for Discord: submitting renders page one, Next renders page two.
  doc.addEventListener("keydown", () => render(["1", "2"], 1));
  const unrecordedAtClick: number[] = [];
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (!target.closest('[rel="next"]')) return;
    unrecordedAtClick.push(
      resultRows(doc).filter((row) => !recorded.has(rowKey(row))).length,
    );
    render(["3", "4"], 2);
    recorded.add(rowId("3"));
    recorded.add(rowId("4"));
  });
  let polls = 0;
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 2,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {
      if (++polls !== 3) return;
      recorded.add(rowId("1"));
      recorded.add(rowId("2"));
    },
  });
  assert.deepEqual(
    unrecordedAtClick,
    [0],
    "clicked Next with posts still unrecorded",
  );
  assert.equal(run.pagesWalked, 2);
  assert.equal(run.posts, 4);
  assert.equal(run.unsettled, 0);
  assert.equal(run.settleNote, null);
});

test("a search still in flight is not an answer of no matches", async () => {
  // Discord opens the results panel first and answers a moment later. The panel
  // appearing is a change of signature all on its own, so two quiet polls —
  // 300ms — was enough to record the code as unposted and skip every page it
  // had. It hit the first codes of a run hardest, and it was a race: the same
  // code came back empty in one run and full in the next.
  const doc = page(SEARCH_BOX);
  const recorded = new Set<string>();
  let polls = 0;
  let answering = false;
  doc.addEventListener("keydown", () => {
    doc.body.insertAdjacentHTML("beforeend", '<div id="search-results"></div>');
    answering = true;
    polls = 0;
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 1,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {
      if (!answering || ++polls !== 5) return;
      answering = false;
      const list = doc.getElementById("search-results");
      assert.ok(list);
      list.innerHTML = ["1", "2"].map(RESULT_ROW).join("");
      recorded.add(rowId("1"));
      recorded.add(rowId("2"));
    },
  });
  assert.equal(run.empty, 0);
  assert.deepEqual(run.emptyQueries, []);
  assert.equal(run.posts, 2);
});

test("a code nobody has posted still reads as no matches, and is named", async () => {
  // The other side of the same rule: an empty panel that stays empty for the
  // grace period is an answer, and the run says which code it was so the claim
  // can be checked by hand.
  const doc = page(
    `${SEARCH_BOX}<div id="search-results">${RESULT_ROW("9")}</div>`,
  );
  const list = doc.getElementById("search-results");
  assert.ok(list);
  doc.addEventListener("keydown", () => {
    list.innerHTML = "";
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    probe: probeOf(new Set([rowId("9")])),
    wait: async () => {},
  });
  assert.equal(run.empty, 1);
  assert.deepEqual(run.emptyQueries, ["CC101"]);
});

test("says so when Discord answers with the results already on screen", async () => {
  const recorded = new Set([rowId("1"), rowId("2")]);
  const run = await runSearches(
    page(SEARCH_BOX + searchRow("CC101") + panel(["1", "2"])),
    ["CC101"],
    {
      delayMs: 0,
      signal: { cancelled: false },
      probe: probeOf(recorded),
      wait: async () => {},
      settlePollMs: 100,
    },
  );
  assert.equal(run.unchanged, 1);
  assert.equal(run.posts, 2);
  assert.match(run.settleNote ?? "", /rate-limiting/);
});

test("refuses to count pages the pager cannot confirm it walked", async () => {
  // Next exists but nothing is numbered, so there is no evidence any click
  // landed. Reporting ten pages here is how a run that never left page one
  // claimed forty pages while capturing the channel behind it.
  const doc = page(
    `${SEARCH_BOX}<button type="button" rel="next"><span>Next</span></button>`,
  );
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 10,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 1);
  assert.match(run.pagerNote ?? "", /no page numbers/);
});

test("walks a numberless pager on the results turning over instead", async () => {
  // A pager with Next and no `aria-current` used to end the query at page two
  // of five, having already clicked through to it — the pages were walked and
  // read, and then thrown away for want of a number to compare. The result ids
  // are scoped to the panel, so they say the same thing the number would.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set<string>();
  let page_ = 0;
  const render = () => {
    page_++;
    const ids = [`${page_}a`, `${page_}b`];
    list.innerHTML =
      ids.map(RESULT_ROW).join("") +
      // Next, and nothing numbered anywhere.
      `<button type="button" rel="next"><span>Next</span></button>`;
    for (const id of ids) recorded.add(rowId(id));
  };
  doc.addEventListener("keydown", render);
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (target.closest('[rel="next"]')) render();
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 3);
  assert.equal(run.pagerNote, null);
  assert.equal(run.posts, 6);
});

test("a run that ran out of pages says so differently from one that broke", () => {
  // The last page: Discord keeps the pager and disables Next. A normal end,
  // and the census says the pager was there and spent.
  const spent = pagerCensus(page(SEARCH_BOX + panel(["1"], 3)));
  assert.match(spent, /1 rel=next \(1 disabled\)/);
  assert.match(spent, /4 numbered/);
  // And it says what the controls actually are, which is what a pager this
  // build cannot read has to be identified from.
  assert.match(spent, /rel=next/);
  assert.match(spent, /aria-current=page/);
  // No pager at all: fewer results than fill one page. Also a normal end, and
  // a different sentence — this is the one that used to read as a fault.
  const none = pagerCensus(
    page(`${SEARCH_BOX}<div id="search-results">${RESULT_ROW("1")}</div>`),
  );
  assert.match(none, /0 rel=next/);
  assert.match(none, /0 numbered/);
  assert.match(none, /controls: none/);
});

test("does not read the sidebar's current channel as the pager's page", () => {
  // Discord marks the open channel with aria-current="page", and it comes
  // first in document order. Reading that reported "no page numbers" over the
  // top of a pager that was on screen and numbered.
  const sidebar = '<a href="/channels/1/2" aria-current="page">trades</a>';
  const doc = page(
    `${SEARCH_BOX}${sidebar}<div id="search-results">${RESULT_ROW("1")}${pager(2)}</div>`,
  );
  assert.equal(currentPage(doc), 2);
});

test("tells a page change from a lazy list growing under the scroller", () => {
  const before = "panel a b";
  // Paging replaces every row.
  assert.equal(rowsTurnedOver(before, "panel c d"), true);
  // Discord appending as the scroller reaches the bottom keeps the ones there.
  assert.equal(rowsTurnedOver(before, "panel a b c d"), false);
  // Pages that overlap by a row are still pages: "a" is gone, so this moved.
  assert.equal(rowsTurnedOver(before, "panel b c"), true);
  assert.equal(rowCount(before), 2);
  assert.equal(rowCount("panel"), 0);
  // An empty panel on either side is no evidence, not evidence of a walk.
  assert.equal(rowsTurnedOver("panel", "panel c d"), false);
  assert.equal(rowsTurnedOver(before, "panel"), false);
  assert.equal(rowsTurnedOver("", "panel c d"), false);
});

test("will not count rows a numberless pager only appended", async () => {
  // The scroller reaching the bottom of a long page loads more of that same
  // page. The signature moves, and nothing has been paged.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set<string>();
  const ids: string[] = [];
  const render = () => {
    ids.push(`${ids.length + 1}`);
    for (const id of ids) recorded.add(rowId(id));
    list.innerHTML =
      ids.map(RESULT_ROW).join("") +
      `<button type="button" rel="next"><span>Next</span></button>`;
  };
  doc.addEventListener("keydown", render);
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (target.closest('[rel="next"]')) render();
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 5,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 1);
  assert.match(run.pagerNote ?? "", /without losing any/);
});

test("a query that matched nothing leaves the last one's pager alone", async () => {
  // The pager outlives the query that drew it. Clicking it from an empty panel
  // walks the previous code's results and bills them to this one.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set([rowId("1"), rowId("2")]);
  const NEXT = `<button type="button" rel="next"><span>Next</span></button>`;
  // The previous query's results, and its pager, are what is on screen.
  list.innerHTML = ["1", "2"].map(RESULT_ROW).join("") + NEXT;
  // Nothing matched: the rows go, and the pager is still up.
  doc.addEventListener("keydown", () => {
    list.innerHTML = NEXT;
  });
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (!target.closest('[rel="next"]')) return;
    list.innerHTML = ["1", "2"].map(RESULT_ROW).join("") + NEXT;
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 5,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
  });
  assert.equal(run.empty, 1);
  assert.equal(run.pagesWalked, 1);
  // And it is not the run's one note either: "no Next control" from the query
  // that was never going to have one buried what the real queries hit.
  assert.equal(run.pagerNote, null);
});

test("keeps looking for Next before deciding the results ran out", async () => {
  // Discord rebuilds the pager as the page loads. A single look taken inside
  // that gap ended queries pages short and called it the end of the results.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set<string>();
  let rendered = 0;
  const render = () => {
    rendered++;
    const ids = [`${rendered}a`, `${rendered}b`];
    for (const id of ids) recorded.add(rowId(id));
    list.innerHTML =
      ids.map(RESULT_ROW).join("") +
      `<button type="button" rel="next"><span>Next</span></button>`;
  };
  doc.addEventListener("keydown", render);
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (target.closest('[rel="next"]')) render();
  });
  // The pager is on the page the whole time; it is the *first look* at it after
  // each page that comes back empty, which is what a re-render looks like.
  const query = doc.querySelector.bind(doc);
  let looks = 0;
  doc.querySelector = ((selector: string) =>
    selector.includes('rel="next"') && ++looks % 2 === 1
      ? null
      : query(selector)) as typeof doc.querySelector;
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 3);
  assert.equal(run.pagerNote, null);
});

test("does not call a page done while Discord has emptied the list to fetch it", async () => {
  // Clicking Next clears the results while the next page loads. An empty list
  // is quiet by every other measure — nothing outstanding, scrolled to the
  // bottom, the same as a poll ago — so the page was called done mid-fetch and
  // the rows that arrived after it were read as "nothing turned over".
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const view = doc.defaultView;
  assert.ok(view);
  const recorded = new Set<string>();
  const NEXT = `<button type="button" rel="next"><span>Next</span></button>`;
  let rendered = 0;
  const render = () => {
    rendered++;
    const ids = [`${rendered}a`, `${rendered}b`];
    for (const id of ids) recorded.add(rowId(id));
    list.innerHTML = ids.map(RESULT_ROW).join("") + NEXT;
  };
  doc.addEventListener("keydown", render);
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (!target.closest('[rel="next"]')) return;
    // Emptied now; the rows arrive several polls later.
    list.innerHTML = NEXT;
    let polls = 0;
    fetching = () => {
      if (++polls === 6) {
        fetching = () => {};
        render();
      }
    };
  });
  let fetching: () => void = () => {};
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 3,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => fetching(),
  });
  assert.equal(run.pagesWalked, 3);
  assert.equal(run.pagerNote, null);
});

test("will not count a numberless pager whose results never move", async () => {
  // The other half of the same rule: no number and no turnover is no evidence,
  // and the run must not report pages it cannot show it walked.
  const doc = page(
    `${SEARCH_BOX}<div id="search-results">${RESULT_ROW("1")}` +
      `<button type="button" rel="next"><span>Next</span></button></div>`,
  );
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 10,
    signal: { cancelled: false },
    probe: probeOf(new Set([rowId("1")])),
    wait: async () => {},
  });
  assert.equal(run.pagesWalked, 1);
  assert.match(run.pagerNote ?? "", /no page numbers/);
});

test("stops the run when there is no results panel to read", async () => {
  // The channel list is always on screen and always already captured. Settling
  // against it confirmed page after page that held no search results at all.
  const doc = page(
    `${SEARCH_BOX}<div id="channel">${CHANNEL_ROW("900")}</div>`,
  );
  const run = await runSearches(doc, ["CC101", "CC102"], {
    delayMs: 0,
    pages: 10,
    signal: { cancelled: false },
    probe: probeOf(new Set([rowId("900")])),
    wait: async () => {},
  });
  assert.equal(run.done, 1, "should not keep firing queries it cannot read");
  assert.equal(run.pagesWalked, 0);
  assert.equal(run.posts, 1);
  assert.match(run.stopped ?? "", /search results/);
});

test("never mistakes the channel list for the results panel", () => {
  const doc = page(
    `${SEARCH_BOX}<div id="channel">${CHANNEL_ROW("900")}</div>`,
  );
  assert.equal(resultsPanel(doc), null);
  assert.deepEqual(resultRows(doc), []);
});

test("finds search results that carry no chat-messages wrapper", () => {
  // The measured shape of a real results page: 48 message bodies on screen, only
  // the 22 in the channel list wrapped in chat-messages ids. Anchoring on that
  // wrapper made the other 26 invisible, and the panel walk-up climbed past them
  // into the channel list — which then confirmed every page.
  const doc = page(
    `${SEARCH_BOX}<div id="channel">${CHANNEL_ROW("900")}${CHANNEL_ROW("901")}</div>` +
      panel(["1", "2", "3"]),
  );
  assert.deepEqual(resultRows(doc).map(rowKey), [
    rowId("1"),
    rowId("2"),
    rowId("3"),
  ]);
  assert.equal(
    rowSignature(doc),
    "panel message-content-1 message-content-2 message-content-3",
  );
});

test("stops when the results render but none of them can be read", async () => {
  // Rows present, parser blind to all of them: the exact state that silently
  // walked forty pages and recorded nothing but the channel behind it.
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const run = await runSearches(doc, ["CC101", "CC102"], {
    delayMs: 0,
    pages: 10,
    signal: { cancelled: false },
    probe: {
      account: (rows) => ({
        recorded: 0,
        pending: 0,
        unreadable: rows.length,
      }),
      posts: () => 0,
    },
    wait: async () => {},
  });
  assert.equal(run.done, 1);
  assert.equal(run.pagesWalked, 0);
  assert.match(run.stopped ?? "", /rendered 2 posts but none could be read/);
});

test("counts unreadable rows apart from recorded ones", async () => {
  // Attachment-only posts never parse. They must not hold a page open, and they
  // must not be mistaken for posts that landed.
  const settled = await settlePage(page(SEARCH_BOX + panel(["1", "2", "3"])), {
    page: 1,
    before: "",
    probe: {
      account: () => ({ recorded: 2, pending: 0, unreadable: 1 }),
      posts: () => 2,
    },
    wait: async () => {},
  });
  assert.deepEqual(settled, {
    panel: true,
    rendered: 3,
    recorded: 2,
    unreadable: 1,
    outstanding: 0,
    settled: true,
    changed: true,
  });
});

// Discord's combobox dropdown: generic filter rows, and — once the client has
// actually registered a query — a row that runs it.
const FILTER_ROWS =
  '<div role="option">From a specific user</div>' +
  '<div role="option">Sent in a specific channel</div>';
const searchRow = (query: string) =>
  `<div role="option" id="run-it">Search for ${query}</div>`;

test("picks the row carrying the query, never a filter row", () => {
  const doc = page(SEARCH_BOX + FILTER_ROWS + searchRow("AA101"));
  assert.equal(findSubmitOption(doc, "AA101")?.id, "run-it");
  // Filter rows alone offer nothing to click: that is the stuck state Chrome
  // sits in, and clicking "From a specific user" would apply a filter instead.
  assert.equal(findSubmitOption(page(SEARCH_BOX + FILTER_ROWS), "AA101"), null);
});

test("clicks the Search-for row rather than relying on Enter", async () => {
  const doc = page(SEARCH_BOX + FILTER_ROWS + searchRow("AA101"));
  const box = findSearchBox(doc);
  assert.ok(box);
  const seen: string[] = [];
  for (const type of ["mousedown", "click", "keydown"])
    doc.addEventListener(type, (event) => {
      seen.push(`${type}:${(event.target as Element)?.id ?? ""}`);
    });
  assert.equal(await commitSearch(box, "AA101", now), "option");
  // Committed on the row, and Enter never fired — pressing it while the filter
  // list is open selects a filter.
  assert.ok(seen.includes("mousedown:run-it"), seen.join(" "));
  assert.ok(seen.includes("click:run-it"), seen.join(" "));
  assert.deepEqual(
    seen.filter((entry) => entry.startsWith("keydown")),
    [],
  );
});

test("falls back to Enter when no row ever appears", async () => {
  const doc = page(SEARCH_BOX + FILTER_ROWS);
  const box = findSearchBox(doc);
  assert.ok(box);
  const enters: number[] = [];
  box.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") enters.push(13);
  });
  box.focus();
  assert.equal(await commitSearch(box, "AA101", now), "enter");
  assert.deepEqual(enters, [13]);
});

test("says the query never ran when it had to fall back to Enter", async () => {
  // Enter plus results that never changed is the Chrome failure exactly, and it
  // must not be reported as rate-limiting.
  const doc = page(SEARCH_BOX + FILTER_ROWS + panel(["1", "2"]));
  const run = await runSearches(doc, ["AA101"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(new Set([rowId("1"), rowId("2")])),
    wait: async () => {},
    settlePollMs: 100,
  });
  // Fired three times before giving up: a query that draws no response is far
  // more often a misfire than a real answer.
  assert.deepEqual(run.submittedBy, { option: 0, enter: 3, blocked: 0 });
  assert.equal(run.retried, 2);
  assert.match(run.settleNote ?? "", /results never changed after 3 attempts/);
});

test("retries a query that draws no response, and recovers", async () => {
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const recorded = new Set<string>();
  let submits = 0;
  // Chrome's misfire: the first submit lands the text but the bar never opens,
  // so nothing runs. The retry clicks it open, retypes, and results arrive.
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    if (++submits < 2) return;
    list.innerHTML = ["1", "2"].map(RESULT_ROW).join("") + pager(1, 3);
    recorded.add(rowId("1"));
    recorded.add(rowId("2"));
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    pages: 1,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
  });
  assert.equal(run.retried, 1);
  assert.equal(run.posts, 2);
  // Recovered, so there is nothing to warn about...
  assert.equal(run.unchanged, 0);
  assert.equal(run.settleNote, null);
  // ...and a retry is the same query again, not an extra one.
  assert.equal(run.done, 1);
});

test("leaves the search bar alone until a query has misfired", async () => {
  // Clicking re-renders the bar, which detaches the field that was just found —
  // typing into that stale node inserts nothing and reads back as the
  // placeholder. So the first pass types into what it found, untouched.
  const doc = page(SEARCH_BOX);
  const box = findSearchBox(doc);
  assert.ok(box);
  const events: string[] = [];
  box.addEventListener("mousedown", () => events.push("open"));
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") events.push("submit");
  });
  await runSearches(doc, ["CC101"], {
    delayMs: 0,
    signal: { cancelled: false },
    wait: async () => {},
  });
  assert.deepEqual(events, ["submit"]);
});

test("clicks the bar open on the recovery pass, and re-finds the field", async () => {
  // No results panel: every attempt misfires, so every retry recovers.
  const doc = page(SEARCH_BOX);
  const box = findSearchBox(doc);
  assert.ok(box);
  let opens = 0;
  box.addEventListener("mousedown", () => {
    opens++;
  });
  const run = await runSearches(doc, ["CC101"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(new Set()),
    wait: async () => {},
  });
  assert.equal(run.retried, 2);
  assert.equal(opens, 2, "one open per recovery pass, none on the first");
});

test("an empty field reads as empty, not as its own placeholder", async () => {
  // Discord renders the placeholder inside the editable and it repeats the
  // field's accessible name, so a field that took no text reported back as
  // 'the search box shows: "Search tripleS"'.
  const doc = page(SEARCH_BOX);
  const box = findSearchBox(doc);
  assert.ok(box);
  box.textContent = "Search tripleS";
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: () => true,
  });
  const typed = await typeQuery(box, "CC101", now);
  assert.equal(typed.ok, false);
  assert.equal(typed.seen, "", "the placeholder is not content");
});

test("a query that matches nothing does not end the run", async () => {
  // Once any query has produced results the panel is known to work, so an empty
  // one is a code nobody posted. Ending there abandoned every query after the
  // first gap — a four-query run stopped on its second.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const recorded = new Set<string>();
  let submits = 0;
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    submits++;
    // First query hits, the rest match nothing at all.
    if (submits > 1) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = ["1", "2"].map(RESULT_ROW).join("");
    recorded.add(rowId("1"));
    recorded.add(rowId("2"));
  });
  const run = await runSearches(doc, ["CC101", "CC201", "AA101"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
    settlePollMs: 100,
  });
  assert.equal(run.stopped, null, "an empty result set is an answer");
  assert.equal(run.done, 3, "every query still ran");
  assert.equal(run.empty, 2);
  assert.equal(run.posts, 2);
});

test("still stops when no query ever finds a results panel", async () => {
  // Nothing has proved the panel works, so this really could be broken.
  const run = await runSearches(page(SEARCH_BOX), ["CC101", "CC201"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(new Set()),
    wait: async () => {},
  });
  assert.equal(run.done, 1);
  assert.equal(run.retried, 2);
  assert.match(run.stopped ?? "", /Could not find Discord's search results/);
});

/**
 * A stand-in for Slate: it owns the text, and paints the placeholder exactly
 * while its model is empty.
 *
 * `accepts` decides which insertions reach the model. Chrome accepts
 * `beforeinput` and silently drops `execCommand`, which still edits the markup —
 * so the markup and the model disagree, which is the entire bug.
 */
function fakeEditor(doc: Document, box: HTMLElement, accepts: string[]) {
  let model = "";
  const render = () => {
    box.innerHTML = model
      ? `<span data-slate-string="true">${model}</span>`
      : PLACEHOLDER;
  };
  const set = (value: string) => {
    model = value;
    render();
  };
  render();
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: (command: string, _ui: boolean, text: string) => {
      if (accepts.includes("insertText")) {
        set(command === "delete" ? "" : text);
        return true;
      }
      // Dropped by the editor, but the markup still changes — the state that
      // made every text-based check pass while nothing was searched.
      if (command === "delete") box.innerHTML = PLACEHOLDER;
      else box.insertAdjacentHTML("beforeend", `<span>${text}</span>`);
      return true;
    },
  });
  box.addEventListener("beforeinput", (event) => {
    if (!accepts.includes("beforeinput")) return;
    const input = event as InputEvent;
    set(input.inputType === "insertText" ? (input.data ?? "") : "");
  });
  return { model: () => model };
}

test("replaces the previous query in an editor that ignores execCommand", async () => {
  // Chrome. The first query worked because an empty field still shows its
  // placeholder, which caught the dropped insert. The second had no such
  // signal: the markup read back as the new code while the editor held the old
  // one, so a four-query run returned 231 posts all carrying the first code.
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  const editor = fakeEditor(doc, box, ["beforeinput"]);

  const first = await typeQuery(box, "CC101", now);
  assert.equal(first.ok, true);
  assert.equal(first.via, "beforeinput");
  assert.equal(editor.model(), "CC101");

  const second = await typeQuery(box, "CC201", now);
  assert.equal(second.ok, true);
  assert.equal(second.via, "beforeinput");
  assert.equal(editor.model(), "CC201", "the editor holds the new query");
});

test("takes the cheap path in an editor that accepts execCommand", async () => {
  // Firefox, where insertText reaches the model: nothing should escalate.
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  const editor = fakeEditor(doc, box, ["insertText"]);
  const typed = await typeQuery(box, "CC101", now);
  assert.equal(typed.via, "insertText");
  assert.deepEqual(typed.tried, ["insertText"]);
  assert.equal(editor.model(), "CC101");
});

test("refuses when no insertion reaches the editor at all", async () => {
  const doc = page();
  const box = findSearchBox(doc);
  assert.ok(box);
  const editor = fakeEditor(doc, box, []);
  const typed = await typeQuery(box, "CC101", now);
  assert.equal(typed.ok, false, "markup is not the editor");
  assert.equal(typed.via, null);
  assert.equal(editor.model(), "");
});

test("escalates the insertion until the results actually move", async () => {
  // The real verdict. Reading the field back cannot tell whether the editor
  // took the text — the markup can show CC201 while the model still holds
  // CC101 — so the run escalates on the only ground truth there is: whether
  // Discord's results changed. Here the first insertion is ignored by the
  // editor and the second is not.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const box = findSearchBox(doc);
  assert.ok(box);
  const recorded = new Set<string>();
  let served = 0;
  // Only beforeinput reaches the editor; execCommand edits the markup alone.
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    value: (command: string, _ui: boolean, text: string) => {
      box.innerHTML =
        command === "delete"
          ? PLACEHOLDER
          : `<span data-slate-string="true">${text}</span>`;
      return true;
    },
  });
  box.addEventListener("beforeinput", (event) => {
    const input = event as InputEvent;
    if (input.inputType !== "insertText" || !input.data) return;
    box.innerHTML = `<span data-slate-string="true">${input.data}</span>`;
    // The editor took it, so Discord answers with fresh results.
    served++;
    list.innerHTML = [`${served}1`, `${served}2`].map(RESULT_ROW).join("");
    recorded.add(rowId(`${served}1`));
    recorded.add(rowId(`${served}2`));
  });
  const run = await runSearches(doc, ["CC101", "CC201"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
    settlePollMs: 100,
  });
  assert.equal(run.stopped, null);
  assert.equal(run.done, 2);
  assert.equal(run.posts, 4, "both queries returned their own results");
  // One retry for the first query to find the working insertion; the second
  // query starts from it and needs none.
  assert.equal(run.retried, 1);
  assert.deepEqual(run.typedBy, { insertText: 1, beforeinput: 2 });
});

test("strips search operators out of a query", () => {
  // Discord's search has its own syntax, and a query is built from parsed user
  // input — a stray colon turns a search for an objekt into a filter.
  assert.equal(searchSafe('from:me "CC101"'), "from me CC101");
  assert.equal(searchSafe("CC101 -Mayu"), "CC101 Mayu");
  // Too short to discriminate anything: it would match most of the channel.
  assert.equal(searchSafe("#"), "");
  assert.equal(searchSafe("A"), "");
});

test("an empty results panel is an answer, not a missing panel", async () => {
  // Discord leaves the panel in place and empties it. Treating that as "no
  // panel" cost every unmatched code the full grace period and made it
  // indistinguishable from a panel that had been closed.
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  assert.equal(resultsPanel(doc)?.id, "search-results");
  assert.equal(rowSignature(doc), "panel ");
  assert.equal(resultRows(doc).length, 0);
});

test("does not re-fire a code that already came back empty", async () => {
  const doc = page(`${SEARCH_BOX}<div id="search-results"></div>`);
  const list = doc.getElementById("search-results");
  assert.ok(list);
  const recorded = new Set<string>();
  const submits: string[] = [];
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    const typed = (findSearchBox(doc)?.textContent ?? "").replace(/[​-‍﻿]/g, "");
    submits.push(typed);
    // The first code is posted about; the two after it are not, and Discord
    // answers those by leaving the panel exactly as it is.
    if (submits.length === 1) {
      list.innerHTML = RESULT_ROW("1");
      recorded.add(rowId("1"));
      return;
    }
    list.innerHTML = "";
  });
  const run = await runSearches(doc, ["CC101", "CC201", "AA101"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
    settlePollMs: 100,
  });
  assert.equal(run.stopped, null);
  assert.equal(run.done, 3);
  assert.equal(run.empty, 2, "both unmatched codes read as answered");
  assert.equal(run.unchanged, 0, "and neither reads as a stall");
  assert.deepEqual(submits, ["CC101", "CC201", "AA101"], "one submit each");
});

test("gives up rather than typing into a client that stopped answering", async () => {
  // The shape a rate limit takes: the results stay exactly as they are, however
  // many times the query is fired. Retrying that forever is how an account gets
  // noticed.
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const recorded = new Set([rowId("1"), rowId("2")]);
  let submits = 0;
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") submits++;
  });
  const waits: number[] = [];
  const run = await runSearches(doc, ["CC1", "CC2", "CC3", "CC4", "CC5"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async (ms) => {
      waits.push(ms);
    },
    settlePollMs: 100,
    attempts: 2,
    backoffMs: 500,
  });
  assert.match(run.stopped ?? "", /rate-limited/);
  assert.equal(run.done, 3, "stops after the third stalled query, not the 5th");
  assert.equal(submits, 6, "two attempts each, then it stops");
  // And it backed off between attempts rather than firing straight back.
  assert.ok(
    waits.includes(500),
    `expected a backoff pause, got ${waits.join(",")}`,
  );
});

test("a run stops the moment it is cancelled, not when the budget runs out", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const signal = { cancelled: false };
  // Nothing is ever recorded, so the settle would otherwise wait out its whole
  // budget on this page.
  const probe = probeOf(new Set<string>());
  let polls = 0;
  const run = await runSearches(doc, ["CC1"], {
    delayMs: 0,
    signal,
    probe,
    wait: async () => {
      polls++;
      if (polls === 3) signal.cancelled = true;
    },
    settlePollMs: 100,
    settleBudgetMs: 60_000,
  });
  assert.equal(run.stopped, "Cancelled.");
  assert.ok(polls < 40, `settle kept polling after cancel: ${polls}`);
});

test("a results panel closed mid-run ends the query, not the run", async () => {
  const doc = page(SEARCH_BOX + panel(["1", "2"]));
  const recorded = new Set([rowId("1"), rowId("2")]);
  let submits = 0;
  doc.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    submits++;
    // The user clicks a result, which closes the panel; the next query types
    // into the bar again and brings it back.
    const list = doc.getElementById("search-results");
    if (submits === 2) list?.remove();
    else if (!list) doc.body.insertAdjacentHTML("beforeend", panel(["3", "4"]));
  });
  for (const id of ["3", "4"]) recorded.add(rowId(id));
  const run = await runSearches(doc, ["CC1", "CC2", "CC3"], {
    delayMs: 0,
    signal: { cancelled: false },
    probe: probeOf(recorded),
    wait: async () => {},
    settlePollMs: 100,
  });
  assert.equal(run.stopped, null, "the run carries on");
  assert.equal(run.closed, 1);
  assert.match(run.pagerNote ?? "", /results closed/);
});

test("reads the pager in a client whose labels are not in English", () => {
  // aria-current is the same everywhere; "Page 2" is not, and neither is the
  // word in front of the number.
  const doc = page(
    '<div id="search-results"><div class="pager">' +
      '<div role="button" aria-label="Seite 1" aria-current="page">1</div>' +
      '<div role="button" aria-label="Seite 2">2</div>' +
      "</div></div>",
  );
  assert.equal(currentPage(doc), 1);
  assert.equal(findNextPage(doc)?.textContent, "2");
});

test("reads the pager from the button's own text when the label is gone", () => {
  const doc = page(
    '<div id="search-results"><div class="pager">' +
      '<div role="button" aria-current="page">3</div>' +
      '<div role="button">4</div>' +
      "</div></div>",
  );
  assert.equal(currentPage(doc), 3);
  assert.equal(findNextPage(doc)?.textContent, "4");
});

test("a pager it cannot read is reported as no pager, not as page one", () => {
  // Guessing a page number is worse than admitting there is none: the run
  // counts a page as walked only when the pager confirms it moved.
  const doc = page(
    '<div id="search-results"><div class="pager">' +
      '<div role="button" aria-current="page">page one of many</div>' +
      "</div></div>",
  );
  assert.equal(currentPage(doc), null);
  assert.equal(findNextPage(doc), null);
});
