import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeArtistId } from "@/lib/artist-utils";
import { fetchArtistDetail } from "@/lib/cosmo/client";
import { mirror } from "@/lib/db/indexer-mirror";
import { collections } from "@/lib/db/indexer-schema";
import { validSeasons } from "@/lib/filters";
import { STATIC_MEMBER_IMAGES } from "@/lib/progress/member-images";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const COSMO_ARTISTS = ["tripleS", "artms", "idntt"] as const;

const seasonOrder: Record<string, number> = Object.fromEntries(
  validSeasons.map((s, i) => [s, i]),
);

async function fetchCosmoProfileImages(): Promise<Record<string, string>> {
  const results = await Promise.all(
    COSMO_ARTISTS.map(async (artist) => {
      const detail = await fetchArtistDetail(artist);
      const artistId = normalizeArtistId(artist);
      return (detail?.artistMembers ?? []).flatMap((m) =>
        m.profileImageUrl
          ? [[`${artistId}|${m.name}`, m.profileImageUrl] as const]
          : [],
      );
    }),
  );

  return Object.fromEntries(results.flat());
}

async function fetchWelcomeFallbackImages(): Promise<Record<string, string>> {
  const rows = await mirror
    .select({
      artist: collections.artist,
      member: collections.member,
      season: collections.season,
      frontImage: collections.frontImage,
    })
    .from(collections)
    .where(eq(collections.class, "Welcome"));

  const best = new Map<string, { season: string; frontImage: string }>();
  for (const row of rows) {
    const key = `${normalizeArtistId(row.artist)}|${row.member}`;
    const existing = best.get(key);
    const newIdx = seasonOrder[row.season] ?? -1;
    const existingIdx = existing ? (seasonOrder[existing.season] ?? -1) : -2;
    if (newIdx > existingIdx) {
      best.set(key, { season: row.season, frontImage: row.frontImage });
    }
  }

  return Object.fromEntries(
    [...best.entries()].map(([k, v]) => [k, v.frontImage]),
  );
}

export async function GET() {
  const images = await getCached(
    "progress:member-images:v1",
    60 * 60_000,
    async () => {
      const [cosmo, fallback] = await Promise.all([
        fetchCosmoProfileImages(),
        fetchWelcomeFallbackImages(),
      ]);
      // Priority: Cosmo API > static headshots > Welcome frontImage
      return { ...fallback, ...STATIC_MEMBER_IMAGES, ...cosmo };
    },
  );

  return NextResponse.json(
    { images },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
      },
    },
  );
}
