"use client";

import { useEffect, useState } from "react";
import type { ParsedItem } from "@/lib/paste-parser";
import { resolveForPoster } from "@/lib/poster/poster-resolver";

// Share resolved art across both grids and result cards. Each mounted grid
// resolves at most one page, with four lookups in flight at a time.
const artCache = new Map<string, Promise<string | null>>();
async function artwork(key: string, item: ParsedItem) {
  let pending = artCache.get(key);
  if (!pending) {
    pending = resolveForPoster([{ ...item, onOffline: undefined }])
      .then((rows) => rows[0]?.imageUrl ?? null)
      .catch(() => null);
    if (artCache.size >= 1500)
      artCache.delete(artCache.keys().next().value as string);
    artCache.set(key, pending);
  }
  return pending;
}

export function useDeskArtwork(
  cards: readonly { key: string; item: ParsedItem }[],
  images: ReadonlyMap<string, string>,
) {
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    const queue = cards.filter((card) => !images.has(card.key));
    async function worker() {
      while (active && queue.length) {
        const card = queue.shift();
        if (!card) break;
        const url = await artwork(card.key, card.item);
        if (active && url)
          setResolved((prev) => new Map(prev).set(card.key, url));
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker));
    return () => {
      active = false;
    };
  }, [cards, images]);
  return resolved;
}
