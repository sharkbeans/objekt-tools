"use client";

import Image from "next/image";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deskLabel } from "@/lib/discord/trade-desk";
import type { ParsedItem } from "@/lib/paste-parser";
import { useDeskArtwork } from "./desk-artwork";
import { DeskCardName } from "./desk-card-name";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";

/** Cards a gallery previews before "View all". */
const PREVIEW = 4;
/** Cards per "Show more" once a gallery is showing more than a preview. */
const PAGE = 18;

export function ContactGallery({
  items,
  images,
  title,
  caption,
  wanted,
  onReview,
  focus,
}: {
  items: [string, ParsedItem][];
  images: ReadonlyMap<string, string>;
  title: string;
  caption?: (key: string) => string;
  wanted?: ReadonlySet<string>;
  onReview: () => void;
  /**
   * The cards this trader is on screen for: what was searched for or selected.
   *
   * A trader with 43 haves who matched on seven of them used to show the first
   * four of the 43, in the order they typed them, with the seven somewhere
   * past card thirty. When only some cards qualify, only those show until
   * "Show all" is pressed, and they stay first after it is.
   */
  focus?: (key: string, item: ParsedItem) => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // Everything derived here is memoized: `useDeskArtwork` restarts its fetches
  // whenever the list it is handed changes identity.
  const focused = useMemo(
    () => (focus ? items.filter(([key, item]) => focus(key, item)) : []),
    [items, focus],
  );
  // A separate view only when it leaves something out.
  const focusing = focused.length > 0 && focused.length < items.length;
  const ordered = useMemo(() => {
    if (!focusing) return items;
    const first = new Set(focused.map(([key]) => key));
    return [...focused, ...items.filter(([key]) => !first.has(key))];
  }, [items, focused, focusing]);
  const pool = focusing && !expanded ? focused : ordered;
  const filtered = useMemo(() => {
    if (!expanded) return pool;
    const parsed = parseDeskQuery(query);
    return pool.filter(([, item]) => matchesDeskQuery(item, parsed));
  }, [pool, query, expanded]);
  const shown = expanded || focusing ? limit : PREVIEW;
  const visible = useMemo(
    () => filtered.slice(0, shown).map(([key, item]) => ({ key, item })),
    [filtered, shown],
  );
  const resolved = useDeskArtwork(visible, images);
  // Where the matches end and the rest of their haves begin, once both show.
  const focusedKeys = useMemo(
    () => new Set(focused.map(([key]) => key)),
    [focused],
  );
  const firstOther =
    focusing && expanded
      ? visible.findIndex(({ key }) => !focusedKeys.has(key))
      : -1;
  const expand = (open: boolean) => {
    setExpanded(open);
    setQuery("");
    setLimit(PAGE);
  };
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {title}{" "}
          <span className="ml-1 tabular-nums">
            {focusing ? `${focused.length} of ${items.length}` : items.length}
          </span>
        </h3>
        {(focusing ? expanded : items.length > PREVIEW) && (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => expand(!expanded)}
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
            setLimit(PAGE);
          }}
        />
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-4">
        {visible.map(({ key, item }, index) => {
          const label = deskLabel(item);
          const url = images.get(key) ?? resolved.get(key);
          return (
            <Fragment key={key}>
              {index === firstOther && (
                <p className="basis-full border-t pt-3 text-xs font-semibold text-muted-foreground">
                  Their other haves
                </p>
              )}
              <button
                type="button"
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
                      unoptimized
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                      {label}
                    </span>
                  )}
                </div>
                <DeskCardName
                  item={item}
                  className="mt-2 text-xs font-medium"
                />
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
            </Fragment>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No cards match this search.
        </p>
      )}
      {(expanded || focusing) && filtered.length > limit && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLimit(limit + PAGE)}
        >
          Show more ({filtered.length - limit} remaining)
        </Button>
      )}
      {focusing && !expanded && (
        <Button size="sm" variant="outline" onClick={() => expand(true)}>
          Show all {items.length} haves
        </Button>
      )}
    </div>
  );
}
