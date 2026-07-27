import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  CosmoUnavailableError,
  resolveCurrentNicknameForAddress,
} from "@/lib/cosmo/resolve-nickname";
import type { ProgressIdentityResponse } from "@/lib/progress/types";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

// Wallet -> current nickname. Callers hold a wallet (it survives renames) but
// navigate by nickname (it's the only thing a collection URL should show), so
// this is the hop between the two.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!address || !/^0x[0-9a-f]{40}$/i.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const session = await getSession();
  const rateLimitId = session?.user.id
    ? `user:${session.user.id}`
    : `ip:${request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"}`;
  const rateLimitKey = `rate-limit:progress-resolve:${rateLimitId}`;
  const limit = session ? 60 : 10;
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

  let resolved: Awaited<ReturnType<typeof resolveCurrentNicknameForAddress>>;
  try {
    resolved = await resolveCurrentNicknameForAddress(address);
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
      { error: "No Cosmo user known for this wallet" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    nickname: resolved.nickname,
    address: resolved.address,
  } satisfies ProgressIdentityResponse);
}
