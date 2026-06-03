import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (
    fwd?.split(",").at(-1)?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
