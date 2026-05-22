import { and, asc, ilike, inArray, not } from "drizzle-orm";
import { NextResponse } from "next/server";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const spinClasses = [
  "First",
  "Basic",
  "Special",
  "Premier",
  "Unit",
  "First Class",
  "Basic Class",
  "Special Class",
  "Premier Class",
  "Unit Class",
];

export async function GET() {
  try {
    const rows = await getCached("spin:collections:v2", 10 * 60_000, () =>
      indexer
        .select({
          collectionId: collections.collectionId,
          artist: collections.artist,
          member: collections.member,
          collectionNo: collections.collectionNo,
          season: collections.season,
          class: collections.class,
          frontImage: collections.frontImage,
          backImage: collections.backImage,
          thumbnailImage: collections.thumbnailImage,
        })
        .from(collections)
        .where(
          and(
            inArray(collections.class, spinClasses),
            not(ilike(collections.collectionNo, "%A")),
          ),
        )
        .orderBy(
          asc(collections.season),
          asc(collections.class),
          asc(collections.member),
          asc(collections.collectionNo),
        ),
    );

    return NextResponse.json(
      { results: rows },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    console.warn("Failed to load spin collections", error);
    return NextResponse.json(
      { error: "Failed to load spin collections", results: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
