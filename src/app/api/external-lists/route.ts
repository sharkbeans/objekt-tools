import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getClientIp } from "@/lib/client-ip";
import {
  ExternalListBusyError,
  ExternalListImportError,
  importExternalList,
} from "@/lib/external-list.server";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_SECONDS = 60;
// "Load all" on a full day of #objekt_trade fetches 63 lists at once, so both
// limits leave room for that plus a retry. Signed-in users are easier to hold
// accountable, so they get a little more.
const SIGNED_IN_LIMIT = 120;
const ANONYMOUS_LIMIT = 80;

const retryLater = (error: string, status: 429 | 503) =>
  NextResponse.json(
    { error },
    {
      status,
      headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) },
    },
  );

/** Fetches a validated public Objekt.top/Apollo list for the match dialog. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const requester = session
    ? `user:${session.user.id}`
    : `ip:${getClientIp(request)}`;
  if (
    await isRateLimited(
      `rate-limit:external-lists:${requester}`,
      session ? SIGNED_IN_LIMIT : ANONYMOUS_LIMIT,
      RATE_LIMIT_WINDOW_SECONDS,
    )
  ) {
    return retryLater("Too many list imports. Try again in a minute.", 429);
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url || url.length > 2048) {
    return NextResponse.json(
      { error: "Missing or invalid list URL" },
      { status: 400 },
    );
  }

  try {
    const imported = await importExternalList(url);
    return NextResponse.json(imported, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof ExternalListBusyError) {
      return retryLater(error.message, 503);
    }
    const message =
      error instanceof ExternalListImportError
        ? error.message
        : "Could not import that public list.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
