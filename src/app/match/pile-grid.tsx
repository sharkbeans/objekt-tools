"use client";

import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INTENT_LABEL } from "@/lib/discord/intent";
import type { PileEntry } from "@/lib/discord/match";
import { askingPrice, bidPrice, formatPrice } from "@/lib/discord/price";
import type { DemandEntry } from "@/lib/discord/supply";
import type { VerificationState } from "@/lib/discord/verify";
import { formatShortLabel } from "@/lib/objekt-label";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { CopyDiscordHandle } from "./post-dialog";

/**
 * Resolving an objekt to its artwork costs a request per distinct collection,
 * so the pile is paged rather than resolved whole — a channel dump routinely
 * runs to thousands of distinct objekts.
 */
const PAGE_SIZE = 50;
const EMPTY_IMAGES = new Map<string, string>();

interface PileGridProps {
  entries: PileEntry[];
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  demand: ReadonlyMap<string, DemandEntry>;
  verified: ReadonlyMap<string, VerificationState>;
  /** Artwork supplied by a public linked list, keyed by collection identity. */
  imageUrls?: ReadonlyMap<string, string>;
}

export function PileGrid({
  entries,
  picked,
  onToggle,
  demand,
  verified,
  imageUrls = EMPTY_IMAGES,
}: PileGridProps) {
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  /** Keys already sent to the resolver, image or not. */
  const attempted = useRef<Set<string>>(new Set());

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [entries, safePage],
  );

  // Reset to the first page whenever the pile itself changes (a new paste, a
  // different filter) rather than leaving the viewer on a page that no longer
  // exists.
  useEffect(() => {
    setPage(0);
  }, []);

  useEffect(() => {
    // Keyed on *attempted*, not resolved: not every objekt has artwork, and
    // keying on the result map meant those were re-requested on every render —
    // an unbounded fetch loop rather than one pass per page.
    const missing = visible.filter(
      (entry) => !attempted.current.has(entry.key) && !imageUrls.has(entry.key),
    );
    if (missing.length === 0) return;
    for (const entry of missing) attempted.current.add(entry.key);

    setLoading(true);
    // The pile collapses A/Z twins into one entry, so resolve without the
    // on/offline constraint: the parser defaults every CC item to the offline
    // twin, and objekts that only exist as the online variant would otherwise
    // show a blank card even though artwork exists.
    resolveForPoster(missing.map((e) => ({ ...e.item, onOffline: undefined })))
      .then((resolved) => {
        // Applied even if this effect run was cleaned up. React re-runs
        // effects on mount in development, and the second run finds every key
        // already attempted — so discarding the first run's results here threw
        // away the only fetch that was ever made.
        const found = resolved.flatMap((r, i) => {
          const key = missing[i]?.key;
          return key && r.imageUrl
            ? ([[key, r.imageUrl]] as [string, string][])
            : [];
        });
        if (found.length > 0) setImages((prev) => new Map([...prev, ...found]));
      })
      .catch(() => {
        // Artwork is decoration — a failed lookup leaves the text label, which
        // is the part a trader actually needs.
      })
      .finally(() => setLoading(false));
  }, [imageUrls, visible]);

  const detail = detailKey
    ? (entries.find((e) => e.key === detailKey) ?? null)
    : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
        {visible.map((entry) => {
          const isPicked = picked.has(entry.key);
          const url = imageUrls.get(entry.key) ?? images.get(entry.key);
          const asks = entry.offeredBy
            .map((m) => askingPrice(m.pricing, entry.key))
            .filter((p) => p !== null);
          const cheapest =
            asks.length > 0
              ? asks.reduce((a, b) => (b.amount < a.amount ? b : a))
              : null;
          const label = formatShortLabel({
            member: entry.item.member,
            season: entry.item.season,
            collectionNo: entry.item.collectionNo,
            collectionId: "",
          });
          return (
            <div key={entry.key} className="relative">
              <button
                type="button"
                onClick={() => onToggle(entry.key)}
                title={`Offered by ${entry.offeredBy.map((m) => m.author).join(", ")}`}
                className={`relative block w-full overflow-hidden rounded-md ring-2 transition-colors ${
                  isPicked
                    ? "ring-primary"
                    : "ring-transparent hover:ring-border"
                }`}
              >
                {url ? (
                  <div className="relative aspect-photocard w-full">
                    <Image
                      src={url}
                      alt={label}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 12vw, 30vw"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-photocard w-full items-center justify-center bg-muted p-1 text-center text-muted-foreground text-xs">
                    {loading ? "…" : label}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4">
                  <p className="font-medium text-white text-xs leading-tight">
                    {label}
                  </p>
                </div>
                {entry.offeredBy.length > 1 && (
                  <span className="absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 font-medium text-white text-xs">
                    {entry.offeredBy.length} traders
                  </span>
                )}
                {/* Cheapest ask, so the grid is scannable when money is the
                    point rather than the swap. */}
                {cheapest !== null && (
                  <span className="absolute top-1.5 right-9 rounded bg-emerald-600 px-1.5 py-0.5 font-semibold text-white text-xs shadow-sm">
                    {formatPrice(cheapest)}
                  </span>
                )}
              </button>
              {/* Detail is opt-in: the conditions attached to a listing are
                  important but would drown the grid if shown inline. */}
              <button
                type="button"
                aria-label={`Details for ${label}`}
                onClick={() =>
                  setDetailKey(detailKey === entry.key ? null : entry.key)
                }
                className="absolute top-1.5 right-1.5 rounded bg-black/70 p-1 text-white hover:bg-black/90"
              >
                <InfoIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {detail && (
        <ObjektDialog
          entry={detail}
          imageUrl={imageUrls.get(detail.key) ?? images.get(detail.key) ?? null}
          demand={demand.get(detail.key)}
          verified={verified}
          onOpenChange={(open) => !open && setDetailKey(null)}
        />
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground">
            {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, entries.length)} of{" "}
            {entries.length.toLocaleString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One objekt, and the market for it inside this paste.
 *
 * Filtering to "Sells" narrows which posts are in play but says nothing about
 * the price, which is the entire question when money is involved. This answers
 * it per objekt: who is selling, for how much, on what payment rail — and, on
 * the other side, who is buying and what they will pay.
 */
function ObjektDialog({
  entry,
  imageUrl,
  demand,
  verified,
  onOpenChange,
}: {
  entry: PileEntry;
  imageUrl: string | null;
  demand: DemandEntry | undefined;
  verified: ReadonlyMap<string, VerificationState>;
  onOpenChange: (open: boolean) => void;
}) {
  const label = formatShortLabel({
    member: entry.item.member,
    season: entry.item.season,
    collectionNo: entry.item.collectionNo,
    collectionId: "",
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="gap-4 text-left sm:flex-row sm:items-start">
          {imageUrl ? (
            <div className="relative aspect-photocard w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:w-36">
              <Image src={imageUrl} alt={label} fill className="object-cover" />
            </div>
          ) : (
            <div className="flex aspect-photocard w-28 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted p-2 text-center text-xs text-muted-foreground sm:w-36">
              Reference image unavailable
            </div>
          )}
          <div className="space-y-1.5">
            <DialogTitle className="text-2xl">{label}</DialogTitle>
            <DialogDescription className="text-base">
              {entry.item.season} — {entry.offeredBy.length} offering,{" "}
              {demand?.wanters.length ?? 0} looking for it in this paste.
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              Copy a Discord name below, then paste it into Discord search to
              contact that trader.
            </p>
          </div>
        </DialogHeader>

        <section className="space-y-2.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Offering it
          </h3>
          {entry.offeredBy.map((message) => {
            const ask = askingPrice(message.pricing, entry.key);
            const chainChecked =
              message.nickname !== null &&
              verified.get(message.nickname)?.status === "verified";
            return (
              <div
                key={message.key}
                className="space-y-2 rounded-md border border-border/60 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <CopyDiscordHandle name={message.author} />
                  {message.intent.intents.map((i) => (
                    <Badge key={i} variant="outline">
                      {INTENT_LABEL[i]}
                    </Badge>
                  ))}
                  {chainChecked && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      Chain-checked
                    </Badge>
                  )}
                  <span className="ml-auto font-medium">
                    {ask ? (
                      <span className="text-emerald-400">
                        {formatPrice(ask)}
                        {ask.scope === "post" && (
                          <span
                            className="ml-1 text-[10px] font-normal text-muted-foreground"
                            title="Stated once for the whole post, not on this objekt's line"
                          >
                            post price
                          </span>
                        )}
                      </span>
                    ) : message.pricing.qyop ? (
                      <span className="text-muted-foreground">
                        QYOP — make an offer
                      </span>
                    ) : message.intent.intents.includes("wts") ? (
                      <span className="text-muted-foreground">
                        no price stated
                      </span>
                    ) : (
                      <span className="text-muted-foreground">trade only</span>
                    )}
                  </span>
                </div>
                {message.pricing.payment.length > 0 && (
                  <p className="text-muted-foreground">
                    Accepts {message.pricing.payment.join(", ")}
                  </p>
                )}
                {/* A remark that is only the price is already shown above. */}
                {message.remarks[entry.key]
                  ?.filter((r) => !/^\$?\d+(?:[.,]\d+)?\$?$/.test(r.trim()))
                  .map((r) => (
                    <p key={r} className="text-amber-400">
                      ⚑ {r}
                    </p>
                  ))}
              </div>
            );
          })}
        </section>

        <section className="space-y-2.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Looking for it
          </h3>
          {!demand || demand.wanters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody in this paste asked for it.
            </p>
          ) : (
            demand.wanters.map((message) => {
              const bid = bidPrice(message.pricing, entry.key);
              return (
                <div
                  key={message.key}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 p-3 text-sm"
                >
                  <CopyDiscordHandle name={message.author} />
                  {message.intent.intents.map((i) => (
                    <Badge key={i} variant="outline">
                      {INTENT_LABEL[i]}
                    </Badge>
                  ))}
                  <span className="ml-auto font-medium">
                    {bid ? (
                      <span className="text-primary">
                        pays {formatPrice(bid)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {message.intent.intents.includes("wtb")
                          ? "no price stated"
                          : "wants to trade"}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
