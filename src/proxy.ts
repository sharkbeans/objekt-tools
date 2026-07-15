import { type NextRequest, NextResponse } from "next/server";
import { normalizeRepeatedFilterParams } from "@/lib/filter-param-redirect";
import {
  isRootOnlyPath,
  rootDomain,
  rootUrl,
  sectionForHostname,
  sectionOrigin,
  subdomainsEnabled,
  toExternalPath,
  toInternalPath,
} from "@/lib/sections";

// Optional preview-site gate: only active when TEST_SITE_PASSWORD is configured.
function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Testing Site"',
    },
  });
}

const BOT_USER_AGENTS = ["Discordbot"];

// Returns a 401 response when the preview gate rejects the request, or null
// when the request may proceed.
function previewGate(request: NextRequest): NextResponse | null {
  const password = process.env.TEST_SITE_PASSWORD;

  // If no preview password is configured, leave the app public.
  if (!password) {
    return null;
  }

  // Let embed crawlers through so link previews work on the test site.
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_USER_AGENTS.some((bot) => ua.includes(bot))) {
    return null;
  }

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

    const providedPassword = decoded.slice(separatorIndex + 1);

    if (providedPassword !== password) {
      return unauthorized();
    }

    return null;
  } catch {
    return unauthorized();
  }
}

// Temporary migration shim: sessions issued before the subdomain rollout use
// a host-only cookie on the root domain, which subdomains can't see. On the
// first root-host visit, re-issue the session cookie with Domain=.<root> and
// expire the host-only variant. The marker cookie stops us from re-setting it
// on every request. Remove a few weeks after the subdomain flip.
const MIGRATION_MARKER = "objekt_cookie_domain_v1";

function upgradeSessionCookie(request: NextRequest, response: NextResponse) {
  if (request.cookies.has(MIGRATION_MARKER)) return;

  const secure = rootUrl().startsWith("https://");
  const sessionCookieName = secure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) return;

  const domain = `.${rootDomain()}`;
  // Clear the host-only cookie, then re-issue domain-wide. Better Auth's
  // default session lifetime is 7 days; the server-side session row is the
  // real authority, so a slightly longer cookie is harmless.
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    domain,
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(MIGRATION_MARKER, "1", {
    sameSite: "lax",
    secure,
    path: "/",
    domain,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function proxy(request: NextRequest) {
  const gate = previewGate(request);
  if (gate) return gate;

  // Canonicalize old shared/bookmarked links using repeated filter params
  // (?member=a&member=b) to the comma-joined form the client-side URL
  // filter state (nuqs) expects, before it ever mounts and reads only the
  // first value per key.
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const normalized = normalizeRepeatedFilterParams(request.nextUrl);
    if (normalized) {
      return NextResponse.redirect(normalized, 308);
    }
  }

  // Host-based section routing — only when NEXT_PUBLIC_ROOT_DOMAIN is set.
  if (!subdomainsEnabled()) {
    return NextResponse.next();
  }

  const hostname = request.headers.get("host") ?? "";

  // grid.<domain> isn't a real section — just bounce it to collect.
  const domain = rootDomain();
  if (domain && hostname.toLowerCase().split(":")[0] === `grid.${domain}`) {
    return NextResponse.redirect(
      `${sectionOrigin("collect")}${request.nextUrl.pathname}${request.nextUrl.search}`,
      301,
    );
  }

  const who = sectionForHostname(hostname);
  // Unknown/internal hosts (cron container's app:3000, healthcheck on
  // 127.0.0.1, localhost) are left completely untouched.
  if (who === null) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  // Served as-is on every known host: API (all client fetches are relative),
  // Next internals, the host-aware robots route, the /icon metadata route,
  // and public/ assets (anything with a file extension).
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path === "/robots.txt" ||
    path === "/icon" ||
    /\.[a-z0-9]+$/i.test(path)
  ) {
    return NextResponse.next();
  }

  if (who === "root") {
    // Old root-domain paths permanently moved to their section host.
    const ext = toExternalPath(path);
    if (ext) {
      return NextResponse.redirect(
        `${sectionOrigin(ext.section)}${ext.path}${search}`,
        301,
      );
    }
    const response = NextResponse.next();
    upgradeSessionCookie(request, response);
    return response;
  }

  // Section host.
  if (isRootOnlyPath(path)) {
    return NextResponse.redirect(`${rootUrl()}${path}${search}`, 301);
  }

  // Internal-form paths (trade.../trades/new) and wrong-section paths
  // (trade.../collection/x) both 301 to their canonical external URL.
  const ext = toExternalPath(path);
  if (ext) {
    return NextResponse.redirect(
      `${sectionOrigin(ext.section)}${ext.path}${search}`,
      301,
    );
  }

  // Clean external path → rewrite onto the internal route tree. The browser
  // URL keeps the clean form.
  return NextResponse.rewrite(
    new URL(`${toInternalPath(who, path)}${search}`, request.url),
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
