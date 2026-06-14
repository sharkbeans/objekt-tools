import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeArtistId } from "@/lib/artist-utils";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { validSeasons } from "@/lib/filters";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const seasonOrder: Record<string, number> = Object.fromEntries(
  validSeasons.map((s, i) => [s, i]),
);

export async function GET() {
  const rows = await getCached("progress:member-images:v1", 10 * 60_000, () =>
    indexer
      .select({
        artist: collections.artist,
        member: collections.member,
        season: collections.season,
        thumbnailImage: collections.thumbnailImage,
      })
      .from(collections)
      .where(eq(collections.class, "Welcome")),
  );

  // Pick the latest season's Welcome objekt per artist|member
  const best = new Map<string, { season: string; thumbnailImage: string }>();
  for (const row of rows) {
    const key = `${normalizeArtistId(row.artist)}|${row.member}`;
    const existing = best.get(key);
    const newIdx = seasonOrder[row.season] ?? -1;
    const existingIdx = existing ? (seasonOrder[existing.season] ?? -1) : -2;
    if (newIdx > existingIdx) {
      best.set(key, { season: row.season, thumbnailImage: row.thumbnailImage });
    }
  }

  const images: Record<string, string> = {};
  for (const [key, entry] of best) {
    images[key] = entry.thumbnailImage;
  }

  return NextResponse.json(
    { images },
    {
      headers: {
        "Cache-Control": "public, max-age=600, stale-while-revalidate=1200",
      },
    },
  );
}
