import { NextRequest, NextResponse } from "next/server";

const TYPESENSE_URL = "https://search.apollo.cafe";
const TYPESENSE_KEY = "64oQs36OCM8O6sbVbGGf52FMwzoYDOve";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "*";

  const params = new URLSearchParams({
    q,
    query_by: "member,collectionId,season,collectionNo",
    per_page: "20",
    sort_by: "createdAt:desc",
  });

  const res = await fetch(
    `${TYPESENSE_URL}/collections/collections/documents/search?${params}`,
    {
      headers: { "X-TYPESENSE-API-KEY": TYPESENSE_KEY },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ hits: [] }, { status: 502 });
  }

  const data = await res.json();

  const results = (data.hits ?? []).map((hit: any) => ({
    collectionId: hit.document.collectionId,
    artist: hit.document.artist,
    member: hit.document.member,
    collectionNo: hit.document.collectionNo,
    season: hit.document.season,
    class: hit.document.class,
  }));

  return NextResponse.json({ results });
}
