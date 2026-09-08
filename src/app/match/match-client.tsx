"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  Loader2Icon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type ExternalListImport,
  type ExternalListLink,
  externalItemToParsed,
} from "@/lib/external-list";
import {
  encodeGridTradeStash,
  GRID_TRADE_HASH_PARAM,
} from "@/lib/grid-trade-stash";
import { formatShortLabel } from "@/lib/objekt-label";
import type { ParsedItem } from "@/lib/paste-parser";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { sectionHref } from "@/lib/sections";
import { PileGrid } from "./pile-grid";
import { matchesPileQuery, PileSearch, parsePileQuery } from "./pile-search";
import { CopyDiscordHandle, PostDialog } from "./post-dialog";

const STORAGE_KEY = "match:transcript:v1";
const RAW_KEY = "match:raw:v1";
const NICK_KEY = "match:nickname:v1";
const PICKED_KEY = "match:picked:v1";
const OFFERING_KEY = "match:offering:v1";
const WANTING_KEY = "match:wants:v1";

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

// Match cards contain two chip groups and can be much taller than pile tiles.
// A smaller page keeps a full-channel import scannable instead of creating one
// enormous column.
const MATCH_PAGE_SIZE = 12;
const MATCH_WANT_CHIP_LIMIT = 6;
const MATCH_OFFER_CHIP_LIMIT = 8;

type LinkedListImportState =
  | { status: "loading"; links: ExternalListLink[] }
  | {
      status: "loaded";
      links: ExternalListLink[];
      imports: ExternalListImport[];
      errors: { link: ExternalListLink; message: string }[];
    };

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22)
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

