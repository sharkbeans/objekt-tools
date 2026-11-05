import type { TranscriptMessage } from "@/lib/discord/transcript";
import type { Capture } from "@/lib/match/captures";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

/**
 * How many traders in each capture offer what it was looking for: the answer a
 * trader opens a capture for, where a post count is only a measure of noise.
 *
 * A search is judged against its own want list, and anything without one
 * against the saved wants. A capture with neither has no entry, because there
 * is nothing to count: "0 traders" would read as bad news rather than no
 * question asked. A trader posting twice still counts once.
 */
export function captureTraders(
  captures: readonly Capture[],
  messages: readonly TranscriptMessage[],
  membership: ReadonlyMap<string, readonly string[]>,
  savedWants: string,
): Map<string, number> {
  const inCapture = new Map<string, TranscriptMessage[]>();
  for (const message of messages)
    for (const id of membership.get(message.key) ?? []) {
      const posts = inCapture.get(id);
      if (posts) posts.push(message);
      else inCapture.set(id, [message]);
    }
  const traders = new Map<string, number>();
  for (const capture of captures) {
    const own = capture.wants.length ? capture.wants : capture.filters;
    const query = parseDeskQuery(own.length ? own.join("\n") : savedWants);
    // Without one, every card would match: an empty query filters nothing.
    if (!query.alternatives.length) continue;
    const authors = new Set<string>();
    for (const message of inCapture.get(capture.id) ?? [])
      if (message.haves.some((item) => matchesDeskQuery(item, query)))
        authors.add(message.author);
    traders.set(capture.id, authors.size);
  }
  return traders;
}
