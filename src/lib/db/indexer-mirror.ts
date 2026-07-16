import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { indexer, indexerPool } from "./indexer";
import * as schema from "./indexer-schema";

type MirrorDb = ReturnType<typeof drizzle<typeof schema>>;

type MirrorFallbackRuntime = {
  consecutiveFailures: number;
  bypassUntilMs: number;
  lastFailureAtMs: number | null;
  lastFailureReason: string | null;
};

type PoolLike = {
  connect: (...args: unknown[]) => Promise<unknown> | undefined;
  query: (...args: unknown[]) => Promise<unknown> | undefined;
  end?: (...args: unknown[]) => Promise<unknown> | undefined;
  idleCount?: number;
  totalCount?: number;
  waitingCount?: number;
};

export type MirrorFallbackState = {
  enabled: boolean;
  usingFallback: boolean;
  consecutiveFailures: number;
  failureThreshold: number;
  cooldownMs: number;
  timeoutMs: number;
  fallbackUntil: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
};

export type MirrorHealthSnapshot = {
  collectionCursorAgeSec: number | null;
  objektCursorAgeSec: number | null;
  trueupCursor: null;
} & MirrorFallbackState;

const DEFAULT_MIRROR_QUERY_TIMEOUT_MS = 1500;
const DEFAULT_MIRROR_FAILURE_THRESHOLD = 3;
const DEFAULT_MIRROR_COOLDOWN_MS = 30_000;

