import { type NextRequest, NextResponse } from "next/server";
import { sectionAbsoluteUrl, subdomainsEnabled } from "@/lib/sections";

// Stray root-domain wallet links (objekt.my/by-wallet/0x...). The collect
// section owns the resolver, so hand off to it. On a section host the proxy
// rewrites /by-wallet/... onto /collection/by-wallet/... before any route
// handler runs, so this only ever fires on the root host and on single-host
// builds — where the target has to come from the section registry (or the
// incoming request), never a hardcoded domain.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const internal = `/collection/by-wallet/${encodeURIComponent(address)}${
    request.nextUrl.search
  }`;
  const target = subdomainsEnabled()
    ? sectionAbsoluteUrl(internal)
    : new URL(internal, request.nextUrl.origin);
  return NextResponse.redirect(target, 302);
}
