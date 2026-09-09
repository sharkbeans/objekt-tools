"use client";

import {
  BellOffIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { askingPrice, bidPrice, formatPrice } from "@/lib/discord/price";
import {
  type DeskMode,
  type DeskPost,
  deskLabel,
} from "@/lib/discord/trade-desk";
import type { VerificationState } from "@/lib/discord/verify";
import type { SeenKind } from "@/lib/match/seen-id";
import type { ParsedItem } from "@/lib/paste-parser";
import { ContactGallery } from "./contact-gallery";
import { CopyDiscordHandle } from "./post-dialog";

const PAGE_SIZE = 6;

/** Each result is a single post, with its own legs, price and contact. */
export function ContactResults({
  posts,
  mode,
  mine,
  give,
  get,
  onOpen,
  images,
  wanted,
  onCheck,
  verified,
  onMarkSeen,
  canMarkSeen,
}: {
  posts: DeskPost[];
  mode: DeskMode;
  mine: ReadonlyMap<string, ParsedItem>;
  give: ReadonlySet<string>;
  get: ReadonlySet<string>;
  onOpen: (key: string) => void;
  images: ReadonlyMap<string, string>;
  wanted: ReadonlySet<string>;
  onCheck: (post: DeskPost) => void;
  verified: ReadonlyMap<string, VerificationState>;
  /** Hide this post, or every post by its author, from the desk. */
  onMarkSeen: (messageKey: string, kind: SeenKind) => void;
  /** False until the ids have been hashed, which is a beat after a paste. */
  canMarkSeen: boolean;
}) {
  const [page, setPage] = useState(0);
  const [previous, setPrevious] = useState(posts);
  if (previous !== posts) {
    setPrevious(posts);
    setPage(0);
  }
  const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  return (
    <div className="space-y-3">
      {posts.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {mode === "wtb"
            ? "No seller in this paste lists all of these cards. Remove a selection or import more WTS posts."
            : mode === "wts"
              ? "No cash buyer in this paste matches these cards. Try WTT to find people who want a swap, or import more WTB posts."
              : "No single WTT post connects these selections. Remove a card or import more posts to find another offer."}
        </div>
      )}
      <div
        className={`grid gap-3 ${mode === "wts" ? "max-h-[560px] overflow-y-auto" : ""}`}
      >
        {posts
          .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
          .map((post) => {
            const theirWants = [...post.wants].filter(
              ([key]) => mine.has(key) && (give.size === 0 || give.has(key)),
            );
            const theirOffers = [...post.haves]
              .filter(([key]) => get.size === 0 || get.has(key))
              .sort(
                ([a], [b]) => Number(wanted.has(b)) - Number(wanted.has(a)),
              );
            const state = post.message.nickname
              ? verified.get(post.message.nickname)
              : undefined;
            return (
              <article
                key={post.message.key}
                className="overflow-hidden rounded-xl border bg-background"
                data-testid="trader-result"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
                  <div>
                    <p className="font-semibold">{post.message.author}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {mode === "wtb"
                        ? `${theirOffers.length} listed cards for sale`
                        : theirWants.length === 1
                          ? `Wants your ${deskLabel(theirWants[0][1])}`
                          : `${theirWants.length} of your cards on their want list`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {post.message.time?.raw ?? "Pasted post"}
                    {post.message.repeats > 1
                      ? ` · posted ${post.message.repeats}×`
                      : ""}
                  </span>
                </div>
                <div
                  className={`grid gap-6 p-4 sm:p-5 ${mode === "wtt" && theirOffers.length > 0 ? "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : ""}`}
                >
                  {mode !== "wtb" &&
                    (theirWants.length > 0 ? (
                      <ContactGallery
                        items={theirWants}
                        images={images}
                        title="Your cards they want"
                        onReview={() => onOpen(post.message.key)}
                        caption={
                          mode === "wts"
                            ? (key) => {
                                const bid = bidPrice(post.message.pricing, key);
                                return bid ? formatPrice(bid) : "Ask for bid";
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        None of your cards are on their want list.
                      </p>
                    ))}
                  {mode !== "wts" &&
                    (theirOffers.length > 0 ? (
                      <ContactGallery
                        items={theirOffers}
                        images={images}
                        wanted={wanted}
                        title={
                          mode === "wtb"
                            ? "Cards for sale"
                            : "Their cards you could get"
                        }
                        onReview={() => onOpen(post.message.key)}
                        caption={
                          mode === "wtb"
                            ? (key) => {
                                const ask = askingPrice(
                                  post.message.pricing,
                                  key,
                                );
                                return ask
                                  ? formatPrice(ask)
                                  : post.message.pricing.qyop
                                    ? "Make an offer"
                                    : "Ask for price";
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => onOpen(post.message.key)}
                      >
                        {post.message.listLinks.length
                          ? "View linked offers →"
                          : "Offers not listed · Review post →"}
                      </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5">
                  <Button size="sm" onClick={() => onOpen(post.message.key)}>
                    {mode === "wtb"
                      ? "Review prices & post"
                      : mode === "wts"
                        ? "Review buyer’s post"
                        : "Review trade"}
                  </Button>
                  <CopyDiscordHandle name={post.message.author} explicit />
                  {post.message.nickname && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={state?.status === "pending"}
                      onClick={() => onCheck(post)}
                    >
                      {state?.status === "pending"
                        ? "Checking…"
                        : state?.status === "verified"
                          ? "Inventory checked"
                          : "Check inventory"}
                    </Button>
                  )}
                  {canMarkSeen && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Hide this post from the desk"
                        onClick={() => onMarkSeen(post.message.key, "post")}
                      >
                        <CheckCheckIcon className="size-4" />
                        Handled
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={`Hide every post by ${post.message.author}`}
                        onClick={() => onMarkSeen(post.message.key, "author")}
                      >
                        <BellOffIcon className="size-4" />
                        Mute
                      </Button>
                    </div>
                  )}
                </div>
                {state?.status === "failed" && (
                  <p className="px-5 pb-3 text-xs text-amber-500">
                    {state.reason}
                  </p>
                )}
                {state?.status === "verified" && state.stale.length > 0 && (
                  <p className="px-5 pb-3 text-xs text-amber-500">
                    {state.stale.length} listed cards are no longer in their
                    inventory. Check the full post before contacting them.
                  </p>
                )}
              </article>
            );
          })}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            aria-label="Previous results"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {safePage + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="Next results"
            disabled={safePage + 1 === pages}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
