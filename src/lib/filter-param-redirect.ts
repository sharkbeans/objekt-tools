// Objekt filter array params that used to be sent as repeated keys
// (?member=a&member=b). nuqs (client-side URL filter state, see
// use-objekt-filter-params.ts) reads only the first value per key, so old
// shared/bookmarked links with the repeated form would silently lose all
// but the first selected value once nuqs mounts. This normalizes such URLs
// to the comma-joined form nuqs expects, server-side, before that happens.
const ARRAY_FILTER_KEYS = ["artist", "member", "season", "class", "on_offline"];

/**
 * Returns a new URL with repeated filter-array params collapsed to their
 * comma-joined form, or null if the URL doesn't need normalizing.
 */
export function normalizeRepeatedFilterParams(url: URL): URL | null {
  const params = url.searchParams;
  const next = new URLSearchParams(params);
  let changed = false;

  for (const key of ARRAY_FILTER_KEYS) {
    const values = params.getAll(key);
    if (values.length > 1) {
      next.delete(key);
      const joined = values.filter(Boolean).join(",");
      if (joined) next.set(key, joined);
      changed = true;
    }
  }

  if (!changed) return null;

  const out = new URL(url);
  out.search = next.toString();
  return out;
}
