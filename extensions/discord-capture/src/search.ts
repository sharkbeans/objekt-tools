// Drives Discord's own search box, one objekt at a time.
//
// The extension never calls Discord's API. It types into the search field and
// lets Discord's client issue the request, which keeps the user's token out of
// this code entirely and leaves pacing and backoff to the client that owns
// them. Results render into the message list, where the existing capture
// observer picks them up — so nothing here needs to read or store results.
//
// One page per query is deliberate. Measured over a real 30-day window, a
// median objekt is mentioned by only ~31 distinct traders and a popular one
// surfaces plenty on the first page, so paging deeper mostly re-fetches bumps
// that dedupe away.

import { parseOffering } from "@/lib/discord/match";
import { formatSeasonNumberLabel } from "@/lib/objekt-label";
import { resultBodies, rowOf } from "./dom";

/**
 * One query per collection code ("CC101"), without the member name.
 *
 * Including the member floods the results: measured over a real channel day,
 * a member name appears in ~442 of 1,362 posts against ~75 for a collection
 * code — roughly 6x more noise for a token that does no filtering. Discord
 * returns loose term matches rather than the phrase, so a 25-result page spent
 * on "SeoYeon" is mostly posts that merely mention her. The code is the
 * discriminating token, and the parser already knows which member each hit
 * belongs to, so precision is not lost by leaving the name out.
 *
 * Dropping the member also collapses queries: wanting SeoYeon CC101 and Mayu
 * CC101 is one search, not two.
 */
export function searchQueries(text: string): string[] {
  const queries = new Set<string>();
  for (const item of parseOffering(text)) {
    if (!item.collectionNo) continue;
    // Strips a trailing variant letter, so CC101Z searches as CC101.
    const query = formatSeasonNumberLabel({
      ...item,
      collectionId: "",
    }).trim();
    const safe = searchSafe(query);
    if (safe) queries.add(safe);
  }
  return [...queries];
}

/**
 * A query Discord will read as words rather than as instructions.
 *
 * Discord's search has its own syntax — `from:`, `in:`, `has:`, `before:`,
 * quoting, `-` for exclusion — and a query is built from parsed user input, so
 * a colon or a quote reaching it turns a search for an objekt into a filter
 * nobody asked for. Letters, digits and single spaces are all a collection
 * code needs. Anything under two characters is dropped: it matches most of the
 * channel and finds nothing useful.
 */
export function searchSafe(query: string): string {
  const clean = query
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 2 ? clean : "";
}

/**
 * Discord's search field is a Slate `contenteditable`, not an input.
 *
 * The message composer is *also* a contenteditable div in the same document, so
 * this has to be exact: typing into the wrong one and pressing Enter would post
 * to the channel. Two independent guards, both required — the composer is
 * `role="textbox"` while search is `role="combobox"`, and search is the only one
 * whose accessible name begins with "Search". Generated class names
 * (`searchBar_c322aa`) are deliberately not used; they churn every release.
 */
const SEARCH_BOX_SELECTOR = '[role="combobox"][contenteditable="true"]';
const SEARCH_LABEL = /^\s*search\b/i;

export function findSearchBox(doc: Document): HTMLElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  for (const candidate of doc.querySelectorAll(SEARCH_BOX_SELECTOR)) {
    if (!(candidate instanceof view.HTMLElement)) continue;
    // Fail closed: no accessible name, no typing.
    if (!SEARCH_LABEL.test(candidate.getAttribute("aria-label") ?? ""))
      continue;
    return candidate;
  }
  return null;
}

/**
 * Replace the search field's contents with `query`.
 *
 * Slate keeps its own document model and ignores direct DOM edits, so the text
 * has to arrive as a real editing operation. `execCommand("insertText")` is
 * deprecated but is what still produces the `beforeinput`/`input` pair Slate
 * listens for; assigning `textContent` is silently discarded on the next
 * render. Existing content is selected first so each query replaces the last
 * rather than appending to it.
 *
 * Returns false when the text did not land, which is the signal that Discord's
 * editor changed and the run must stop.
 */
/**
 * Slate renders text into nested spans padded with zero-width placeholders, so
 * the field's textContent is never byte-identical to what was typed. Compare on
 * visible characters only.
 */
function normalize(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What the field actually holds, with the placeholder discounted.
 *
 * Discord renders the placeholder inside the editable, so a field that took no
 * text at all still reads back as "Search tripleS" — which reported as "the
 * editor rewrote the query" when the truth was that nothing was inserted. The
 * placeholder repeats the field's own accessible name, which is what makes it
 * recognisable without knowing Slate's markup.
 */
function fieldText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll(
    '[data-slate-placeholder="true"], [aria-hidden="true"], [contenteditable="false"]',
  ))
    hidden.remove();
  let text = normalize(clone.textContent ?? "");
  const label = normalize(element.getAttribute("aria-label") ?? "");
  // Measured in Chrome: inserted text lands *after* the placeholder rather than
  // replacing it, giving "Search tripleSAA101". Strip it by name as well as by
  // markup, so this does not depend on which attribute marks it.
  if (label && text.startsWith(label)) text = text.slice(label.length).trim();
  return label && text === label ? "" : text;
}

