import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Authorizes a call to an /api/cron/* route. The cron container sends
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * Returns the response to send back when the job must not run, or null when
 * it may.
 *
 * An unset or blank CRON_SECRET refuses every call with a 503. Comparing
 * against `Bearer ` instead only failed because header values are trimmed in
 * transit, so a header can never end in that space — not a guarantee to hang
 * every cron job on.
 *
 * Route handlers must authorize through this — `cron-auth.test.ts` fails the
 * build if one compares CRON_SECRET itself.
 */
export function cronAuthError(
  request: Pick<Request, "headers">,
): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 },
    );
  }

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
