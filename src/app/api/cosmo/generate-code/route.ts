import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { address, cosmoId, nickname, artistId } = body;

  if (!address || !cosmoId || !nickname || !artistId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Rate limit: 5 attempts per 30 seconds
  const rateLimitKey = `cosmo-verify-rate:${session.user.id}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) {
    await redis.expire(rateLimitKey, 30);
  }
  if (attempts > 5) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  // Check if address is already linked
  const existing = await db.query.cosmoAccount.findFirst({
    where: eq(cosmoAccount.address, address.toLowerCase()),
  });
  if (existing) {
    return NextResponse.json(
      { error: "This Cosmo account is already linked" },
      { status: 409 },
    );
  }

  // Generate verification code
  const code = `verify-${randomBytes(3).toString("hex")}`;
  const redisKey = `cosmo-verify:${session.user.id}:${address}`;
  await redis.set(
    redisKey,
    JSON.stringify({ code, cosmoId, nickname, artistId }),
    "EX",
    120,
  );

  return NextResponse.json({ code, expiresIn: 120 });
}
