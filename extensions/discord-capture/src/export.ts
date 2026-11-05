import { splitTranscript } from "@/lib/discord/transcript";
import type { HandoffCapture } from "@/lib/match/extension-handoff";
import {
  blocksToTranscript,
  MAX_BLOCKS,
  type StoredBlock,
} from "@/lib/match/transcript-blocks";

/** Validate boundaries before crossing the text-only import contract. */
export function exportTranscript(blocks: StoredBlock[]): string {
  if (!blocks.length) throw new Error("Capture some posts first.");
  if (blocks.length > MAX_BLOCKS)
    throw new Error(
      `The index exceeds /match's ${MAX_BLOCKS}-post limit. Use the JSON dump to keep a full backup before clearing and starting a smaller capture.`,
    );
  const text = blocksToTranscript(blocks);
  const restored = splitTranscript(text);
  if (
    restored.orphanLines ||
    restored.blocks.length !== blocks.length ||
    restored.blocks.some(
      (block, i) =>
        block.author !== blocks[i].author ||
        block.body !== blocks[i].body ||
        block.time?.raw !== blocks[i].time,
    )
  ) {
    throw new Error(
      "Some posts contain ambiguous transcript headers or names. Export the JSON index for inspection; text export was stopped to preserve attribution.",
    );
  }
  return text;
}

/**
 * The posts a search run produced, and nothing else.
 *
 * The index also holds whatever was scrolled past, and that is a random slice
 * of a channel with no filter to describe it: /match keeps searches as dated
 * captures, and a capture nobody can name is noise on the desk. No run means no
 * search has happened yet, so there is nothing to send.
 */
export function searchPosts<T extends { run?: string }>(
  posts: readonly T[],
  run: string | null,
): T[] {
  return run ? posts.filter((post) => post.run === run) : [];
}

/**
 * What a run's delivery tells /match about itself.
 *
 * The run is dated by its last captured post, not by the moment of delivery:
 * pressing Open in match on a three-day-old search must not make it look new.
 * Posts from before 1.4.0 carry no stamp, which leaves `now` as the only guess.
 */
export function runCapture(
  run: string,
  posts: readonly { capturedAt?: number }[],
  queries: unknown,
  now: number,
): HandoffCapture {
  let capturedAt = 0;
  for (const post of posts)
    if (typeof post.capturedAt === "number" && post.capturedAt > capturedAt)
      capturedAt = post.capturedAt;
  return {
    run,
    capturedAt: capturedAt || now,
    queries: Array.isArray(queries)
      ? queries.filter((query) => typeof query === "string")
      : [],
  };
}
