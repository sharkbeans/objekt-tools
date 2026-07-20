"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DiscordNudge } from "@/components/discord-nudge";
import {
  type ObjektImageItem,
  ObjektImages,
  useObjektImages,
} from "@/components/objekt/objekt-images";
import { PerRowDropdown } from "@/components/objekt/per-row-dropdown";
import { SignInDialog } from "@/components/sign-in-dialog";
import { InitiateDirectDialog } from "@/components/trades/initiate-direct-dialog";
import { InitiateTradeDialog } from "@/components/trades/initiate-trade-dialog";
import { MatchCard } from "@/components/trades/match-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCosmoLink } from "@/hooks/use-cosmo-link";
import { usePerRow } from "@/hooks/use-per-row";
import { useSession } from "@/lib/auth-client";
import { compareMembers, compareSeasons } from "@/lib/filter-options";
import { anyWantLabel } from "@/lib/objekt-label";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";
import { sectionAbsoluteUrl, sectionHref } from "@/lib/sections";
import type { TradePostDTO } from "@/lib/trade-types";

type TradeItem = ObjektImageItem;
type TradeDetailDTO = TradePostDTO & {
  discordId?: string | null;
  discordUsername?: string | null;
};

function collectionSortValue(item: TradeItem) {
  const no = item.collectionNo
    ? Number.parseInt(stripVariantSuffix(item.collectionNo), 10)
    : Number.POSITIVE_INFINITY;
  return Number.isFinite(no) ? no : Number.POSITIVE_INFINITY;
}

function compareTradeItems(a: TradeItem, b: TradeItem) {
  const seasonCompare = compareSeasons(a.season ?? "", b.season ?? "");
  if (seasonCompare !== 0) return seasonCompare;
  const noCompare = collectionSortValue(a) - collectionSortValue(b);
  if (noCompare !== 0) return noCompare;
  return (a.collectionId ?? "").localeCompare(b.collectionId ?? "");
}

function objektCode(item: TradeItem) {
  if (item.collectionNo) {
    const prefix = getSeasonPrefix(item.season);
    return `${prefix}${stripVariantSuffix(item.collectionNo)}`;
  }
  return item.collectionId || "Unknown";
}

function countTokens(items: TradeItem[]) {
  const counts = new Map<string, number>();
  for (const item of [...items].sort(compareTradeItems)) {
    const code = objektCode(item);
    counts.set(code, (counts.get(code) ?? 0) + (item.quantity ?? 1));
  }
  return [...counts.entries()].map(([code, count]) =>
    count > 1 ? `${code} x${count}` : code,
  );
}

