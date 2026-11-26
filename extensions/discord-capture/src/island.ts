/**
 * What the minimised panel says: one line, read off the run's own report.
 *
 * Minimised, the panel is a small pill at the top of Discord — the "island" —
 * so a search can run without a window over the channel. It has room for a
 * status, a count and at most one button, so this decides which: the code
 * being searched while a run goes, how many posts it found once it is done
 * (with Open in match), and that it stopped when it did. Kept apart from the
 * DOM so the wording can be tested without a browser.
 */

import { STALE_MS } from "./resume";
import { DEFAULT_COOLDOWN_MS } from "./search-plan";

export type IslandState = "idle" | "running" | "done" | "stopped";

export interface IslandView {
  state: IslandState;
  label: string;
  /** Short and secondary: "3/9", or "". */
  meta: string;
  /** 0–1, for the bar along the bottom while a run goes. */
  progress: number;
  /** Whether Open in match has anything to send. */
  canOpen: boolean;
}

/** How long a finished search keeps its result on the island. */
export const RESULT_SHOWN_MS = DEFAULT_COOLDOWN_MS;

const IDLE: IslandView = {
  state: "idle",
  label: "Objekt Match",
  meta: "",
  progress: 0,
  canOpen: false,
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function posts(n: number): string {
  return `${n} post${n === 1 ? "" : "s"}`;
}

/** The island for the stored `searchProgress`, as of `now`. */
export function islandView(progress: unknown, now: number): IslandView {
  if (!progress || typeof progress !== "object") return IDLE;
  const p = progress as Record<string, unknown>;
  const at = count(p.at);
  const found = count(p.posts);
  const done = count(p.done);
  const total = count(p.total);
  if (p.running === true) {
    // A report that stopped arriving is a run that died with its tab.
    if (now - at >= STALE_MS)
      return {
        state: "stopped",
        label: "Search interrupted",
        meta: found ? posts(found) : "",
        progress: 0,
        canOpen: found > 0,
      };
    const query = typeof p.query === "string" ? p.query : "";
    const label =
      typeof p.paused === "string" && p.paused
        ? "Paused"
        : p.waiting === true
          ? "Waiting for Discord"
          : query
            ? `Searching ${query}`
            : "Starting search";
    return {
      state: "running",
      label,
      meta: total ? `${Math.min(done, total)}/${total}` : "",
      progress: total ? Math.min(1, done / total) : 0,
      canOpen: false,
    };
  }
  const finishedAt = count(p.finishedAt) || at;
  if (!finishedAt || now - finishedAt >= RESULT_SHOWN_MS) return IDLE;
  if (typeof p.stopped === "string" && p.stopped)
    return {
      state: "stopped",
      label: "Search stopped",
      meta: found ? posts(found) : "",
      progress: 0,
      canOpen: found > 0,
    };
  return {
    state: "done",
    label: found ? `${posts(found)} found` : "Nothing new found",
    meta: "",
    progress: 1,
    canOpen: found > 0,
  };
}
