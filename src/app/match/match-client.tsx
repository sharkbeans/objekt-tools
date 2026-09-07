"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardPasteIcon,
  Loader2Icon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { fetchInventoryByNickname } from "@/lib/cosmo-inventory";
import { INTENT_LABEL, type TradeIntent } from "@/lib/discord/intent";
import {
  buildPile,
  indexOwned,
  matchTranscript,
  objektKey,
  parseOffering,
  summarize,
} from "@/lib/discord/match";
import { askingPrice, bidPrice, formatPrice } from "@/lib/discord/price";
import {
  buildDemandIndex,
  buildSupplyIndex,
  type DemandEntry,
  type SupplyEntry,
  searchDemand,
  searchSupply,
} from "@/lib/discord/supply";
import {
  analyzeTranscript,
  mergeTranscripts,
  type TranscriptMessage,
} from "@/lib/discord/transcript";
import {
  buildVerification,
  suppliesPicked,
  type VerificationState,
  verifySequentially,
} from "@/lib/discord/verify";
import {
  encodeGridTradeStash,
  GRID_TRADE_HASH_PARAM,
} from "@/lib/grid-trade-stash";
import { formatShortLabel } from "@/lib/objekt-label";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { sectionHref } from "@/lib/sections";
import { PileGrid } from "./pile-grid";
import { matchesPileQuery, PileSearch, parsePileQuery } from "./pile-search";
import { DiscordHandle, PostDialog } from "./post-dialog";

const STORAGE_KEY = "match:transcript:v1";
const NICK_KEY = "match:nickname:v1";
const PICKED_KEY = "match:picked:v1";
const OFFERING_KEY = "match:offering:v1";

// Shown from the empty state so a first-time visitor can see what a result
// looks like before going to fetch a real paste.
const SAMPLE_PASTE = `haerin.exe — 3:44 PM
Have
SeoYeon CC101 CC112
Mayu CC103 CC104

Want
JiYeon CC102
Xinyu CC101 CC102
bunny — Yesterday at 11:20 PM
WTS ALL
Mostly Lynn

Lynn C319 C323 D301
JiWoo D325

https://apollo.cafe/@bunnyobjekt?transferable=true
yeonji_stan — 3:52 PM
HAVE
SeoYeon CC101
ChaeYeon CC104

WANT
JiYeon CC102
Nien CC301`;

type PileSortId = "scarcest" | "cheapest" | "priciest" | "member";

const PILE_SORTS: { id: PileSortId; label: string }[] = [
  { id: "scarcest", label: "Scarcest" },
  { id: "cheapest", label: "Cheapest" },
  { id: "priciest", label: "Priciest" },
  { id: "member", label: "Member" },
];

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

/**
 * "Verified" is reserved for a claim actually checked against the chain.
 * A profile link only means the poster *can* be checked, which is a different
 * and much weaker statement — spending the stronger word on it gives away the
 * one thing this tool has that an indexer does not.
 */
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

