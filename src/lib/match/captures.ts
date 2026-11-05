// The saved captures on the match desk: which Discord searches its posts came
// from, when each one ran, and what it covers.
//
// A delivery from the extension used to melt into one undated pool of posts.
// That hid the two things worth knowing before messaging a trader: how old the
// picture is, and which part of the channel it covers — a scan of CC101-120
// says nothing about CC301. So every search stays a separate, dated capture the
// user can turn on and off, and several can sit on the desk at once.
//
// Only searches are captures. Posts the extension collected while someone
// scrolled are a random slice of a channel with no filter to describe, so they
// never reach /match (see `deliveredCapture`). Text pasted by hand has no filter
// either, but the user chose it, so it keeps one row of its own.
//
// Posts are not stored per capture. Traders repost constantly, so two captures
// overlap heavily and a copy each would undo the dedupe in `transcript-blocks`.
// A post is stored once and names the captures that saw it.

import type { HandoffPayload } from "./extension-handoff";

/** The one row every hand-pasted post, and anything older than captures, is in. */
export const PASTE_CAPTURE = "paste";

/** Past this, a capture says more about last week than about who has what now. */
export const STALE_AFTER_MS = 72 * 60 * 60 * 1000;
/** How long "Not now" keeps the alert away. The list still marks them old. */
export const STALE_SNOOZE_MS = 24 * 60 * 60 * 1000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Filter groups a label spells out before it says "+N more". */
const LABEL_PARTS = 4;

export interface Capture {
  /** The search run's id, or `PASTE_CAPTURE`. */
  id: string;
  kind: "search" | "paste";
  /**
   * When the posts were collected, in ms. Not when they were posted, which is
   * `from`/`to`: a scan run today can reach back a month. Null only for posts
   * from before this was recorded, when none of them carries a usable date.
   */
  capturedAt: number | null;
  /** Oldest post, in ms. Null when no post has a real date. */
  from: number | null;
  /** Newest post, in ms. Null when no post has a real date. */
  to: number | null;
  /** What the search looked for: "CC101". Empty for the paste row. */
  filters: string[];
  /** The want list behind it, one objekt per line, to search again with. */
  wants: string[];
  /** Whether its posts are on the desk. */
  active: boolean;
}

/** A capture as it arrives, before the desk knows what it covers. */
export type NewCapture = Pick<
  Capture,
  "id" | "kind" | "capturedAt" | "filters" | "wants"
>;

const PASTE_ONLY: readonly string[] = [PASTE_CAPTURE];

/**
 * The captures a stored post belongs to.
 *
 * No list means the paste row, which is what makes this need no migration:
 * every post stored before captures existed already reads as pasted.
 */