const _g = globalThis as typeof globalThis & {
  _mirrorLocalPool?: Pool;
  _mirrorReadSourcePool?: Pool;
  _mirrorFallbackPool?: MirrorFallbackPool;
  _mirrorLocal?: MirrorDb;
  _mirror?: MirrorDb;
  _mirrorFallbackRuntime?: MirrorFallbackRuntime;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getMirrorQueryTimeoutMs(): number {
  return parsePositiveInt(
    process.env.MIRROR_QUERY_TIMEOUT_MS,
    DEFAULT_MIRROR_QUERY_TIMEOUT_MS,
  );
}

function getMirrorFailureThreshold(): number {
  return parsePositiveInt(
    process.env.MIRROR_FALLBACK_FAILURE_THRESHOLD,
    DEFAULT_MIRROR_FAILURE_THRESHOLD,
  );
}

function getMirrorCooldownMs(): number {
  return parsePositiveInt(
    process.env.MIRROR_FALLBACK_COOLDOWN_MS,
    DEFAULT_MIRROR_COOLDOWN_MS,
  );
}

function getMirrorRuntime(): MirrorFallbackRuntime {
  if (!_g._mirrorFallbackRuntime) {
    _g._mirrorFallbackRuntime = {
      consecutiveFailures: 0,
      bypassUntilMs: 0,
      lastFailureAtMs: null,
      lastFailureReason: null,
    };
  }
  return _g._mirrorFallbackRuntime;
}

export function isMirrorEnabled(): boolean {
  return Boolean(process.env.MIRROR_DATABASE_URL);
}

function getMirrorLocalPool(): Pool {
  if (!_g._mirrorLocalPool) {
    const url = process.env.MIRROR_DATABASE_URL;
    if (!url) throw new Error("MIRROR_DATABASE_URL is not configured");
    const connectionTimeoutMillis = Number(
      process.env.MIRROR_CONNECTION_TIMEOUT_MS ?? 3000,
    );
    _g._mirrorLocalPool = new Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis,
      ssl: url.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return _g._mirrorLocalPool;
}

function getMirrorReadSourcePool(): Pool {
  if (!_g._mirrorReadSourcePool) {
    const url = process.env.MIRROR_DATABASE_URL;
    if (!url) throw new Error("MIRROR_DATABASE_URL is not configured");
    const connectionTimeoutMillis = Number(
      process.env.MIRROR_CONNECTION_TIMEOUT_MS ?? 3000,
    );
    const timeoutMs = getMirrorQueryTimeoutMs();
    _g._mirrorReadSourcePool = new Pool({
      connectionString: url,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis,
      query_timeout: timeoutMs,
      statement_timeout: timeoutMs,
      ssl: url.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return _g._mirrorReadSourcePool;
}

function getMirrorLocal(): MirrorDb {
  if (!_g._mirrorLocal) {
    _g._mirrorLocal = drizzle(getMirrorLocalPool(), { schema });
  }
  return _g._mirrorLocal;
}

function isMirrorTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "Query read timeout" ||
    error.message.toLowerCase().includes("statement timeout")
  );
}

function formatErrorForLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toIsoOrNull(valueMs: number | null): string | null {
  return valueMs ? new Date(valueMs).toISOString() : null;
}

export function getMirrorFallbackState(now = Date.now()): MirrorFallbackState {
  const runtime = getMirrorRuntime();
  return {
    enabled: isMirrorEnabled(),
    usingFallback: isMirrorEnabled() && runtime.bypassUntilMs > now,
    consecutiveFailures: runtime.consecutiveFailures,
    failureThreshold: getMirrorFailureThreshold(),
    cooldownMs: getMirrorCooldownMs(),
    timeoutMs: getMirrorQueryTimeoutMs(),
    fallbackUntil: toIsoOrNull(
      runtime.bypassUntilMs > now ? runtime.bypassUntilMs : null,
    ),
    lastFailureAt: toIsoOrNull(runtime.lastFailureAtMs),
    lastFailureReason: runtime.lastFailureReason,
  };
}

export async function getMirrorHealthSnapshot(): Promise<MirrorHealthSnapshot> {
  const { rows } = await getMirrorReadSourcePool().query<{
    key: string;
    cursor_ts: Date | null;
  }>("SELECT key, cursor_ts FROM sync_state");

  const cursorAgeSec = (key: string) => {
    const cursorTs = rows.find((row) => row.key === key)?.cursor_ts;
    return cursorTs
      ? Math.round((Date.now() - cursorTs.getTime()) / 1000)
      : null;
  };

  return {
    ...getMirrorFallbackState(),
    collectionCursorAgeSec: cursorAgeSec("collection"),
    objektCursorAgeSec: cursorAgeSec("objekt"),
    trueupCursor: null,
  };
}

type MirrorFallbackPoolOptions = {
  getMirrorPool: () => PoolLike;
  getRemotePool: () => PoolLike;
  isMirrorEnabled: () => boolean;
  runtime: MirrorFallbackRuntime;
  now?: () => number;
  warn?: (message: string, error?: unknown) => void;
  failureThreshold?: number;
  cooldownMs?: number;
};

export class MirrorFallbackPool {
  private readonly now: () => number;
  private readonly warn: (message: string, error?: unknown) => void;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(private readonly options: MirrorFallbackPoolOptions) {
    this.now = options.now ?? Date.now;
    this.warn =
      options.warn ??
      ((message, error) => {
        if (error) {
          console.warn(message, error);
          return;
        }
        console.warn(message);
      });
    this.failureThreshold =
      options.failureThreshold ?? getMirrorFailureThreshold();
    this.cooldownMs = options.cooldownMs ?? getMirrorCooldownMs();
  }

  get totalCount(): number {
    return this.getPreferredPool().totalCount ?? 0;
  }

  get idleCount(): number {
    return this.getPreferredPool().idleCount ?? 0;
  }

  get waitingCount(): number {
    return this.getPreferredPool().waitingCount ?? 0;
  }

  connect(...args: unknown[]): Promise<unknown> | undefined {
    return (
      this.getPreferredPool().connect as (...params: unknown[]) => unknown
    )(...args);
  }

  end(...args: unknown[]): Promise<unknown> | undefined {
    return (
      this.getPreferredPool().end as
        | ((...params: unknown[]) => unknown)
        | undefined
    )?.(...args);
  }

  query(...args: unknown[]): Promise<unknown> | undefined {
    const callback =
      typeof args.at(-1) === "function"
        ? (args.pop() as (error: Error | null, result?: unknown) => void)
        : undefined;
    const promise = this.queryInternal(args);

    if (!callback) {
      return promise;
    }

    void promise.then(
      (result) => callback(null, result),
      (error) =>
        callback(
          error instanceof Error ? error : new Error(formatErrorForLog(error)),
        ),
    );
  }

  private getPreferredPool(): PoolLike {
    return this.shouldBypassMirror()
      ? this.options.getRemotePool()
      : this.options.getMirrorPool();
  }

  private shouldBypassMirror(): boolean {
    if (!this.options.isMirrorEnabled()) {
      return true;
    }

    const now = this.now();
    if (
      this.options.runtime.bypassUntilMs > 0 &&
      this.options.runtime.bypassUntilMs <= now
    ) {
      this.options.runtime.bypassUntilMs = 0;
      this.options.runtime.consecutiveFailures = 0;
    }

    return this.options.runtime.bypassUntilMs > now;
  }

  private clearFailures() {
    this.options.runtime.consecutiveFailures = 0;
    this.options.runtime.bypassUntilMs = 0;
  }

  private markFailure(error: unknown) {
    const now = this.now();
    const runtime = this.options.runtime;
    runtime.consecutiveFailures += 1;
    runtime.lastFailureAtMs = now;
    runtime.lastFailureReason = isMirrorTimeoutError(error)
      ? "timeout"
      : formatErrorForLog(error);

    const opensCircuit = runtime.consecutiveFailures >= this.failureThreshold;
    if (opensCircuit) {
      runtime.bypassUntilMs = now + this.cooldownMs;
    }

    const reason = isMirrorTimeoutError(error) ? "timed out" : "errored";
    const cooldownSuffix = opensCircuit
      ? `; circuit open until ${new Date(runtime.bypassUntilMs).toISOString()}`
      : "";
    this.warn(
      `Mirror query ${reason}; falling back to remote indexer (failure ${runtime.consecutiveFailures}/${this.failureThreshold}${cooldownSuffix})`,
      error,
    );
  }

  private async queryInternal(args: unknown[]): Promise<unknown> {
    if (this.shouldBypassMirror()) {
      return await this.options.getRemotePool().query(...args);
    }

    try {
      const result = await this.options.getMirrorPool().query(...args);
      this.clearFailures();
      return result;
    } catch (mirrorError) {
      this.markFailure(mirrorError);
      return await this.options.getRemotePool().query(...args);
    }
  }
}

function getFallbackPool(): MirrorFallbackPool {
  if (!_g._mirrorFallbackPool) {
    _g._mirrorFallbackPool = new MirrorFallbackPool({
      getMirrorPool: getMirrorReadSourcePool,
      getRemotePool: () => indexerPool,
      isMirrorEnabled,
      runtime: getMirrorRuntime(),
    });
  }
  return _g._mirrorFallbackPool;
}

function getMirror(): MirrorDb {
  if (!_g._mirror) {
    _g._mirror = drizzle(getFallbackPool() as unknown as Pool, { schema });
  }
  return _g._mirror;
}

// Public read path: query the local mirror first, then transparently retry the
// remote indexer on mirror timeout/error. When the mirror is disabled entirely,
// this behaves exactly like the remote indexer.
export const mirrorPool: Pool = new Proxy({} as Pool, {
  get(_, prop) {
    const pool = getFallbackPool() as unknown as Pool;
    const value = Reflect.get(pool, prop);
    return typeof value === "function" ? value.bind(pool) : value;
  },
});

export const mirror: MirrorDb = new Proxy({} as MirrorDb, {
  get(_, prop) {
    return Reflect.get(isMirrorEnabled() ? getMirror() : indexer, prop);
  },
});

// Local-only mirror access for sync/bootstrap paths. This must never fall back
// to the remote indexer because writes should fail loudly when the mirror DB is
// unhealthy.
export const mirrorLocalPool: Pool = new Proxy({} as Pool, {
  get(_, prop) {
    const pool = getMirrorLocalPool();
    const value = Reflect.get(pool, prop);
    return typeof value === "function" ? value.bind(pool) : value;
  },
});

export const mirrorLocal: MirrorDb = new Proxy({} as MirrorDb, {
  get(_, prop) {
    return Reflect.get(getMirrorLocal(), prop);
  },
});
