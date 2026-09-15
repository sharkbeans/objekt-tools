import { rootUrl } from "@/lib/sections";

/**
 * Where the extension delivers posts to /match, fetches card art, and looks
 * up inventory — the app's own root origin, not a second place to point it
 * somewhere else.
 *
 * `rootUrl()` is the exact helper the app itself uses for this (middleware,
 * server code, `sectionHref`/`sectionAbsoluteUrl`), reading
 * `NEXT_PUBLIC_APP_URL` with the same "https://objekt.my" default. Pointing a
 * build at a local dev server is therefore the one variable already used for
 * that everywhere else in this repo, not a bespoke extension-only one:
 *
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run extension:build
 *
 * `build.mjs` inlines the value via esbuild's `define`, because a content
 * script and service worker have no `process.env` of their own at runtime,
 * and rewrites the manifest's host permission to match so the built
 * extension can actually reach it. It cannot import this module's own source
 * to compute that value — it runs under plain Node, not a TypeScript loader
 * — so it mirrors `rootUrl()`'s two lines directly; a comment there points
 * back here. Node itself, including every test that imports this module
 * directly rather than through the bundle, reads `process.env` unchanged, so
 * a build-time override and a plain `tsx --test` run always agree.
 */
export const APP_ORIGIN = rootUrl();

/**
 * Where Open in match sends a search: `APP_ORIGIN`, like everything else.
 *
 * This pointed at a local dev server while /match was not yet on objekt.my.
 * It is now, so a default build delivers to production. Pointing a whole build
 * somewhere with `NEXT_PUBLIC_APP_URL` still takes /match with it, and
 * `EXTENSION_MATCH_URL` still moves /match alone, for testing the page side of
 * the handoff against a dev server without moving card art and inventory:
 *
 *   EXTENSION_MATCH_URL=http://localhost:3001 npm run extension:build
 *
 * `build.mjs` mirrors this for the host permission, and `pack.mjs` refuses to
 * package a build that points anywhere at localhost.
 */
export const MATCH_ORIGIN = (
  process.env.EXTENSION_MATCH_URL || APP_ORIGIN
).replace(/\/+$/, "");

/**
 * A match pattern for `path` on `origin`, leaving the port out.
 *
 * Firefox rejects a match pattern with a port in it (bug 1362809) and Chrome
 * reads one without a port as any port, so the portless form is the only one
 * both accept — for host permissions, `permissions.contains` and `tabs.query`
 * alike. `http://localhost:3000/*` would install in Chrome and fail in Firefox.
 */
export function hostPattern(origin: string, path = "/*"): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}${path}`;
}
