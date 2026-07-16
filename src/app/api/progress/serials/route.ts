import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { loadOwnedObjektsForPublicCollectionIds } from "@/lib/indexer-owned-objekts";
import type { ProgressSerialsResponse } from "@/lib/progress/types";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const collectionId = searchParams.get("collectionId");

  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!collectionId) {
    return NextResponse.json(
      { error: "Missing collectionId" },
      { status: 400 },
    );
  }

  const session = await getSession();
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const rateLimitKey = `rate-limit:progress-serials:${rateLimitId}`;
  const limit = session ? 120 : 30;
  try {
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 60);
    if (attempts > limit) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 },
      );
    }
  } catch {
    // Redis unavailable — skip rate limiting
  }

  const rows = await getCached(
    `progress:serials:v1:${address.toLowerCase()}:${collectionId}`,
    60_000,
    async () => {
      const ownedRows = await loadOwnedObjektsForPublicCollectionIds(address, [
        collectionId,
      ]);
      return ownedRows.map((row) => ({
        serial: row.serial,
        objektId: row.objektId,
        transferable: row.transferable,
      }));
    },
  );

  const response: ProgressSerialsResponse = { serials: rows };
  return NextResponse.json(response);
}
