import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";

const OBJEKT_TOP_URL = "https://objekt.top";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.userId, session.user.id),
  });

  if (!linked) {
    return NextResponse.json(
      { error: "Cosmo account not linked" },
      { status: 404 },
    );
  }

  const params = new URLSearchParams();
  params.append("artist", "artms");
  params.append("artist", "tripleS");
  params.append("artist", "idntt");

  const res = await fetch(
    `${OBJEKT_TOP_URL}/api/objekts/owned-by/${linked.address}?${params}`,
    { next: { revalidate: 60 } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch owned objekts" },
      { status: 502 },
    );
  }

  const data = await res.json();

  const results = (data.objekts ?? [])
    .filter((o: any) => o.transferable)
    .map((o: any) => ({
      collectionId: o.collectionId,
      artist: o.artist,
      member: o.member,
      collectionNo: o.collectionNo,
      season: o.season,
      class: o.class,
      thumbnailImage: o.thumbnailImage,
      serial: o.serialNo,
    }));

  return NextResponse.json({ results });
}
