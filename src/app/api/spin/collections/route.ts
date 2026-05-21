import { asc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { indexer } from "@/lib/db/indexer";
import { collections } from "@/lib/db/indexer-schema";

const spinClasses = [
  "First",
  "Basic",
  "Special",
  "Premier",
  "First Class",
  "Basic Class",
  "Special Class",
  "Premier Class",
];

export async function GET() {
  try {
    const rows = await indexer
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
      .where(inArray(collections.class, spinClasses))
      .orderBy(
        asc(collections.season),
        asc(collections.class),
        asc(collections.member),
        asc(collections.collectionNo),
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
    console.error("Failed to load spin collections", error);
    return NextResponse.json(
      { error: "Failed to load spin collections", results: [] },
      { status: 500 },
    );
  }
}
