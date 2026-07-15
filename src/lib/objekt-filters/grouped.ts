// Season/class filter values are scoped per-artist and encoded as
// "artistId::value" (e.g. "tripleS::Atom01") to disambiguate identically-named
// values across artists (ARTMS and tripleS share season names).

export function encodeGroupedValue(artistId: string, item: string) {
  return `${artistId}::${item}`;
}

export function decodeGroupedValue(
  value: string,
): { artistId: string; item: string } | null {
  const idx = value.indexOf("::");
  if (idx === -1) return null;
  return { artistId: value.slice(0, idx), item: value.slice(idx + 2) };
}

/**
 * Splits a list of season/class filter values into grouped "artistId::value"
 * pairs and plain (ungrouped) values. This is the single place grouped values
 * get decoded — used by the JS structural predicate, the SQL filter builder,
 * and the filter chips.
 */
export function decodeGroupedFilterValues(values: string[]): {
  pairs: { artistId: string; item: string }[];
  plain: string[];
} {
  const pairs: { artistId: string; item: string }[] = [];
  const plain: string[] = [];
  for (const value of values) {
    const decoded = decodeGroupedValue(value);
    if (decoded) pairs.push(decoded);
    else plain.push(value);
  }
  return { pairs, plain };
}
