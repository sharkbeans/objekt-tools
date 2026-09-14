import { type ObjektKeyParts, objektKey } from "@/lib/discord/match";
import { stripVariantSuffix } from "@/lib/season-prefix";

/**
 * Card art for the want list, from objekt.my's public collection search.
 *
 * A wall of "SeoYeon CC101" lines is hard to scan and easy to get wrong; the
 * card itself is what people recognise. objekt.my already resolves a code to
 * its Cosmo thumbnail for posters, so this asks the same endpoint the same
 * question rather than inventing a second catalogue.
 *
 * Lookups are cached in `storage.local` by objekt key. Art for a collection
 * does not change, so a hit is kept for a month; a miss is usually a typo or a
 * collection the mirror has not synced yet, so it is retried after a day.
 */
export const ARTWORK_ENDPOINT = "https://objekt.my/api/objekts/search";

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
/** Entries kept. A want list is dozens; this is several lists' worth. */
const CACHE_CAP = 600;
/** Items looked up per request, so a pasted catalogue is not a request storm. */
export const LOOKUP_CAP = 60;
const CONCURRENCY = 4;

export type ArtworkCache = Record<string, { url: string | null; at: number }>;

/** Read the stored cache, tolerating anything at all in storage. */
export function readArtworkCache(value: unknown): ArtworkCache {
  const cache: ArtworkCache = {};
  if (!value || typeof value !== "object") return cache;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { url, at } = entry as Record<string, unknown>;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    if (url !== null && (typeof url !== "string" || !isArtUrl(url))) continue;
    cache[key] = { url, at };
  }
  return cache;
}

/**
 * Whether a URL is one the panel may put in an `<img>`.
 *
 * The response is from our own service, but it is still a network response
 * turned into markup, so it is held to the image hosts objekt.my itself allows.
 */
export function isArtUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "imagedelivery.net" ||
        parsed.hostname.endsWith(".cosmo.fans"))
    );
  } catch {
    return false;
  }
}

export function artworkUrl(item: ObjektKeyParts): string {
  const params = new URLSearchParams({
    season: item.season ?? "",
    q: stripVariantSuffix(item.collectionNo ?? ""),
  });
  if (item.member) params.set("member", item.member);
  return `${ARTWORK_ENDPOINT}?${params}`;
}

/**
 * The thumbnail for `item` out of a search response, or null.
 *
 * The search matches loosely — `q=101` also finds 1010 — so the collection
 * number is compared exactly, ignoring the online/offline letter, which a want
 * list almost never states.
 */
export function pickArtwork(
  data: unknown,
  item: ObjektKeyParts,
): string | null {
  const results =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).results
      : null;
  if (!Array.isArray(results)) return null;
  const number = stripVariantSuffix(item.collectionNo ?? "").toLowerCase();
  const member = item.member?.toLowerCase();
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.collectionNo !== "string" ||
      stripVariantSuffix(r.collectionNo).toLowerCase() !== number
    )
      continue;
    if (
      member &&
      (typeof r.member !== "string" || r.member.toLowerCase() !== member)
    )
      continue;
    const url =
      typeof r.thumbnailImage === "string"
        ? r.thumbnailImage
        : typeof r.frontImage === "string"
          ? r.frontImage
          : null;
    if (url && isArtUrl(url)) return url;
  }
  return null;
}

function fresh(entry: ArtworkCache[string] | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.at < (entry.url ? HIT_TTL_MS : MISS_TTL_MS);
}

/** Drop the oldest entries past the cap. */
function trim(cache: ArtworkCache): ArtworkCache {
  const keys = Object.keys(cache);
  if (keys.length <= CACHE_CAP) return cache;
  const kept = keys
    .sort((a, b) => cache[b].at - cache[a].at)
    .slice(0, CACHE_CAP);
  return Object.fromEntries(kept.map((key) => [key, cache[key]]));
}

/**
 * Resolve art for `items`, from the cache where it can and the network where
 * it must.
 *
 * A failed request is answered as "no art" but not cached, so a flaky moment
 * does not blank a card for a day.
 */
export async function lookupArtwork(
  items: readonly ObjektKeyParts[],
  cache: ArtworkCache,
  options: { now?: number; fetcher?: typeof fetch } = {},
): Promise<{ urls: Record<string, string | null>; cache: ArtworkCache }> {
  const now = options.now ?? Date.now();
  const fetcher = options.fetcher ?? fetch;
  const next: ArtworkCache = { ...cache };
  const urls: Record<string, string | null> = {};
  const queue: { key: string; item: ObjektKeyParts }[] = [];
  const queued = new Set<string>();
  for (const item of items) {
    const key = objektKey(item);
    if (!key || queued.has(key) || key in urls) continue;
    if (fresh(next[key], now)) {
      urls[key] = next[key].url;
      continue;
    }
    if (queue.length >= LOOKUP_CAP) continue;
    queued.add(key);
    queue.push({ key, item });
  }
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const response = await fetcher(artworkUrl(job.item), {
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          urls[job.key] = null;
          continue;
        }
        const url = pickArtwork(await response.json(), job.item);
        urls[job.key] = url;
        next[job.key] = { url, at: now };
      } catch {
        urls[job.key] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { urls, cache: trim(next) };
}
