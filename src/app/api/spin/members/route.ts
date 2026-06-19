import { NextResponse } from "next/server";
import { fetchArtistDetail } from "@/lib/cosmo/client";
import type { ValidArtist } from "@/lib/cosmo/types";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const COSMO_ARTISTS: ValidArtist[] = ["tripleS", "artms", "idntt"];

async function fetchMemberOrder(
  artist: ValidArtist,
): Promise<{ artist: string; members: string[] }> {
  const detail = await fetchArtistDetail(artist);
  if (!detail) throw new Error(`cosmo.fans ${artist} returned no data`);
  const members = (detail.artistMembers ?? [])
    .sort((a, b) => a.order - b.order)
    .map((m) => m.name);
  return { artist: artist.toLowerCase(), members };
}

export async function GET() {
  try {
    const results = await getCached(
      "spin:members:v1",
      7 * 24 * 60 * 60_000,
      () => Promise.all(COSMO_ARTISTS.map(fetchMemberOrder)),
    );

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control":
            "public, max-age=604800, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.warn("Failed to load member order from cosmo.fans", error);
    return NextResponse.json(
      { error: "Failed to load member order", results: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
