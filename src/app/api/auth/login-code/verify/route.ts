import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { session as sessionTable } from "@/lib/db/schema";
import { redis } from "@/lib/redis";
import { rootDomain, subdomainsEnabled } from "@/lib/sections";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit: max 5 failed attempts per IP per 10 minutes
  const failKey = `login-code-fail:${ip}`;
  const failCount = Number(await redis.get(failKey)) || 0;
  if (failCount >= 5) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = await request.json();
  const code = String(body.code ?? "").trim();

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid code format." },
      { status: 400 },
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
      { status: 401 },
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

  // Better Auth stores cookies as "{token}.{base64(HMAC-SHA256(token, secret))}"
  // Replicating makeSignature from better-auth/dist/crypto/index.mjs
  const secret = process.env.BETTER_AUTH_SECRET!;
  const keyData = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(sessionToken),
  );
  const signedToken = `${sessionToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  // In production (https), Better Auth prefixes cookie names with "__Secure-"
  const isSecure =
    process.env.BETTER_AUTH_URL?.startsWith("https://") ||
    process.env.NODE_ENV === "production";
  const cookieName = isSecure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";

  const res = NextResponse.json({ success: true });
  res.cookies.set(cookieName, signedToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    expires: expiresAt,
    // Match Better Auth's crossSubDomainCookies so the session is visible on
    // every section subdomain.
    ...(subdomainsEnabled() ? { domain: `.${rootDomain()}` } : {}),
  });

  return res;
}
