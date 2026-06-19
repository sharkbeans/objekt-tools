import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { redis } from "@/lib/redis";

export async function POST() {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit: max 5 code generations per user per 10 minutes
  const genKey = `login-code-gen:${userId}`;
  const genCount = await redis.incr(genKey);
  if (genCount === 1) await redis.expire(genKey, 600);
  if (genCount > 5) {
    return NextResponse.json(
      { error: "Too many code generations. Try again later." },
      { status: 429 },
    );
  }

  // Invalidate any existing code for this user
  const existingCode = await redis.get(`login-code:user:${userId}`);
  if (existingCode) {
    await redis.del(`login-code:${existingCode}`);
    await redis.del(`login-code:user:${userId}`);
  }

  // Generate a 6-digit numeric code, retrying on collision (SET NX)
  let code = "";
  let stored = false;
  for (let i = 0; i < 10; i++) {
    code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    // Only set if the key doesn't already exist (NX = no overwrite)
    const ok = await redis.set(`login-code:${code}`, userId, "EX", 120, "NX");
    if (ok) {
      stored = true;
      break;
    }
  }
  if (!stored) {
    return NextResponse.json(
      { error: "Failed to generate code. Try again." },
      { status: 503 },
    );
  }

  await redis.set(`login-code:user:${userId}`, code, "EX", 120);

  return NextResponse.json({ code, expiresIn: 120 });
}
