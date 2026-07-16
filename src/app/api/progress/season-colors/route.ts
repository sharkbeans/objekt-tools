import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeArtistId } from "@/lib/artist-utils";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";

export async function GET() {
  try {
    const colors = await getCached(
      "progress:season-colors",
      24 * 60 * 60_000,
      async () => {
        const rows = await mirror
          .selectDistinctOn([collections.artist, collections.season], {
            artist: collections.artist,
            season: collections.season,
            accentColor: collections.accentColor,
          })
          .from(collections)
          .where(
            and(
              eq(collections.class, "First"),
              ne(collections.accentColor, ""),
            ),
          )
          .orderBy(
            collections.artist,
            collections.season,
            collections.accentColor,
          );

        const result: Record<string, string> = {};
        for (const row of rows) {
          if (!row.accentColor.startsWith("#")) continue;
          const artist = normalizeArtistId(row.artist);
          result[`${artist}|${row.season}`] = row.accentColor;
        }
        return result;
      },
    );
    return NextResponse.json({ colors });
  } catch {
    return NextResponse.json({ colors: {} });
  }
}
