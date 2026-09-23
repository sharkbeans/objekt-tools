/**
 * Measure how much of a real Discord trade-channel export the paste parser
 * reads, and list the lines it skipped that look like they name objekts.
 *
 * The parser is rule-based: improving it means running this over a fresh
 * export, picking the most common missed shape, adding a rule and a test in
 * src/lib/paste-parser.test.ts, then re-running to check nothing else moved.
 *
 * Exports hold other people's messages. Keep them outside the repo.
 *
 * Usage:
 *   npx tsx scripts/audit-trade-parser.ts <export.txt> [more.txt ...] [--top=80]
 */

import { readFileSync } from "node:fs";
import { splitTranscript } from "../src/lib/discord/transcript";
import { parsePastedTrade } from "../src/lib/paste-parser";

const args = process.argv.slice(2);
const top = Number(
  args.find((a) => a.startsWith("--top="))?.slice("--top=".length) ?? 80,
);
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error(
    "Usage: npx tsx scripts/audit-trade-parser.ts <export.txt> [--top=80]",
  );
  process.exit(1);
}

// A season prefix (or none) plus a three-digit collection number.
const CODE_LIKE = /\b[a-z]{0,4}\s?\d{3}[az]?\b/i;

const seen = new Set<string>();
const bodies: string[] = [];
let headers = 0;
for (const file of files) {
  const { blocks } = splitTranscript(readFileSync(file, "utf8"));
  headers += blocks.length;
  for (const { body } of blocks) {
    if (!body || seen.has(body)) continue;
    seen.add(body);
    bodies.push(body);
  }
}

const count = (text: string) => {
  const parsed = parsePastedTrade(text);
  return parsed.haves.length + parsed.wants.length;
};

let items = 0;
let empty = 0;
const missed = new Map<string, number>();
for (const body of bodies) {
  const total = count(body);
  items += total;
  if (total === 0) empty++;

  // A line is missed when removing it leaves the item count unchanged.
  const lines = body.split("\n");
  lines.forEach((line, i) => {
    const text = line.trim();
    if (!CODE_LIKE.test(text) || /^https?:/.test(text)) return;
    const without = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n");
    if (count(without) === total) missed.set(text, (missed.get(text) ?? 0) + 1);
  });
}

console.log(`headers        ${headers}`);
console.log(`unique posts   ${bodies.length}`);
console.log(`objekts read   ${items}`);
console.log(`posts with 0   ${empty}`);
console.log(
  `missed lines   ${[...missed.values()].reduce((a, b) => a + b, 0)}`,
);
console.log(`\nMost common missed lines (count, line):`);
for (const [line, n] of [...missed].sort((a, b) => b[1] - a[1]).slice(0, top))
  console.log(`${String(n).padStart(4)}  ${line.slice(0, 140)}`);