/**
 * Whether the editor still considers itself empty.
 *
 * Slate paints its placeholder only while its own model has no content, so a
 * field showing both the placeholder and the typed characters means the
 * characters reached the DOM and the editor never received them. That is the
 * whole Chrome failure: the text is visible, so every check based on reading it
 * back passed, while Discord went on believing nothing had been typed and
 * offered nothing to submit.
 */
function placeholderShowing(element: HTMLElement): boolean {
  const label = normalize(element.getAttribute("aria-label") ?? "");
  return label !== "" && normalize(element.textContent ?? "").includes(label);
}

/** Ways to empty a Slate editor, cheapest first — mirroring the insertions. */
const CLEARANCES: { name: string; run: (element: HTMLElement) => boolean }[] = [
  {
    name: "delete",
    run: (element) => {
      if (!selectAll(element)) return false;
      element.ownerDocument.execCommand("delete");
      return true;
    },
  },
  {
    name: "beforeinput",
    run: (element) => {
      const view = element.ownerDocument.defaultView;
      if (!view || !("InputEvent" in view)) return false;
      if (!selectAll(element)) return false;
      element.dispatchEvent(
        new view.InputEvent("beforeinput", {
          inputType: "deleteContentBackward",
          bubbles: true,
          cancelable: true,
        }),
      );
      return true;
    },
  },
  {
    name: "beforeinput-empty",
    run: (element) => {
      const view = element.ownerDocument.defaultView;
      if (!view || !("InputEvent" in view)) return false;
      if (!selectAll(element)) return false;
      element.dispatchEvent(
        new view.InputEvent("beforeinput", {
          inputType: "insertText",
          data: "",
          bubbles: true,
          cancelable: true,
        }),
      );
      return true;
    },
  },
];

/**
 * The text is in the editor, is all that is in it, and nothing else.
 *
 * Equality rather than "contains": the second query of a run types into a field
 * that already holds the first, and an insertion that appends instead of
 * replacing leaves "CC101CC201" — which contains the new query and would pass a
 * looser check while Discord keeps answering the old one. That is exactly what
 * happened in Chrome, where every post a four-query run captured came back
 * carrying the *first* code.
 */
function accepted(element: HTMLElement, query: string): boolean {
  // One-way. A placeholder still showing proves the editor's model is empty, so
  // this insertion certainly failed. Its absence proves nothing: the model can
  // hold the *previous* query while the markup shows this one. The real verdict
  // is whether the results change, and that is decided back in the run.
  return (
    !placeholderShowing(element) && fieldText(element) === normalize(query)
  );
}

/**
 * Ways to get text into a Slate editor, cheapest first.
 *
 * `insertText` is what Firefox accepts and what Chrome quietly drops. The
 * others hand Slate the event a real keystroke or paste would have produced,
 * rather than relying on it noticing a DOM change it never asked for.
 */
const INSERTIONS: {
  name: string;
  run: (element: HTMLElement, query: string) => boolean;
}[] = [
  {
    name: "insertText",
    run: (element, query) => {
      if (!selectAll(element)) return false;
      element.ownerDocument.execCommand("insertText", false, query);
      return true;
    },
  },
  {
    name: "beforeinput",
    run: (element, query) => {
      const view = element.ownerDocument.defaultView;
      if (!view || !("InputEvent" in view)) return false;
      if (!selectAll(element)) return false;
      element.dispatchEvent(
        new view.InputEvent("beforeinput", {
          inputType: "insertText",
          data: query,
          bubbles: true,
          cancelable: true,
        }),
      );
      return true;
    },
  },
  {
    name: "paste",
    run: (element, query) => {
      const view = element.ownerDocument.defaultView;
      if (!view || !("ClipboardEvent" in view) || !("DataTransfer" in view))
        return false;
      if (!selectAll(element)) return false;
      const data = new view.DataTransfer();
      data.setData("text/plain", query);
      element.dispatchEvent(
        new view.ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
      return true;
    },
  },
];

/**
 * Whether the commands about to run are actually pointed at the search box.
 *
 * `execCommand` and the synthetic input events act on the document's selection,
 * not on the element they were handed. An insertion attempted while something
 * else holds focus therefore types the query into that something else — and in
 * this document the other contenteditable is the message composer. It fails
 * quietly: the search box reads back empty, the attempt is recorded as refused
 * and retried, and what it leaves behind is an objekt code sitting in the
 * message box of a public channel, one Enter away from being posted.
 *
 * So every insertion, every clearance and the Enter itself are conditional on
 * this. Refusing to type is always the safe failure.
 */
function holdsFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const active = element.ownerDocument.activeElement;
  return active === element || (active !== null && element.contains(active));
}

/**
 * Focus the field and select what is in it, reporting whether focus took.
 *
 * False means the caller must not touch the selection: the field is detached,
 * or the browser refused it focus, and whatever is focused instead is not
 * something this extension is allowed to type into.
 */
