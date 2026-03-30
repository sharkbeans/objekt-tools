import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { session as sessionTable } from "@/lib/db/schema";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  // Use the rightmost IP in x-forwarded-for — the leftmost entry is
  // attacker-controlled (they can prepend arbitrary values), but the
  // rightmost is appended by the outermost trusted proxy (e.g. Vercel).
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",").at(-1)?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Rate limit: max 5 failed attempts per IP per 10 minutes
  const failKey = `login-code-fail:${ip}`;
  const failCount = Number(await redis.get(failKey)) || 0;
  if (failCount >= 5) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const code = String(body.code ?? "").trim();

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code format." },
      { status: 400 }
    );
  }

  // Atomically get-and-delete the code (single-use, no TOCTOU race)
  const userId = await redis.getdel(`login-code:${code}`);
  if (!userId) {
    // Increment fail counter
    const newCount = await redis.incr(failKey);
    if (newCount === 1) await redis.expire(failKey, 600);
    return NextResponse.json(
      { error: "Invalid or expired code." },
      { status: 401 }
    );
  }

  // Clean up the reverse lookup key
  await redis.del(`login-code:user:${userId}`);

  // Create a new session in the database
  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessionTable).values({
    id: sessionId,
    token: sessionToken,
    userId,
    expiresAt,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  });

  // Set the session cookie
  const res = NextResponse.json({ success: true });
  res.cookies.set("better-auth.session_token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return res;
}
