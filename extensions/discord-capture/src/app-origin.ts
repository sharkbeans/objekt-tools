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
