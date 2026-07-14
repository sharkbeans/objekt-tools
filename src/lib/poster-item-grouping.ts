import type { ResolvedPosterItem } from "@/lib/poster-resolver";

export function getItemQuantity(item: ResolvedPosterItem): number {
  return item.parsed.quantity && item.parsed.quantity > 1
    ? item.parsed.quantity
    : 1;
}

export function getNumberGroupKey(item: ResolvedPosterItem): string {
  if (item.entry) return `entry:${item.entry.collectionId}`;
  return [
    "parsed",
    item.parsed.member ?? "",
    item.parsed.season,
    item.parsed.collectionNo,
    item.parsed.onOffline ?? "",
    item.parsed.raw,
  ].join("|");
}

export function autoGridCols(count: number): number {
  if (count <= 0) return 3;
  return Math.min(7, Math.max(3, Math.ceil(Math.sqrt(count * 1.5))));
}
