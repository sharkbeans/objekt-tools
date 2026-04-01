import { NextRequest, NextResponse } from "next/server";

// Optional preview-site gate: only active when TEST_SITE_PASSWORD is configured.
function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Testing Site"',
    },
  });
}

export function middleware(request: NextRequest) {
  const password = process.env.TEST_SITE_PASSWORD;

  // If no preview password is configured, leave the app public.
  if (!password) {
    return NextResponse.next();
  }

  const username = process.env.TEST_SITE_USERNAME ?? "tester";
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) {
    return unauthorized();
  }

  try {
    const encoded = authHeader.slice("Basic ".length);
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return unauthorized();
    }

    const providedUsername = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);

    if (providedUsername !== username || providedPassword !== password) {
      return unauthorized();
    }

    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