function formatDiscordSection(items: TradeItem[]) {
  const groups = new Map<string, TradeItem[]>();
  const anyCounts = new Map<string, number>();

  for (const item of items) {
    if (item.isAny) {
      const label = anyWantLabel(item);
      anyCounts.set(label, (anyCounts.get(label) ?? 0) + (item.quantity ?? 1));
      continue;
    }
    const member = item.member?.trim() || "Unknown";
    groups.set(member, [...(groups.get(member) ?? []), item]);
  }

  const lines = [...groups.entries()]
    .sort(([a], [b]) => compareMembers(a, b))
    .map(
      ([member, groupItems]) =>
        `${member} ${countTokens(groupItems).join(" ")}`,
    );

  for (const [label, count] of [...anyCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(count > 1 ? `${label} x${count}` : label);
  }

  return lines.length ? lines : ["None"];
}

function formatDiscordTradeText(
  trade: Pick<TradeDetailDTO, "haves" | "wants" | "description">,
  tradeUrl?: string,
) {
  const lines = [
    "Have",
    ...formatDiscordSection(trade.haves),
    "",
    "Want",
    ...formatDiscordSection(trade.wants),
  ];

  const notes = trade.description?.trim();
  if (notes) lines.push("", notes);
  if (tradeUrl) lines.push("", `Trade: ${tradeUrl}`);

  return lines.join("\n");
}

export default function TradeDetailClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const { isLinked } = useCosmoLink();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [initiateTarget, setInitiateTarget] = useState<{
    matchedTradePostId: string;
    theirHaves: TradeItem[];
  } | null>(null);
  // For non-owners: direct initiation (no own trade post required)
  const [directInitiateOpen, setDirectInitiateOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<"close" | "delete" | null>(
    null,
  );

  const { data: trade, isLoading: tradeLoading } = useQuery({
    queryKey: ["trade", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}`);
      if (!res.ok) throw new Error("Trade not found");
      return res.json() as Promise<TradeDetailDTO>;
    },
  });

  const { data: matchData, isLoading: matchesLoading } = useQuery({
    queryKey: ["trade-matches", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}/matches`);
      return res.json();
    },
    enabled: !!trade,
  });

  const haveImages = useObjektImages(trade?.haves ?? []);
  const wantImages = useObjektImages(trade?.wants ?? []);
  const { perRow, setPerRow, gridStyle } = usePerRow();

  const isOwnerEarly = session?.user?.id === trade?.user?.id;
  const tradeLinkHref = sectionHref("/link", { currentSection: "trade" });

  function handleBlockedTradeOffer() {
    toast.error("Link your Cosmo account to send trades", {
      action: {
        label: "Link now",
        onClick: () => router.push(tradeLinkHref),
      },
    });
  }

  function renderTradeOfferButton({
    onSend,
    variant,
    className,
  }: {
    onSend: () => void;
    variant?: React.ComponentProps<typeof Button>["variant"];
    className?: string;
  }) {
    const requiresLink = !!session && !isLinked;
    const button = (
      <Button
        size="sm"
        variant={variant}
        aria-disabled={requiresLink}
        className={
          requiresLink
            ? `${className ?? ""} cursor-not-allowed opacity-50`.trim()
            : className
        }
        onClick={() => {
          if (!session) {
            setSignInOpen(true);
            return;
          }
          if (requiresLink) {
            handleBlockedTradeOffer();
            return;
          }
          onSend();
        }}
      >
        Send a Trade Offer
      </Button>
    );

    if (!requiresLink) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>Link your Cosmo account to send trades.</TooltipContent>
      </Tooltip>
    );
  }

  async function handleClose() {
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) throw new Error("Failed to close trade");
      toast.success("Trade closed");
      router.refresh();
    } catch {
      toast.error("Failed to close trade");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete trade");
      toast.success("Trade deleted");
      router.push(sectionHref("/trades", { currentSection: "trade" }));
    } catch {
      toast.error("Failed to delete trade");
    }
  }

  const { data: availabilityData } = useQuery({
    queryKey: ["trade-availability", id],
    queryFn: async () => {
      const res = await fetch(`/api/trades/${id}/check-availability`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to check availability");
      return res.json();
    },
    enabled: !!trade && trade.status === "open",
    staleTime: Number.POSITIVE_INFINITY, // only run once per page load
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!availabilityData) return;
    if (availabilityData.deleted) {
      toast.error(
        "This trade was removed because the offered objekts are no longer in the trader's inventory.",
      );
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["check-availability"] });
      router.push(sectionHref("/trades", { currentSection: "trade" }));
    } else if (availabilityData.removed > 0) {
      toast.warning(
        `${availabilityData.removed} objekt(s) removed — no longer in trader's inventory.`,
      );
      queryClient.invalidateQueries({ queryKey: ["trade", id] });
      queryClient.invalidateQueries({ queryKey: ["trade-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["my-trades"] });
      queryClient.invalidateQueries({ queryKey: ["check-availability"] });
    }
  }, [availabilityData, id, queryClient, router]);

  const discordPreviewText = useMemo(
    () => (trade ? formatDiscordTradeText(trade) : ""),
    [trade],
  );
  const discordCopyText = useMemo(
    () =>
      trade
        ? formatDiscordTradeText(
            trade,
            sectionAbsoluteUrl(`/trades/${trade.id}`),
          )
        : "",
    [trade],
  );
  const [copiedDiscordText, setCopiedDiscordText] = useState(false);

  async function handleCopyDiscordText() {
    try {
      await navigator.clipboard.writeText(discordCopyText);
      setCopiedDiscordText(true);
      toast.success("Copied trade text");
      window.setTimeout(() => setCopiedDiscordText(false), 1500);
    } catch {
      toast.error("Failed to copy trade text");
    }
  }

  if (tradeLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading trade...
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Trade not found
      </div>
    );
  }

  const isOwner = isOwnerEarly;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Trade details */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                Trade #{trade.id}
                <Badge
                  variant={trade.status === "open" ? "default" : "secondary"}
                >
                  {trade.status}
                </Badge>
                {trade.wantsOnly && (
                  <Badge variant="outline" className="text-xs">
                    Wants only
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                by {trade.user.name}
                {trade.cosmoNickname && (
                  <span className="ml-1">(@{trade.cosmoNickname})</span>
                )}
                {" · "}
                {new Date(trade.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {!isOwner && trade.discordId && (
                <a
                  href={`https://discord.com/users/${trade.discordId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4752C4]"
                >
                  <svg
                    className="h-4 w-4 fill-current"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Contact @{trade.discordUsername ?? trade.user.name}
                </a>
              )}
              {isOwner && trade.status === "open" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDialog("close")}
                  >
                    Close Trade
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDialog("delete")}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        {trade.haves?.length > 0 && trade.wants?.length > 0 && (
          <>
            <div className="px-6 pb-2 flex justify-end">
              <PerRowDropdown value={perRow} onChange={setPerRow} />
            </div>
            <div className="px-6 pb-4 flex gap-6">
              <ObjektImages
                items={trade.haves}
                images={haveImages}
                label="HAVE"
                showSerial
                cosmoNickname={trade.cosmoNickname}
                gridStyle={gridStyle}
              />
              <Separator orientation="vertical" className="h-auto" />
              <ObjektImages
                items={trade.wants}
                images={wantImages}
                label="WANT"
                isWant
                gridStyle={gridStyle}
              />
            </div>
          </>
        )}
        <CardContent>
          <div className="rounded-md border border-border bg-muted/30">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Trade text
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyDiscordText}
                className="h-8 gap-2 bg-background/70"
              >
                {copiedDiscordText ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
                {copiedDiscordText ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm leading-6 text-foreground">
              {discordPreviewText}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Non-owner: Send a Trade Offer directly against this post (no own trade post required) */}
      {!isOwner && trade.status === "open" && (
        <TooltipProvider>
          <Card>
            <CardContent className="py-4 space-y-3">
              {trade.wantsOnly && session && (
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-200">
                  This trader only accepts offers that include at least one
                  objekt from their want list. Your offer will be rejected if
                  none of your objekts match.
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Interested? Initiate a trade with this poster.
                </p>
                {renderTradeOfferButton({
                  onSend: () => setDirectInitiateOpen(true),
                })}
              </div>
              {session && <DiscordNudge />}
            </CardContent>
          </Card>
        </TooltipProvider>
      )}

      {/* Matches */}
      {isOwner && trade.status === "open" && (
        <div>
          <h2 className="text-xl font-bold mb-4">
            Matching Trades
            {matchData?.matches && (
              <span className="text-muted-foreground font-normal text-base ml-2">
                ({matchData.matches.length} found)
              </span>
            )}
          </h2>

          {matchesLoading ? (
            <p className="text-muted-foreground">Finding matches...</p>
          ) : matchData?.matches?.length > 0 ? (
            <TooltipProvider>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {matchData.matches.map((match: TradePostDTO) => (
                  <MatchCard key={match.id} match={match}>
                    {renderTradeOfferButton({
                      variant: "outline",
                      className: "w-full mt-1",
                      onSend: () =>
                        setInitiateTarget({
                          matchedTradePostId: match.id,
                          theirHaves: match.haves,
                        }),
                    })}
                  </MatchCard>
                ))}
              </div>
            </TooltipProvider>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No matching trades found yet. Check back later!
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Close trade confirmation */}
      <AlertDialog
        open={confirmDialog === "close"}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This trade will no longer be visible to others or accept new
              offers. You can&apos;t reopen it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDialog(null);
                handleClose();
              }}
            >
              Close trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete trade confirmation */}
      <AlertDialog
        open={confirmDialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the trade post. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDialog(null);
                handleDelete();
              }}
            >
              Delete trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Owner-side: initiate dialog (owner picking from their matches) */}
      {initiateTarget && (
        <InitiateTradeDialog
          open={!!initiateTarget}
          onOpenChange={(open) => {
            if (!open) setInitiateTarget(null);
          }}
          myTradePostId={id}
          myHaves={trade?.haves ?? []}
          matchedTradePostId={initiateTarget.matchedTradePostId}
          theirHaves={initiateTarget.theirHaves}
        />
      )}

      {/* Non-owner: direct initiate dialog (no own trade post needed) */}
      {directInitiateOpen && (
        <InitiateDirectDialog
          open={directInitiateOpen}
          onOpenChange={setDirectInitiateOpen}
          tradePostId={id}
          theirHaves={trade?.haves ?? []}
          theirWants={trade?.wants ?? []}
        />
      )}

      {/* Unauthenticated: prompt sign-in */}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
