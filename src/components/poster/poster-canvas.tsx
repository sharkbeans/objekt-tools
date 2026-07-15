import { getItemQuantity, getNumberGroupKey } from "@/lib/poster-item-grouping";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";

export type PosterTheme = "dark" | "light";

export interface PosterData {
  username: string;
  cosmoId: string;
  haves: ResolvedPosterItem[];
  wants: ResolvedPosterItem[];
  notes?: string;
  date: string;
  haveTitle: string;
  wantTitle: string;
}

interface DisplayItem {
  item: ResolvedPosterItem;
  index: number;
  quantity: number;
}

function getDisplayItems(
  items: ResolvedPosterItem[],
  groupByNumbers: boolean,
): DisplayItem[] {
  if (!groupByNumbers) {
    return items.map((item, index) => ({
      item,
      index,
      quantity: getItemQuantity(item),
    }));
  }

  const grouped: DisplayItem[] = [];
  const seen = new Map<string, DisplayItem>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = getNumberGroupKey(item);
    const existing = seen.get(key);
    if (existing) {
      existing.quantity += getItemQuantity(item);
    } else {
      const displayItem = { item, index, quantity: getItemQuantity(item) };
      grouped.push(displayItem);
      seen.set(key, displayItem);
    }
  }

  return grouped;
}

export function getGridCols(count: number): number {
  return Math.min(10, Math.max(3, Math.ceil(Math.sqrt(count * 1.5))));
}

export function getDisplayCount(
  items: ResolvedPosterItem[],
  groupByNumbers: boolean,
): number {
  return getDisplayItems(items, groupByNumbers).length;
}