export function MatchClient() {
  const [raw, setRaw] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [nickname, setNickname] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [offering, setOffering] = useState("");
  const [loadingInv, setLoadingInv] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Verification results keyed by Cosmo nickname, so two posters sharing a
  // link are only fetched once.
  const [verified, setVerified] = useState<Map<string, VerificationState>>(
    new Map(),
  );
  const [verifying, setVerifying] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [pileFilter, setPileFilter] = useState("");
  const [pileSort, setPileSort] = useState<PileSortId>("scarcest");
  const [intentFilter, setIntentFilter] = useState<TradeIntent | "all">("all");
  const [building, setBuilding] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  /**
   * Drop every pasted post and everything derived from it.
   *
   * Picks, chain-check results and the filters all describe posts that are
   * about to stop existing, so they go too — leaving them behind means a stale
   * filter silently hiding the next paste. What the viewer typed about
   * *themselves* (spares, nickname) is not a paste and survives, so they can
   * clear a channel and start on another without re-entering their own side.
   */
  const clearAllPastes = useCallback(() => {
    setMessages([]);
    setPicked(new Set());
    setVerified(new Map());
    setIntentFilter("all");
    setPileFilter("");
    setPileSort("scarcest");
    setLookupQuery("");
    setOpenPost(null);
    setConfirmClear(false);
    toast.success("Cleared every pasted post");
  }, []);

  // Restore the session — pastes, spares and picks all survive a reload
  // without an account. localStorage only; nothing leaves the browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
      const nick = localStorage.getItem(NICK_KEY);
      if (nick) setNickname(nick);
      const picks = localStorage.getItem(PICKED_KEY);
      if (picks) setPicked(new Set(JSON.parse(picks)));
      const spares = localStorage.getItem(OFFERING_KEY);
      if (spares) setOffering(spares);
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

  useEffect(() => {
    try {
      localStorage.setItem(OFFERING_KEY, offering);
    } catch {}
  }, [offering]);

  const addPaste = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const {
        messages: incoming,
        orphanLines,
        headerless,
      } = analyzeTranscript(text);

      if (incoming.length === 0) {
        toast.error(
          headerless
            ? "Couldn't read a trade list out of that. Paste the message text itself, or include the name/time line above each post."
            : 'No trade posts found. Include the name/time line above each message (e.g. "trader — 3:41 PM").',
        );
        return;
      }

      // Toasts stay out of the state updater: React invokes updaters twice in
      // development, which fired every one of these messages twice.
      const merged = mergeTranscripts(messages, incoming);
      const added = merged.length - messages.length;
      setMessages(merged);
      setRaw("");

      if (added > 0) {
        toast.success(`Added ${added} new post${added === 1 ? "" : "s"}`);
      } else {
        toast.info("No new posts — all of those were already pasted");
      }
      if (headerless) {
        toast.info("No name/time lines found — read as one trader's list.");
      }
      if (orphanLines > 0) {
        toast.warning(
          `Ignored ${orphanLines} line${orphanLines === 1 ? "" : "s"} above the first post — start your selection at a name/time line.`,
        );
      }
    },
    [messages],
  );

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

  const linkedNicknames = useMemo(
    () => [
      ...new Set(messages.flatMap((m) => (m.nickname ? [m.nickname] : []))),
    ],
    [messages],
  );

  const handleVerifyAll = useCallback(async () => {
    const pending = linkedNicknames.filter(
      (n) => verified.get(n)?.status !== "verified",
    );
    if (pending.length === 0) return;
    setVerifying(true);

    // Claims are indexed per nickname so each fetch can be checked against
    // whatever that trader typed.
    const claimsByNickname = new Map(
      messages
        .filter((m) => m.nickname)
        .map((m) => [m.nickname as string, m.haves]),
    );

    const { completed, rateLimited } = await verifySequentially(
      pending,
      (nickname, result) => {
        setVerified((prev) => {
          const next = new Map(prev);
          if (result.ok) {
            next.set(
              nickname,
              buildVerification(
                claimsByNickname.get(nickname) ?? [],
                result.inventory,
              ),
            );
          } else {
            next.set(nickname, {
              status: result.rateLimited ? "rate-limited" : "failed",
              ...(result.rateLimited ? {} : { reason: result.reason }),
            } as VerificationState);
          }
          return next;
        });
      },
    );

    setVerifying(false);
    if (rateLimited) {
      toast.warning(
        `Chain-checked ${completed} of ${pending.length}. Cosmo lookups are capped at 10/min when signed out — sign in to check the rest.`,
      );
    } else if (completed === 0) {
      toast.error(
        "Could not chain-check anyone — see the reasons on each trader below.",
      );
    } else {
      toast.success(
        `Chain-checked ${completed} trader${completed === 1 ? "" : "s"}`,
      );
    }
  }, [linkedNicknames, messages, verified]);

  /**
   * Close the loop: turn the viewer's picks into a real objekt.my list.
   *
   * Reuses the grid board's existing hand-off channel (/list?prefill=grid
   * with the draft in the URL fragment) rather than inventing a second one —
   * the fragment survives a cross-origin hop when section subdomains are on,
   * and never reaches the server. Only wants are prefilled; the list builder
   * already auto-imports haves from the linked Cosmo account.
   */
  const handleBuildList = useCallback(async () => {
    const wanted = pileRef.current.filter((e) => picked.has(e.key));
    if (wanted.length === 0) return;
    setBuilding(true);
    try {
      const wants = await resolveForPoster(wanted.map((e) => e.item));
      const stash = encodeGridTradeStash({
        username: "",
        cosmoId: nickname.trim(),
        haves: [],
        wants,
        date: new Date().toLocaleDateString("en-GB"),
        haveTitle: "Have",
        wantTitle: "Want",
      });
      window.location.href = `${sectionHref("/list", {
        currentSection: undefined,
      })}?prefill=grid#${GRID_TRADE_HASH_PARAM}=${stash}`;
    } catch {
      toast.error("Could not build the list draft. Try again.");
      setBuilding(false);
    }
  }, [picked, nickname]);

  // Your side of the trade comes from either source, or both: an inventory
  // read from the chain, and spares typed by hand.
  const offeringItems = useMemo(() => parseOffering(offering), [offering]);
  const ownedIndex = useMemo(
    () => indexOwned([...owned, ...offeringItems]),
    [owned, offeringItems],
  );
  const hasOffer = ownedIndex.total > 0;

  // Intent is a filter over the same posts, not a separate tool: a quarter of
  // a real channel is selling rather than swapping, and several posts are both
  // at once, so splitting them into sections would duplicate or hide them.
  const shown = useMemo(
    () =>
      intentFilter === "all"
        ? messages
        : messages.filter((m) => m.intent.intents.includes(intentFilter)),
    [messages, intentFilter],
  );

  const matched = useMemo(
    () => matchTranscript(shown, ownedIndex, picked),
    [shown, ownedIndex, picked],
  );
  const pile = useMemo(() => buildPile(shown), [shown]);
  const pileRef = useRef(pile);
  pileRef.current = pile;
  const visiblePile = useMemo(() => {
    const query = parsePileQuery(pileFilter);
    const filtered =
      pileFilter.trim().length === 0
        ? pile
        : pile.filter((entry) => matchesPileQuery(entry, query));

    if (pileSort === "scarcest") return filtered;

    // Cheapest ask across everyone offering it. An objekt nobody priced sorts
    // last either way rather than pretending to be free.
    const cheapestOf = (entry: (typeof filtered)[number]) => {
      const asks = entry.offeredBy
        .map((m) => askingPrice(m.pricing, entry.key))
        .filter((p) => p !== null);
      return asks.length > 0 ? Math.min(...asks.map((a) => a.amount)) : null;
    };

    const sorted = [...filtered];
    if (pileSort === "member") {
      sorted.sort((a, b) =>
        itemLabel(a.item).localeCompare(itemLabel(b.item), undefined, {
          numeric: true,
        }),
      );
      return sorted;
    }

    sorted.sort((a, b) => {
      const pa = cheapestOf(a);
      const pb = cheapestOf(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pileSort === "cheapest" ? pa - pb : pb - pa;
    });
    return sorted;
  }, [pile, pileFilter, pileSort]);

  // Supply spans typed lists *and* verified inventories, so a link-only poster
  // holding thousands of objekts becomes searchable instead of invisible.
  const supplyIndex = useMemo(
    () => buildSupplyIndex(shown, verified),
    [shown, verified],
  );
  const demandIndex = useMemo(() => buildDemandIndex(shown), [shown]);

  /**
   * One lookup, both directions. A trader holding a spare is asking a demand
   * question ("who will take this?"); answering only the supply half returns
   * the opposite of what they wanted in a shape that reads like a match.
   */
  const lookupRows = useMemo(() => {
    const q = lookupQuery.trim();
    if (!q) return [];
    const rows = new Map<
      string,
      {
        key: string;
        member: string;
        season: string;
        collectionNo: string;
        suppliers: SupplyEntry["suppliers"];
        wanters: DemandEntry["wanters"];
      }
    >();
    for (const s of searchSupply(supplyIndex, q)) {
      rows.set(s.key, { ...s, wanters: [] });
    }
    for (const d of searchDemand(demandIndex, q)) {
      const row = rows.get(d.key);
      if (row) row.wanters = d.wanters;
      else rows.set(d.key, { ...d, suppliers: [] });
    }
    return [...rows.values()];
  }, [lookupQuery, supplyIndex, demandIndex]);

  const summary = useMemo(() => summarize(shown), [shown]);
  const wantYouHaveCount = matched.filter(
    (m) => m.theyWantYouHave.length > 0,
  ).length;

  const verifyStats = useMemo(() => {
    let checked = 0;
    let failed = 0;
    let limited = 0;
    for (const nick of linkedNicknames) {
      const state = verified.get(nick);
      if (!state) continue;
      if (state.status === "verified") checked++;
      else if (state.status === "rate-limited") limited++;
      else if (state.status === "failed") failed++;
    }
    return { checked, failed, limited };
  }, [linkedNicknames, verified]);

  const togglePick = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-[120rem] space-y-6 px-1 pb-16 sm:px-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Match from a Discord paste</h1>
        <p className="text-sm text-muted-foreground">
          Copy trade posts out of a Discord channel and paste them here. You
          keep control of what gets read — objekt.my never touches Discord.
        </p>
      </header>

      {/* Input */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
            <Button onClick={() => addPaste(raw)} disabled={!raw.trim()}>
              <ClipboardPasteIcon className="mr-1.5 h-4 w-4" />
              Add paste
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                <Trash2Icon className="mr-1.5 h-4 w-4" />
                Clear all {messages.length}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Discord only renders part of a channel at a time — paste in
              chunks, duplicates are dropped automatically.
            </p>
          </div>
        </div>

        {/* Your side of the trade. Either half works on its own. */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">What you're offering</CardTitle>
            <CardDescription>
              Type your spares — no sign-in, no Cosmo link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={offering}
              onChange={(e) => setOffering(e.target.value)}
              rows={3}
              placeholder={"JiYeon CC102\nSeoYeon CC114 CC115"}
              className="font-mono text-xs"
            />
            {offeringItems.length > 0 && (
              <p className="text-xs text-emerald-500">
                {offeringItems.length} objekt
                {offeringItems.length === 1 ? "" : "s"} recognised
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                or load it all
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-2">
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadInventory()}
                placeholder="Cosmo nickname"
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
            <p className="text-xs text-muted-foreground">
              Read from the chain. No sign-in; kept in this browser only.
            </p>
            {owned.length > 0 && (
              <p className="text-xs text-emerald-500">
                {owned.length} objekts loaded
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {messages.length === 0 ? (
        <div className="space-y-4 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">Paste some trade posts to start</p>
          <div className="mx-auto max-w-md space-y-1.5 text-left text-xs text-muted-foreground">
            <p>
              1. In your trade channel, click just before the first message,
              scroll, then shift+click after the last one.
            </p>
            <p>2. Copy, and paste it above. Repeat for as much as you want.</p>
            <p>
              3. Type a spare or two into “What you're offering” and you'll see
              who wants it.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addPaste(SAMPLE_PASTE)}
          >
            Try it with a sample paste
          </Button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.posters} posters
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.verified} linked
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.claimed} typed lists
            </span>
            <span className="rounded-full border border-border bg-card px-3 py-1.5">
              {summary.haveItems} haves · {summary.wantItems} wants
            </span>
            {verifyStats.checked > 0 && (
              <span className="rounded-full border border-emerald-600/50 bg-emerald-600/10 px-3 py-1.5 text-emerald-400">
                {verifyStats.checked} chain-checked
              </span>
            )}
            {verifyStats.limited > 0 && (
              <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-amber-400">
                {verifyStats.limited} hit the lookup limit
              </span>
            )}
            {verifyStats.failed > 0 && (
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-muted-foreground">
                {verifyStats.failed} could not be checked
              </span>
            )}
            {hasOffer && (
              <span className="rounded-full border border-emerald-600/50 bg-emerald-600/10 px-3 py-1.5 font-medium text-emerald-400">
                {wantYouHaveCount} trader{wantYouHaveCount === 1 ? "" : "s"}{" "}
                {wantYouHaveCount === 1 ? "wants" : "want"} something you have
              </span>
            )}
            {linkedNicknames.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-auto rounded-full px-3 py-1.5 text-xs"
                onClick={handleVerifyAll}
                disabled={verifying}
              >
                {verifying ? (
                  <Loader2Icon className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheckIcon className="mr-1.5 h-3 w-3" />
                )}
                Chain-check {linkedNicknames.length} linked
              </Button>
            )}
          </div>

          {/* Intent filter. A trade channel is not only trades: in a real
              sample a quarter of posts were sales and several were a sale and
              a swap at once, so this filters the same posts rather than
              splitting them into a separate section. */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Showing</span>
            {(["all", "wtt", "wts", "wtb"] as const).map((option) => {
              const count =
                option === "all"
                  ? messages.length
                  : messages.filter((m) => m.intent.intents.includes(option))
                      .length;
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => setIntentFilter(option)}
                  className={`rounded-full border px-3 py-1.5 transition-colors ${
                    intentFilter === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {option === "all" ? "Everything" : INTENT_LABEL[option]}{" "}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Two-way lookup — the question traders actually arrive with */}
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle>Who has it — who wants it?</CardTitle>
                <CardDescription>
                  {supplyIndex.size.toLocaleString()} on offer ·{" "}
                  {demandIndex.size.toLocaleString()} asked for
                </CardDescription>
              </div>
              <Input
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder="e.g. nien cc301"
              />
            </CardHeader>
            {lookupQuery.trim() && (
              <CardContent>
                <div className="space-y-1.5 pt-1">
                  {lookupRows.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      Nobody in this paste has or wants that.
                    </p>
                  ) : (
                    lookupRows.map((row) => (
                      <div
                        key={row.key}
                        className="space-y-1.5 rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">
                            {row.member} {row.collectionNo}
                          </span>
                          <span className="text-muted-foreground">
                            {row.season}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-14 shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
                            Has
                          </span>
                          {row.suppliers.length === 0 ? (
                            <span className="text-muted-foreground">
                              nobody
                            </span>
                          ) : (
                            row.suppliers.map((sup) => (
                              <span
                                key={`h-${row.key}-${sup.message.key}`}
                                className={`rounded px-1.5 py-0.5 ${
                                  sup.source === "verified"
                                    ? "bg-emerald-600/15 text-emerald-400"
                                    : "bg-muted text-muted-foreground"
                                }`}
                                title={
                                  sup.source === "verified"
                                    ? "Confirmed on-chain"
                                    : "Self-reported in their post"
                                }
                              >
                                {sup.message.author}
                                {sup.copies > 1 && ` ×${sup.copies}`}
                                {(() => {
                                  const ask = askingPrice(
                                    sup.message.pricing,
                                    row.key,
                                  );
                                  return ask ? (
                                    <span className="ml-1 font-medium text-emerald-400">
                                      {" "}
                                      {formatPrice(ask)}
                                    </span>
                                  ) : null;
                                })()}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-14 shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
                            Wants
                          </span>
                          {row.wanters.length === 0 ? (
                            <span className="text-muted-foreground">
                              nobody
                            </span>
                          ) : (
                            row.wanters.map((msg) => (
                              <span
                                key={`w-${row.key}-${msg.key}`}
                                className="rounded bg-primary/15 px-1.5 py-0.5 text-primary"
                                title="Asked for it in their post"
                              >
                                {msg.author}
                                {(() => {
                                  const bid = bidPrice(msg.pricing, row.key);
                                  return bid ? (
                                    <span className="ml-1 font-medium">
                                      {" "}
                                      pays {formatPrice(bid)}
                                    </span>
                                  ) : null;
                                })()}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
            {/* Panel 1 — who wants what you have */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Who wants what you have</CardTitle>
                <CardDescription>
                  {hasOffer
                    ? "Ordered by mutual matches, then by overlap size."
                    : "Type a spare into “What you're offering” above to fill this in."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {matched
                  .filter((m) => m.theyWantYouHave.length > 0)
                  .map((match) => {
                    const { message, theyWantYouHave, theyHave, isMutual } =
                      match;
                    const state = message.nickname
                      ? verified.get(message.nickname)
                      : undefined;
                    // Keyed and deduped: a trader who listed the same objekt
                    // twice should still get one chip, and the key is what a
                    // pick is recorded against.
                    const theirOffer = [
                      ...new Map(
                        theyHave.flatMap((item) => {
                          const key = objektKey(item);
                          return key ? [[key, { key, item }] as const] : [];
                        }),
                      ).values(),
                    ];
                    return (
                      // The card opens the full post. It carries the button role
                      // rather than being a <button>, because the pick chips
                      // inside it are buttons and nesting them is invalid HTML.
                      // Chips stop propagation so picking never doubles as
                      // opening.
                      // biome-ignore lint/a11y/useSemanticElements: see above
                      <div
                        role="button"
                        tabIndex={0}
                        key={message.key}
                        onClick={() => setOpenPost(message.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenPost(message.key);
                          }
                        }}
                        className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                          isMutual
                            ? "border-emerald-600/60 bg-emerald-600/5 hover:border-emerald-600"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <DiscordHandle name={message.author} />
                          {tierBadge(
                            message.tier,
                            state?.status === "verified",
                          )}
                          {isMutual && (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              <CheckCircle2Icon className="mr-1 h-3 w-3" />
                              Mutual
                            </Badge>
                          )}
                          {message.intent.intents.map((i) => (
                            <Badge key={i} variant="outline">
                              {INTENT_LABEL[i]}
                            </Badge>
                          ))}
                        </div>

                        {state && state.status !== "verified" && (
                          <p
                            className={`mb-2 text-[11px] ${
                              state.status === "rate-limited"
                                ? "text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {state.status === "rate-limited"
                              ? "Not chain-checked — Cosmo lookup limit reached."
                              : state.status === "failed"
                                ? `Could not chain-check: ${state.reason}`
                                : "Not chain-checked yet."}
                          </p>
                        )}
                        {state?.status === "verified" && (
                          <div className="mb-2 space-y-1 rounded border border-emerald-600/30 bg-emerald-600/5 p-2">
                            <p className="text-[11px] text-emerald-400">
                              <ShieldCheckIcon className="mr-1 inline h-3 w-3" />
                              Holds {state.inventory.length} tradable objekts
                              on-chain
                            </p>
                            {state.stale.length > 0 && (
                              <p className="text-[11px] text-amber-400">
                                <AlertTriangleIcon className="mr-1 inline h-3 w-3" />
                                {state.stale.length} listed objekt
                                {state.stale.length === 1 ? "" : "s"} no longer
                                in their inventory
                              </p>
                            )}
                            {suppliesPicked(state.index, picked).length > 0 && (
                              <p className="text-[11px] font-medium text-emerald-300">
                                Can supply{" "}
                                {suppliesPicked(state.index, picked).length} of
                                your picks
                              </p>
                            )}
                          </div>
                        )}

                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          They want, you have
                        </p>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {theyWantYouHave.map((hit) => (
                            <span
                              key={`${message.key}-w-${hit.key}`}
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

                        {/* The return leg, in the same card: without it the
                          viewer has to go hunting for what this trader offers,
                          which is the scrolling the tool exists to remove. */}
                        {theirOffer.length > 0 && (
                          <>
                            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                              They have — click to pick
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {theirOffer.slice(0, 24).map(({ key, item }) => (
                                <button
                                  type="button"
                                  key={`${message.key}-h-${key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePick(key);
                                  }}
                                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                                    picked.has(key)
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-card hover:border-primary/50"
                                  }`}
                                >
                                  {itemLabel(item)}
                                </button>
                              ))}
                              {theirOffer.length > 24 && (
                                <span className="self-center text-xs text-muted-foreground">
                                  +{theirOffer.length - 24} more
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                {hasOffer && wantYouHaveCount === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    Nobody in this paste wants what you're offering. Try pasting
                    more of the channel.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Panel 2 — the pile */}
            <Card>
              <CardHeader className="gap-3">
                <div>
                  <CardTitle>
                    What they have{" "}
                    <span className="font-normal text-muted-foreground text-sm">
                      ({pile.length.toLocaleString()})
                    </span>
                  </CardTitle>
                  <CardDescription>
                    Pick what you want — no want list needed.
                  </CardDescription>
                </div>

                <PileSearch
                  value={pileFilter}
                  onChange={setPileFilter}
                  count={pile.length}
                />

                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Sort</span>
                  {PILE_SORTS.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={pileSort === option.id ? "default" : "outline"}
                      onClick={() => setPileSort(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  <span className="ml-auto text-muted-foreground text-xs">
                    {visiblePile.length.toLocaleString()} shown
                  </span>
                </div>
              </CardHeader>

              <CardContent>
                {visiblePile.length === 0 ? (
                  <p className="py-10 text-center text-muted-foreground text-sm">
                    Nothing here matches that search.
                  </p>
                ) : (
                  <PileGrid
                    entries={visiblePile}
                    picked={picked}
                    onToggle={togglePick}
                    demand={demandIndex}
                    verified={verified}
                  />
                )}
              </CardContent>

              {/* The list hand-off is a side road, not the point of the page:
                  one quiet line under the grid rather than a banner above it. */}
              {picked.size > 0 && (
                <CardFooter className="justify-between gap-2 border-border/60 border-t pt-4 text-muted-foreground text-sm">
                  <span>{picked.size} picked</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleBuildList}
                    disabled={building}
                  >
                    {building ? (
                      <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save as a list
                    <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>

          <PostDialog
            match={matched.find((m) => m.message.key === openPost) ?? null}
            verification={(() => {
              const nick = matched.find((m) => m.message.key === openPost)
                ?.message.nickname;
              return nick ? verified.get(nick) : undefined;
            })()}
            picked={picked}
            onToggle={togglePick}
            onOpenChange={(open) => !open && setOpenPost(null)}
          />

          {/* Confirmed, because a paste pile is accumulated work — often many
              append-pastes across a session — and there is no undo. */}
          <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Clear all {messages.length} pasted post
                  {messages.length === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This also drops your {picked.size} pick
                  {picked.size === 1 ? "" : "s"}, any chain-check results, and
                  the current filters. Your own spares and Cosmo nickname are
                  kept. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearAllPastes}>
                  Clear everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
