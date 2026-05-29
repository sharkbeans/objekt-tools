import { getSeasonPrefix } from "@/lib/season-prefix";

export type ObjektLabelItem = {
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  artist?: string | null;
  class?: string | null;
};

/** "Any X" placeholder label for wildcard wants. */
export function anyWantLabel(item: ObjektLabelItem): string {
  if (item.member) return `Any ${item.member}`;
  if (item.season && item.artist) return `Any ${item.artist} ${item.season}`;
  if (item.season) return `Any ${item.season}`;
  if (item.artist) return `Any ${item.artist}`;
  if (item.class) return `Any ${item.class}`;
  return "Any";
}

/** Compact label: "SeoYeon A108" — strip trailing type char (Z/A). */
export function formatShortLabel(item: ObjektLabelItem): string {
  if (item.collectionNo && item.member) {
    const prefix = getSeasonPrefix(item.season);
    const num = item.collectionNo.replace(/[A-Za-z]$/, "");
    return `${item.member} ${prefix}${num}`;
  }
  return item.collectionId;
}
