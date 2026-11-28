import { NextResponse } from "next/server";
import { getShowcase } from "@/lib/home/showcase.server";

export const dynamic = "force-dynamic";

/**
 * Real cards for the home page's two feature panels. The page itself stays
 * static and asks for these after it loads, so a slow or absent indexer only
 * costs the panels their card tables, never the page.
 */
export async function GET() {
  try {
    const showcase = await getShowcase();
    if (!showcase) {
      return NextResponse.json(
        { showcase: null },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );
    }
    return NextResponse.json(
      { showcase },
      {
        headers: {
          "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.warn("Failed to load the home showcase", error);
    return NextResponse.json(
      { showcase: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
