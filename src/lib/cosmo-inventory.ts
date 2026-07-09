import type { ObjektEntry } from "@/lib/cosmo/types";

export type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

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
