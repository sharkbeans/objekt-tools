import { and, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";
import {
  pickShowcase,
  SHOWCASE_ARTISTS,
  SHOWCASE_CLASSES,
  type Showcase,
  showcaseDay,
} from "./showcase";

// How many of each artist's newest seasons to consider. A brand-new season
// often has only a few members' grids out, so the grid may fall back a
// season or two; the trade's two sides mix all of them.
const SEASONS_TO_SCAN = 3;
const CACHE_TTL_MS = 30 * 60_000;

const artistKey = sql<string>`lower(${collections.artist})`;

// Online prints only; offline (A) ones never grid.
const showcaseCards = and(
  inArray(artistKey, [...SHOWCASE_ARTISTS]),
  inArray(collections.class, SHOWCASE_CLASSES),
  ilike(collections.collectionNo, "%Z"),
);

async function loadShowcase(day: number): Promise<Showcase | null> {
  const seasons = await mirror
    .select({
      artist: artistKey,
      season: collections.season,
      latest: max(collections.createdAt),
    })
    .from(collections)
    .where(showcaseCards)
    .groupBy(artistKey, collections.season);

  // Each artist's newest few seasons. Season names repeat across artists
  // (tripleS and ARTMS both have an Atom02), so they're kept per artist.
  const recent = SHOWCASE_ARTISTS.map((artist) => ({
    artist,
    seasons: seasons
      .filter((s) => s.artist === artist)
      .sort((a, b) => (b.latest?.getTime() ?? 0) - (a.latest?.getTime() ?? 0))
      .slice(0, SEASONS_TO_SCAN)
      .map((s) => s.season),
  })).filter((r) => r.seasons.length > 0);
  if (!recent.some((r) => r.artist === "triples")) return null;

  const rows = await mirror
    .select({
      id: collections.id,
      artist: artistKey,
      season: collections.season,
      member: collections.member,
      collectionNo: collections.collectionNo,
      class: collections.class,
      thumbnailImage: collections.thumbnailImage,
      createdAt: collections.createdAt,
    })
    .from(collections)
    .where(
      and(
        showcaseCards,
        or(
          ...recent.map(({ artist, seasons }) =>
            and(eq(artistKey, artist), inArray(collections.season, seasons)),
          ),
        ),
      ),
    );
  return pickShowcase(rows, day);
}

/** Today's home-page showcase, cached per Seoul day. */
export function getShowcase(now = Date.now()): Promise<Showcase | null> {
  const day = showcaseDay(now);
  return getCached(`home:showcase:v6:${day}`, CACHE_TTL_MS, () =>
    loadShowcase(day),
  );
}