function selectAll(element: HTMLElement): boolean {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view || !element.isConnected) return false;
  element.focus();
  if (!holdsFocus(element)) return false;
  const selection = view.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export async function typeQuery(
  element: HTMLElement,
  query: string,
  wait: (ms: number) => Promise<void>,
  /** Skip insertions the run already knows this browser drops. */
  from = 0,
): Promise<{
  ok: boolean;
  seen: string;
  via: string | null;
  index: number;
  tried: string[];
  /** True when nothing was typed because the field never held focus. */
  unfocused: boolean;
}> {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view)
    return {
      ok: false,
      seen: "",
      via: null,
      index: -1,
      tried: [],
      unfocused: false,
    };
  const tried: string[] = [];
  let unfocused = false;
  // Start where the caller asks and wrap around, so every insertion still gets
  // a turn. Skipping the earlier ones outright meant a late attempt could be
  // left with only a method this browser does not implement, and fail without
  // ever retrying one that works.
  for (let step = 0; step < INSERTIONS.length; step++) {
    const index = (Math.max(0, from) + step) % INSERTIONS.length;
    const insertion = INSERTIONS[index];
    element.focus();
    // Nothing is typed at a field that does not hold focus, because the
    // commands would land wherever focus actually is.
    if (!holdsFocus(element)) {
      unfocused = true;
      await wait(50);
      continue;
    }
    // Best-effort clear, so the insertion replaces rather than appends. Not
    // verified: some states never repaint the placeholder, and there is no
    // other way to ask the editor what its model holds.
    try {
      CLEARANCES[Math.min(index, CLEARANCES.length - 1)].run(element);
    } catch {
      /* Nothing to undo; the insertion below selects everything anyway. */
    }
    await wait(50);
    try {
      if (!insertion.run(element, query)) {
        unfocused = unfocused || !holdsFocus(element);
        continue;
      }
    } catch {
      continue;
    }
    tried.push(insertion.name);
    // Slate commits through React, so the DOM is not updated synchronously —
    // reading straight after sees the pre-render state.
    for (let attempt = 0; attempt < 12; attempt++) {
      if (accepted(element, query))
        return {
          ok: true,
          seen: fieldText(element),
          via: insertion.name,
          index,
          tried,
          unfocused: false,
        };
      await wait(50);
    }
  }
  return {
    ok: false,
    seen: fieldText(element),
    via: null,
    index: -1,
    tried,
    unfocused,
  };
}

/**
 * Discord's "Search for <query>" row.
 *
 * Chrome takes the inserted text but never processes it as a query: the
 * combobox stays on its generic filter list ("From a specific user", "Sent in a
 * specific channel") and a synthetic Enter does nothing at all. The row that
 * actually runs the search is the only option carrying the query itself — the
 * filter rows never do — which also means this does not depend on the client's
 * language.
 */
export function findSubmitOption(
  doc: Document,
  query: string,
): HTMLElement | null {
  const view = doc.defaultView;
  const wanted = normalize(query).toLowerCase();
  if (!view || !wanted) return null;
  for (const option of doc.querySelectorAll('[role="option"]')) {
    if (!(option instanceof view.HTMLElement)) continue;
    const label = normalize(option.textContent ?? "").toLowerCase();
    if (label.includes(wanted)) return option;
  }
  return null;
}

/**
 * Click the way a person does.
 *
 * Discord commits several of its menus on pointerdown/mousedown rather than
 * click, so a bare `click()` selects nothing.
 */
function clickLike(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  // Opening the bar replaces the field, so a reference held across it can be
  // detached — and firing pointer events at a detached node achieves nothing
  // at best.
  if (!view || !element.isConnected) return;
  for (const type of ["mousedown", "mouseup", "click"])
    element.dispatchEvent(
      new view.MouseEvent(type, { bubbles: true, cancelable: true, view }),
    );
}

async function waitForOption(
  element: HTMLElement,
  query: string,
  wait: (ms: number) => Promise<void>,
  attempts: number,
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const option = findSubmitOption(element.ownerDocument, query);
    if (option) return option;
    await wait(50);
  }
  return null;
}

/**
 * Put the search bar into the state a person's click leaves it in.
 *
 * Typing into a combobox nobody opened lands the text without opening the
 * popup — the query ends up drawn over the placeholder and no "Search for …"
 * row is ever offered. That is the stuck state a second Chrome run falls into,
 * and clicking first is what a person does without thinking about it.
 */
async function openSearch(
  element: HTMLElement,
  wait: (ms: number) => Promise<void>,
): Promise<boolean> {
  const open = () => element.getAttribute("aria-expanded") === "true";
  if (open()) return true;
  clickLike(element);
  element.focus();
  // Short: measured on Chrome, the click opens nothing this can observe, so
  // there is no point waiting long for a signal that never arrives.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (open()) return true;
    await wait(50);
  }
  return false;
}

/** Empty the field, so a retry types into a clean box rather than onto a stale one. */
async function clearSearch(
  element: HTMLElement,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  selectAll(element);
  try {
    element.ownerDocument.execCommand("delete");
  } catch {
    return;
  }
  await wait(50);
}

/** How the query was finally handed to Discord, or that it never was. */
export type SubmitPath = "option" | "enter" | "blocked";

