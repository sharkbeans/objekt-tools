import { defaultFilters, type ObjektFilterState } from "./types";

/**
 * Reads a repeated-or-comma-joined array param. Accepts both the legacy
 * repeated-param form (?member=a&member=b) and the comma-joined form
 * (?member=a,b) used by nuqs, so old bookmarked/shared links keep working.
 */
function getArrayParam(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseFilterParams(params: URLSearchParams): ObjektFilterState {
  return {
    search: params.get("search") ?? "",
    artist: getArrayParam(params, "artist"),
    member: getArrayParam(params, "member"),
    season: getArrayParam(params, "season"),
    class: getArrayParam(params, "class"),
    on_offline: getArrayParam(params, "on_offline"),
    sort: params.get("sort") ?? defaultFilters.sort,
    filterMode:
      (params.get("filter_mode") as "haves" | "wants") ??
      defaultFilters.filterMode,
  };
}

export function serializeFilterParams(
  filters: ObjektFilterState,
  extra?: { page?: number; user?: string },
): URLSearchParams {
  const p = new URLSearchParams();
  if (extra?.page !== undefined) p.set("page", String(extra.page));
  if (filters.artist.length) p.set("artist", filters.artist.join(","));
  if (filters.member.length) p.set("member", filters.member.join(","));
  if (filters.season.length) p.set("season", filters.season.join(","));
  if (filters.class.length) p.set("class", filters.class.join(","));
  if (filters.on_offline.length)
    p.set("on_offline", filters.on_offline.join(","));
  if (filters.search) p.set("search", filters.search);
  if (filters.sort) p.set("sort", filters.sort);
  p.set("filter_mode", filters.filterMode);
  if (extra?.user) p.set("user", extra.user);
  return p;
}

/**
 * Normalizes a query string into a canonical cache key: parses filter params
 * (accepting both repeated and comma-joined array forms) and re-serializes
 * them, plus a whitelist of extra params. Requests differing only in param
 * order/form or containing junk params collapse to the same cache entry.
 */
export function normalizeCacheKey(
  params: URLSearchParams,
  extraKeys: string[] = [],
): string {
  const filters = parseFilterParams(params);
  const normalized = serializeFilterParams(filters);
  for (const key of [...new Set(extraKeys)].sort()) {
    const value = params.get(key);
    if (value) normalized.set(key, value);
  }
  normalized.sort();
  return normalized.toString();
}

export function hasAnyFilter(filters: ObjektFilterState): boolean {
  return (
    filters.artist.length > 0 ||
    filters.member.length > 0 ||
    filters.season.length > 0 ||
    filters.class.length > 0 ||
    filters.on_offline.length > 0 ||
    !!filters.search
  );
}
