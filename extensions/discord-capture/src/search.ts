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
    if (query) queries.add(query);
  }
  return [...queries];
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

export async function typeQuery(
  element: HTMLElement,
  query: string,
  wait: (ms: number) => Promise<void>,
): Promise<{ ok: boolean; seen: string }> {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (!view) return { ok: false, seen: "" };
  element.focus();
  const selection = view.getSelection();
  if (selection) {
    const range = doc.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  try {
    doc.execCommand("insertText", false, query);
  } catch {
    return { ok: false, seen: normalize(element.textContent ?? "") };
  }
  // Slate commits through React, so the DOM is not updated synchronously —
  // reading straight after the command sees the pre-render text. Poll briefly
  // rather than assuming either timing.
  let seen = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    seen = normalize(element.textContent ?? "");
    if (seen.includes(normalize(query))) return { ok: true, seen };
    await wait(50);
  }
  return { ok: false, seen };
}

export function submitSearch(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
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

export interface SearchProgress {
  done: number;
  total: number;
  query: string;
  /** Result pages captured for the query in flight. */
  page?: number;
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
}

export interface SearchOptions {
  /** Gap between queries. Also the window results have to render and capture. */
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
  onProgress?: (progress: SearchProgress) => void;
  /** Injectable for tests. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Submit each query in turn, pausing between them.
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
  let done = 0;
  let pagesWalked = 0;
  let pagerNote: string | null = null;
  const finish = (stopped: string | null): SearchRun => ({
    done,
    stopped,
    pagesWalked,
    pagerNote,
  });
  for (const query of queries) {
    if (options.signal.cancelled) return finish("Cancelled.");
    const box = findSearchBox(doc);
    if (!box) return finish("Could not find Discord's search box.");
    const typed = await typeQuery(box, query, wait);
    if (!typed.ok)
      // Report what the field actually held: the difference between "nothing
      // was inserted" and "the editor rewrote it" needs different fixes.
      return finish(
        `Discord did not accept "${query}". The search box shows: "${typed.seen}"`,
      );
    submitSearch(box);
    done++;
    options.onProgress?.({ done, total: queries.length, query, page: 1 });
    // Page one renders during this wait and is captured by the observer.
    await wait(options.delayMs);
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
      const before = currentPage(doc);
      next.click();
      options.onProgress?.({ done, total: queries.length, query, page });
      await wait(options.delayMs);
      // If the pager did not move, clicking again will not help either — stop
      // rather than re-capturing page one for the rest of the budget.
      if (before !== null && currentPage(doc) === before) {
        pagerNote ??= `clicking Next did not leave page ${before}`;
        break;
      }
      pagesWalked++;
    }
  }
  return finish(null);
}
