"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DeskCard, deskLabel } from "@/lib/discord/trade-desk";
import { useDeskArtwork } from "./desk-artwork";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

const ROWS_PER_PAGE = 3;
export function DeskGrid({
  cards,
  selected,
  onToggle,
  images,
  side,
  caption,
  emptyText,
  columns,
  poolKey,
}: {
  cards: DeskCard[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  images: ReadonlyMap<string, string>;
  side: "mine" | "theirs";
  caption: (card: DeskCard) => string;
  emptyText: string;
  columns: number;
  poolKey: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const parsed = parseDeskQuery(query);
    return cards.filter((card) => matchesDeskQuery(card.item, parsed));
  }, [cards, query]);
  // A new pool — another mode, another paste, another inventory — starts at
  // its first page. Selecting a card rebuilds this list too, and that must not
  // move the reader: the page they were on is kept and only clamped when the
  // narrowed pool has fewer pages, so clearing the pick returns them to it.
  // Selection trays remain visible outside the grid even when a search hides a
  // selected collection.
  const [lastPool, setLastPool] = useState(poolKey);
  if (lastPool !== poolKey) {
    setLastPool(poolKey);
    setPage(0);
  }
  const pageSize = columns * ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => filtered.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [filtered, safePage, pageSize],
  );
  const resolved = useDeskArtwork(visible, images);

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
          <div
            className="grid gap-3 [grid-template-columns:repeat(3,minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--desk-cols),minmax(0,1fr))]"
            style={{ "--desk-cols": columns } as CSSProperties}
          >
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
                  <div className="relative aspect-[11/17] bg-muted">
                    {url ? (
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes={`(min-width: 768px) ${Math.round(46 / columns)}vw, 30vw`}
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
                    <p className="line-clamp-2 min-h-[2.25rem] text-sm font-medium leading-tight">
                      {label}
                    </p>
                    <p
                      className={`truncate text-xs leading-tight ${card.posts.length > 0 ? "text-primary" : "text-muted-foreground"}`}
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
