import { NextResponse } from "next/server";
import {
  getProgressMemberCatalog,
  isProgressMember,
} from "@/lib/progress/member-catalog";
import {
  hasGlobalTradableCopy,
  loadCollectionTradabilityByDbId,
} from "@/lib/progress/tradability";
import type { ProgressMemberTradabilityResponse } from "@/lib/progress/types";
import { getCachedStaleWhileRevalidate } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ member: string }> },
) {
  const { member } = await params;
  if (!member || !isProgressMember(member)) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const catalog = await getProgressMemberCatalog(member);
  const tradabilityById = await getCachedStaleWhileRevalidate(
    `progress:member-tradability:v1:${member.toLowerCase()}`,
    10 * 60_000,
    () =>
      loadCollectionTradabilityByDbId(
        catalog.collections.map((collection) => collection.collectionDbId),
      ),
  );

  const counts: ProgressMemberTradabilityResponse["counts"] = {};
  for (const collection of catalog.collections) {
    const tradability = tradabilityById.get(collection.collectionDbId);
    counts[collection.collectionId] = {
      globalTotalCount: tradability?.totalCount ?? 0,
      globalTradableCount: tradability?.tradableCount ?? 0,
      progressCountable:
        collection.baseProgressCountable && hasGlobalTradableCopy(tradability),
    };
  }

  return NextResponse.json(
    { member, counts } satisfies ProgressMemberTradabilityResponse,
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
      },
    },
  );
}