/**
 * Hand the query to Discord: its own "Search for …" row when there is one,
 * Enter otherwise.
 *
 * Measured on a real client, there is no `role="option"` anywhere at any point,
 * so this is Enter in practice — but the row costs one short poll to look for
 * and clicking it is the more honest action when it exists.
 */
export async function commitSearch(
  element: HTMLElement,
  query: string,
  wait: (ms: number) => Promise<void>,
): Promise<SubmitPath> {
  const option = await waitForOption(element, query, wait, 12);
  if (option) {
    clickLike(option);
    return "option";
  }
  return submitSearch(element) ? "enter" : "blocked";
}

/**
 * Press Enter at the search box.
 *
 * Guarded on focus like the insertions: Discord listens for keys at the
 * document too, and an Enter that bubbles up from a field nobody is typing in
 * is not something to fire at a chat client on spec. Returns false when it
 * declined.
 */
export function submitSearch(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !holdsFocus(element)) return false;
  // keydown alone is usually enough for React, but some handlers still read the
  // legacy numeric codes, which a constructed KeyboardEvent leaves at 0.
  for (const type of ["keydown", "keyup"]) {
    const event = new view.KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "keyCode", { get: () => 13 });
    Object.defineProperty(event, "which", { get: () => 13 });
    element.dispatchEvent(event);
  }
  return true;
}

/**
 * Discord's search pager.
 *
 * The Next control is a plain `<button rel="next">` with no accessible name —
 * only an icon and the word "Next" inside — so it has to be found by `rel`,
 * not by label. It gains `disabled` at the last page. The numbered buttons are
 * `role="button"` divs labelled "Page N", with `aria-current="page"` marking
 * the active one; they are the fallback and also the only way to tell whether
 * a click actually advanced anything. Generated class names are avoided
 * throughout — `pageButton_c15210` changes every release.
 */
const NEXT_PAGE_SELECTORS = [
  'button[rel="next"]',
  '[aria-label="Next Page"]',
  'button[aria-label*="next" i]',
];

/** The page Discord marks as current, or null when there is no pager. */
export function currentPage(doc: Document): number | null {
  const active = doc.querySelector(
    '[aria-current="page"][aria-label^="Page "]',
  );
  const label = active?.getAttribute("aria-label") ?? "";
  const page = Number(label.replace(/^Page\s+/, ""));
  return Number.isFinite(page) && page > 0 ? page : null;
}

export function findNextPage(doc: Document): HTMLElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  for (const selector of NEXT_PAGE_SELECTORS) {
    const found = doc.querySelector(selector);
    if (!(found instanceof view.HTMLElement)) continue;
    // Disabled means the last page, not a target worth clicking.
    if (found.hasAttribute("disabled")) continue;
    if (found.getAttribute("aria-disabled") === "true") continue;
    return found;
  }
  // Fall back to the numbered buttons if the Next control ever changes shape.
  const page = currentPage(doc);
  if (page === null) return null;
  const numbered = doc.querySelector(`[aria-label="Page ${page + 1}"]`);
  return numbered instanceof view.HTMLElement ? numbered : null;
}

/**
 * The results panel, so a settle watches the page being paged and nothing else.
 *
 * The open channel's message list sits in the same document and keeps taking
 * new posts while a run is going; counting those as "not finished yet" would
 * stall every page on a busy trade channel. Anchors are the panel's own id and
 * label first, then the pager — which only ever renders inside the panel — so
 * no generated class names are relied on here either.
 */
const RESULTS_SELECTORS = [
  "#search-results",
  '[aria-label="Search Results" i]',
];
const PAGER_SELECTOR =
  '[aria-label^="Page "], button[rel="next"], button[rel="prev"]';

export function resultsPanel(doc: Document): Element | null {
  // The precise anchors identify the panel on their own, so an empty one still
  // counts: "Discord answered, and nothing matched" is an answer, and it used
  // to be indistinguishable from "Discord never answered" — which cost every
  // unmatched code the full grace period, and made a closed panel look like an
  // empty result.
  for (const selector of RESULTS_SELECTORS) {
    const found = doc.querySelector(selector);
    if (found) return found;
  }
  for (
    let node = doc.querySelector(PAGER_SELECTOR)?.parentElement ?? null;
    node;
    node = node.parentElement
  )
    // Must hold *result* bodies, not just any message. Walking up looking for
    // the channel list's own markup is what made this return a container of 22
    // channel rows and zero results, and every page confirm against it.
    if (resultBodies(node).length) return node;
  return null;
}

/**
 * Message rows in the results panel. Empty when there is no panel.
 *
 * Deliberately not falling back to the document: the open channel's message
 * list is always there and always already captured, so a run that settled
 * against it would confirm page after page without ever reading a result. That
 * is not a hypothetical — it is what a whole index of captures turned out to
 * be, every batch an unbroken stretch of the live channel and not one post from
 * a results page.
 */
export function resultRows(doc: Document): Element[] {
  const panel = resultsPanel(doc);
  return panel ? resultBodies(panel).map(rowOf) : [];
}

