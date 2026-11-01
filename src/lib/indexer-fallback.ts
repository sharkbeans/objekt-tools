// While the remote indexer database is unreachable, reads that have an
// objekt.top public API equivalent (see objekt-top-api.ts) are served from the
// API instead. After a failure the indexer is skipped for a cooldown, so an
// outage costs one failed attempt per cooldown rather than one per request
// (a dead socket can take the pool's full connection timeout to fail).
//
// INDEXER_API_FALLBACK=off turns this off and restores the old behaviour of
// surfacing indexer errors to the caller.

const DEFAULT_COOLDOWN_MS = 60_000;

type FallbackRuntime = {
  bypassUntilMs: number;
  lastFailureAtMs: number | null;
  lastFailureReason: string | null;
  lastFallbackAtMs: number | null;
};

const _g = globalThis as typeof globalThis & {
  _indexerFallbackRuntime?: FallbackRuntime;
};

function runtime(): FallbackRuntime {
  if (!_g._indexerFallbackRuntime) {
    _g._indexerFallbackRuntime = {
      bypassUntilMs: 0,
      lastFailureAtMs: null,
      lastFailureReason: null,
      lastFallbackAtMs: null,
    };
  }
  return _g._indexerFallbackRuntime;
}

function cooldownMs(): number {
  const parsed = Number(process.env.INDEXER_FALLBACK_COOLDOWN_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_COOLDOWN_MS;
}

// Drizzle wraps driver errors as "Failed query: <sql>"; the reason worth
// logging (ECONNREFUSED, a timeout) is the cause.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error && error.message.startsWith("Failed query")) {
    return cause.message;
  }
  return error.message;
}

export function isApiFallbackEnabled(): boolean {
  return process.env.INDEXER_API_FALLBACK !== "off";
}

/** True while a recent indexer failure means it should not be tried. */
export function isIndexerBypassed(now = Date.now()): boolean {
  return runtime().bypassUntilMs > now;
}

export function markIndexerFailed(error: unknown, now = Date.now()): void {
  const state = runtime();
  state.bypassUntilMs = now + cooldownMs();
  state.lastFailureAtMs = now;
  state.lastFailureReason = describeError(error);
}

/**
 * Runs `primary` against the indexer; if it fails (or failed recently), runs
 * `fallback` instead. With the fallback disabled, `primary` runs and its
 * errors propagate as before.
 */
export async function withIndexerFallback<T>(
  label: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  if (!isApiFallbackEnabled()) return primary();

  if (!isIndexerBypassed()) {
    try {
      return await primary();
    } catch (error) {
      markIndexerFailed(error);
      console.warn(
        `Indexer read "${label}" failed (${describeError(error)}); serving it from the objekt.top API for ${cooldownMs() / 1000}s`,
      );
    }
  }

  runtime().lastFallbackAtMs = Date.now();
  return fallback();
}

export type IndexerFallbackState = {
  enabled: boolean;
  bypassingIndexer: boolean;
  bypassUntil: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastFallbackAt: string | null;
};

export function getIndexerFallbackState(
  now = Date.now(),
): IndexerFallbackState {
  const state = runtime();
  const iso = (ms: number | null) =>
    ms === null ? null : new Date(ms).toISOString();
  return {
    enabled: isApiFallbackEnabled(),
    bypassingIndexer: isIndexerBypassed(now),
    bypassUntil: isIndexerBypassed(now) ? iso(state.bypassUntilMs) : null,
    lastFailureAt: iso(state.lastFailureAtMs),
    lastFailureReason: state.lastFailureReason,
    lastFallbackAt: iso(state.lastFallbackAtMs),
  };
}

/** Test-only: forget every recorded failure. */
export function resetIndexerFallbackForTests(): void {
  _g._indexerFallbackRuntime = undefined;
}
