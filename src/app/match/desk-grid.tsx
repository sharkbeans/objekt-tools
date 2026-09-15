"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DeskCard, deskLabel } from "@/lib/discord/trade-desk";
import { useDeskArtwork } from "./desk-artwork";
import { DeskCardName } from "./desk-card-name";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

const ROWS_PER_PAGE = 3;

/**
 * What a card's count means, once it is no longer spelled out in words.
 *
 * "have" and "want" are always the trader's, never the viewer's — a card in
 * "Their objekts" says how many traders *have* it to offer; a card in
 * "My objekts" says how many traders *want* it from the viewer. Each grid only
 * ever passes one tone, so a card's panel already fixes which meaning applies;
 * the tone still drives the badge's color so that holds even out of context —
 * on its own, before/after a screenshot, autofill, whatever.
 *
 * `full` is the sentence version, never shown but always present: it is the
 * badge's accessible name and its hover title, so the count is legible to a
 * screen reader and to a returning user who forgot what "H"/"W" stood for.
 */
export type DeskBadge =
  | { kind: "count"; count: number; tone: "have" | "want"; full: string }
  | { kind: "text"; text: string };

export function DeskGrid({
  cards,
  selected,
  onToggle,
  images,
  side,
  badge,
  emptyText,
  columns,
  poolKey,
  search,
  onSearchChange,
  clearFilters,
}: {
  cards: DeskCard[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  images: ReadonlyMap<string, string>;
  side: "mine" | "theirs";
  badge: (card: DeskCard) => DeskBadge;
  emptyText: string;
  columns: number;
  poolKey: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  clearFilters?: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState("");
  const query = search ?? localQuery;
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
  const searchPool = `${poolKey}|${query}`;
  const [lastPool, setLastPool] = useState(searchPool);
  if (lastPool !== searchPool) {
    setLastPool(searchPool);
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
      <div className="flex items-center gap-2">
        <Input
          ref={searchRef}
          className="min-w-0"
          aria-label={
            side === "mine" ? "Search my objekts" : "Search their objekts"
          }
          placeholder="Search member or code · e.g. sy cc101"
          value={query}
          onChange={(event) => {
            if (onSearchChange) onSearchChange(event.target.value);
            else setLocalQuery(event.target.value);
            setPage(0);
          }}
        />
        {clearFilters && (
          <button
            type="button"
            className="min-h-9 shrink-0 rounded px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            title="Clear the search and card selections to browse all imported offers"
            onClick={() => {
              clearFilters();
              setPage(0);
              searchRef.current?.focus();
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {/* Grows with its rows and lets the page scroll: pages already bound
          how many cards show, and a box scrolling inside the page trapped the
          wheel halfway down it. */}
      <div className="min-h-48 p-1">
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
              const info = badge(card);
              // Read by assistive tech in place of the badge's letter, and by
              // everyone else as the hover title — the same full sentence
              // either way, since `aria-label` on the button already replaces
              // whatever text is inside it.
              const description = info.kind === "count" ? info.full : info.text;
              return (
                <button
                  key={card.key}
                  type="button"
                  aria-label={`${side === "mine" ? "My" : "Their"} ${label}, ${description}`}
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
                        unoptimized
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-sm text-muted-foreground">
                        {label}
                      </span>
                    )}
                    {info.kind === "count" && (
                      // Top-left, not top-right: the selection check lands
                      // top-right, and the two must never share a corner.
                      // Colored by which panel this is — matching the "Your
                      // side" / "From your Discord paste" header above each
                      // grid — so the count reads as "mine" or "theirs" by
                      // color alone, the letter confirming rather than
                      // carrying the meaning on its own.
                      <span
                        title={info.full}
                        aria-hidden="true"
                        className={`absolute top-1.5 left-1.5 min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-[1.15rem] shadow-sm ${
                          info.count === 0
                            ? "bg-background/90 text-muted-foreground"
                            : info.tone === "have"
                              ? "bg-primary text-primary-foreground"
                              : "bg-emerald-500 text-white"
                        }`}
                      >
                        {info.count}
                        {info.tone === "have" ? "H" : "W"}
                      </span>
                    )}
                    {chosen && (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                        <CheckIcon className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-2">
                    <DeskCardName
                      item={card.item}
                      className="text-xs font-medium"
                    />
                    {info.kind === "text" && (
                      <p
                        className={`truncate text-xs leading-tight ${card.posts.length > 0 ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {info.text}
                      </p>
                    )}
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
