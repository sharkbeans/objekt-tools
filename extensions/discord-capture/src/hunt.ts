/**
 * A hunt handed over from objekt.my, as it lands in extension storage.
 *
 * The page posts it (`hunt` in `@/lib/match/extension-handoff`), the bridge
 * content script on objekt.my stores it, and the panel on Discord picks it up
 * through `storage.onChanged`. What gets written is decided here, as a plain
 * function, so the rules — keep the list it replaced, never overwrite a
 * nickname the user typed — are tested without a browser.
 */

/** How long "Undo — restore previous list" and the hunt notice stay up. */
export const HUNT_UNDO_MS = 24 * 60 * 60 * 1000;

/** The storage keys a hunt reads before writing. */
export const HUNT_READ_KEYS = ["wants", "nickname", "huntId"] as const;

export interface IncomingHunt {
  id: string;
  /** Already validated by `readPageMessage`: 1-40 lines, one objekt each. */
  wants: string;
  /** "" when the page did not know one. */
  nickname: string;
}

export interface HuntWrite {
  set: Record<string, unknown>;
  remove: string[];
}

/** How many objekts a hunt's want list holds, one per non-empty line. */
export function huntCount(wants: string): number {
  return wants.split("\n").filter((line) => line.trim()).length;
}

/**
 * The storage write that makes `hunt` the want list.
 *
 * - The list it replaces is kept as `wantsBeforeHunt`, so the panel can offer
 *   Undo. Sending the same list again keeps the original, not the hunt itself.
 * - Replacing an empty list leaves nothing to undo to, so a stale
 *   `wantsBeforeHunt` from an older hunt is removed rather than offered.
 * - The nickname is filled in only when the extension has none: a nickname
 *   typed into the extension is the user's own choice and outranks a page's.
 * - Cards taken out of the previous search are forgotten; a hunt is a new list.
 * - The same hunt delivered twice (a retried click) writes nothing.
 */
export function huntWrite(
  stored: Record<string, unknown>,
  hunt: IncomingHunt,
  now: number,
): HuntWrite {
  const previous = typeof stored.wants === "string" ? stored.wants : "";
  if (stored.huntId === hunt.id && previous === hunt.wants)
    return { set: {}, remove: [] };
  const set: Record<string, unknown> = {
    wants: hunt.wants,
    huntId: hunt.id,
    huntAt: now,
    removedWants: [],
  };
  const remove: string[] = [];
  if (!previous.trim()) remove.push("wantsBeforeHunt");
  else if (previous !== hunt.wants) set.wantsBeforeHunt = previous;
  const nickname =
    typeof stored.nickname === "string" ? stored.nickname.trim() : "";
  if (hunt.nickname && !nickname) set.nickname = hunt.nickname;
  return { set, remove };
}

/** Whether a hunt stored at `huntAt` is recent enough to announce and undo. */
export function huntIsFresh(huntAt: unknown, now: number): boolean {
  return (
    typeof huntAt === "number" &&
    now - huntAt >= 0 &&
    now - huntAt < HUNT_UNDO_MS
  );
}

/** The panel's one-line notice for a hunt of `count` objekts. */
export function huntNotice(count: number): string {
  return `${count} missing objekt${count === 1 ? "" : "s"} from objekt.my. Scroll your trade channel or press Search.`;
}
