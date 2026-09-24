import { type NextRequest, NextResponse } from "next/server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { membersByArtist } from "@/lib/filters";
import { getGridMintCounts } from "@/lib/progress/grid-mints";
import { decodeRouteParam } from "@/lib/route-params";

const allMembers = new Set(Object.values(membersByArtist).flat());

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nickname: string; member: string }> },
) {
  const { nickname: rawNickname, member: rawMember } = await params;
  const nickname = decodeRouteParam(rawNickname);
  const member = decodeRouteParam(rawMember);

  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 });
  }
  if (!member || !allMembers.has(member)) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let resolved: Awaited<ReturnType<typeof resolveNickname>>;
  try {
    resolved = await resolveNickname(nickname);
  } catch (error) {
    if (error instanceof CosmoUnavailableError) {
      return NextResponse.json(
        { error: "Cosmo is temporarily unavailable. Try again later." },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!resolved) {
    return NextResponse.json(
      { error: "Cosmo user not found" },
      { status: 404 },
    );
  }

  // Only the Grid tab needs this, so the default Collection view no longer
  // waits for transfer-history data. Shared with saved hunts (lib/hunts).
  return NextResponse.json({
    counts: await getGridMintCounts(resolved.address, member),
  });
}
