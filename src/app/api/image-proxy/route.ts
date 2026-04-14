import { NextRequest, NextResponse } from "next/server";

// Allowed image CDN hostnames — add more as needed
const ALLOWED_HOSTS = [
  "imagedelivery.net",
  "static.cosmo.fans",
  "s3.ap-northeast-2.amazonaws.com",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  const isAllowed = ALLOWED_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
  if (!isAllowed) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok) {
    return new NextResponse("Upstream error", { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
