"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { askingPrice, bidPrice, formatPrice } from "@/lib/discord/price";
import {
  type DeskMode,
  type DeskPost,
  deskLabel,
} from "@/lib/discord/trade-desk";
import type { VerificationState } from "@/lib/discord/verify";
import type { ParsedItem } from "@/lib/paste-parser";
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
  onChoose,
  onCheck,
  verified,
}: {
  posts: DeskPost[];
  mode: DeskMode;
  mine: ReadonlyMap<string, ParsedItem>;
  give: ReadonlySet<string>;
  get: ReadonlySet<string>;
  onOpen: (key: string) => void;
  onChoose: (give: string[], get: string[]) => void;
  onCheck: (post: DeskPost) => void;
  verified: ReadonlyMap<string, VerificationState>;
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
          {mode === "buy"
            ? "No seller in this paste lists all of these cards. Remove a selection or import more sale posts."
            : mode === "sell"
              ? "No cash buyer in this paste matches these cards. Try Trade to find people who want a swap, or import more WTB posts."
              : "No single trade post connects these selections. Remove a card or import more posts to find another offer."}
        </div>
      )}
      <div
        className={`grid gap-3 ${mode === "sell" ? "max-h-[560px] overflow-y-auto" : "lg:grid-cols-2"}`}
      >
        {posts
          .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
          .map((post) => {
            const theirWants = [...post.wants].filter(
              ([key]) => mine.has(key) && (give.size === 0 || give.has(key)),
            );
            const theirOffers = [...post.haves].filter(
              ([key]) => get.size === 0 || get.has(key),
            );
            const state = post.message.nickname
              ? verified.get(post.message.nickname)
              : undefined;
            return (
              <article
                key={post.message.key}
                className="space-y-3 rounded-xl border bg-background p-4"
                data-testid="trader-result"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CopyDiscordHandle name={post.message.author} />
                  <span className="text-xs text-muted-foreground">
                    {post.message.time?.raw ?? "Pasted post"}
                    {post.message.repeats > 1
                      ? ` · posted ${post.message.repeats}×`
                      : ""}
                  </span>
                </div>
                {mode !== "buy" && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-500">
                      {mode === "sell"
                        ? "They want to buy"
                        : give.size
                          ? "You give"
                          : "You could give"}
                    </p>
                    {theirWants.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        None of your cards are on their want list.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {theirWants.slice(0, 6).map(([key, item]) => {
                          const bid =
                            mode === "sell"
                              ? bidPrice(post.message.pricing, key)
                              : null;
                          return (
                            <span
                              key={key}
                              className="rounded-md bg-emerald-500/10 px-2 py-1 text-sm"
                            >
                              {deskLabel(item)}
                              {mode === "sell" && (
                                <span className="ml-1.5 font-medium text-emerald-500">
                                  {bid ? formatPrice(bid) : "Ask for bid"}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        {theirWants.length > 6 && (
                          <span className="self-center text-xs text-muted-foreground">
                            +{theirWants.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {mode !== "sell" && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                      {mode === "buy"
                        ? "You buy"
                        : get.size
                          ? "You get"
                          : "You could get"}
                    </p>
                    {theirOffers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Open their linked list to see the cards they offer.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {theirOffers.slice(0, 6).map(([key, item]) => {
                          const ask =
                            mode === "buy"
                              ? askingPrice(post.message.pricing, key)
                              : null;
                          return (
                            <span
                              key={key}
                              className="rounded-md bg-primary/10 px-2 py-1 text-sm"
                            >
                              {deskLabel(item)}
                              {mode === "buy" && (
                                <span className="ml-1.5 font-medium text-primary">
                                  {ask
                                    ? formatPrice(ask)
                                    : post.message.pricing.qyop
                                      ? "Make an offer"
                                      : "Ask for price"}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        {theirOffers.length > 6 && (
                          <span className="self-center text-xs text-muted-foreground">
                            +{theirOffers.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(post.message.pricing.payment.length > 0 ||
                  post.message.notes) && (
                  <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                    {post.message.pricing.payment.length > 0
                      ? `Payment: ${post.message.pricing.payment.join(", ")}. `
                      : ""}
                    {post.message.notes}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(post.message.key)}
                  >
                    {mode === "buy" ? "Price & post details" : "View full post"}
                  </Button>
                  {mode === "trade" &&
                    theirWants.length > 0 &&
                    theirOffers.length > 0 &&
                    (give.size === 0 || get.size === 0) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onChoose(
                            give.size ? [...give] : [theirWants[0][0]],
                            get.size ? [...get] : [theirOffers[0][0]],
                          )
                        }
                      >
                        Compare this pair
                      </Button>
                    )}
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
                </div>
                {state?.status === "failed" && (
                  <p className="text-xs text-amber-500">{state.reason}</p>
                )}
                {state?.status === "verified" && state.stale.length > 0 && (
                  <p className="text-xs text-amber-500">
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