/**
 * Identity of what is on screen now, used to tell new results from stale ones.
 *
 * Keyed on the body ids rather than the rows': a result row carries no id of
 * its own, so row ids would sign every page as the same empty string.
 */
export function rowSignature(doc: Document): string {
  const panel = resultsPanel(doc);
  if (!panel) return "";
  // The prefix is what makes an empty panel differ from no panel at all, so a
  // query that matched nothing still reads as the results having turned over.
  return `panel ${resultBodies(panel)
    .map((body) => body.id)
    .join(" ")}`;
}

/**
 * Nudge the results scroller down one viewport, reporting whether it is at the
 * bottom.
 *
 * Discord fills the results list lazily, so a page that is never scrolled hands
 * back only the rows that happened to fit. Reaching the bottom is part of
 * "captured everything on this page" — without it the run would confirm a page
 * it had only seen the top of. jsdom reports every dimension as 0, which reads
 * as "already at the bottom", so tests are unaffected.
 */
function scrollResults(doc: Document): boolean {
  const panel = resultsPanel(doc);
  const view = doc.defaultView;
  if (!panel || !view) return true;
  for (const node of [panel, ...panel.querySelectorAll("*")]) {
    if (!(node instanceof view.HTMLElement)) continue;
    if (node.scrollHeight <= node.clientHeight + 1) continue;
    // A scrollable embed or code block inside one result is not the list.
    if (!resultBodies(node).length) continue;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1)
      return true;
    node.scrollTop = Math.min(
      node.scrollHeight,
      node.scrollTop + node.clientHeight,
    );
    return false;
  }
  return true;
}

/**
 * How the run asks the capture pipeline whether a page is fully recorded.
 *
 * Capture lives in the content script (observer, worker, IndexedDB) and the
 * search driver is a pure DOM module, so the two meet here rather than by
 * importing each other.
 */
/** What became of the rows on one results page. */
export interface RowAccounting {
  /** Recorded in the index. */
  recorded: number;
  /** Not recorded yet, and still worth waiting for. */
  pending: number;
  /**
   * Rendered but unreadable by the parser.
   *
   * Counted separately rather than folded into "done", because a page where
   * every row is unreadable and one where every row is stored both leave
   * nothing pending — and they mean opposite things.
   */
  unreadable: number;
}

export interface CaptureProbe {
  /**
   * Account for these rows. Polled, so the implementation can also re-kick
   * anything the capture observer never saw — a row that renders without
   * mutating a subtree the observer is watching would otherwise sit unrecorded
   * and unnoticed.
   */
  account: (rows: readonly Element[]) => RowAccounting;
  /** Posts recorded so far in this run, for the popup's running total. */
  posts: () => number;
}

export interface PageSettle {
  /**
   * Whether a results panel was found. False means the run confirmed nothing,
   * however clean the other numbers look.
   */
  panel: boolean;
  /** Rows rendered in the results panel when the wait ended. */
  rendered: number;
  /** Of those, how many reached the index. */
  recorded: number;
  /** Of those, how many the parser could not read at all. */
  unreadable: number;
  /** Rows still unconfirmed when the wait ended. Zero on a clean settle. */
  outstanding: number;
  /** False when the budget ran out with rows still unrecorded. */
  settled: boolean;
  /**
   * Whether the rows ever turned over. False means Discord answered with the
   * same list it was already showing — the shape a rate-limited search takes.
   */
  changed: boolean;
}

export interface SettleOptions {
  /** Pager page being waited for, or null when the results have no pager. */
  page: number | null;
  /** Row signature from before the query or click. */
  before: string;
  probe: CaptureProbe;
  wait: (ms: number) => Promise<void>;
  /** Checked every poll, so Stop is not held up by the settle budget. */
  signal?: { cancelled: boolean };
  pollMs?: number;
  budgetMs?: number;
  /** How long to wait for the rows to turn over before accepting them as-is. */
  graceMs?: number;
}

/**
 * Block until every post rendered for this result page has been recorded.
 *
 * This is what replaces guessing with a fixed delay. Three things have to hold
 * together, twice in a row, before the page counts as done: the pager is on the
 * page that was asked for, the results scroller is at the bottom, and the
 * capture pipeline has no rows left outstanding.
 */
