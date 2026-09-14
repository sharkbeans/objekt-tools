/**
 * The address of whoever connected to nginx, for keying IP rate limits.
 *
 * nginx forwards `X-Forwarded-For` with `$proxy_add_x_forwarded_for`, which
 * appends the address it saw to whatever the client sent. Only that last hop
 * is trustworthy: reading the whole header lets a client prefix any value it
 * likes and land in a fresh rate-limit bucket on every request.
 *
 * Route handlers must read the client IP through this, never the raw header —
 * `client-ip.test.ts` fails the build if one does.
 */
export function getClientIp(request: Pick<Request, "headers">): string {
  const lastHop = request.headers.get("x-forwarded-for")?.split(",").at(-1);
  return (
    lastHop?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}