export function blockCaptures(block: {
  captures?: readonly string[];
}): readonly string[] {
  return block.captures?.length ? block.captures : PASTE_ONLY;
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The capture a delivery files under, or null for one that must not be kept.
 *
 * An extension that predates capture details sends none, and is on people's
 * machines until the store update reaches them. Its delivery id still carries
 * the run, as `<run>-<time>`, and the arrival time stands in for the scan time:
 * nearly always right, since a delivery follows its search, and the newest post
 * in `to` shows when it is not. Its fallback for "no search yet" sends the whole
 * scrolled index as `index-<time>`, which is the one thing never to keep.
 */
export function deliveredCapture(
  delivery: Pick<HandoffPayload, "id" | "wants" | "capture">,
  now: number,
): NewCapture | null {
  const wants = lines(delivery.wants);
  const { capture } = delivery;
  if (capture)
    return {
      id: capture.run,
      kind: "search",
      // A clock running ahead must not leave a capture dated in the future,
      // where it would never go stale.
      capturedAt: Math.min(capture.capturedAt, now),
      filters: capture.queries.length ? capture.queries : wants,
      wants,
    };
  const run = delivery.id.replace(/-[^-]+$/, "");
  if (run === "index") return null;
  return { id: run, kind: "search", capturedAt: now, filters: wants, wants };
}

/** The paste row's half of `addCapture`, for text added by hand at `now`. */
export function pastedCapture(now: number): NewCapture {
  return {
    id: PASTE_CAPTURE,
    kind: "paste",
    capturedAt: now,
    filters: [],
    wants: [],
  };
}

/**
 * A post time in ms, or null when it is not a real date.
 *
 * Only the extension's ISO stamps qualify. Clipboard text has "3:41 PM", which
 * is relative to the day it was copied, and "09/05/2026", which is day-first or
 * month-first depending on the reader's locale. A guess there would draw a
 * confident timeline that is off by months.
 */
export function postInstant(time: string | null): number | null {
  if (!time || !/^\d{4}-\d{2}-\d{2}T/.test(time)) return null;
  const instant = Date.parse(time);
  return Number.isFinite(instant) ? instant : null;
}

/** The span of `posts`, or nulls when none of them has a real date. */
export function coverageOf(
  posts: readonly { time: string | null }[],
): Pick<Capture, "from" | "to"> {
  let from: number | null = null;
  let to: number | null = null;
  for (const post of posts) {
    const instant = postInstant(post.time);
    if (instant === null) continue;
    if (from === null || instant < from) from = instant;
    if (to === null || instant > to) to = instant;
  }
  return { from, to };
}

/** The earlier of two times, either of which may be unknown. */
function earliest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  return b === null ? a : Math.min(a, b);
}

/** The later of two times, either of which may be unknown. */
function latest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  return b === null ? a : Math.max(a, b);
}

/** Newest first, with the paste row last: searches are what the list is for. */
function sorted(captures: Capture[]): Capture[] {
  return [...captures].sort(
    (a, b) =>
      Number(a.kind === "paste") - Number(b.kind === "paste") ||
      (b.capturedAt ?? 0) - (a.capturedAt ?? 0),
  );
}

/** Whether `newer` searched for everything `older` did, and later. */
function supersedes(newer: Capture, older: Capture): boolean {
  if (older.kind !== "search" || !older.filters.length) return false;
  if ((older.capturedAt ?? 0) > (newer.capturedAt ?? 0)) return false;
  const searched = new Set(newer.filters.map((f) => f.toLowerCase()));
  return older.filters.every((filter) => searched.has(filter.toLowerCase()));
}

/**
 * File a new capture on the desk, turned on.
 *
 * A search run is replaced outright when it comes round again: every delivery
 * of a run carries all of it, so a run that was continued arrives whole. The
 * paste row is added to instead, because each paste is only the latest piece.
 *
 * An older capture this one fully re-searches is turned off, not deleted.
 * Otherwise the rescan the stale alert asks for would leave the very posts it
 * warned about on the desk, and the alert would come straight back.
 */
export function addCapture(
  captures: readonly Capture[],
  incoming: NewCapture,
  posts: readonly { time: string | null }[],
): { captures: Capture[]; replaced: Capture[] } {
  const coverage = coverageOf(posts);
  const previous = captures.find((capture) => capture.id === incoming.id);
  const added: Capture =
    incoming.kind === "paste" && previous
      ? {
          ...previous,
          capturedAt: incoming.capturedAt,
          from: earliest(previous.from, coverage.from),
          to: latest(previous.to, coverage.to),
          active: true,
        }
      : { ...incoming, ...coverage, active: true };
  const replaced = captures.filter(
    (capture) =>
      capture.id !== added.id && capture.active && supersedes(added, capture),
  );
  const gone = new Set(replaced.map((capture) => capture.id));
  return {
    captures: sorted([
      added,
      ...captures
        .filter((capture) => capture.id !== added.id)
        .map((capture) =>
          gone.has(capture.id) ? { ...capture, active: false } : capture,
        ),
    ]),
    replaced,
  };
}

/**
 * How many posts each capture holds, from each post's list of captures. A post
 * can count towards several.
 */
