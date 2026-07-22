import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  CosmoUnavailableError,
  resolveNickname,
  validateNickname,
} from "@/lib/cosmo/resolve-nickname";
import {
  countTransferableInventoryRows,
  hasAnyTransferableInventoryCandidate,
  hasInventoryPageFilters,
  type InventoryOwnershipCandidate,
  type InventoryPageFilters,
  loadTransferableInventoryPage,
} from "@/lib/indexer-owned-objekts";
import { withTimeout } from "@/lib/promise-timeout";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_FILTER_VALUES = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

type InventoryRateLimitResult =
  | { delayedMs: number; headers: HeadersInit }
  | { response: NextResponse };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const nickname = (await params).nickname;
  const validationError = validateInventoryRequest(nickname, request);
  if (validationError) return validationError;

  const rateLimit = await applyRateLimit(request, "page");
  if ("response" in rateLimit) return rateLimit.response;
  if (rateLimit.delayedMs > 0) {
    await sleep(rateLimit.delayedMs);
  }

  const resolved = await resolveInventoryOwner(nickname);
  if (resolved instanceof NextResponse) return resolved;

  const page = parseBoundedInteger(request.nextUrl.searchParams.get("page"), 1);
  const limit = parseBoundedInteger(
    request.nextUrl.searchParams.get("limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const filters = parseInventoryFilters(request.nextUrl.searchParams);
  const address = resolved.address;

  try {
    const totalPromise = getCached(
      `objekts:nickname-total:v1:${address}`,
      90_000,
      () => countTransferableInventoryRows(address),
    );
    const filteredTotalPromise = hasInventoryPageFilters(filters)
      ? countTransferableInventoryRows(address, filters)
      : totalPromise;
    const resultsPromise = loadTransferableInventoryPage(
      address,
      filters,
      page,
      limit,
    );
    const [total, filteredTotal, rows] = await withTimeout(
      Promise.all([totalPromise, filteredTotalPromise, resultsPromise]),
      7000,
      "Timed out loading paginated objekt inventory",
    );

    return NextResponse.json(
      {
        results: rows.map(({ createdAt: _createdAt, ...row }) => row),
        total,
        filteredTotal,
        page,
        limit,
        address,
      },
      { headers: rateLimit.headers },
    );
  } catch (error) {
    console.warn("Failed to load paginated objekt inventory", {
      nickname,
      address,
      error,
    });
    return NextResponse.json(
      { error: "Inventory is temporarily unavailable. Try again later." },
      { status: 503 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const nickname = (await params).nickname;
  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Nickname required" }, { status: 400 });
  }

  const rateLimit = await applyRateLimit(request, "verify");
  if ("response" in rateLimit) return rateLimit.response;
  if (rateLimit.delayedMs > 0) {
    await sleep(rateLimit.delayedMs);
  }

  const candidates = await parseOwnershipCandidates(request);
  if (candidates instanceof NextResponse) return candidates;

  const resolved = await resolveInventoryOwner(nickname);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const owned = await withTimeout(
      hasAnyTransferableInventoryCandidate(resolved.address, candidates),
      5000,
      "Timed out checking objekt ownership",
    );
    return NextResponse.json({ owned }, { headers: rateLimit.headers });
  } catch (error) {
    console.warn("Failed to check paginated inventory ownership", {
      nickname,
      address: resolved.address,
      error,
    });
    return NextResponse.json(
      { error: "Inventory is temporarily unavailable. Try again later." },
      { status: 503 },
    );
  }
}

function validateInventoryRequest(nickname: string, request: NextRequest) {
  if (!nickname || !validateNickname(nickname)) {
    return NextResponse.json({ error: "Nickname required" }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  if (query.length > 200) {
    return NextResponse.json(
      { error: "Search query too long" },
      { status: 400 },
    );
  }

  for (const key of ["artist", "member", "season", "class", "on_offline"]) {
    if (params.getAll(key).length > MAX_FILTER_VALUES) {
      return NextResponse.json(
        { error: "Too many filter values" },
        { status: 400 },
      );
    }
  }

  return null;
}

async function applyRateLimit(
  request: NextRequest,
  action: "page" | "verify",
): Promise<InventoryRateLimitResult> {
  const session = await getSession();
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const policy = getRateLimitPolicy(Boolean(session), action);
  const key = `rate-limit:inventory-search:${action}:${rateLimitId}`;

  try {
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);

    const remaining = Math.max(policy.hardLimit - attempts, 0);
    const headers: HeadersInit = {
      "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS),
      "X-RateLimit-Limit": String(policy.hardLimit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(RATE_LIMIT_WINDOW_SECONDS),
    };

    if (attempts > policy.hardLimit) {
      return {
        response: NextResponse.json(
          { error: "Too many requests. Try again later." },
          { status: 429, headers },
        ),
      };
    }

    if (attempts <= policy.softLimit) {
      return { delayedMs: 0, headers };
    }

    const delayedMs = Math.min(
      policy.maxDelayMs,
      (attempts - policy.softLimit) * policy.delayStepMs,
    );
    return { delayedMs, headers };
  } catch {
    return { delayedMs: 0, headers: {} };
  }
}

function getRateLimitPolicy(isAuthed: boolean, action: "page" | "verify") {
  if (action === "verify") {
    return isAuthed
      ? { softLimit: 20, hardLimit: 40, delayStepMs: 120, maxDelayMs: 1200 }
      : { softLimit: 6, hardLimit: 12, delayStepMs: 200, maxDelayMs: 1500 };
  }

  return isAuthed
    ? { softLimit: 45, hardLimit: 90, delayStepMs: 75, maxDelayMs: 900 }
    : { softLimit: 10, hardLimit: 20, delayStepMs: 150, maxDelayMs: 1200 };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveInventoryOwner(nickname: string) {
  try {
    const resolved = await resolveNickname(nickname);
    if (resolved) return resolved;
    return NextResponse.json(
      { error: "Cosmo user not found" },
      { status: 404 },
    );
  } catch (error) {
    if (error instanceof CosmoUnavailableError) {
      return NextResponse.json(
        { error: "Cosmo is temporarily unavailable. Try again later." },
        { status: 503 },
      );
    }
    throw error;
  }
}

function parseInventoryFilters(params: URLSearchParams): InventoryPageFilters {
  return {
    query: params.get("q")?.trim() ?? "",
    artist: params.getAll("artist").filter(Boolean),
    member: params.getAll("member").filter(Boolean),
    season: params.getAll("season").filter(Boolean),
    class: params.getAll("class").filter(Boolean),
    onOffline: params.getAll("on_offline").filter(Boolean),
  };
}

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function parseOwnershipCandidates(
  request: NextRequest,
): Promise<InventoryOwnershipCandidate[] | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const rawCandidates =
    body && typeof body === "object" && "candidates" in body
      ? (body as { candidates?: unknown }).candidates
      : null;
  if (!Array.isArray(rawCandidates) || rawCandidates.length > 50) {
    return NextResponse.json(
      { error: "Between 1 and 50 candidates are required" },
      { status: 400 },
    );
  }

  const candidates = rawCandidates.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const candidate = value as { collectionId?: unknown; serial?: unknown };
    if (
      typeof candidate.collectionId !== "string" ||
      candidate.collectionId.length < 1 ||
      candidate.collectionId.length > 100
    ) {
      return [];
    }
    const serial = candidate.serial == null ? null : Number(candidate.serial);
    if (serial !== null && (!Number.isInteger(serial) || serial < 1)) return [];
    return [{ collectionId: candidate.collectionId, serial }];
  });

  if (candidates.length !== rawCandidates.length || candidates.length === 0) {
    return NextResponse.json(
      { error: "Invalid inventory candidates" },
      { status: 400 },
    );
  }
  return candidates;
}
