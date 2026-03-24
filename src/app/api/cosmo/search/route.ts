import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { searchUsers } from "@/lib/cosmo/client";
import { redis } from "@/lib/redis";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 requests per 60 seconds
  const rateLimitKey = `rate-limit:cosmo-search:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, 60);
  if (attempts > 10) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  try {
    const result = await searchUsers(query);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Cosmo search failed:", error);
    return NextResponse.json(
      { error: "Failed to search Cosmo users" },
      { status: 502 }
    );
  }
}
