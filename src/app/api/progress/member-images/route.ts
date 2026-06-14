import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normalizeArtistId } from "@/lib/artist-utils";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { realMembersByArtist, validSeasons } from "@/lib/filters";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const COSMO_ARTISTS = ["tripleS", "artms", "idntt"] as const;

// Verified static headshots from static.cosmo.fans — same source Apollo uses.
// Cosmo API profileImageUrl (fetched below) will override these if available.

// idntt: /uploads/member-profile/idntt-{Korean}.jpg (only verified members)
const IDNTT_KOREAN: Record<string, string> = {
  DoHun:    "도훈",
  HeeJu:    "희주",
  TaeIn:    "태인",
  JaeYoung: "재영",
  JuHo:     "주호",
  JiWoon:   "지운",
  HwanHee:  "환희",
  MinGyeol: "민결",
};

const STATIC_IMAGES: Record<string, string> = {
  ...Object.fromEntries(
    realMembersByArtist.tripleS.map((name, i) => [
      `tripleS|${name}`,
      `https://static.cosmo.fans/uploads/member-profile/2025-05-01/S${i + 1}.jpg`,
    ]),
  ),
  ...Object.fromEntries(
    realMembersByArtist.artms.map((name) => [
      `artms|${name}`,
      `https://static.cosmo.fans/images/artms/${name}.jpg`,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(IDNTT_KOREAN).map(([eng, kor]) => [
      `idntt|${eng}`,
      `https://static.cosmo.fans/uploads/member-profile/idntt-${kor}.jpg`,
    ]),
  ),
};

const seasonOrder: Record<string, number> = Object.fromEntries(
  validSeasons.map((s, i) => [s, i]),
);

interface CosmoMember {
  name: string;
  order: number;
  profileImageUrl?: string;
}

interface CosmoArtistResponse {
  artist: {
    members: CosmoMember[];
  };
}

async function fetchCosmoProfileImages(): Promise<Record<string, string>> {
  const results = await Promise.all(
    COSMO_ARTISTS.map(async (artist) => {
      const res = await fetch(`https://api.cosmo.fans/artist/v1/${artist}`, {
        next: { revalidate: 604800 },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as CosmoArtistResponse;
      const artistId = normalizeArtistId(artist);
      return data.artist.members
        .filter((m) => m.profileImageUrl)
        .map((m) => [`${artistId}|${m.name}`, m.profileImageUrl!] as const);
    }),
  );

  return Object.fromEntries(results.flat());
}

async function fetchWelcomeFallbackImages(): Promise<Record<string, string>> {
  const rows = await indexer
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

  return Object.fromEntries([...best.entries()].map(([k, v]) => [k, v.frontImage]));
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
      return { ...fallback, ...STATIC_IMAGES, ...cosmo };
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
