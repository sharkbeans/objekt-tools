import { NextResponse } from "next/server";
import { indexerPool } from "@/lib/db/indexer";
import {
  getMirrorHealthSnapshot,
  isMirrorEnabled,
} from "@/lib/db/indexer-mirror";

export const dynamic = "force-dynamic";

type PoolStats = {
  total: number;
  idle: number;
  waiting: number;
};

function getIndexerPoolStats(): PoolStats | null {
  if (!process.env.INDEXER_DATABASE_URL) return null;
  return {
    total: indexerPool.totalCount,
    idle: indexerPool.idleCount,
    waiting: indexerPool.waitingCount,
  };
}

// Saturated = every client checked out and requests queueing. With the
// query_timeout backstop this self-heals within ~30s, so only sustained
// saturation (Docker healthcheck: 5 failures x 30s) marks the container
// unhealthy — the signature of the 2026-07-17 pool-exhaustion outage.
function isSaturated(stats: PoolStats | null): boolean {
  return stats !== null && stats.waiting > 0 && stats.idle === 0;
}

export async function GET() {
  const indexerStats = getIndexerPoolStats();
  const saturated = isSaturated(indexerStats);

  let mirror: unknown;
  if (isMirrorEnabled()) {
    try {
      mirror = await getMirrorHealthSnapshot();
    } catch (error) {
      console.error("Mirror health check failed:", error);
      mirror = "error";
    }
  }

  return NextResponse.json(
    {
      ok: !saturated,
      ...(indexerStats ? { indexerPool: indexerStats } : {}),
      ...(mirror !== undefined ? { mirror } : {}),
    },
    { status: saturated ? 503 : 200 },
  );
}
