import { type NextRequest, NextResponse } from "next/server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { membersByArtist } from "@/lib/filters";
import { getGridRank } from "@/lib/progress/grid-rank";

const allMembers = new Set(Object.values(membersByArtist).flat());

/**
 * Where a single viewer's grid-craft count for a member/season ranks among
 * everyone who's crafted at least one grid — without needing to know anyone
 * else's identity. Query is cheap (no spin-exclusion anti-join, see
 * route.ts's own gridMintCount comment) and cached once per member/season,
 * shared across every visitor who checks it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string; member: string }> },
) {
  const { nickname, member } = await params;

  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 });
  }
  if (!member || !allMembers.has(member)) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const season = request.nextUrl.searchParams.get("season");
  if (!season) {
    return NextResponse.json({ error: "Missing season" }, { status: 400 });
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

  const gridRank = await getGridRank(resolved.address, member, season);

  return NextResponse.json({ season, ...gridRank });
}
