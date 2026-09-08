import type { ParsedItem } from "@/lib/paste-parser";

/** Public list hosts that can be attached to a Discord trade post. */
export type ExternalListSource = "objekt.top" | "apollo.cafe";

/** A validated public list URL found in a pasted post. */
export interface ExternalListLink {
  source: ExternalListSource;
  /** Canonical, safe-to-open URL. */
  url: string;
  /** The site's list slug or UUID. */
  id: string;
}

/**
 * One collection entry exposed by a public list. This is intentionally a
 * collection, not a token: matching only needs member + season + number and
 * must not imply that a particular serial is still available.
 */
export interface ExternalListItem {
  member: string;
  season: string;
  collectionNo: string;
  onOffline?: "online" | "offline";
  imageUrl: string | null;
}

export interface ExternalListImport {
  source: ExternalListSource;
  url: string;
  items: ExternalListItem[];
  /** Null when the upstream page does not publish a total. */
  total: number | null;
  /** Apollo's public page currently exposes its first page only. */
  partial: boolean;
}

const ID = /^[A-Za-z0-9_-]{3,160}$/;

function canonicalHost(hostname: string): ExternalListSource | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "objekt.top" || host === "apollo.cafe" ? host : null;
}

/**
 * Accept only a public, HTTPS list URL. Keeping this strict means the server
 * route can never turn a pasted link into an open proxy or SSRF primitive.
 */
export function parseExternalListLink(value: string): ExternalListLink | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const source = canonicalHost(parsed.hostname);
  if (
    !source ||
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.port ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  let id: string | undefined;
  let path: string[] | undefined;
  if (
    source === "objekt.top" &&
    segments.length === 2 &&
    segments[0] === "list"
  ) {
    id = segments[1];
    path = ["list", id];
  } else if (source === "apollo.cafe") {
    if (segments.length === 2 && segments[0] === "list") {
      id = segments[1];
      path = ["list", id];
    } else if (
      segments.length === 3 &&
      segments[0].startsWith("@") &&
      segments[1] === "list"
    ) {
      id = segments[2];
      path = [segments[0], "list", id];
    }
  }
  if (!id || !path || !ID.test(id)) return null;

  return {
    source,
    id,
    // Query parameters on a pasted link affect neither public list contents
    // nor import semantics, so discard them from the URL we later fetch/open.
    url: `https://${source}/${path
      .map((segment) =>
        segment.startsWith("@")
          ? `@${encodeURIComponent(segment.slice(1))}`
          : encodeURIComponent(segment),
      )
      .join("/")}`,
  };
}

/** Pull public Objekt.top/Apollo list links out of ordinary Discord prose. */
export function extractExternalListLinks(body: string): ExternalListLink[] {
  const links: ExternalListLink[] = [];
  const seen = new Set<string>();
  const urls = body.match(/https?:\/\/[^\s<>()]+/gi) ?? [];

  for (const raw of urls) {
    // A link at the end of a sentence is common. URL itself cannot contain
    // these punctuation marks, and stripping them also handles markdown's
    // closing `>)` wrapper.
    const link = parseExternalListLink(raw.replace(/[.,!?]+$/, ""));
    if (!link || seen.has(link.url)) continue;
    seen.add(link.url);
    links.push(link);
  }
  return links;
}

/** Turn a public-list row into the exact item shape used by the matcher. */
export function externalItemToParsed(item: ExternalListItem): ParsedItem {
  return {
    member: item.member,
    season: item.season,
    collectionNo: item.collectionNo,
    onOffline: item.onOffline,
    raw: `${item.member} ${item.season} ${item.collectionNo}`,
  };
}
