import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { buildFilterOptions } from "@/lib/filter-options";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getCached("objekts:filter-options:v1", 10 * 60_000, () =>
      indexer
        .selectDistinct({
          artist: collections.artist,
          member: collections.member,
          season: collections.season,
          className: collections.class,
        })
        .from(collections)
        .orderBy(
          asc(collections.artist),
          asc(collections.season),
          asc(collections.class),
          asc(collections.member),
        ),
    );

    const artists = new Set<string>();
    const membersByArtist: Record<string, string[]> = {};
    const seasonsByArtist: Record<string, string[]> = {};
    const classesByArtist: Record<string, string[]> = {};

    for (const row of rows) {
      artists.add(row.artist);
      membersByArtist[row.artist] = [
        ...(membersByArtist[row.artist] ?? []),
        row.member,
      ];
      seasonsByArtist[row.artist] = [
        ...(seasonsByArtist[row.artist] ?? []),
        row.season,
      ];
      classesByArtist[row.artist] = [
        ...(classesByArtist[row.artist] ?? []),
        row.className,
      ];
    }

    return NextResponse.json(
      buildFilterOptions({
        artists: [...artists],
        membersByArtist,
        seasonsByArtist,
        classesByArtist,
      }),
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    console.warn("Failed to load objekt filter options", error);
    return NextResponse.json(
      { error: "Failed to load filter options" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
