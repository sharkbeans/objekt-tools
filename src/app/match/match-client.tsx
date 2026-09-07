"use client";

import {
  CheckCircle2Icon,
  ClipboardPasteIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { fetchInventoryByNickname } from "@/lib/cosmo-inventory";
import {
  buildPile,
  indexOwned,
  matchTranscript,
  summarize,
} from "@/lib/discord/match";
import {
  mergeTranscripts,
  parseTranscript,
  type TranscriptMessage,
} from "@/lib/discord/transcript";
import { formatShortLabel } from "@/lib/objekt-label";

const STORAGE_KEY = "match:transcript:v1";
const NICK_KEY = "match:nickname:v1";
const PICKED_KEY = "match:picked:v1";

function tierBadge(tier: TranscriptMessage["tier"]) {
  if (tier === "verified")
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        Verified
      </Badge>
    );
  if (tier === "claimed") return <Badge variant="secondary">Claimed</Badge>;
  return <Badge variant="outline">No list</Badge>;
}

export function MatchClient() {
  const [raw, setRaw] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [nickname, setNickname] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Restore the session — pastes, nickname and picks all survive a reload
  // without an account. localStorage only; nothing leaves the browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
      const nick = localStorage.getItem(NICK_KEY);
      if (nick) setNickname(nick);
      const picks = localStorage.getItem(PICKED_KEY);
      if (picks) setPicked(new Set(JSON.parse(picks)));
    } catch {
      // Corrupt or unavailable storage — start clean rather than crash.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(PICKED_KEY, JSON.stringify([...picked]));
    } catch {}
  }, [picked]);

  const handleAddPaste = useCallback(() => {
    if (!raw.trim()) return;
    const incoming = parseTranscript(raw);
    if (incoming.length === 0) {
      toast.error(
        "No Discord messages found. Copy from the channel including the name/time lines.",
      );
      return;
    }
    setMessages((prev) => {
      const merged = mergeTranscripts(prev, incoming);
      const added = merged.length - prev.length;
      toast.success(
        added > 0
          ? `Added ${added} new post${added === 1 ? "" : "s"}`
          : "No new posts — all of those were already pasted",
      );
      return merged;
    });
    setRaw("");
  }, [raw]);

  const loadInventory = useCallback(async () => {
    const nick = nickname.trim();
    if (!nick) return;
    setLoadingInv(true);
    try {
      const entries = await fetchInventoryByNickname(nick);
      setOwned(entries);
      localStorage.setItem(NICK_KEY, nick);
      toast.success(`Loaded ${entries.length} objekts for @${nick}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoadingInv(false);
    }
  }, [nickname]);

  const ownedIndex = useMemo(() => indexOwned(owned), [owned]);
  const matched = useMemo(
    () => matchTranscript(messages, ownedIndex, picked),
    [messages, ownedIndex, picked],
  );
  const pile = useMemo(() => buildPile(messages), [messages]);
  const summary = useMemo(() => summarize(messages), [messages]);
  const wantYouHaveCount = matched.filter(
    (m) => m.theyWantYouHave.length > 0,
  ).length;

  const togglePick = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Match from a Discord paste</h1>
        <p className="text-sm text-muted-foreground">
          Copy trade posts out of a Discord channel and paste them here. You
          keep control of what gets read — objekt.my never touches Discord.
        </p>
      </header>

      {/* Input */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-2">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder={
              "Paste Discord messages here, including the name/time lines:\n\ntraderA — 3:41 PM\nHAVE\nSeoyeon cc112\n..."
            }
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleAddPaste} disabled={!raw.trim()}>
              <ClipboardPasteIcon className="mr-1.5 h-4 w-4" />
              Add paste
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMessages([]);
                  setPicked(new Set());
                }}
              >
                <Trash2Icon className="mr-1.5 h-4 w-4" />
                Clear {messages.length}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Discord only renders part of a channel at a time — paste in
              chunks, duplicates are dropped automatically.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Your Cosmo nickname</p>
          <p className="text-xs text-muted-foreground">
            Read from the chain. No sign-in, and nothing is stored.
          </p>
          <div className="flex gap-2">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadInventory()}
              placeholder="nickname"
            />
            <Button
              variant="outline"
              onClick={loadInventory}
              disabled={loadingInv || !nickname.trim()}
            >
              {loadingInv ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          {owned.length > 0 && (
            <p className="text-xs text-emerald-500">
              {owned.length} objekts loaded
            </p>
          )}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Paste some trade posts to get started.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.posters} posters
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-emerald-500">
              {summary.verified} verified
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.claimed} claimed
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.haveItems} haves · {summary.wantItems} wants
            </span>
            {owned.length > 0 && (
              <span className="rounded-full border border-emerald-600/50 bg-emerald-600/10 px-3 py-1.5 font-medium text-emerald-400">
                {wantYouHaveCount} traders want something you own
              </span>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Panel 1 — who wants what you own */}
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">Who wants what you own</h2>
                <p className="text-xs text-muted-foreground">
                  {owned.length === 0
                    ? "Load your nickname above to fill this in."
                    : "Ordered by mutual matches, then by overlap size."}
                </p>
              </div>

              {matched
                .filter((m) => m.theyWantYouHave.length > 0)
                .map(({ message, theyWantYouHave, isMutual }) => (
                  <div
                    key={message.key}
                    className={`rounded-lg border p-3 ${
                      isMutual
                        ? "border-emerald-600/60 bg-emerald-600/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {message.author}
                      </span>
                      {tierBadge(message.tier)}
                      {isMutual && (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          <CheckCircle2Icon className="mr-1 h-3 w-3" />
                          Mutual
                        </Badge>
                      )}
                      {message.nickname && (
                        <span className="text-xs text-muted-foreground">
                          @{message.nickname}
                        </span>
                      )}
                    </div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      They want, you have
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {theyWantYouHave.map((hit) => (
                        <span
                          key={`${message.key}-${hit.want.season}-${hit.want.collectionNo}`}
                          className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-xs"
                        >
                          {formatShortLabel({
                            member: hit.want.member,
                            season: hit.want.season,
                            collectionNo: hit.want.collectionNo,
                            collectionId: "",
                          })}
                          {hit.owned.length > 1 && (
                            <span className="ml-1 text-emerald-400">
                              ×{hit.owned.length}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}

              {owned.length > 0 && wantYouHaveCount === 0 && (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  Nobody in this paste wants anything you hold. Try pasting more
                  of the channel.
                </p>
              )}
            </section>

            {/* Panel 2 — the pile */}
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">
                  What they have{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({pile.length})
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pick what you want — no want list needed. Scarcest first.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {pile.map((entry) => {
                  const isPicked = picked.has(entry.key);
                  return (
                    <button
                      type="button"
                      key={entry.key}
                      onClick={() => togglePick(entry.key)}
                      title={`Offered by ${entry.offeredBy
                        .map((m) => m.author)
                        .join(", ")}`}
                      className={`rounded border px-2 py-1 text-xs transition-colors ${
                        isPicked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      {formatShortLabel({
                        member: entry.item.member,
                        season: entry.item.season,
                        collectionNo: entry.item.collectionNo,
                        collectionId: "",
                      })}
                      {entry.offeredBy.length > 1 && (
                        <span className="ml-1 opacity-60">
                          ×{entry.offeredBy.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
