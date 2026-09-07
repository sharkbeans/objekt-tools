import type { ProgressIdentityResponse } from "./types";

/** Typing under this length is too ambiguous to be worth an upstream call. */
export const MIN_SUGGEST_LENGTH = 5;
export const MAX_SUGGESTIONS = 5;

export type ProgressSuggestResponse = { results: ProgressIdentityResponse[] };

/**
 * Ranks Cosmo's fuzzy search hits by how close they are to what was typed:
 * exact match, then prefix, then substring, then everything else by edit
 * distance. Ties break on the shorter nickname — "sharkbean" before
 * "sharkbeans_official" for the same prefix.
 */
export function rankByCloseness(
  users: ProgressIdentityResponse[],
  query: string,
): ProgressIdentityResponse[] {
  const normalized = query.toLowerCase();
  return users
    .map((user) => ({ user, rank: closeness(user.nickname, normalized) }))
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] ||
        a.rank[1] - b.rank[1] ||
        a.user.nickname.localeCompare(b.user.nickname),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.user);
}

function closeness(nickname: string, query: string): [number, number] {
  const name = nickname.toLowerCase();
  if (name === query) return [0, 0];
  if (name.startsWith(query)) return [1, name.length];
  const at = name.indexOf(query);
  if (at >= 0) return [2, at * 100 + name.length];
  return [3, editDistance(name, query)];
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}
