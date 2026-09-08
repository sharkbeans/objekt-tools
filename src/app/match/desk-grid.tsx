"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DeskCard, deskLabel } from "@/lib/discord/trade-desk";
import type { ParsedItem } from "@/lib/paste-parser";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { matchesPileQuery, parsePileQuery } from "./pile-search";

const PAGE_SIZE = 12;
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

export function DeskGrid({
  cards,
  selected,
  onToggle,
  images,
  side,
  caption,
  emptyText,
}: {
  cards: DeskCard[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  images: ReadonlyMap<string, string>;
  side: "mine" | "theirs";
  caption: (card: DeskCard) => string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());
  const filtered = useMemo(() => {
    const parsed = parsePileQuery(query);
    return cards.filter((card) =>
      matchesPileQuery(
        { key: card.key, item: card.item, offeredBy: [] },
        parsed,
      ),
    );
  }, [cards, query]);
  // A changed pool starts at its first page. Selection trays remain visible
  // outside the grid even when a search hides a selected collection.
  const [lastCards, setLastCards] = useState(cards);
  if (lastCards !== cards) {
    setLastCards(cards);
    setPage(0);
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );
  useEffect(() => {
    let active = true;
    const queue = visible.filter((card) => !images.has(card.key));
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
  }, [visible, images]);

  return (
    <div className="space-y-3">
      <Input
        aria-label={
          side === "mine" ? "Search my objekts" : "Search their objekts"
        }
        placeholder="Search member or code · e.g. sy cc101"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(0);
        }}
      />
      <div className="max-h-[420px] min-h-48 overflow-y-auto overscroll-contain p-1">
        {visible.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">
            {query
              ? "No cards match this search. Try a different member or code."
              : emptyText}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {visible.map((card) => {
              const label = deskLabel(card.item);
              const chosen = selected.has(card.key);
              const url = images.get(card.key) ?? resolved.get(card.key);
              return (
                <button
                  key={card.key}
                  type="button"
                  aria-label={`${side === "mine" ? "My" : "Their"} ${label}`}
                  aria-pressed={chosen}
                  onClick={() => onToggle(card.key)}
                  className={`overflow-hidden rounded-lg border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${chosen ? "border-primary bg-primary/10 ring-2 ring-primary" : "border-border bg-background hover:border-primary/70"}`}
                >
                  <div className="relative aspect-[3/4] bg-muted">
                    {url ? (
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 150px, 30vw"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-sm text-muted-foreground">
                        {label}
                      </span>
                    )}
                    {chosen && (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                        <CheckIcon className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-2">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p
                      className={`text-xs leading-tight ${card.posts.length > 0 ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {caption(card)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {filtered.length.toLocaleString()} cards · page {safePage + 1} of{" "}
          {pageCount}
        </span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label={`Previous ${side} page`}
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label={`Next ${side} page`}
            disabled={safePage + 1 >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
