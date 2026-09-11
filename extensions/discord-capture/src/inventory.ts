import type { ObjektKeyParts } from "@/lib/discord/match";

/**
 * The one origin the inventory lookup needs, named once.
 *
 * It is an optional host permission, so it is granted by a prompt rather than
 * at install — and the panel, the worker and the manifest all have to agree on
 * the pattern or the check passes while the fetch is blocked.
 */
export const INVENTORY_ORIGIN = "https://objekt.my/*";
export function inventoryRows(value: unknown): ObjektKeyParts[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (row) =>
        row &&
        typeof row === "object" &&
        typeof row.member === "string" &&
        typeof row.season === "string" &&
        typeof row.collectionNo === "string",
    )
  )
    throw new Error("Inventory response is invalid. Saved haves were kept.");
  return value.map(({ member, season, collectionNo }) => ({
    member,
    season,
    collectionNo,
  }));
}
export async function loadInventory(
  nickname: unknown,
): Promise<ObjektKeyParts[]> {
  if (
    typeof nickname !== "string" ||
    !nickname.length ||
    nickname.length > 30 ||
    /\s/.test(nickname)
  )
    throw new Error("Enter a Cosmo nickname (up to 30 characters, no spaces).");
  const response = await fetch(
    `https://objekt.my/api/objekts/by-nickname/${encodeURIComponent(nickname)}`,
    {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Too many lookups. Wait a minute before trying again."
        : `Inventory lookup failed (${response.status}). Saved haves were kept.`,
    );
  const data = await response.json();
  if (data?.unavailable)
    throw new Error(
      "Inventory is temporarily unavailable. Saved haves were kept.",
    );
  return inventoryRows(data?.results);
}
