import {
  type ExternalListImport,
  type ExternalListItem,
  type ExternalListLink,
  parseExternalListLink,
} from "@/lib/external-list";
import { isRateLimited } from "@/lib/rate-limit";
import { createServerCache } from "@/lib/server-cache";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_LIST_ITEMS = 500;
const CACHE_TTL_MS = 5 * 60_000;
// Real list responses (Apollo HTML, objekt.top JSON) measured 97–137 KB, so
// this is several times the largest seen while still bounding what one import
// can hold in memory.
const MAX_RESPONSE_BYTES = 1_000_000;
// Every cache miss is a request from this server's IP to someone else's site.
// Across all users, stay polite enough not to get that IP blocked.
const UPSTREAM_BUDGET_KEY = "rate-limit:external-lists:upstream";
const UPSTREAM_BUDGET_PER_MINUTE = 240;
const MAX_UPSTREAM_IN_FLIGHT = 6;

// Keys are list URLs, which anyone can vary, so they get their own budget
// rather than competing with the default cache.
const listCache = createServerCache("external-lists", { maxEntries: 200 });

/** The list can't be imported, and asking again soon won't change that. */
export class ExternalListImportError extends Error {}

/** The upstream site couldn't be reached; a later attempt may succeed. */
export class ExternalListUnavailableError extends ExternalListImportError {}

/** This server is already importing as many lists as it allows itself to. */
export class ExternalListBusyError extends Error {}

let upstreamInFlight = 0;
const upstreamWaiting: (() => void)[] = [];

/** Run `task` once fewer than MAX_UPSTREAM_IN_FLIGHT imports are running. */
async function withUpstreamSlot<T>(task: () => Promise<T>): Promise<T> {
  if (upstreamInFlight < MAX_UPSTREAM_IN_FLIGHT) upstreamInFlight++;
  else await new Promise<void>((resolve) => upstreamWaiting.push(resolve));
  try {
    return await task();
  } finally {
    // Hand the slot straight to the next waiter, if any, so the count stays put.
    const next = upstreamWaiting.shift();
    if (next) next();
    else upstreamInFlight--;
  }
}

function upstreamStatusError(site: string, status: number) {
  const message = `${site} could not open this list (${status}).`;
  return status === 429 || status >= 500
    ? new ExternalListUnavailableError(message)
    : new ExternalListImportError(message);
}

/** Read a response body as text, refusing anything past MAX_RESPONSE_BYTES. */
export async function readCappedText(
  response: Response,
  site: string,
): Promise<string> {
  const tooLarge = () =>
    new ExternalListImportError(`${site} returned a list too large to import.`);
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    throw tooLarge();
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ExternalListImportError) throw error;
    throw new ExternalListUnavailableError(`Could not reach ${site}.`);
  }
  return Buffer.concat(chunks).toString("utf8");
}

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
    throw new ExternalListUnavailableError("Could not reach objekt.top.");
  }
  if (!response.ok) throw upstreamStatusError("objekt.top", response.status);

  const text = await readCappedText(response, "objekt.top");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
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
      throw new ExternalListUnavailableError("Could not reach Apollo.");
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
    if (!response.ok) throw upstreamStatusError("Apollo", response.status);
    return { html: await readCappedText(response, "Apollo"), url: current };
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
  const outcome = await listCache.getCached(
    `external-list:v2:${link.url}`,
    CACHE_TTL_MS,
    async (): Promise<
      { ok: true; list: ExternalListImport } | { ok: false; message: string }
    > => {
      if (
        await isRateLimited(UPSTREAM_BUDGET_KEY, UPSTREAM_BUDGET_PER_MINUTE, 60)
      ) {
        throw new ExternalListBusyError(
          "List imports are busy. Try again in a minute.",
        );
      }
      try {
        const list = await withUpstreamSlot(() =>
          link.source === "objekt.top"
            ? importObjektTop(link)
            : importApollo(link),
        );
        return { ok: true, list };
      } catch (error) {
        // A list that is missing or unreadable will still be that way in five
        // minutes, so remember the answer instead of asking the site again —
        // otherwise a stream of made-up slugs is a stream of upstream
        // requests. Network failures might clear up, so those aren't kept.
        if (
          error instanceof ExternalListImportError &&
          !(error instanceof ExternalListUnavailableError)
        ) {
          return { ok: false, message: error.message };
        }
        throw error;
      }
    },
  );
  if (!outcome.ok) throw new ExternalListImportError(outcome.message);
  return outcome.list;
}
