// Deduped, re-parsable storage form for a pasted Discord transcript.
//
// The paste workflow is scroll → select → paste → scroll → paste again, so
// overlapping selections are not an edge case, they are the norm. Appending the
// raw text of every paste therefore grows the store without bound: in a real
// one-day channel export, 53% of messages are reposts (traders bump their
// lists), and an overlapping paste duplicates all of them again.
//
// `mergeTranscripts` already collapses that overlap for the *parsed* messages.
// This module does the same thing one level lower, for what gets persisted,
// keyed on the same content key so the two agree by construction.
//
// What is stored is the message text, not `TranscriptMessage` — re-parsing on
// load stays the source of truth, so the parser can keep gaining fields without
// a storage migration each time.

import {
  messageKey,
  splitTranscript,
  UNKNOWN_AUTHOR,
} from "@/lib/discord/transcript";

export interface StoredBlock {
  /** Discord display name, exactly as the header carried it. */
  author: string;
  /**
   * The rendered timestamp, verbatim ("3:41 PM", "09/05/2026 3:41 PM"). Null
   * for a paste that arrived with no header at all.
   */
  time: string | null;
  body: string;
}

// Re-parsing every stored block on load costs about 0.25 ms each, so history is
// bounded by load time rather than by space: roughly 0.35 s per day of a busy
// channel. 40,000 blocks is about a month of one, and lands near a 10 s worst
// case on the measured hardware. Holding a full 90 days is not a tuning
// question — it needs ~1.5 GB of heap for the parsed items, so it belongs on a
// server that can filter before sending, not in the tab.
export const MAX_BLOCKS = 40_000;

// Stand-in timestamp for a block that never had one. Matches what the paste
// path has always written for a headerless chunk, and parses as a clock time,
// which is what makes the reconstructed header a valid message boundary.
const NO_TIME = "00:00";

/**
 * Fold a new paste into what is already stored, dropping messages that are
 * already there.
 *
 * Last write wins, the same rule `mergeTranscripts` uses: a trader who edited
 * their list should show the newer copy.
 *
 * Order is last-seen, not first-seen, which is what makes trimming safe: a
 * trader who is still bumping their list moves back to the end and survives,
 * while the ones who stopped posting fall off first.
 */
export function mergeBlocks(
  existing: StoredBlock[],
  pasted: string,
): StoredBlock[] {
  const { blocks } = splitTranscript(pasted);

  // No header anywhere: Discord's single-message "Copy Text" omits it. Keep the
  // whole chunk as one anonymous post rather than dropping it — the caller has
  // already checked that it parses as a trade list.
  const incoming: StoredBlock[] =
    blocks.length === 0
      ? pasted.trim()
        ? [{ author: UNKNOWN_AUTHOR, time: null, body: pasted.trim() }]
        : []
      : blocks.map((block) => ({
          author: block.author,
          time: block.time?.raw ?? null,
          body: block.body,
        }));

  const byKey = new Map(
    existing.map((block) => [messageKey(block.author, block.body), block]),
  );
  for (const block of incoming) {
    const key = messageKey(block.author, block.body);
    // Delete before setting so a re-sighted post moves to the end rather than
    // keeping the position of its first sighting.
    byKey.delete(key);
    byKey.set(key, block);
  }
  return trimBlocks([...byKey.values()]);
}

/** Drop the least recently seen blocks once past the load-time budget. */
export function trimBlocks(blocks: StoredBlock[]): StoredBlock[] {
  return blocks.length > MAX_BLOCKS
    ? blocks.slice(blocks.length - MAX_BLOCKS)
    : blocks;
}

/**
 * Render stored blocks back into transcript text that `analyzeTranscript` reads
 * as the same messages.
 *
 * The round trip holds because `MessageTime.raw` is kept verbatim and was
 * captured by the very pattern the author-line regex matches, and because a
 * stored body can never itself contain a header line — if it did, the splitter
 * would have cut a new block there when the text first arrived.
 */
export function blocksToTranscript(blocks: StoredBlock[]): string {
  return blocks
    .map((block) => `${block.author} — ${block.time ?? NO_TIME}\n${block.body}`)
    .join("\n");
}
