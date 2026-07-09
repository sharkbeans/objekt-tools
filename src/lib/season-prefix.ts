const explicitSeasonPrefixes: Record<string, string> = {
  Spring25: "SP",
  Summer25: "SU",
  Autumn25: "AU",
  Winter26: "W",
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
