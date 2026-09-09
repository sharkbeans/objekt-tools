"use client";

import {
  AlertTriangleIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/discord-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INTENT_LABEL } from "@/lib/discord/intent";
import { type MatchedPoster, objektKey } from "@/lib/discord/match";
import { askingPrice, bidPrice, formatPrice } from "@/lib/discord/price";
import type { DeskMode } from "@/lib/discord/trade-desk";
import type { TranscriptMessage } from "@/lib/discord/transcript";
import type { VerificationState } from "@/lib/discord/verify";
import {
  type ExternalListImport,
  type ExternalListLink,
  externalItemToParsed,
} from "@/lib/external-list";
import { formatShortLabel } from "@/lib/objekt-label";
import { useDeskArtwork } from "./desk-artwork";

const OFFER_PREVIEW_LIMIT = 30;
const LINKED_LIST_PREVIEW_LIMIT = 12;
const EMPTY_IMAGES = new Map<string, string>();

function discordHandleText(name: string) {
  return name.replace(/^@+/, "");
}

/**
 * A pasted transcript does not include a durable Discord profile URL. Copying
 * the displayed username is therefore the useful contact action: paste it into
 * Discord's member search or the channel search to find the trader.
 */
export function CopyDiscordHandle({
  name,
  className = "",
  explicit = false,
}: {
  name: string;
  className?: string;
  explicit?: boolean;
}) {
  const handle = discordHandleText(name);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handle);
      toast.success(`Copied ${handle} — paste it into Discord to find them.`);
    } catch {
      toast.error("Could not copy the Discord name.");
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
      aria-label={`Copy ${handle} to find this trader in Discord`}
      title="Copy this name to find the trader in Discord"
      className={`h-8 max-w-full bg-[#5865F2]/15 text-[#8b96f2] hover:bg-[#5865F2]/25 hover:text-[#aeb6ff] ${className}`}
    >
      <DiscordIcon className="size-3.5 shrink-0 text-[#5865F2]" />
      <span className="truncate font-medium">
        {explicit ? "Copy Discord name" : name}
      </span>
      <CopyIcon className="ml-0.5 shrink-0" />
    </Button>
  );
}

function itemLabel(item: {
  member: string | null;
  season: string;
  collectionNo: string;
}) {
  return formatShortLabel({
    member: item.member,
    season: item.season,
    collectionNo: item.collectionNo,
    collectionId: "",
  });
}

function tierBadge(tier: TranscriptMessage["tier"], chainChecked: boolean) {
  if (chainChecked)
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        <ShieldCheckIcon className="mr-1 h-3 w-3" />
        Chain-checked
      </Badge>
    );
  if (tier === "verified")
    return (
      <Badge variant="outline" title="Profile link posted — not checked yet">
        Linked
      </Badge>
    );
  if (tier === "claimed")
    return (
      <Badge variant="secondary" title="Self-reported — cannot be checked">
        Typed list
      </Badge>
    );
  return <Badge variant="outline">No list</Badge>;
}

