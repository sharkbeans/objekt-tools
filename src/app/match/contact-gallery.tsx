"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deskLabel } from "@/lib/discord/trade-desk";
import type { ParsedItem } from "@/lib/paste-parser";
import { useDeskArtwork } from "./desk-artwork";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

export function ContactGallery({
  items,
  images,
  title,
  caption,
  wanted,
  onReview,
}: {
  items: [string, ParsedItem][];
  images: ReadonlyMap<string, string>;
  title: string;
  caption?: (key: string) => string;
  wanted?: ReadonlySet<string>;
  onReview: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(18);
  const filtered = useMemo(() => {
    const parsed = parseDeskQuery(query);
    return items.filter(
      ([, item]) => !expanded || matchesDeskQuery(item, parsed),
    );
  }, [items, query, expanded]);
  const visible = useMemo(
    () =>
      filtered
        .slice(0, expanded ? limit : 4)
        .map(([key, item]) => ({ key, item })),
    [filtered, expanded, limit],
  );
  const resolved = useDeskArtwork(visible, images);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {title} <span className="ml-1 tabular-nums">{items.length}</span>
        </h3>
        {items.length > 4 && (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show fewer" : `View all ${items.length} cards →`}
          </button>
        )}
      </div>
      {expanded && (
        <Input
          aria-label={`Search ${title.toLowerCase()}`}
          placeholder="Search member or code · e.g. sy cc101"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(18);
          }}
        />
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-4">
        {visible.map(({ key, item }) => {
          const label = deskLabel(item);
          const url = images.get(key) ?? resolved.get(key);
          return (
            <button
              type="button"
              key={key}
              onClick={onReview}
              aria-label={`Review ${label}`}
              className="w-[72px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-[84px]"
            >
              <div className="relative aspect-[11/17] overflow-hidden rounded-lg border bg-muted">
                {url ? (
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="84px"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {label}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs font-medium leading-snug">{label}</p>
              {wanted?.has(key) && (
                <p className="mt-1 text-[10px] font-medium text-emerald-500">
                  On your want list
                </p>
              )}
              {caption && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {caption(key)}
                </p>
              )}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No cards match this search.
        </p>
      )}
      {expanded && filtered.length > limit && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLimit(limit + 18)}
        >
          Show more ({filtered.length - limit} remaining)
        </Button>
      )}
    </div>
  );
}
