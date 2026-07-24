import { type NextRequest, NextResponse } from "next/server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import { indexerPool } from "@/lib/db/indexer";
import { membersByArtist } from "@/lib/filters";
import { ZERO_ADDRESS } from "@/lib/indexer-constants";
import { getCachedStaleWhileRevalidate } from "@/lib/server-cache";

type GridMintCountRow = {
  collection_id: string;
  grid_mint_count: string;
};

const allMembers = new Set(Object.values(membersByArtist).flat());

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ nickname: string; member: string }> },
) {
  const { nickname, member } = await params;

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

  // A completed grid mints a Special reward from the zero address. This
  // query is only needed by the Grid tab, so the default Collection view no
  // longer waits for transfer-history data.
  const rows = await getCachedStaleWhileRevalidate(
    `progress:grid-mints:v3:${resolved.address}:${member.toLowerCase()}`,
    10 * 60_000,
    async () => {
      const result = await indexerPool.query<GridMintCountRow>(
        `
          select
            c.collection_id,
            count(*)::text as grid_mint_count
          from transfer reward
          join collection c on c.id = reward.collection_id
          where reward."from" = $1
            and reward."to" = $2
            and c.member = $3
            and c.class = 'Special'
            and c.on_offline = 'online'
          group by c.collection_id
        `,
        [ZERO_ADDRESS, resolved.address, member],
      );
      return result.rows;
    },
  );

  return NextResponse.json({
    counts: Object.fromEntries(
      rows.map((row) => [row.collection_id, Number(row.grid_mint_count)]),
    ),
  });
}
