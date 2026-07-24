import { NextResponse } from "next/server";
import {
  getProgressMemberCatalog,
  isProgressMember,
  toPublicProgressMemberCatalog,
} from "@/lib/progress/member-catalog";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ member: string }> },
) {
  const { member } = await params;
  if (!member || !isProgressMember(member)) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const catalog = toPublicProgressMemberCatalog(
    await getProgressMemberCatalog(member),
  );
  return NextResponse.json(catalog, {
    headers: {
      "Cache-Control":
        "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
