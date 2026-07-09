// Section → subdomain registry for host-based routing.
//
// Each tool section can be served from its own subdomain (trade.objekt.my,
// collect.objekt.my, ...) with clean paths: the section's internal path
// prefix (/trades, /collection, ...) is stripped from the public URL and
// re-added by the middleware rewrite. The feature is enabled by setting
// NEXT_PUBLIC_ROOT_DOMAIN (build-time); when unset, every helper degrades
// to today's single-host, path-based behavior.
//
// This module must stay edge-safe (no Node APIs): it is imported by the
// middleware, client components, and server code alike.

export type SectionId = "trade" | "collect" | "list" | "create";

type SectionDef = {
  sub: string;
  // Internal base paths owned by this section. Order matters where one is a
  // prefix of another concern — keep longest/most-specific first.
  bases: string[];
};

const SECTIONS: Record<SectionId, SectionDef> = {
  // On the trade host, /active/... maps to /active-trades/... — which makes
  // "active" (plus the static /trades subroutes "new", "mine", "history")
  // reserved first segments that must never collide with a trade post ID.
  // Post IDs are DB-generated, so this holds.
  trade: { sub: "trade", bases: ["/active-trades", "/trades"] },
  collect: { sub: "collect", bases: ["/collection"] },
  list: { sub: "list", bases: ["/list"] },
  create: { sub: "create", bases: ["/objekt-maker"] },
};

export const SECTION_IDS = Object.keys(SECTIONS) as SectionId[];

// Paths that only exist on the root domain. "/" is intentionally absent: on a
// section host, "/" is that section's home.
const ROOT_ONLY_PREFIXES = [
  "/notifications",
  "/link",
  "/proofshot",
  "/spin",
  "/sign-in",
  "/sign-up",
];

export function rootDomain(): string | null {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN || null;
}

export function subdomainsEnabled(): boolean {
  return rootDomain() !== null;
}

export function rootUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "https://objekt.my";
  return raw.replace(/\/+$/, "");
}

// Origin for a section host, taking protocol and port from NEXT_PUBLIC_APP_URL
// (so http://lvh.me:3000 works for local subdomain testing).
export function sectionOrigin(section: SectionId): string {
  const domain = rootDomain();
  if (!domain) return rootUrl();
  const url = new URL(rootUrl());
  url.hostname = `${SECTIONS[section].sub}.${domain}`;
  return url.origin;
}

export function allOrigins(): string[] {
  const origins = [new URL(rootUrl()).origin];
  if (subdomainsEnabled()) {
    for (const section of SECTION_IDS) origins.push(sectionOrigin(section));
  }
  return origins;
}

// Returns the remainder of `path` after `base` when `base` matches on a
// segment boundary ("" for an exact match), or null when it doesn't match.
function matchBase(path: string, base: string): string | null {
  if (path === base) return "";
  if (path.startsWith(`${base}/`)) return path.slice(base.length);
  return null;
}

export function sectionForHostname(hostname: string): SectionId | "root" | null {
  const domain = rootDomain();
  if (!domain) return null;
  const host = hostname.toLowerCase().split(":")[0];
  if (host === domain || host === `www.${domain}`) return "root";
  for (const section of SECTION_IDS) {
    if (host === `${SECTIONS[section].sub}.${domain}`) return section;
  }
  return null;
}

export function isRootOnlyPath(path: string): boolean {
  if (path.startsWith("/@") || path.startsWith("/%40")) return true;
  return ROOT_ONLY_PREFIXES.some((prefix) => matchBase(path, prefix) !== null);
}

// Internal path → owning section + clean external path.
// "/trades/new" → { trade, "/new" }; "/active-trades/9" → { trade, "/active/9" };
// "/trades" → { trade, "/" }. Returns null for root-owned paths.
export function toExternalPath(
  internalPath: string,
): { section: SectionId; path: string } | null {
  for (const section of SECTION_IDS) {
    for (const base of SECTIONS[section].bases) {
      const rest = matchBase(internalPath, base);
      if (rest === null) continue;
      if (base === "/active-trades") return { section, path: `/active${rest}` };
      return { section, path: rest === "" ? "/" : rest };
    }
  }
  return null;
}

// Clean external path on a section host → internal route path.
export function toInternalPath(section: SectionId, externalPath: string): string {
  if (section === "trade") {
    const activeRest = matchBase(externalPath, "/active");
    if (activeRest !== null) return `/active-trades${activeRest}`;
    return externalPath === "/" ? "/trades" : `/trades${externalPath}`;
  }
  const base = SECTIONS[section].bases[0];
  return externalPath === "/" ? base : `${base}${externalPath}`;
}

function splitHref(href: string): { path: string; suffix: string } {
  const i = href.search(/[?#]/);
  if (i === -1) return { path: href, suffix: "" };
  return { path: href.slice(0, i), suffix: href.slice(i) };
}

// The one link helper components use. Call sites always write the INTERNAL
// path form ("/trades/new", "/active-trades/9"); this emits the right shape:
//  - subdomains disabled → the internal path, unchanged (today's behavior)
//  - path owned by `currentSection` → clean relative path ("/new") so
//    intra-section navigation stays a soft client-side nav
//  - path owned by another section → absolute URL on that section's host
//  - root-owned path → relative on the root host; absolute root URL when
//    `currentSection` says we're rendering on a section host
// Never derive `currentSection` from `window` in rendered hrefs — pass it
// explicitly (from a section directory, or from the layout's host-derived
// prop), so SSR and client render identically.
export function sectionHref(
  internalHref: string,
  opts?: { currentSection?: SectionId },
): string {
  if (!subdomainsEnabled()) return internalHref;
  const { path, suffix } = splitHref(internalHref);
  const ext = toExternalPath(path);
  if (!ext) {
    if (opts?.currentSection) return `${rootUrl()}${path}${suffix}`;
    return internalHref;
  }
  if (opts?.currentSection === ext.section) return `${ext.path}${suffix}`;
  return `${sectionOrigin(ext.section)}${ext.path}${suffix}`;
}

// Absolute URL for server-generated links (Discord DMs, OG tags, canonicals).
export function sectionAbsoluteUrl(internalHref: string): string {
  const { path, suffix } = splitHref(internalHref);
  if (subdomainsEnabled()) {
    const ext = toExternalPath(path);
    if (ext) return `${sectionOrigin(ext.section)}${ext.path}${suffix}`;
  }
  return `${rootUrl()}${path}${suffix}`;
}