export function postCounts(
  memberships: Iterable<readonly string[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ids of memberships)
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/**
 * Bring the capture list in line with the posts actually stored.
 *
 * A capture whose posts have all been trimmed away has nothing left to show.
 * Posts with no row yet are the ones stored before captures existed, so their
 * row is made here: dated by the newest post among them, the best that is known
 * and a floor on when they were really collected, so a store left untouched for
 * a month still reads as old.
 */
export function settleCaptures(
  captures: readonly Capture[],
  blocks: readonly { time: string | null; captures?: readonly string[] }[],
): Capture[] {
  const counts = postCounts(blocks.map(blockCaptures));
  const kept = captures.filter((capture) => counts.has(capture.id));
  if (
    !counts.has(PASTE_CAPTURE) ||
    kept.some((capture) => capture.id === PASTE_CAPTURE)
  )
    return kept;
  const coverage = coverageOf(
    blocks.filter((block) => blockCaptures(block).includes(PASTE_CAPTURE)),
  );
  return sorted([
    ...kept,
    {
      id: PASTE_CAPTURE,
      kind: "paste",
      capturedAt: coverage.to,
      ...coverage,
      filters: [],
      wants: [],
      active: true,
    },
  ]);
}

/**
 * The posts to keep off the desk: those whose every capture is turned off.
 *
 * Asked this way round so a post seen by two captures stays while either is on,
 * and a post naming a capture that no longer exists is shown rather than lost.
 */
export function hiddenPosts(
  membership: ReadonlyMap<string, readonly string[]>,
  captures: readonly Capture[],
): ReadonlySet<string> {
  const hidden = new Set<string>();
  const off = new Set(
    captures.filter((capture) => !capture.active).map((capture) => capture.id),
  );
  if (!off.size) return hidden;
  for (const [key, ids] of membership)
    if (ids.every((id) => off.has(id))) hidden.add(key);
  return hidden;
}

/** The captures on the desk that have gone past `STALE_AFTER_MS`. */
export function staleCaptures(
  captures: readonly Capture[],
  now: number,
): Capture[] {
  return captures.filter(
    (capture) =>
      capture.active &&
      capture.capturedAt !== null &&
      now - capture.capturedAt > STALE_AFTER_MS,
  );
}

/** What searching `captures` again takes, one objekt per line. */
export function rescanWants(captures: readonly Capture[]): string[] {
  return [
    ...new Set(
      captures.flatMap((capture) =>
        capture.wants.length ? capture.wants : capture.filters,
      ),
    ),
  ];
}

/** "CC101" split so neighbours can be folded; null for anything else. */
const CODE = /^(?:(.*\S)\s+)?([A-Za-z]+)(\d+)$/;

/**
 * Filters as a person would say them: "CC101–120", "SeoYeon CC101–102, Mayu
 * CC103". Codes are grouped by member and season and runs of numbers folded,
 * because a real search is dozens of consecutive codes. Anything that is not a
 * plain code, like the variant "AA301Z", is kept as written.
 */
export function filterLabel(
  filters: readonly string[],
  limit = LABEL_PARTS,
): string {
  const groups = new Map<string, { head: string; numbers: number[] }>();
  const parts: (string | { head: string; numbers: number[] })[] = [];
  for (const filter of filters) {
    const code = filter.match(CODE);
    if (!code) {
      parts.push(filter);
      continue;
    }
    const head = `${code[1] ? `${code[1]} ` : ""}${code[2]}`;
    let group = groups.get(head);
    if (!group) {
      group = { head, numbers: [] };
      groups.set(head, group);
      parts.push(group);
    }
    group.numbers.push(Number(code[3]));
  }
  const spans = parts.flatMap((part) => {
    if (typeof part === "string") return [part];
    const numbers = [...new Set(part.numbers)].sort((a, b) => a - b);
    const out: string[] = [];
    for (let i = 0; i < numbers.length; ) {
      let end = i;
      while (numbers[end + 1] === numbers[end] + 1) end++;
      out.push(
        end > i
          ? `${part.head}${numbers[i]}–${numbers[end]}`
          : `${part.head}${numbers[i]}`,
      );
      i = end + 1;
    }
    return out;
  });
  const shown = spans.slice(0, limit).join(", ");
  return spans.length > limit
    ? `${shown} +${spans.length - limit} more`
    : shown;
}

/** What a capture is called in the list, the alert and the toasts. */
export function captureLabel(
  capture: Pick<Capture, "kind" | "filters">,
): string {
  if (capture.kind === "paste") return "Pasted posts";
  return filterLabel(capture.filters) || "Discord search";
}

interface FormatOptions {
  /** Defaults to the reader's own. Tests pin these. */
  locale?: string;
  timeZone?: string;
}

/**
 * The span a capture covers: "1/11/2026 10:30–18:30", or with both dates when
 * it crosses midnight. Null when no post in it has a real date.
 */
export function formatCoverage(
  { from, to }: Pick<Capture, "from" | "to">,
  { locale, timeZone }: FormatOptions = {},
): string | null {
  if (from === null || to === null) return null;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone,
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const fromDate = date.format(from);
  const toDate = date.format(to);
  if (fromDate !== toDate)
    return `${fromDate} ${time.format(from)} – ${toDate} ${time.format(to)}`;
  return time.format(from) === time.format(to)
    ? `${fromDate} ${time.format(from)}`
    : `${fromDate} ${time.format(from)}–${time.format(to)}`;
}

/** A post's stamp for reading: ISO stamps get dressed, the rest are as shown. */
export function formatPostTime(
  raw: string,
  { locale, timeZone }: FormatOptions = {},
): string {
  const instant = postInstant(raw);
  if (instant === null) return raw;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
}

/** How long ago `at` was: "just now", "40 min ago", "5h ago", "3 days ago". */
export function formatAge(at: number, now: number): string {
  const age = Math.max(0, now - at);
  if (age < MINUTE_MS) return "just now";
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min ago`;
  // Hours up to two days, so a capture just past the 72h line reads "3 days".
  if (age < 2 * DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`;
  return `${Math.floor(age / DAY_MS)} days ago`;
}

/** The stretch of time the coverage bars are drawn against. */
export function timelineSpan(
  captures: readonly Pick<Capture, "from">[],
  now: number,
): { start: number; end: number } | null {
  const starts = captures.flatMap(({ from }) => (from === null ? [] : [from]));
  if (!starts.length) return null;
  return { start: Math.min(...starts), end: now };
}

/** Where one capture sits on that span, as percentages of its width. */
export function coverageBar(
  { from, to }: Pick<Capture, "from" | "to">,
  span: { start: number; end: number },
): { left: number; width: number } | null {
  if (from === null || to === null) return null;
  const whole = span.end - span.start;
  if (whole <= 0) return { left: 0, width: 100 };
  const left = Math.min(100, Math.max(0, ((from - span.start) / whole) * 100));
  // A scan of one busy afternoon, on a month-long axis, is still a visible mark.
  const width = Math.max(1.5, ((to - from) / whole) * 100);
  return { left: Math.min(left, 100 - width), width };
}

/** Read the stored list back, dropping anything that is not a whole capture. */
export function readCaptures(value: unknown): Capture[] {
  return Array.isArray(value) ? value.filter(isCapture) : [];
}

function isCapture(value: unknown): value is Capture {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  const time = (field: unknown) =>
    field === null || (typeof field === "number" && Number.isFinite(field));
  const list = (field: unknown) =>
    Array.isArray(field) && field.every((item) => typeof item === "string");
  return (
    typeof c.id === "string" &&
    (c.kind === "search" || c.kind === "paste") &&
    time(c.capturedAt) &&
    time(c.from) &&
    time(c.to) &&
    list(c.filters) &&
    list(c.wants) &&
    typeof c.active === "boolean"
  );
}
