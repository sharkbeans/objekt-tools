"use client";

import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";
import { DiscordIcon } from "@/components/discord-icon";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INTENT_LABEL } from "@/lib/discord/intent";
import { type MatchedPoster, objektKey } from "@/lib/discord/match";
import type { TranscriptMessage } from "@/lib/discord/transcript";
import type { VerificationState } from "@/lib/discord/verify";
import { formatShortLabel } from "@/lib/objekt-label";

/**
 * The poster's Discord display name, styled as the contact affordance.
 *
 * A pasted transcript carries the rendered display name and nothing else — no
 * user ID, no discriminator — so this cannot be a link or a DM action. It is
 * the string to search for in the channel, and it is labelled as such rather
 * than dressed up as something clickable that would dead-end.
 */
export function DiscordHandle({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      title="Discord display name, as it appeared in the paste — search for it in your channel"
      className={`inline-flex items-center gap-1.5 rounded-md bg-[#5865F2]/15 px-2 py-1 text-[#8b96f2] ${className}`}
    >
      <DiscordIcon className="size-3.5 shrink-0 text-[#5865F2]" />
      <span className="font-medium">{name}</span>
    </span>
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

interface PostDialogProps {
  match: MatchedPoster | null;
  verification: VerificationState | undefined;
  picked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onOpenChange: (open: boolean) => void;
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
  match,
  verification,
  picked,
  onToggle,
  onOpenChange,
}: PostDialogProps) {
  if (!match) return null;
  const { message, theyWantYouHave, theyHave } = match;

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

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <DiscordHandle name={message.author} />
          </DialogTitle>
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

        {theyWantYouHave.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              They want, you have
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {theyWantYouHave.map((hit) => (
                <span
                  key={hit.key}
                  className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-xs"
                >
                  {itemLabel(hit.want)}
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

        {offer.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Everything they have ({offer.length}) — click to pick
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {offer.map(({ key, item }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => onToggle(key)}
                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                    picked.has(key)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {itemLabel(item)}
                  {message.remarks[key] && (
                    <span className="ml-1 text-amber-400">⚑</span>
                  )}
                </button>
              ))}
            </div>
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
