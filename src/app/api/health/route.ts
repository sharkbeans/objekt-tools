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

const PROBE_TIMEOUT_MS = 5000;

// Pool counters alone missed the 2026-07-18 outage: stuck clients showed
// total 8 / idle 0 / waiting 0 between requests, so isSaturated stayed false
// for ten hours. Only actually running a query proves the pool can serve one —
// and a probe failing with a checkout timeout trips the pool recycler even
// when no user traffic is arriving.
async function probeIndexer(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!process.env.INDEXER_DATABASE_URL) return { ok: true };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      indexerPool.query("select 1"),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("indexer probe timed out")),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const probe = await probeIndexer();
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

  const ok = !saturated && probe.ok;
  return NextResponse.json(
    {
      ok,
      indexerProbe: probe,
      ...(indexerStats ? { indexerPool: indexerStats } : {}),
      ...(mirror !== undefined ? { mirror } : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