/** Merge a public list into a paste without changing the raw pasted source. */
function mergeImportedHaves(
  haves: ParsedItem[],
  imported: ExternalListImport[],
): ParsedItem[] {
  const merged: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const item of [
    ...haves,
    ...imported.flatMap((list) => list.items.map(externalItemToParsed)),
  ]) {
    const key = objektKey(item);
    // Keep unkeyed source items too: even if they cannot match, their raw
    // text may be useful in the post dialog.
    if (!key) {
      merged.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function fetchLinkedList(
  link: ExternalListLink,
): Promise<ExternalListImport> {
  const response = await fetch(
    `/api/external-lists?url=${encodeURIComponent(link.url)}`,
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Could not import this linked list.";
    throw new Error(message);
  }
  return data as ExternalListImport;
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
  const [storedRaw, setStoredRaw] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [nickname, setNickname] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [offering, setOffering] = useState("");
  const [wanting, setWanting] = useState("");
  const [loadingInv, setLoadingInv] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Verification results keyed by Cosmo nickname, so two posters sharing a
  // link are only fetched once.
  const [verified, setVerified] = useState<Map<string, VerificationState>>(
    new Map(),
  );
  // Imported data is session-only. The small raw Discord paste remains the
  // persistent source of truth; opening the post again refreshes its public
  // list instead of permanently storing hundreds of CDN URLs in localStorage.
  const [linkedImports, setLinkedImports] = useState<
    Map<string, LinkedListImportState>
  >(new Map());
  const [verifying, setVerifying] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [pileFilter, setPileFilter] = useState("");
  const deferredPileFilter = useDeferredValue(pileFilter);
  const [pileSort, setPileSort] = useState<PileSortId>("scarcest");
  const [intentFilter, setIntentFilter] = useState<TradeIntent | "all">("all");
  const [building, setBuilding] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [matchPage, setMatchPage] = useState(0);
  const importFileRef = useRef<HTMLInputElement>(null);
  const linkedImportStarted = useRef<Set<string>>(new Set());
  const linkedImportGeneration = useRef(0);
  const hydrated = useRef(false);
  // The ref distinguishes the post-hydration render from the initial empty
  // render; this state makes that distinction observable to the write effects.
  const [hydrationComplete, setHydrationComplete] = useState(false);

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
    setStoredRaw("");
    setPicked(new Set());
    setVerified(new Map());
    setLinkedImports(new Map());
    linkedImportStarted.current.clear();
    linkedImportGeneration.current++;
    setIntentFilter("all");
    setPileFilter("");
    setPileSort("scarcest");
    setLookupQuery("");
    setOpenPost(null);
    setConfirmClear(false);
    try {
      localStorage.removeItem(RAW_KEY);
    } catch {
      // Storage can be disabled; state is already cleared for this session.
    }
    toast.success("Cleared every pasted post");
  }, []);

  // Restore the session — pastes, spares and picks all survive a reload
  // without an account. localStorage only; nothing leaves the browser.
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(RAW_KEY);
      // Parsed message JSON can exceed localStorage quota. Remove the old
      // format once so it cannot keep consuming space beside the raw source.
      localStorage.removeItem(STORAGE_KEY);
      if (savedRaw) {
        setStoredRaw(savedRaw);
        setMessages(analyzeTranscript(savedRaw).messages);
      }
      const nick = localStorage.getItem(NICK_KEY);
      if (nick) setNickname(nick);
      const picks = localStorage.getItem(PICKED_KEY);
      if (picks) setPicked(new Set(JSON.parse(picks)));
      const spares = localStorage.getItem(OFFERING_KEY);
      if (spares) setOffering(spares);
      const wants = localStorage.getItem(WANTING_KEY);
      if (wants) setWanting(wants);
    } catch {
      // Corrupt or unavailable storage — start clean rather than crash.
    } finally {
      hydrated.current = true;
      setHydrationComplete(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current || !hydrationComplete) return;
    try {
      if (storedRaw) localStorage.setItem(RAW_KEY, storedRaw);
      else localStorage.removeItem(RAW_KEY);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        toast.error(
          "This import is too large to keep after a reload. Your current results are still available until you leave this page.",
        );
      }
    }
  }, [hydrationComplete, storedRaw]);

  useEffect(() => {
    if (!hydrated.current || !hydrationComplete) return;
    try {
      localStorage.setItem(PICKED_KEY, JSON.stringify([...picked]));
    } catch {}
  }, [hydrationComplete, picked]);

  useEffect(() => {
    if (!hydrated.current || !hydrationComplete) return;
    try {
      localStorage.setItem(OFFERING_KEY, offering);
    } catch {}
  }, [hydrationComplete, offering]);

  useEffect(() => {
    if (!hydrated.current || !hydrationComplete) return;
    try {
      localStorage.setItem(WANTING_KEY, wanting);
    } catch {}
  }, [hydrationComplete, wanting]);

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
      // Keep the compact source, not the expanded parsed objects. On reload it
      // is parsed as one transcript, which also gives exact reposts a repeat
      // count instead of the current-session last-paste-wins merge behavior.
      setStoredRaw((previous) => (previous ? `${previous}\n${text}` : text));
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

  const importTextFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const files = Array.from(input.files ?? []);
      try {
        const texts = await Promise.all(files.map((file) => file.text()));
        addPaste(texts.join("\n"));
      } catch {
        toast.error("Could not read the selected text files. Try again.");
      } finally {
        // Let choosing the same file again fire change after a correction.
        input.value = "";
      }
    },
    [addPaste],
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

  // Your side of the trade comes from either source, or both: an inventory
  // read from the chain, and spares typed by hand. Wants stay separate so a
  // trader can also start by looking for an objekt without offering one.
  const offeringItems = useMemo(() => parseOffering(offering), [offering]);
  const wantingItems = useMemo(() => parseOffering(wanting), [wanting]);
  const ownedIndex = useMemo(
    () => indexOwned([...owned, ...offeringItems]),
    [owned, offeringItems],
  );
  const hasOffer = ownedIndex.total > 0;
  const typedWantKeys = useMemo(
    () =>
      new Set(
        wantingItems
          .map((item) => objektKey(item))
          .filter((key): key is string => key !== null),
      ),
    [wantingItems],
  );
  const wantedKeys = useMemo(
    () => new Set([...typedWantKeys, ...picked]),
    [typedWantKeys, picked],
  );
  const hasWant = wantedKeys.size > 0;

  const enrichedMessages = useMemo(
    () =>
      messages.map((message) => {
        const state = linkedImports.get(message.key);
        if (state?.status !== "loaded" || state.imports.length === 0)
          return message;
        return {
          ...message,
          haves: mergeImportedHaves(message.haves, state.imports),
        };
      }),
    [linkedImports, messages],
  );

  // Prefer the artwork supplied by the linked public list. The grid still
  // falls back to our resolver for ordinary typed posts or cards without a
  // public thumbnail.
  const linkedImages = useMemo(() => {
    const images = new Map<string, string>();
    for (const state of linkedImports.values()) {
      if (state.status !== "loaded") continue;
      for (const list of state.imports) {
        for (const item of list.items) {
          const key = objektKey(externalItemToParsed(item));
          if (key && item.imageUrl && !images.has(key)) {
            images.set(key, item.imageUrl);
          }
        }
      }
    }
    return images;
  }, [linkedImports]);

  // Import only after the user opens a specific post. This keeps a 1,300-post
  // transcript fast and avoids fetching a stranger's list merely because it
  // happened to appear in a paste.
  useEffect(() => {
    if (!openPost) return;
    const message = messages.find((candidate) => candidate.key === openPost);
    if (!message || message.listLinks.length === 0) return;
    if (linkedImportStarted.current.has(message.key)) return;

    linkedImportStarted.current.add(message.key);
    const generation = linkedImportGeneration.current;
    setLinkedImports((previous) => {
      if (previous.has(message.key)) return previous;
      const next = new Map(previous);
      next.set(message.key, { status: "loading", links: message.listLinks });
      return next;
    });

    void Promise.allSettled(message.listLinks.map(fetchLinkedList)).then(
      (results) => {
        if (generation !== linkedImportGeneration.current) return;
        const imports: ExternalListImport[] = [];
        const errors: { link: ExternalListLink; message: string }[] = [];
        results.forEach((result, index) => {
          const link = message.listLinks[index];
          if (!link) return;
          if (result.status === "fulfilled") imports.push(result.value);
          else {
            errors.push({
              link,
              message:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Could not import this linked list.",
            });
          }
        });
        setLinkedImports((previous) => {
          const next = new Map(previous);
          next.set(message.key, {
            status: "loaded",
            links: message.listLinks,
            imports,
            errors,
          });
          return next;
        });
      },
    );
  }, [messages, openPost]);

  /**
   * Close the loop: turn the trader's typed wants and pile picks into a real
   * objekt.my list. The import is just the matching source; this remains the
   * trader's own list, so it should not discard wants typed before the paste.
   */
  const handleBuildList = useCallback(async () => {
    const wantByKey = new Map<string, (typeof wantingItems)[number]>();
    for (const item of [
      ...wantingItems,
      ...pileRef.current
        .filter((entry) => picked.has(entry.key))
        .map((entry) => entry.item),
    ]) {
      const key = objektKey(item);
      if (key) wantByKey.set(key, item);
    }
    const wanted = [...wantByKey.values()];
    if (wanted.length === 0) return;
    setBuilding(true);
    try {
      const wants = await resolveForPoster(wanted);
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
  }, [nickname, picked, wantingItems]);

  // Intent is a filter over the same posts, not a separate tool: a quarter of
  // a real channel is selling rather than swapping, and several posts are both
  // at once, so splitting them into sections would duplicate or hide them.
  const shown = useMemo(
    () =>
      intentFilter === "all"
        ? enrichedMessages
        : enrichedMessages.filter((m) =>
            m.intent.intents.includes(intentFilter),
          ),
    [enrichedMessages, intentFilter],
  );

  const matched = useMemo(
    () => matchTranscript(shown, ownedIndex, wantedKeys),
    [shown, ownedIndex, wantedKeys],
  );
  const listMatches = useMemo(
    () =>
      matched.filter(
        (match) =>
          match.theyWantYouHave.length > 0 ||
          match.theyHaveYouWant.length > 0 ||
          match.message.listLinks.length > 0,
      ),
    [matched],
  );
  const matchPageCount = Math.max(
    1,
    Math.ceil(listMatches.length / MATCH_PAGE_SIZE),
  );
  const safeMatchPage = Math.min(matchPage, matchPageCount - 1);
  const visibleMatches = useMemo(
    () =>
      listMatches.slice(
        safeMatchPage * MATCH_PAGE_SIZE,
        (safeMatchPage + 1) * MATCH_PAGE_SIZE,
      ),
    [listMatches, safeMatchPage],
  );
  useEffect(() => {
    setMatchPage((page) => (page >= matchPageCount ? 0 : page));
  }, [matchPageCount]);

  const pile = useMemo(() => buildPile(shown), [shown]);
  const pileRef = useRef(pile);
  pileRef.current = pile;
  const visiblePile = useMemo(() => {
    const query = parsePileQuery(deferredPileFilter);
    const filtered =
      deferredPileFilter.trim().length === 0
        ? pile
        : pile.filter((entry) => matchesPileQuery(entry, query));

    if (pileSort === "scarcest") return filtered;

    // Resolve each price once before sorting. Calling askingPrice in the
    // comparator turns an n log n sort of a large pile into hundreds of
    // thousands of price parses.
    const sorted = filtered.map((entry) => {
      const asks = entry.offeredBy
        .map((message) => askingPrice(message.pricing, entry.key))
        .filter((price) => price !== null);
      return {
        entry,
        price:
          asks.length > 0
            ? Math.min(...asks.map((price) => price.amount))
            : null,
      };
    });
    if (pileSort === "member") {
      sorted.sort((a, b) =>
        itemLabel(a.entry.item).localeCompare(
          itemLabel(b.entry.item),
          undefined,
          {
            numeric: true,
          },
        ),
      );
      return sorted.map(({ entry }) => entry);
    }

    sorted.sort((a, b) => {
      const pa = a.price;
      const pb = b.price;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pileSort === "cheapest" ? pa - pb : pb - pa;
    });
    return sorted.map(({ entry }) => entry);
  }, [deferredPileFilter, pile, pileSort]);

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
  const wantYouHaveCount = useMemo(
    () => matched.filter((match) => match.theyWantYouHave.length > 0).length,
    [matched],
  );
  const haveWhatYouWantCount = useMemo(
    () => matched.filter((match) => match.theyHaveYouWant.length > 0).length,
    [matched],
  );

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
          Start with your haves and wants, then compare them with copied Discord
          posts. objekt.my never touches Discord.
        </p>
      </header>

      {/* Set the trader's list before importing the source to match against. */}
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="order-2 space-y-2">
          <input
            ref={importFileRef}
            type="file"
            multiple
            accept=".txt,text/plain"
            className="hidden"
            onChange={importTextFiles}
          />
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                addPaste(raw);
              }
            }}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => importFileRef.current?.click()}
            >
              Import .txt files
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                <Trash2Icon className="mr-1.5 h-4 w-4" />
                Clear all {messages.length}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Ctrl+Enter to add. Click blank space in Discord's message area,
              then Ctrl+A — it grabs every message Discord has loaded, which
              beats dragging. Scroll up and repeat; duplicates are dropped
              automatically.
            </p>
          </div>
        </div>

        {/* The trader's list comes first; the paste is only the source to
            compare against. Either tab is useful on its own. */}
        <Card className="order-1 h-fit">
          <CardHeader>
            <CardTitle className="text-base">Your trade list</CardTitle>
            <CardDescription>
              Add haves and wants first, then match them against this paste.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="have">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="have">
                  Have{offeringItems.length > 0 && ` (${offeringItems.length})`}
                </TabsTrigger>
                <TabsTrigger value="want">
                  Want{wantingItems.length > 0 && ` (${wantingItems.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="have" className="space-y-3 pt-3">
                <Textarea
                  value={offering}
                  onChange={(e) => setOffering(e.target.value)}
                  rows={4}
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
                    or load your inventory
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
              </TabsContent>

              <TabsContent value="want" className="space-y-3 pt-3">
                <Textarea
                  value={wanting}
                  onChange={(e) => setWanting(e.target.value)}
                  rows={6}
                  placeholder={"SeoYeon CC101\nNien CC301"}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  One line or a compact list is enough. We only look for these
                  objekts in the imported posts.
                </p>
                {wantingItems.length > 0 && (
                  <p className="text-xs text-emerald-500">
                    {wantingItems.length} objekt
                    {wantingItems.length === 1 ? "" : "s"} recognised
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {messages.length === 0 ? (
        <div className="space-y-4 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">Paste some trade posts to start</p>
          <div className="mx-auto max-w-md space-y-1.5 text-left text-xs text-muted-foreground">
            <p>
              1. In your trade channel, click blank space in the message area,
              then Ctrl+A and Ctrl+C. That takes everything Discord has loaded —
              dragging across a scroll silently loses most of it.
            </p>
            <p>
              2. Paste it above and add it. Scroll up in Discord to load more,
              then repeat — duplicates are dropped automatically.
            </p>
            <p>
              3. Add your haves and wants above. The paste is only used to find
              matching traders.
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
            {hasWant && (
              <span className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 font-medium text-primary">
                {haveWhatYouWantCount} trader
                {haveWhatYouWantCount === 1 ? "" : "s"}{" "}
                {haveWhatYouWantCount === 1 ? "has" : "have"} something you want
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

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
            {/* Panel 1 — every overlap with the trader's own list. */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Matches from this paste</CardTitle>
                <CardDescription>
                  {hasOffer || hasWant
                    ? `${listMatches.length.toLocaleString()} matching trader${listMatches.length === 1 ? "" : "s"}, with linked lists ready to import when opened.`
                    : "Add haves or wants above, or open a linked list to import its cards."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleMatches.map((match) => {
                  const {
                    message,
                    theyHaveYouWant,
                    theyWantYouHave,
                    theyHave,
                    isMutual,
                  } = match;
                  const state = message.nickname
                    ? verified.get(message.nickname)
                    : undefined;
                  const linkedState = linkedImports.get(message.key);
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
                        <CopyDiscordHandle name={message.author} />
                        {tierBadge(message.tier, state?.status === "verified")}
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
                        {message.listLinks.length > 0 && (
                          <Badge
                            variant="outline"
                            className="border-primary/50 text-primary"
                          >
                            {linkedState?.status === "loading"
                              ? "Importing linked list"
                              : linkedState?.status === "loaded"
                                ? `${linkedState.imports.reduce((count, list) => count + list.items.length, 0)} imported`
                                : `${message.listLinks.length} linked list${message.listLinks.length === 1 ? "" : "s"}`}
                          </Badge>
                        )}
                      </div>

                      {message.listLinks.length > 0 && !linkedState && (
                        <p className="mb-2 text-xs text-primary/85">
                          Open this post to import its linked cards and match
                          them visually.
                        </p>
                      )}

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
                              {state.stale.length === 1 ? "" : "s"} no longer in
                              their inventory
                            </p>
                          )}
                          {suppliesPicked(state.index, wantedKeys).length >
                            0 && (
                            <p className="text-[11px] font-medium text-emerald-300">
                              Can supply{" "}
                              {suppliesPicked(state.index, wantedKeys).length}{" "}
                              of your wants
                            </p>
                          )}
                        </div>
                      )}

                      <div
                        className={`mb-3 grid gap-2 ${
                          theyWantYouHave.length > 0 &&
                          theyHaveYouWant.length > 0
                            ? "sm:grid-cols-2"
                            : "grid-cols-1"
                        }`}
                      >
                        {theyWantYouHave.length > 0 && (
                          <section className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-2.5">
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                              You give
                            </p>
                            <p className="mb-2 text-xs text-muted-foreground">
                              They are looking for these from you
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {theyWantYouHave
                                .slice(0, MATCH_WANT_CHIP_LIMIT)
                                .map((hit) => (
                                  <span
                                    key={`${message.key}-w-${hit.key}`}
                                    className="rounded border border-emerald-600/40 bg-background/40 px-2.5 py-1.5 text-sm"
                                  >
                                    {itemLabel(hit.want)}
                                    {hit.owned.length > 1 && (
                                      <span className="ml-1 text-emerald-400">
                                        ×{hit.owned.length}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              {theyWantYouHave.length >
                                MATCH_WANT_CHIP_LIMIT && (
                                <span className="self-center text-sm text-muted-foreground">
                                  +
                                  {theyWantYouHave.length -
                                    MATCH_WANT_CHIP_LIMIT}{" "}
                                  more
                                </span>
                              )}
                            </div>
                          </section>
                        )}

                        {theyHaveYouWant.length > 0 && (
                          <section className="rounded-md border border-primary/40 bg-primary/10 p-2.5">
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                              You get
                            </p>
                            <p className="mb-2 text-xs text-muted-foreground">
                              They are offering these to you
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {theyHaveYouWant
                                .slice(0, MATCH_WANT_CHIP_LIMIT)
                                .map((item) => (
                                  <span
                                    key={`${message.key}-h-${objektKey(item)}`}
                                    className="rounded border border-primary/40 bg-background/40 px-2.5 py-1.5 text-sm"
                                  >
                                    {itemLabel(item)}
                                  </span>
                                ))}
                              {theyHaveYouWant.length >
                                MATCH_WANT_CHIP_LIMIT && (
                                <span className="self-center text-sm text-muted-foreground">
                                  +
                                  {theyHaveYouWant.length -
                                    MATCH_WANT_CHIP_LIMIT}{" "}
                                  more
                                </span>
                              )}
                            </div>
                          </section>
                        )}
                      </div>

                      {/* The return leg, in the same card: without it the
                          viewer has to go hunting for what this trader offers,
                          which is the scrolling the tool exists to remove. */}
                      {theirOffer.length > 0 && (
                        <>
                          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                            Other cards they listed — click to add to your wants
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {theirOffer
                              .slice(0, MATCH_OFFER_CHIP_LIMIT)
                              .map(({ key, item }) => (
                                <button
                                  type="button"
                                  key={`${message.key}-h-${key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePick(key);
                                  }}
                                  className={`rounded border px-2.5 py-1.5 text-sm transition-colors ${
                                    picked.has(key)
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-card hover:border-primary/50"
                                  }`}
                                >
                                  {itemLabel(item)}
                                </button>
                              ))}
                            {theirOffer.length > MATCH_OFFER_CHIP_LIMIT && (
                              <span className="self-center text-sm text-muted-foreground">
                                +{theirOffer.length - MATCH_OFFER_CHIP_LIMIT}{" "}
                                more
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {matchPageCount > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safeMatchPage === 0}
                      onClick={() => setMatchPage(safeMatchPage - 1)}
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Button>
                    <span className="text-muted-foreground">
                      {safeMatchPage * MATCH_PAGE_SIZE + 1}–
                      {Math.min(
                        (safeMatchPage + 1) * MATCH_PAGE_SIZE,
                        listMatches.length,
                      )}{" "}
                      of {listMatches.length.toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safeMatchPage >= matchPageCount - 1}
                      onClick={() => setMatchPage(safeMatchPage + 1)}
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {hasOffer || hasWant ? (
                  listMatches.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                      Nothing in this paste overlaps your list. Try adding more
                      of the channel or adjusting your haves and wants.
                    </p>
                  )
                ) : (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    Add haves or wants above to see matching traders here.
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
                    Browse the paste and add extra wants to your match.
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
                    imageUrls={linkedImages}
                  />
                )}
              </CardContent>

              {/* The list hand-off is a side road, not the point of the page:
                  one quiet line under the grid rather than a banner above it. */}
              {hasWant && (
                <CardFooter className="justify-between gap-2 border-border/60 border-t pt-4 text-muted-foreground text-sm">
                  <span>
                    {wantedKeys.size} want{wantedKeys.size === 1 ? "" : "s"}
                  </span>
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
                    Save wants as a list
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
            linkedImport={openPost ? linkedImports.get(openPost) : undefined}
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
