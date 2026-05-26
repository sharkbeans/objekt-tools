export function normalizeArtistId(artist: string | null | undefined): string {
  const value = (artist ?? "").trim().toLowerCase();
  if (value === "triples" || value === "triple-s") {
    return "tripleS";
  }
  if (value === "artms") return "artms";
  if (value === "idntt") return "idntt";
  return artist ?? "";
}

export function artistLabel(artist: string): string {
  const normalized = normalizeArtistId(artist);
  if (normalized === "tripleS") return "tripleS";
  if (normalized === "artms") return "ARTMS";
  if (normalized === "idntt") return "idntt";
  return artist;
}

export function artistMatches(
  selected: string,
  actual: string | null | undefined,
): boolean {
  return normalizeArtistId(selected) === normalizeArtistId(actual);
}
