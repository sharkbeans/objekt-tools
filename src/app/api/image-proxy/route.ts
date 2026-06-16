import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Some cosmo.fans CDN hosts (the random-hash subdomains and the resized
// `/2000/` webp variants) serve images without an `Access-Control-Allow-Origin`
// header. Those load fine in an <img> tag but cannot be drawn onto a canvas
// without tainting it, which breaks the progress share card. This route
// re-serves such images from our own origin so the browser treats them as
// same-origin (canvas-safe). Mirrors the allowlist in next.config.ts so it
// can't be abused as an open proxy.
const ALLOWED_HOST_SUFFIXES = [".cosmo.fans", "imagedelivery.net"];

const FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix),
  );
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
  if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: "image/*" },
    });
  } catch {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/webp";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Cache aggressively — objekt images are immutable per URL.
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    },
  });
}