export async function settlePage(
  doc: Document,
  options: SettleOptions,
): Promise<PageSettle> {
  const pollMs = Math.max(1, options.pollMs ?? 150);
  const budgetMs = options.budgetMs ?? 15_000;
  const graceMs = options.graceMs ?? 2_500;
  let waited = 0;
  let quiet = 0;
  let last: string | null = null;
  let changed = false;
  for (;;) {
    const bottom = scrollResults(doc);
    const panel = resultsPanel(doc) !== null;
    const rows = resultRows(doc);
    const signature = rowSignature(doc);
    const account = options.probe.account(rows);
    const outstanding = account.pending;
    if (signature !== options.before) changed = true;
    const here = currentPage(doc);
    // The previous page's rows survive the click for a frame or two, and every
    // one of them is already stored — settling on those would fire Next again
    // against results nothing had re-read.
    const arrived =
      options.page === null || here === null || here === options.page;
    const still =
      panel && arrived && bottom && outstanding === 0 && signature === last;
    quiet = still ? quiet + 1 : 0;
    last = signature;
    // Two quiet polls once the rows have visibly turned over. When they have
    // not — a code nobody has posted returns the same empty panel twice — sit
    // out the grace period rather than the whole budget before accepting it.
    const need = changed ? 2 : Math.max(2, Math.ceil(graceMs / pollMs));
    const done = quiet >= need;
    // Stop means stop: waiting out a fifteen-second budget first is how a
    // cancel button earns a reputation for not working.
    if (done || waited >= budgetMs || options.signal?.cancelled)
      return {
        panel,
        rendered: rows.length,
        recorded: account.recorded,
        unreadable: account.unreadable,
        outstanding,
        settled: done,
        changed,
      };
    await options.wait(pollMs);
    waited += pollMs;
  }
}

export interface SearchProgress {
  done: number;
  total: number;
  query: string;
  /** Result pages captured for the query in flight. */
  page?: number;
  /** Posts recorded so far in this run. Resets when a new run starts. */
  posts?: number;
}

export interface SearchRun {
  /** Queries actually submitted before finishing or stopping. */
  done: number;
  /** Null when every query was submitted; otherwise why it stopped. */
  stopped: string | null;
  /**
   * Result pages actually walked, summed across queries. Reported because a
   * pager that silently refuses to advance is otherwise indistinguishable from
   * one that worked — both just capture page one.
   */
  pagesWalked: number;
  /** Why paging stopped short, when it did. */
  pagerNote: string | null;
  /** Posts recorded across the whole run. */
  posts: number;
  /** Pages abandoned with rows still unrecorded. */
  unsettled: number;
  /** Pages Discord answered with the list it was already showing. */
  unchanged: number;
  /** The first settle that went wrong, in words. */
  settleNote: string | null;
  /**
   * How each query reached Discord. Reported because the browsers differ here
   * and the difference is invisible otherwise: "enter" means neither the
   * "Search for …" row nor a retype worked, so the query very likely never ran.
   */
  submittedBy: Record<SubmitPath, number>;
  /** Queries fired again because the first attempt drew no response at all. */
  retried: number;
  /** Queries that ran and matched nothing. A normal outcome, not a failure. */
  empty: number;
  /** Times the results panel disappeared mid-query, which ends that query. */
  closed: number;
  /**
   * Which insertion the editor accepted, per query. The browsers differ here —
   * Chrome drops the one Firefox takes — so it is worth knowing which is
   * carrying a given run.
   */
  typedBy: Record<string, number>;
}

