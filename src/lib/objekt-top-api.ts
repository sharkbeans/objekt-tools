// Client for objekt.top's public read API (https://objekt.top/api/v1/,
// reference page at that URL, OpenAPI document at /api/v1/spec.json). It is
// served by izrin96/cosmo-web from the same indexer database we otherwise
// query directly, and is documented as the contract third-party clients build
// against (openspec/specs/api-openapi/spec.md in that repo).
//
// We only use it as a fallback while the indexer database is unreachable
// (see indexer-fallback.ts). Be a polite client: cache what we read, send
// conditional requests where the API supports them, and identify ourselves.

const DEFAULT_BASE_URL = "https://objekt.top/api/v1";
const USER_AGENT = "objekt.my (+https://objekt.my; indexer fallback)";
const REQUEST_TIMEOUT_MS = 15_000;
// owned-by pages hold 8,000 objekts and transfers pages 150; these caps only
// stop a misbehaving cursor from looping for ever.
const MAX_OWNED_PAGES = 50;
const MAX_TRANSFER_PAGES = 40;

export class ObjektTopApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ObjektTopApiError";
  }
}

export type ObjektTopCollection = {
  id: string;
  createdAt: string;
  slug: string;
  collectionId: string;
  season: string;
  member: string;
  artist: string;
  collectionNo: string;
  class: string;
  thumbnailImage: string;
  frontImage: string;
  backImage: string;
  originalFrontImage: string;
  originalBackImage: string;
  backgroundColor: string;
  onOffline: "online" | "offline";
};

// An owned objekt carries its collection's metadata but not the collection's
// database id; `id` here is the token id.
export type ObjektTopOwnedObjekt = Omit<ObjektTopCollection, "id"> & {
  id: string;
  tokenId: string;
  serial: number;
  transferable: boolean;
  receivedAt: string;
};

export type ObjektTopTransfer = {
  transfer: { id: string; from: string; to: string; timestamp: string };
  objekt: Pick<
    ObjektTopCollection,
    "collectionId" | "member" | "class" | "onOffline" | "season"
  >;
};

export function getObjektTopApiBaseUrl(): string {
  return (process.env.OBJEKT_TOP_API_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

async function request(
  path: string,
  params?: URLSearchParams,
  headers?: Record<string, string>,
): Promise<Response> {
  const query = params?.toString();
  const url = `${getObjektTopApiBaseUrl()}${path}${query ? `?${query}` : ""}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ObjektTopApiError(
      `objekt.top API request failed: ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok && response.status !== 304) {
    throw new ObjektTopApiError(
      `objekt.top API ${path} answered ${response.status}`,
      response.status,
    );
  }
  return response;
}

async function readJson<T>(response: Response, path: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ObjektTopApiError(`objekt.top API ${path} sent invalid JSON`);
  }
}

/** Every objekt the address owns, across all pages. */
export async function fetchOwnedObjekts(
  address: string,
): Promise<ObjektTopOwnedObjekt[]> {
  const path = `/objekts/owned-by/${encodeURIComponent(address.toLowerCase())}`;
  const objekts: ObjektTopOwnedObjekt[] = [];
  let cursor: { receivedAt: string; id: string } | undefined;

  for (let page = 0; page < MAX_OWNED_PAGES; page++) {
    const params = new URLSearchParams();
    if (cursor) {
      params.set("cursor[receivedAt]", cursor.receivedAt);
      params.set("cursor[id]", cursor.id);
    }
    const body = await readJson<{
      objekts?: ObjektTopOwnedObjekt[];
      nextCursor?: { receivedAt: string; id: string } | null;
    }>(await request(path, params), path);
    if (!Array.isArray(body.objekts)) {
      throw new ObjektTopApiError(`objekt.top API ${path} sent no objekts`);
    }
    objekts.push(...body.objekts);
    if (!body.nextCursor) return objekts;
    cursor = body.nextCursor;
  }

  throw new ObjektTopApiError(
    `objekt.top API ${path} had more than ${MAX_OWNED_PAGES} pages`,
  );
}

export type CollectionsFetchResult =
  | { notModified: true }
  | {
      notModified: false;
      lastModified: string | null;
      collections: ObjektTopCollection[];
    };

/**
 * Every collection. The endpoint answers a conditional request with an empty
 * 304, so pass the previous response's Last-Modified and the full list is
 * only downloaded when a collection was actually added.
 */
export async function fetchCollectionsIfModified(
  ifModifiedSince: string | null,
): Promise<CollectionsFetchResult> {
  const path = "/collections";
  const response = await request(
    path,
    undefined,
    ifModifiedSince ? { "If-Modified-Since": ifModifiedSince } : undefined,
  );
  if (response.status === 304) return { notModified: true };
  const body = await readJson<{ collections?: ObjektTopCollection[] }>(
    response,
    path,
  );
  if (!Array.isArray(body.collections)) {
    throw new ObjektTopApiError(`objekt.top API ${path} sent no collections`);
  }
  return {
    notModified: false,
    lastModified: response.headers.get("last-modified"),
    collections: body.collections,
  };
}

/** Every mint (transfer from the zero address) the address received. */
export async function fetchMintTransfers(
  address: string,
  filters: {
    member?: string;
    class?: string;
    onOffline?: "online" | "offline";
  },
): Promise<ObjektTopTransfer[]> {
  const path = `/transfers/${encodeURIComponent(address.toLowerCase())}`;
  const results: ObjektTopTransfer[] = [];
  let cursor: { timestamp: string; id: string } | undefined;

  for (let page = 0; page < MAX_TRANSFER_PAGES; page++) {
    const params = new URLSearchParams({ type: "mint" });
    if (filters.member) params.set("member", filters.member);
    if (filters.class) params.set("class", filters.class);
    if (filters.onOffline) params.set("on_offline", filters.onOffline);
    if (cursor) {
      params.set("cursor[timestamp]", cursor.timestamp);
      params.set("cursor[id]", cursor.id);
    }
    const body = await readJson<{
      results?: ObjektTopTransfer[];
      nextCursor?: { timestamp: string; id: string } | null;
    }>(await request(path, params), path);
    if (!Array.isArray(body.results)) {
      throw new ObjektTopApiError(`objekt.top API ${path} sent no results`);
    }
    results.push(...body.results);
    if (!body.nextCursor) return results;
    cursor = body.nextCursor;
  }

  throw new ObjektTopApiError(
    `objekt.top API ${path} had more than ${MAX_TRANSFER_PAGES} pages`,
  );
}

/** objekt.top's own view of whether its indexer and Cosmo are current. */
export async function fetchObjektTopStatus(): Promise<{
  database?: { latestTransferDate?: string; behind?: boolean };
  cosmo?: { status?: string };
}> {
  const path = "/status";
  return readJson(await request(path), path);
}
