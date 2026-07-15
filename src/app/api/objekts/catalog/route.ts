import { NextResponse } from "next/server";
import { getObjektCatalog } from "@/lib/objekt-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const collections = await getObjektCatalog();

  return NextResponse.json(
    { collections },
    {
      headers: {
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=86400",
      },
    },
  );
}
