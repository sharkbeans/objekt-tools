import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { fetchUserProfile } from "@/lib/cosmo/client";
import type { ValidArtist } from "@/lib/cosmo/types";
import { db } from "@/lib/db";
import { cosmoAccount } from "@/lib/db/schema";
import { redis } from "@/lib/redis";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { address } = body;

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  // Get stored verification data from Redis
  const redisKey = `cosmo-verify:${session.user.id}:${address}`;
  const stored = await redis.get(redisKey);

  if (!stored) {
    return NextResponse.json(
      { error: "Verification code expired. Please generate a new one." },
      { status: 410 },
    );
  }

  const { code, cosmoId, nickname, artistId } = JSON.parse(stored) as {
    code: string;
    cosmoId: number;
    nickname: string;
    artistId: ValidArtist;
  };

  // Fetch user profile from Cosmo and check status message
  try {
    const profile = await fetchUserProfile(cosmoId, artistId);

    if (normalize(profile.address) !== normalize(address)) {
      return NextResponse.json({ error: "Address mismatch" }, { status: 400 });
    }

    // Validate nickname matches
    if (normalize(profile.nickname) !== normalize(nickname)) {
      return NextResponse.json({ error: "Nickname mismatch" }, { status: 400 });
    }

    // Check if code appears in status message
    if (
      !profile.statusMessage ||
      !normalize(profile.statusMessage).includes(normalize(code))
    ) {
      return NextResponse.json(
        { error: "Verification code not found in your Cosmo bio message" },
        { status: 400 },
      );
    }

    // Link the account (upsert if already linked)
    await db
      .insert(cosmoAccount)
      .values({
        userId: session.user.id,
        address: address.toLowerCase(),
        nickname,
        cosmoId,
        lastCosmoCheck: new Date(),
      })
      .onConflictDoUpdate({
        target: cosmoAccount.userId,
        set: {
          address: address.toLowerCase(),
          nickname,
          cosmoId,
          lastCosmoCheck: new Date(),
        },
      });

    // Clean up Redis
    await redis.del(redisKey);

    return NextResponse.json({
      success: true,
      address: address.toLowerCase(),
      nickname,
    });
  } catch (error) {
    console.error("Cosmo verification failed:", error);
    return NextResponse.json(
      { error: "Failed to verify with Cosmo" },
      { status: 502 },
    );
  }
}
