import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { searchUsers } from "@/lib/cosmo/client";
import { validateNickname } from "@/lib/cosmo/resolve-nickname";
import {
  MIN_SUGGEST_LENGTH,
  type ProgressSuggestResponse,
  rankByCloseness,
} from "@/lib/progress/suggest";
import { redis } from "@/lib/redis";
import { getCached } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const SUGGEST_TTL_MS = 5 * 60_000;

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < MIN_SUGGEST_LENGTH || !validateNickname(query)) {
    return NextResponse.json({
      results: [],
    } satisfies ProgressSuggestResponse);
  }

  const session = await getSession();
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const rateLimitKey = `rate-limit:progress-suggest:${rateLimitId}`;
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
    // Redis unavailable — skip rate limiting.
  }

  try {
    // Cached per query so a room full of people typing the same nickname
    // costs Cosmo one search, not one per keystroke that got past the
    // client-side debounce.
    const results = await getCached(
      `cosmo:nickname:suggest:v1:${query.toLowerCase()}`,
      SUGGEST_TTL_MS,
      async () => {
        const { results: users } = await searchUsers(query);
        return rankByCloseness(
          users.map((user) => ({
            nickname: user.nickname,
            address: user.address,
          })),
          query,
        );
      },
    );
    return NextResponse.json({ results } satisfies ProgressSuggestResponse);
  } catch (error) {
    console.error("Cosmo suggest failed:", error);
    return NextResponse.json(
      { error: "Failed to search Cosmo users" },
      { status: 502 },
    );
  }
}