export interface SearchOptions {
  /**
   * Extra pause after a page is confirmed captured. Zero is the normal
   * setting: the settle gate already paces the run by the speed Discord
   * actually answers at. Raise it only to be gentler than that.
   */
  delayMs: number;
  /**
   * Result pages to walk per query. Discord returns thousands of hits across
   * hundreds of pages, but sorts newest first — and trade posts go stale in
   * days — so depth buys progressively less. Stops early when the pager runs
   * out or the control cannot be found.
   */
  pages?: number;
  /** Flipped by the popup's cancel button. Checked before every query. */
  signal: { cancelled: boolean };
  /**
   * Confirms each result page finished rendering and recording before the run
   * moves on. Without it the run falls back to pacing on `delayMs` alone.
   */
  probe?: CaptureProbe;
  settlePollMs?: number;
  settleBudgetMs?: number;
  /**
   * Times to fire a query that draws no response before moving on. Retrying is
   * safe: a query that did run just runs again.
   */
  attempts?: number;
  /**
   * First pause before re-firing a query that drew no response, doubled each
   * time.
   *
   * A query that got no answer is the shape a rate limit takes, and retrying
   * one immediately — three times, for every query — is the worst possible
   * response to being rate limited. Backing off costs nothing when the cause
   * was a one-off misfire.
   */
  backoffMs?: number;
  /**
   * Consecutive unanswered queries before the run gives up.
   *
   * Being refused three times in a row is not a run that will come good on the
   * fourth; it is a client that has stopped answering, and continuing to type
   * into it is how an account gets noticed.
   */
  stallLimit?: number;
  onProgress?: (progress: SearchProgress) => void;
  /**
   * Called for each query Discord actually answered.
   *
   * Lets the caller remember what has been searched recently, so re-running a
   * long want list does not search every code again from scratch.
   */
  onQuerySearched?: (query: string) => void;
  /** Injectable for tests. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Submit each query in turn, waiting for each result page to be fully recorded.
 *
 * Stops at the first sign the UI is not behaving — a missing search box, or a
 * query that would not stick — rather than continuing to fire into a page it no
 * longer understands.
 */
export async function runSearches(
  doc: Document,
  queries: readonly string[],
  options: SearchOptions,
): Promise<SearchRun> {
  const wait =
    options.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const probe = options.probe;
  let done = 0;
  let pagesWalked = 0;
  let unsettled = 0;
  let unchanged = 0;
  let retried = 0;
  let empty = 0;
  /** Whether any query has produced a results panel, which proves it works. */
  let sawPanel = false;
  /**
   * Whether any query has visibly moved the results.
   *
   * Until one has, an unchanged empty panel cannot be read as "nothing matched"
   * — it is equally likely that nothing was ever submitted, and calling that an
   * answer would report a completely broken run as a quiet one.
   */
  let sawChange = false;
  /** Consecutive queries answered with the list already on screen. */
  let stalled = 0;
  /** Result pages abandoned because the panel disappeared under the run. */
  let closed = 0;
  const typedBy: Record<string, number> = {};
  /** Insertion that last actually moved the results. Index into INSERTIONS. */
  let preferred = 0;
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoffMs = Math.max(0, options.backoffMs ?? 750);
  const stallLimit = Math.max(1, options.stallLimit ?? 3);
  /** Wait longer for each attempt, so a rate limit is given room to clear. */
  const backoff = (attempt: number) =>
    wait(Math.min(8_000, backoffMs * 2 ** (attempt - 1)));
  let pagerNote: string | null = null;
  let settleNote: string | null = null;
  const submittedBy: Record<SubmitPath, number> = {
    option: 0,
    enter: 0,
    blocked: 0,
  };
  const finish = (stopped: string | null): SearchRun => ({
    done,
    stopped,
    pagesWalked,
    pagerNote,
    posts: probe?.posts() ?? 0,
    unsettled,
    unchanged,
    settleNote,
    submittedBy,
    retried,
    empty,
    closed,
    typedBy,
  });
  const progress = (query: string, page: number) =>
    options.onProgress?.({
      done,
      total: queries.length,
      query,
      page,
      posts: probe?.posts() ?? 0,
    });

  /**
   * Hold until this page is recorded, then apply whatever extra pacing is set.
   *
   * Returns the reason to abandon the whole run, when there is one.
   */
  const settle = async (
    query: string,
    page: number,
    before: string,
  ): Promise<{
    blocked: string | null;
    /** Whether firing the query again could plausibly fix it. */
    retryable: boolean;
    result: PageSettle | null;
  }> => {
    let result: PageSettle | null = null;
    if (probe) {
      result = await settlePage(doc, {
        // Page one of a fresh query has no pager number to wait for yet: the
        // pager may still be showing the last query's page until it resets.
        page: page === 1 ? null : page,
        before,
        probe,
        wait,
        signal: options.signal,
        pollMs: options.settlePollMs,
        budgetMs: options.settleBudgetMs,
      });
      // A settle that ended because Stop was pressed has no verdict to give:
      // every count in it is a snapshot of a page that was still working.
      if (options.signal.cancelled)
        return { blocked: "Cancelled.", retryable: false, result };
      // A missing panel is left for the caller: it is a misfire on the first
      // query, a code nobody has posted on a later one, and simply the end of
      // the results while paging. Only the caller knows which.
      // Results rendered and the parser could read none of them. Firing the
      // same query again would render the same unreadable rows.
      if (result.rendered > 0 && result.recorded === 0)
        return {
          blocked: `Discord's search results rendered ${result.rendered} posts but none could be read — the results markup has changed. Open Troubleshooting and press “Check this tab”.`,
          retryable: false,
          result,
        };
      // "0 of 0 unrecorded" says nothing. A page with no panel is accounted
      // for by the caller, which knows whether that is a misfire or an answer.
      if (result.panel && !result.settled) {
        unsettled++;
        settleNote ??= `${query} page ${page}: gave up with ${result.outstanding} of ${result.rendered} posts unrecorded`;
      }
    }
    if (!probe || options.delayMs > 0) await wait(options.delayMs);
    return { blocked: null, retryable: false, result };
  };

  /**
   * Fire one query and wait for its first page, retrying when nothing answers.
   *
   * A query that leaves the results exactly as they were got no feedback at
   * all — on Chrome that is the search bar failing to open, so the text lands
   * on top of the placeholder and nothing is ever submitted. It is a misfire
   * rather than a real state, so it is worth simply doing again; the retry
   * clicks the bar open first and types a keystroke at a time.
   */
  const fire = async (query: string): Promise<string | null> => {
    for (let attempt = 1; ; attempt++) {
      if (options.signal.cancelled) return "Cancelled.";
      let box = findSearchBox(doc);
      if (!box) return "Could not find Discord's search box.";
      // Only the recovery pass touches the bar. Clicking it open re-renders
      // it, which detaches the field that was just found — typing into that
      // stale node inserts nothing and reads back as the placeholder, so the
      // element has to be looked up again afterwards.
      if (attempt > 1) {
        await openSearch(box, wait);
        box = findSearchBox(doc) ?? box;
        await clearSearch(box, wait);
      }
      const before = probe ? rowSignature(doc) : "";
      // Each retry escalates to the next insertion, because the only reliable
      // verdict on whether the editor took the text is whether Discord's
      // results actually changed — which is not knowable until after the
      // submit. Start from whatever last worked, so a browser that needs the
      // third method does not spend two attempts relearning that every query.
      const typed = await typeQuery(box, query, wait, preferred + attempt - 1);
      if (!typed.ok) {
        // Report what the field actually held: the difference between "nothing
        // was inserted" and "the editor rewrote it" needs different fixes.
        if (attempt >= attempts)
          return `Discord's search box would not take "${query}" after ${attempt} attempts (tried ${typed.tried.join(", ") || "nothing"}). The field shows: "${typed.seen}".`;
        retried++;
        continue;
      }
      if (typed.via) typedBy[typed.via] = (typedBy[typed.via] ?? 0) + 1;
      const usedInsertion = typed.index;
      const path = await commitSearch(box, query, wait);
      submittedBy[path]++;
      // Nothing was handed to Discord at all, so there is nothing to wait for.
      if (path === "blocked") {
        if (attempt >= attempts)
          return `Discord's search box lost focus before "${query}" could be submitted. Click into the Discord window and run again.`;
        retried++;
        await backoff(attempt);
        continue;
      }
      if (attempt === 1) done++;
      progress(query, 1);
      // Page one renders during this wait and is captured by the observer.
      const outcome = await settle(query, 1, before);
      if (outcome.blocked) {
        if (!outcome.retryable || attempt >= attempts) return outcome.blocked;
        retried++;
        await backoff(attempt);
        continue;
      }
      if (!outcome.result) return null;
      if (options.signal.cancelled) return "Cancelled.";
      if (!outcome.result.panel) {
        // The panel is gone, not empty — an empty one is still a panel now.
        // After a query has produced one, that means it was closed: the user
        // clicked a result, or pressed Escape. The next query types into the
        // bar again and brings it back, so this ends the query, not the run.
        if (sawPanel) {
          closed++;
          pagerNote ??=
            "the search results closed part-way through — leave the results panel open while a run is going";
          return null;
        }
        if (attempt >= attempts)
          return "Could not find Discord's search results. Nothing on the results pages was read — open Troubleshooting and press “Check this tab”.";
        retried++;
        await backoff(attempt);
        continue;
      }
      sawPanel = true;
      if (outcome.result.changed) {
        // The results moved, so this insertion really did reach the editor.
        preferred = usedInsertion;
        sawChange = true;
        stalled = 0;
        if (outcome.result.rendered === 0) empty++;
        return null;
      }
      // An empty panel that did not change is the previous empty answer still
      // on screen, which means this code is not posted either. Retrying it
      // three times finds the same nothing three times — but only once a query
      // in this run has visibly moved the results, because before that "the
      // panel never changed" is equally consistent with nothing being
      // submitted at all.
      if (outcome.result.rendered === 0 && sawChange) {
        empty++;
        stalled = 0;
        return null;
      }
      if (attempt >= attempts) {
        unchanged++;
        stalled++;
        settleNote ??= `${query}: the results never changed after ${attempt} attempts (typed via ${typed.via ?? "nothing"}). Either the editor is dropping every insertion this build knows, or Discord is rate-limiting — try adding a pause.`;
        return null;
      }
      retried++;
      await backoff(attempt);
    }
  };

  for (const query of queries) {
    const blocked = await fire(query);
    if (blocked) return finish(blocked);
    // Three queries in a row answered with the list already on screen is not a
    // run that recovers on the fourth. Something — a rate limit, or a Discord
    // change this build does not understand — has stopped it working, and
    // typing more into a client that is refusing to answer is exactly what
    // gets an account noticed.
    if (stalled >= stallLimit)
      return finish(
        `Discord stopped answering: ${stalled} searches in a row returned the results already on screen. That usually means search is rate-limited — wait a few minutes, then run again with a pace of a second or two.`,
      );
    options.onQuerySearched?.(query);
    pagesWalked++;

    const pages = Math.max(1, options.pages ?? 1);
    for (let page = 2; page <= pages; page++) {
      if (options.signal.cancelled) return finish("Cancelled.");
      const next = findNextPage(doc);
      // Fail soft: fewer results than requested pages is normal, and a missing
      // pager must not abandon the remaining queries.
      if (!next) {
        pagerNote ??= "no Next control found on the results pager";
        break;
      }
      const beforePage = currentPage(doc);
      const beforeRows = probe ? rowSignature(doc) : "";
      next.click();
      progress(query, page);
      const stopped = await settle(query, page, beforeRows);
      if (stopped.blocked) return finish(stopped.blocked);
      // The results ran out. That is the end of this query, not of the run —
      // killing it here is what stopped a four-query run halfway through its
      // second.
      if (stopped.result && !stopped.result.panel) {
        pagerNote ??= "the results ran out before the requested page count";
        break;
      }
      // Only the numbered buttons can confirm the click landed. Without them
      // there is no evidence a page was walked, and counting one anyway is how
      // a run that never left page one reported forty pages of progress.
      const nowPage = currentPage(doc);
      if (beforePage === null || nowPage === null) {
        pagerNote ??=
          "the results pager has no page numbers, so paging could not be confirmed";
        break;
      }
      if (nowPage === beforePage) {
        pagerNote ??= `clicking Next did not leave page ${beforePage}`;
        break;
      }
      pagesWalked++;
    }
  }
  return finish(null);
}
