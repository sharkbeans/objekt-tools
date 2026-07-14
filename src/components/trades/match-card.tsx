"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  formatSeasonNumberLabel,
  formatShortLabel,
} from "@/lib/objekt-label";
import type { TradePostDTO, TradePostItem } from "@/lib/trade-types";

function ItemThumb({ item }: { item: TradePostItem }) {
  const fullLabel = formatShortLabel(item);
  const compactLabel = formatSeasonNumberLabel(item);

  return (
    <div className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5">
      <div className="h-[5.75rem] w-16 rounded overflow-hidden border border-border bg-muted">
        {item.thumbnailUrl && (
          // biome-ignore lint/performance/noImgElement: small trusted thumbnail from indexer, no next/image benefit
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <p
        className="w-full truncate text-center text-xs font-medium leading-tight text-foreground"
        title={fullLabel}
      >
        {compactLabel}
      </p>
    </div>
  );
}

function OverlapRow({
  label,
  items,
}: {
  label: string;
  items: TradePostItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] text-muted-foreground font-medium mb-1">
        {label}
      </p>
      <div className="flex gap-2.5 overflow-x-auto pb-0.5">
        {items.map((item) => (
          <ItemThumb key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function DiscordLinkButton({
  discordId,
  handle,
}: {
  discordId?: string | null;
  handle: string;
}) {
  const href = discordId
    ? `https://discord.com/users/${discordId}`
    : "https://discord.com/app";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#5865F2] px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#4752c4]"
      title={
        discordId
          ? `Open Discord profile: ${handle}`
          : `Open Discord: ${handle}`
      }
    >
      <DiscordIcon />
      {handle}
    </a>
  );
}

function DiscordIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 fill-current"
    >
      <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.77-.551 1.116a18.27 18.27 0 0 0-5.668 0A11.59 11.59 0 0 0 9.114 3a19.736 19.736 0 0 0-4.433 1.37C1.879 8.583 1.119 12.692 1.5 16.745a19.9 19.9 0 0 0 5.427 2.755c.439-.596.83-1.227 1.167-1.889-.643-.242-1.257-.54-1.837-.886.154-.114.304-.233.45-.355 3.542 1.665 7.381 1.665 10.882 0 .147.122.297.241.45.355-.58.346-1.195.644-1.839.887.338.661.729 1.292 1.168 1.888a19.863 19.863 0 0 0 5.43-2.755c.448-4.699-.765-8.77-3.181-12.376M8.02 14.315c-1.061 0-1.934-.974-1.934-2.17s.854-2.17 1.934-2.17c1.09 0 1.952.983 1.933 2.17 0 1.196-.853 2.17-1.933 2.17m7.96 0c-1.061 0-1.934-.974-1.934-2.17s.854-2.17 1.934-2.17c1.09 0 1.952.983 1.933 2.17 0 1.196-.844 2.17-1.933 2.17" />
    </svg>
  );
}

interface MatchCardProps {
  match: TradePostDTO;
  /** Optional extra content rendered below the card body (e.g. a "Send a Trade Offer" button). */
  children?: React.ReactNode;
  /** Override navigation, e.g. to validate availability before opening. */
  onOpenTrade?: (match: TradePostDTO) => void;
}

/**
 * Discovery-focused match card: leads with what actually overlaps between
 * the two lists/posts, plus a way to reach out. Unlike TradeCard (which
 * shows a partner's whole post), this only shows the items relevant to the
 * match — see findTradePostMatches' theyHaveIWant/iHaveTheyWant.
 */
export function MatchCard({ match, children, onOpenTrade }: MatchCardProps) {
  const router = useRouter();
  const displayName = match.cosmoNickname
    ? `@${match.cosmoNickname}`
    : match.user.name;
  const theyHaveIWant = match.theyHaveIWant ?? [];
  const iHaveTheyWant = match.iHaveTheyWant ?? [];
  const tradeHref = `/trades/${match.id}`;
  const openTrade = () => {
    if (onOpenTrade) {
      onOpenTrade(match);
      return;
    }
    router.push(tradeHref);
  };

  return (
    <div
      className="cursor-pointer space-y-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/20"
      onClick={openTrade}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTrade();
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {match.source === "list" && (
            <Badge
              variant="outline"
              className="mt-1 h-4 px-1.5 py-0 text-[10px]"
            >
              List
            </Badge>
          )}
        </div>

        {match.user.discordUsername ? (
          <div className="shrink-0">
            <DiscordLinkButton
              discordId={match.user.discordId}
              handle={match.user.discordUsername}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <OverlapRow label="HAVE" items={theyHaveIWant} />
        <OverlapRow label="WANT" items={iHaveTheyWant} />
      </div>

      {!match.user.discordUsername && (
        <div className="pt-0.5">
          <span className="text-[11px] text-muted-foreground">
            No Discord linked
          </span>
        </div>
      )}

      {children ? <div>{children}</div> : null}
    </div>
  );
}
