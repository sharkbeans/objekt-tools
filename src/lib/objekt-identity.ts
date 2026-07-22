import type { ObjektEntry } from "@/lib/cosmo/types";

export function getObjektInstanceKey(entry: ObjektEntry): string {
  if (entry.objektId) return entry.objektId;
  return `${entry.collectionId}:${entry.serial ?? ""}`;
}

export function isSameObjektInstance(a: ObjektEntry, b: ObjektEntry): boolean {
  if (a.objektId && b.objektId) return a.objektId === b.objektId;

  const aSerial = a.serial ?? null;
  const bSerial = b.serial ?? null;
  if (aSerial != null || bSerial != null) {
    return a.collectionId === b.collectionId && aSerial === bSerial;
  }

  return a.collectionId === b.collectionId;
}
