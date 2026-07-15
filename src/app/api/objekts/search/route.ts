import { type NextRequest, NextResponse } from "next/server";
import { getObjektCatalog } from "@/lib/objekt-catalog";

export const dynamic = "force-dynamic";

/**
 * Legacy collectionId lookup, kept for thumbnail-hydration callers
 * (trade cards, initiate/counter dialogs, objekt-images batch lookups).
 * Structural/text search now happens client-side against the full catalog
 * served by /api/objekts/catalog — see objekt-picker.tsx.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const collectionIds = params.getAll("collection_id");

  if (collectionIds.length > 100) {
    return NextResponse.json(
      { error: "Too many collection ids" },
      { status: 400 },
    );
  }

  if (!q && collectionIds.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const wanted = new Set(
    [...collectionIds, ...(q ? [q] : [])].map((id) => id.toLowerCase()),
  );

  const catalog = await getObjektCatalog();
  const results = catalog.filter((row) =>
    wanted.has(row.collectionId.toLowerCase()),
  );

  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    },
  );
}
