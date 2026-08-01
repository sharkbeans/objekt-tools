// Cosmo nicknames are not ASCII-only — Hangul, Han, and emoji nicknames are
// all legal (e.g. "尹舒姸的小狗"), so every [nickname] route segment reaches us
// percent-encoded on the wire.
//
// Next.js does NOT hand that segment to all consumers in the same shape.
// Measured on Next 16 for a request to /collection/%E5%B0%B9...%E7%8B%97:
//
//   page / layout components        -> "%E5%B0%B9..." (encoded, 54 chars)
//   client components (use(params), -> "%E5%B0%B9..." (encoded, 54 chars)
//     useParams())
//   generateMetadata()              -> "尹舒姸的小狗"  (decoded, 6 chars)
//   route handlers (route.ts)       -> "尹舒姸的小狗"  (decoded, 6 chars)
//
// Reading a param without normalizing therefore fails in ways that depend on
// which kind of file you happen to be in: the encoded form blows past
// validateNickname()'s 30-character cap (so pages 404 before ever calling
// Cosmo), and if it does get through it is encoded a second time on the way
// to Cosmo and 404s there instead.
//
// The rule: every route param that can hold a nickname goes through
// decodeRouteParam() immediately after `await params`, and only the decoded
// value is used afterwards — for validation, for Cosmo lookups, and for the
// canonical-nickname comparison that drives the redirect. Anything written
// back into a URL is re-encoded with encodeURIComponent() at that point.
// Applying it in a route handler, where the value already arrives decoded, is
// harmless (see below), so the rule needs no per-file exceptions.
//
// This module is intentionally dependency-free so client components can
// import it without pulling the database layer into the browser bundle.

/**
 * Normalize a Next.js route param to its decoded form.
 *
 * Safe to apply to a value that is already decoded. The encoded shape Next
 * produces is exactly `encodeURIComponent(segment)`, so the decode is only
 * accepted when re-encoding reproduces the input — which means a nickname that
 * merely *contains* a percent escape ("50%41love") is left alone instead of
 * being silently mangled into "50Alove". A malformed escape ("100%ab") makes
 * `decodeURIComponent` throw `URIError`; that falls back to the input rather
 * than taking the route down.
 */
export function decodeRouteParam(value: string): string {
  try {
    const decoded = decodeURIComponent(value);
    return encodeURIComponent(decoded) === value ? decoded : value;
  } catch {
    return value;
  }
}
