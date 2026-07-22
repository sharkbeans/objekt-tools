import type { ObjektEntry } from "@/lib/cosmo/types";

export type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

export type InventoryPageRequest = {
  page: number;
  limit: number;
  query?: string;
  artist?: string[];
  member?: string[];
  season?: string[];
  class?: string[];
  onOffline?: string[];
  signal?: AbortSignal;
};

export type InventoryPageResponse = {
  results: OwnedEntry[];
  total: number;
  filteredTotal: number;
  page: number;
  limit: number;
};

export type InventoryOwnershipCandidate = {
  collectionId: string;
  serial?: number | null;
};

export async function fetchOwnedInventory(): Promise<OwnedEntry[]> {
  const res = await fetch("/api/objekts/owned");
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export async function fetchUserInventory(
  address: string,
): Promise<OwnedEntry[]> {
  const res = await fetch(`/api/objekts/user/${encodeURIComponent(address)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

const INVENTORY_CACHE_TTL = 90_000;
const inventoryCache = new Map<
  string,
  { data: OwnedEntry[]; expiresAt: number }
>();

export async function fetchInventoryByNickname(
  nickname: string,
): Promise<OwnedEntry[]> {
  const key = nickname.toLowerCase();
  const cached = inventoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const res = await fetch(
    `/api/objekts/by-nickname/${encodeURIComponent(nickname)}`,
  );
  if (res.status === 429)
    throw new Error("Too many requests. Try again later.");
  if (res.status === 404)
    throw new Error(`Cosmo user "${nickname}" not found.`);
  if (!res.ok) throw new Error("Failed to load inventory.");
  const data = await res.json();
  const results: OwnedEntry[] = data.results ?? [];
  inventoryCache.set(key, {
    data: results,
    expiresAt: Date.now() + INVENTORY_CACHE_TTL,
  });
  return results;
}

export async function fetchInventoryPageByNickname(
  nickname: string,
  request: InventoryPageRequest,
): Promise<InventoryPageResponse> {
  const params = new URLSearchParams({
    page: String(request.page),
    limit: String(request.limit),
  });
  if (request.query?.trim()) params.set("q", request.query.trim());
  appendParams(params, "artist", request.artist);
  appendParams(params, "member", request.member);
  appendParams(params, "season", request.season);
  appendParams(params, "class", request.class);
  appendParams(params, "on_offline", request.onOffline);

  const res = await fetch(
    `/api/objekts/by-nickname/${encodeURIComponent(nickname)}/inventory?${params}`,
    { signal: request.signal },
  );
  await throwInventoryResponseError(res, nickname);
  const data = await res.json();
  return {
    results: data.results ?? [],
    total: Number(data.total ?? 0),
    filteredTotal: Number(data.filteredTotal ?? 0),
    page: Number(data.page ?? request.page),
    limit: Number(data.limit ?? request.limit),
  };
}

export async function hasAnyInventoryCandidateByNickname(
  nickname: string,
  candidates: InventoryOwnershipCandidate[],
): Promise<boolean> {
  const res = await fetch(
    `/api/objekts/by-nickname/${encodeURIComponent(nickname)}/inventory`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    },
  );
  await throwInventoryResponseError(res, nickname);
  const data = await res.json();
  return data.owned === true;
}

function appendParams(
  params: URLSearchParams,
  key: string,
  values: string[] | undefined,
) {
  for (const value of values ?? []) {
    if (value) params.append(key, value);
  }
}

async function throwInventoryResponseError(res: Response, nickname: string) {
  if (res.ok) return;
  if (res.status === 429) {
    throw new Error("Too many requests. Try again later.");
  }
  if (res.status === 404) {
    throw new Error(`Cosmo user "${nickname}" not found.`);
  }
  throw new Error("Failed to load inventory.");
}
