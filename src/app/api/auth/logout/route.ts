import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { session as sessionTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const isSecure =
    process.env.BETTER_AUTH_URL?.startsWith("https://") ||
    process.env.NODE_ENV === "production";

  const cookieName = isSecure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";

  const raw = request.cookies.get(cookieName)?.value;

  if (raw) {
    // Cookie value is "token.signature" — extract the token part
    const token = raw.split(".")[0];
    if (token) {
      await db
        .delete(sessionTable)
        .where(eq(sessionTable.token, token))
        .catch(() => {});
    }
  }

  const res = NextResponse.json({ success: true });

  // Clear both possible cookie names to be safe
  for (const name of [
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
  ]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: 0,
    });
  }

  return res;
}
