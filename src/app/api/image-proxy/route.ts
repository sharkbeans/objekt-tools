import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Some cosmo.fans CDN hosts (the random-hash subdomains and the resized
// `/2000/` webp variants) serve images without an `Access-Control-Allow-Origin`
// header. Those load fine in an <img> tag but cannot be drawn onto a canvas
// without tainting it, which breaks the progress share card. This route
// re-serves such images from our own origin so the browser treats them as
// same-origin (canvas-safe). Mirrors the allowlist in next.config.ts so it
// can't be abused as an open proxy.
//
// A domain matches itself, and its subdomains only when listed in
// ALLOWED_SUBDOMAINS_OF. A bare `endsWith("imagedelivery.net")` would also
// accept `evilimagedelivery.net`, whose HTML would then be served from our
// origin.
const ALLOWED_HOSTS = ["cosmo.fans", "imagedelivery.net"];
const ALLOWED_SUBDOMAINS_OF = ["cosmo.fans"];

const FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isAllowedHost(host: string): boolean {
  return (
    ALLOWED_HOSTS.includes(host) ||
    ALLOWED_SUBDOMAINS_OF.some((domain) => host.endsWith(`.${domain}`))
  );
}

function isAllowedUrl(url: URL): boolean {
  return url.protocol === "https:" && isAllowedHost(url.hostname);
}

// Raster images only: SVG can carry script, and anything else (HTML above
// all) must never be served from our origin.
function isRasterImage(contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return type.startsWith("image/") && type !== "image/svg+xml";
}

// Redirects are followed by hand so every hop is held to the allowlist: an
// allowed host redirecting to an internal address must not make this route
// fetch it.
async function fetchAllowed(
  url: URL,
  signal: AbortSignal,
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      signal,
      redirect: "manual",
      headers: { Accept: "image/*" },
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      return response;
    }
    const next = new URL(location, current);
    if (!isAllowedUrl(next)) return null;
    current = next;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!isAllowedUrl(parsed)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response | null;
  try {
    upstream = await fetchAllowed(parsed, controller.signal);
  } catch {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!upstream) {
    return NextResponse.json(
      { error: "Redirect not allowed" },
      { status: 403 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/webp";
  if (!isRasterImage(contentType)) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Should anything but an image ever get through, it still can't run.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      // Cache aggressively — objekt images are immutable per URL.
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    },
  });
}