function DialogObjektImage({
  url,
  label,
  size = "size-10",
}: {
  url?: string | null;
  label: string;
  size?: string;
}) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-sm bg-muted ${size}`}
      aria-hidden="true"
    >
      {url ? (
        <Image src={url} alt="" fill sizes="56px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[9px] leading-tight text-muted-foreground">
          {label}
        </span>
      )}
    </span>
  );
}

interface PostDialogProps {
  mode?: DeskMode;
  match: MatchedPoster | null;
  verification: VerificationState | undefined;
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  linkedImport:
    | {
        status: "loading";
        links: ExternalListLink[];
      }
    | {
        status: "loaded";
        links: ExternalListLink[];
        imports: ExternalListImport[];
        errors: { link: ExternalListLink; message: string }[];
      }
    | undefined;
  onOpenChange: (open: boolean) => void;
}

function linkedListTitle(source: ExternalListImport["source"]) {
  return source === "objekt.top" ? "objekt.top list" : "Apollo list";
}

function LinkedListImports({
  state,
  picked,
  onToggle,
}: {
  state: PostDialogProps["linkedImport"];
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  if (!state) return null;
  if (state.status === "loading") {
    return (
      <section className="flex items-center gap-2 rounded-md border border-primary/35 bg-primary/5 p-3 text-sm text-primary">
        <Loader2Icon className="size-4 animate-spin" />
        Importing {state.links.length} linked list
        {state.links.length === 1 ? "" : "s"}…
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border border-primary/35 bg-primary/5 p-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
          Linked list offers
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported as their offers. Click a card to add it to your wants.
        </p>
      </div>

      {state.imports.map((list) => {
        const preview = list.items.slice(0, LINKED_LIST_PREVIEW_LIMIT);
        const importedCount = list.items.length;
        const shownTotal = list.total ?? importedCount;
        return (
          <div key={list.url} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <a
                href={list.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                {linkedListTitle(list.source)}
                <ExternalLinkIcon className="size-3" />
              </a>
              <span className="text-muted-foreground">
                {list.partial
                  ? `${importedCount} of ${shownTotal} public cards imported`
                  : `${importedCount} card${importedCount === 1 ? "" : "s"} imported`}
              </span>
            </div>
            {list.partial && (
              <p className="text-xs text-amber-400">
                Apollo currently exposes this public preview; open the source
                list for the remaining cards.
              </p>
            )}
            {preview.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {preview.map((item) => {
                  const parsed = externalItemToParsed(item);
                  const key = objektKey(parsed);
                  const label = itemLabel(parsed);
                  return (
                    <button
                      type="button"
                      key={`${list.url}-${key ?? label}`}
                      onClick={() => key && onToggle(key)}
                      disabled={!key}
                      className={`group relative overflow-hidden rounded-md border text-left transition-colors ${
                        key && picked.has(key)
                          ? "border-primary ring-2 ring-primary"
                          : "border-border hover:border-primary/70"
                      }`}
                      title={key ? `${label} — add to your wants` : label}
                    >
                      {item.imageUrl ? (
                        <div className="relative aspect-photocard w-full bg-muted">
                          <Image
                            src={item.imageUrl}
                            alt={label}
                            fill
                            sizes="(min-width: 640px) 96px, 22vw"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-photocard items-center justify-center bg-muted p-1 text-center text-[10px] text-muted-foreground">
                          {label}
                        </div>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-1 pt-4 font-medium text-[10px] text-white leading-tight">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This public list has no readable objekt entries.
              </p>
            )}
            {importedCount > preview.length && (
              <p className="text-xs text-muted-foreground">
                +{importedCount - preview.length} more are now in “What they
                have” on this page.
              </p>
            )}
          </div>
        );
      })}

      {state.errors.map(({ link, message }) => (
        <p key={link.url} className="text-xs text-amber-400">
          Couldn’t import {link.source}: {message}
        </p>
      ))}
    </section>
  );
}

/**
 * The whole trade post, opened from its card.
 *
 * The card can only show a slice of a long list, and a trade decision needs the
 * rest: every objekt they offer, the qualifiers attached to them, and the
 * post's own prose. Putting that in a modal keeps the two-column scan readable
 * while leaving the full post one click away.
 */
export function PostDialog({
  mode = "wtt",
  match,
  verification,
  picked,
  onToggle,
  linkedImport,
  onOpenChange,
}: PostDialogProps) {
  const [expandedOfferFor, setExpandedOfferFor] = useState<string | null>(null);

  const artworkCards = useMemo(() => {
    if (!match) return [];
    const items = [
      ...match.theyHave,
      ...match.theyHaveYouWant,
      ...match.theyWantYouHave.map((hit) => hit.want),
    ];
    const seen = new Set<string>();
    return items.flatMap((item) => {
      const key = objektKey(item);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ key, item }];
    });
  }, [match]);
  const resolvedImages = useDeskArtwork(artworkCards, EMPTY_IMAGES);

  if (!match) return null;
  const { message, theyHaveYouWant, theyWantYouHave, theyHave } = match;
  const showAllOffers = expandedOfferFor === message.key;

  // Deduped and keyed: a trader who listed the same objekt twice gets one chip.
  const offer = [
    ...new Map(
      theyHave.flatMap((item) => {
        const key = objektKey(item);
        return key ? ([[key, { key, item }]] as const) : [];
      }),
    ).values(),
  ];

  // Only conditions on objekts this poster actually lists. A qualifier can
  // name an objekt in passing ("Lynn c201 (for c206)"), and c206 is the price
  // of the trade, not something on offer — listing it would invent stock.
  const labelByKey = new Map(
    offer.map(({ key, item }) => [key, itemLabel(item)]),
  );
  const remarkEntries = Object.entries(message.remarks).filter(([key]) =>
    labelByKey.has(key),
  );
  const visibleOffer = showAllOffers
    ? offer
    : offer.slice(0, OFFER_PREVIEW_LIMIT);
  const importedImageByKey = new Map<string, string>();
  if (linkedImport?.status === "loaded") {
    for (const list of linkedImport.imports) {
      for (const item of list.items) {
        const key = objektKey(externalItemToParsed(item));
        if (key && item.imageUrl && !importedImageByKey.has(key)) {
          importedImageByKey.set(key, item.imageUrl);
        }
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="gap-3">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
            <CopyDiscordHandle name={message.author} />
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Copy the name, then paste it into Discord member or channel search
            to contact this trader.
          </p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          {tierBadge(message.tier, verification?.status === "verified")}
          {message.intent.intents.map((i) => (
            <Badge key={i} variant="outline">
              {INTENT_LABEL[i]}
            </Badge>
          ))}
          {message.nickname && (
            <span className="text-xs text-muted-foreground">
              @{message.nickname} on {message.nicknameSource}
            </span>
          )}
        </div>

        {verification?.status === "verified" && (
          <div className="space-y-1 rounded border border-emerald-600/30 bg-emerald-600/5 p-2">
            <p className="text-xs text-emerald-400">
              <ShieldCheckIcon className="mr-1 inline h-3 w-3" />
              Holds {verification.inventory.length} tradable objekts on-chain
            </p>
            {verification.stale.length > 0 && (
              <p className="text-xs text-amber-400">
                <AlertTriangleIcon className="mr-1 inline h-3 w-3" />
                {verification.stale.length} listed objekt
                {verification.stale.length === 1 ? "" : "s"} no longer in their
                inventory
              </p>
            )}
          </div>
        )}
        {verification && verification.status !== "verified" && (
          <p
            className={`text-xs ${
              verification.status === "rate-limited"
                ? "text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {verification.status === "rate-limited"
              ? "Not chain-checked — Cosmo lookup limit reached."
              : verification.status === "failed"
                ? `Could not chain-check: ${verification.reason}`
                : "Not chain-checked yet."}
          </p>
        )}

        <LinkedListImports
          state={linkedImport}
          picked={picked}
          onToggle={onToggle}
        />

        {mode !== "wtb" && theyWantYouHave.length > 0 && (
          <section className="space-y-2 rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              They want
            </h3>
            <p className="text-sm text-muted-foreground">
              {mode === "wts"
                ? "They are looking to buy these from you."
                : "They are looking for these from you."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {theyWantYouHave.map((hit) => (
                <span
                  key={hit.key}
                  className="inline-flex items-center gap-2 rounded border border-emerald-600/40 bg-background/40 py-1.5 pr-2.5 pl-1 text-sm"
                >
                  <DialogObjektImage
                    url={resolvedImages.get(hit.key)}
                    label={itemLabel(hit.want)}
                    size="size-9"
                  />
                  {itemLabel(hit.want)}
                  {mode === "wts" && (
                    <span className="ml-2 font-medium">
                      {(() => {
                        const bid = bidPrice(message.pricing, hit.key);
                        return bid ? formatPrice(bid) : "Ask for bid";
                      })()}
                    </span>
                  )}
                  {hit.owned.length > 1 && (
                    <span className="ml-1 text-emerald-400">
                      ×{hit.owned.length}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        {mode !== "wts" && theyHaveYouWant.length > 0 && (
          <section className="space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
              They have
            </h3>
            <p className="text-sm text-muted-foreground">
              They are offering these to you.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {theyHaveYouWant.map((item) => {
                const key = objektKey(item);
                const imageUrl = key
                  ? (importedImageByKey.get(key) ?? resolvedImages.get(key))
                  : null;
                return (
                  <span
                    key={
                      key ??
                      `${item.member}-${item.season}-${item.collectionNo}`
                    }
                    className="inline-flex items-center gap-2 rounded border border-primary/40 bg-background/40 py-1 pr-2.5 pl-1 text-sm"
                  >
                    <DialogObjektImage
                      url={imageUrl}
                      label={itemLabel(item)}
                      size="size-9"
                    />
                    {itemLabel(item)}
                    {mode === "wtb" && (
                      <span className="ml-2 font-medium">
                        {(() => {
                          const ask = key
                            ? askingPrice(message.pricing, key)
                            : null;
                          return ask ? formatPrice(ask) : "Ask for price";
                        })()}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {mode !== "wts" && offer.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Their listed cards ({offer.length}) — click to select
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {visibleOffer.map(({ key, item }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => onToggle(key)}
                  className={`inline-flex items-center gap-2 rounded border py-1.5 pr-2.5 pl-1 text-sm transition-colors ${
                    picked.has(key)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <DialogObjektImage
                    url={importedImageByKey.get(key) ?? resolvedImages.get(key)}
                    label={itemLabel(item)}
                    size="size-9"
                  />
                  {itemLabel(item)}
                  {mode === "wtb" && (
                    <span className="ml-2 text-primary">
                      {(() => {
                        const ask = askingPrice(message.pricing, key);
                        return ask ? formatPrice(ask) : "Ask for price";
                      })()}
                    </span>
                  )}
                  {message.remarks[key] && (
                    <span className="ml-1 text-amber-400">⚑</span>
                  )}
                </button>
              ))}
            </div>
            {offer.length > OFFER_PREVIEW_LIMIT && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setExpandedOfferFor((current) =>
                    current === message.key ? null : message.key,
                  )
                }
              >
                {showAllOffers
                  ? "Show fewer"
                  : `Show all ${offer.length.toLocaleString()} cards`}
              </Button>
            )}
          </section>
        )}

        {remarkEntries.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Conditions on specific objekts
            </h3>
            <ul className="space-y-0.5 text-xs">
              {remarkEntries.map(([key, texts]) => (
                <li key={key} className="text-amber-400">
                  ⚑ <span className="font-medium">{labelByKey.get(key)}</span> —{" "}
                  {texts.join("; ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        {message.notes && (
          <section className="space-y-1">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Notes from their post
            </h3>
            <p className="whitespace-pre-line text-xs text-muted-foreground">
              {message.notes}
            </p>
          </section>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Original post
          </summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
            {message.body}
          </pre>
        </details>
      </DialogContent>
    </Dialog>
  );
}
