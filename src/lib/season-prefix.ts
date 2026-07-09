const explicitSeasonPrefixes: Record<string, string> = {
  Spring25: "SP",
  Summer25: "SU",
  Autumn25: "AU",
  Winter26: "W",
};

const seasonBaseByPrefix: Record<string, string> = {
  A: "Atom",
  B: "Binary",
  C: "Cream",
  D: "Divine",
  E: "Ever",
};

/**
 * Prefix -> season lookup, generated from the same repeated-initial scheme as
 * getSeasonPrefix below (Atom02 -> AA, Cream02 -> CC, ...), plus idntt's
 * explicit community prefixes. Shared so every parser recognizes new seasons
 * without needing its own hardcoded entry.
 */
export const seasonPrefixMap: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(seasonBaseByPrefix).flatMap(([prefix, season]) =>
      Array.from({ length: 9 }, (_, i) => [
        prefix.repeat(i + 1),
        `${season}${String(i + 1).padStart(2, "0")}`,
      ]),
    ),
  ),
  W: "Winter26",
  SP: "Spring25",
  SU: "Summer25",
  AU: "Autumn25",
};

/**
 * Build compact season prefixes for objekt labels.
 * ARTMS/tripleS seasons use repeated initials (Atom02 -> AA),
 * while idntt seasons use explicit community prefixes (Spring25 -> SP).
 */
export function getSeasonPrefix(season: string | null | undefined): string {
  if (!season) return "";

  const explicitPrefix = explicitSeasonPrefixes[season];
  if (explicitPrefix) return explicitPrefix;

  const match = season.match(/^([A-Za-z]+?)(\d+)$/);
  if (!match) return "";

  const [, word, suffix] = match;
  const letter = word.charAt(0).toUpperCase();
  const num = Number.parseInt(suffix, 10);

  if (!Number.isFinite(num) || num <= 0 || num > 9) {
    return letter;
  }

  return letter.repeat(num);
}

/**
 * Strip the trailing online/offline variant letter (a/z) from a collection
 * number, e.g. "502Z" -> "502". Display-only — collectionId still carries
 * the variant for identity/grouping purposes.
 */
export function stripVariantSuffix(collectionNo: string): string {
  return collectionNo.replace(/[az]$/i, "");
}
