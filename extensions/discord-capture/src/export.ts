import { splitTranscript } from "@/lib/discord/transcript";
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
