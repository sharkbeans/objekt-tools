import {
  type ExternalListImport,
  type ExternalListItem,
  type ExternalListLink,
  parseExternalListLink,
} from "@/lib/external-list";
import { getCached } from "@/lib/server-cache";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_LIST_ITEMS = 500;

export class ExternalListImportError extends Error {}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function imageUrl(value: unknown): string | null {
  const candidate = string(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      (host !== "media.objekt.top" && host !== "imagedelivery.net")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Keep only entries that the local matcher can identify safely. */
export function normalizeExternalListItem(
  value: unknown,
): ExternalListItem | null {
  const entry = record(value);
  if (!entry) return null;
  const member = string(entry.member);
  const season = string(entry.season);
  const rawNo = string(entry.collectionNo);
  const match = rawNo?.match(/^(\d{3})([aAzZ])?$/);
  if (!member || !season || !match) return null;

  const declared = entry.onOffline;
  const onOffline =
    declared === "online" || declared === "offline"
      ? declared
      : match[2]?.toLowerCase() === "a"
        ? "online"
        : match[2]?.toLowerCase() === "z"
          ? "offline"
          : undefined;

  return {
    member,
    season,
    collectionNo: match[1],
    ...(onOffline ? { onOffline } : {}),
    imageUrl: imageUrl(entry.thumbnailImage) ?? imageUrl(entry.frontImage),
  };
}

function uniqueItems(items: ExternalListItem[]): ExternalListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.member.toLowerCase()}|${item.season.toLowerCase()}|${item.collectionNo}|${item.onOffline ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function importObjektTop(
  link: ExternalListLink,
): Promise<ExternalListImport> {
  let response: Response;
  try {
    response = await fetch("https://objekt.top/rpc/list/listEntries", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ json: { slug: link.id } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new ExternalListImportError("Could not reach objekt.top.");
  }
  if (!response.ok) {
    throw new ExternalListImportError(
      `objekt.top could not open this list (${response.status}).`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ExternalListImportError(
      "objekt.top returned an unreadable list.",
    );
  }
  const rows = record(payload)?.json;
  if (!Array.isArray(rows)) {
    throw new ExternalListImportError(
      "objekt.top did not return list entries.",
    );
  }

  const items = uniqueItems(
    rows.slice(0, MAX_LIST_ITEMS).flatMap((row) => {
      const item = normalizeExternalListItem(row);
      return item ? [item] : [];
    }),
  );
  if (rows.length > 0 && items.length === 0) {
    throw new ExternalListImportError(
      "objekt.top returned entries we could not identify as objekts.",
    );
  }
  return {
    source: link.source,
    url: link.url,
    items,
    total: rows.length,
    partial: rows.length > MAX_LIST_ITEMS,
  };
}

async function fetchApolloPage(
  start: URL,
): Promise<{ html: string; url: URL }> {
  let current = start;
  for (let redirects = 0; redirects < 4; redirects++) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers: { Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new ExternalListImportError("Could not reach Apollo.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      const host = next.hostname.toLowerCase().replace(/^www\./, "");
      if (next.protocol !== "https:" || host !== "apollo.cafe") {
        throw new ExternalListImportError(
          "Apollo redirected this list elsewhere.",
        );
      }
      current = next;
      continue;
    }
    if (!response.ok) {
      throw new ExternalListImportError(
        `Apollo could not open this list (${response.status}).`,
      );
    }
    return { html: await response.text(), url: current };
  }
  throw new ExternalListImportError(
    "Apollo redirected this list too many times.",
  );
}

function unescapeApolloString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function apolloField(chunk: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = chunk.match(
    new RegExp(`${escaped}:(?:"((?:\\\\.|[^"])*)"|null)`),
  );
  return match?.[1] === undefined ? null : unescapeApolloString(match[1]);
}

/**
 * Apollo embeds the first public page in its server-rendered stream. Its
 * pagination endpoint is an internal, revisioned implementation detail, so
 * deliberately import only the visible page and report when the list is
 * longer instead of depending on an unstable private API.
 */
export function parseApolloListHtml(html: string): {
  items: ExternalListItem[];
  total: number | null;
  partial: boolean;
} {
  const start = html.indexOf("objekts:$R");
  if (start < 0) {
    throw new ExternalListImportError(
      "Apollo did not expose public list entries.",
    );
  }
  const end = html.indexOf("],pageParams:", start);
  // Apollo puts total/hasNext immediately *before* the `objekts` reference in
  // its stream. Include that object prefix as well as the entries themselves.
  const pageStart = html.lastIndexOf("{total:", start);
  const page = html.slice(
    pageStart < 0 ? start : pageStart,
    end < 0 ? undefined : end,
  );
  const totalMatch = page.match(/total:(\d+)/);
  const total = totalMatch ? Number.parseInt(totalMatch[1], 10) : null;
  const rows = page.split(/\$R\[\d+\]=\{id:/).slice(1);
  const items = uniqueItems(
    rows.slice(0, MAX_LIST_ITEMS).flatMap((chunk) => {
      const item = normalizeExternalListItem({
        member: apolloField(chunk, "member"),
        season: apolloField(chunk, "season"),
        collectionNo: apolloField(chunk, "collectionNo"),
        onOffline: apolloField(chunk, "onOffline"),
        thumbnailImage: apolloField(chunk, "thumbnailImage"),
        frontImage: apolloField(chunk, "frontImage"),
      });
      return item ? [item] : [];
    }),
  );
  if (rows.length > 0 && items.length === 0) {
    throw new ExternalListImportError(
      "Apollo returned unreadable list entries.",
    );
  }
  return {
    items,
    total,
    partial:
      /hasNext:!0/.test(page) ||
      (total !== null && total > items.length) ||
      rows.length > MAX_LIST_ITEMS,
  };
}

async function importApollo(
  link: ExternalListLink,
): Promise<ExternalListImport> {
  const { html, url } = await fetchApolloPage(new URL(link.url));
  const parsed = parseApolloListHtml(html);
  return {
    source: link.source,
    // Preserve the final public URL when Apollo redirected an @handle path to
    // the canonical UUID list, so the dialog's source link remains useful.
    url: url.toString(),
    ...parsed,
  };
}

export async function importExternalList(
  value: string,
): Promise<ExternalListImport> {
  const link = parseExternalListLink(value);
  if (!link) {
    throw new ExternalListImportError(
      "That is not a supported public list URL.",
    );
  }
  return getCached(`external-list:v1:${link.url}`, 5 * 60_000, () =>
    link.source === "objekt.top" ? importObjektTop(link) : importApollo(link),
  );
}
