import { NextResponse } from "next/server";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const COSMO_ARTISTS = ["tripleS", "artms", "idntt"];

interface CosmoMember {
  name: string;
  order: number;
}

interface CosmoArtistResponse {
  artist: {
    members: CosmoMember[];
  };
}

async function fetchMemberOrder(
  artist: string,
): Promise<{ artist: string; members: string[] }> {
  const res = await fetch(`https://api.cosmo.fans/artist/v1/${artist}`, {
    next: { revalidate: 604800 },
  });
  if (!res.ok) throw new Error(`cosmo.fans ${artist} returned ${res.status}`);
  const data = (await res.json()) as CosmoArtistResponse;
  const members = data.artist.members
    .sort((a, b) => a.order - b.order)
    .map((m) => m.name);
  return { artist: artist.toLowerCase(), members };
}

export async function GET() {
  try {
    const results = await getCached("spin:members:v1", 7 * 24 * 60 * 60_000, () =>
      Promise.all(COSMO_ARTISTS.map(fetchMemberOrder)),
    );

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=604800",
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
