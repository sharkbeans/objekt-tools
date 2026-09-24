"use client";

import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ClipboardPasteIcon,
  Loader2Icon,
  PlusIcon,
  PuzzleIcon,
  ShoppingBagIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  useCallback,
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import {
  fetchInventoryByNickname,
  type OwnedEntry,
} from "@/lib/cosmo-inventory";
import {
  indexOwned,
  matchTranscript,
  objektKey,
  parseOffering,
} from "@/lib/discord/match";
import { askingPrice, formatPrice } from "@/lib/discord/price";
import {
  collectDeskCards,
  type DeskCard,
  type DeskMode,
  type DeskPost,
  deskLabel,
  indexDeskPosts,
  keyedItems,
  latestDeskPosts,
  selectDeskPosts,
} from "@/lib/discord/trade-desk";
import {
  analyzeTranscript,
  mergeTranscripts,
  type TranscriptMessage,
} from "@/lib/discord/transcript";
import {
  buildVerification,
  fetchInventoryForVerification,
  type VerificationState,
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
import {
  PAGE_SOURCE,
  type PageMessage,
  readExtensionMessage,
} from "@/lib/match/extension-handoff";
import {
  type HuntParams,
  readHuntParams,
  stripHuntParams,
} from "@/lib/match/hunt-url";
import {
  authorSeenId,
  postSeenId,
  type SeenId,
  type SeenKind,
} from "@/lib/match/seen-id";
import {
  clearRemoteSeen,
  dropRemoteSeen,
  fetchRemoteSeen,
  loadHideSeen,
  loadLocalSeen,
  pushRemoteSeen,
  saveHideSeen,
  saveLocalSeen,
} from "@/lib/match/seen-store";
import {
  blocksToTranscript,
  linksOf,
  MAX_BLOCKS,
  mergeBlocks,
  type StoredBlock,
} from "@/lib/match/transcript-blocks";
import {
  clearBlocks,
  loadBlocks,
  saveBlocks,
} from "@/lib/match/transcript-store";
import type { ParsedItem } from "@/lib/paste-parser";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { stripVariantSuffix } from "@/lib/season-prefix";
import { sectionHref } from "@/lib/sections";
import { ContactResults } from "./desk-contacts";
import { type DeskBadge, DeskGrid } from "./desk-grid";
import { matchesDeskQuery, parseDeskQuery } from "./desk-search";
import { PostDialog } from "./post-dialog";

const NICK_KEY = "match:nickname:v1";
const THEIR_SEARCH_KEY = "match:their-search:v1";
const OFFERING_KEY = "match:offering:v1";
const WANTING_KEY = "match:wants:v1";
const PICKED_KEY = "match:picked:v1";
const COLS_KEY = "match:columns:v1";
const INSTALL_CTA_KEY = "match:install-cta-dismissed:v1";
const COLUMN_CHOICES = [4, 5, 6, 7, 8, 10, 12] as const;
const DEFAULT_COLUMNS = 8;
const EMPTY_KEYS = new Set<string>();
const EMPTY_SEEN: ReadonlySet<SeenId> = new Set<SeenId>();
/** The two ids a post can be hidden by: itself, or its author. */
/** The server is shedding list imports (429/503); retry later, don't report. */
class ListImportsPausedError extends Error {}

type PostSeenIds = { post: SeenId; author: SeenId };
const EMPTY_SEEN_IDS: ReadonlyMap<string, PostSeenIds> = new Map();
const MODES = [
  {
    id: "wtt",
    label: "WTT",
    icon: ArrowLeftRightIcon,
    hint: "Choose what you can give or what you want. The other side shows cards connected through the same trader.",
  },
  {
    id: "wtb",
    label: "WTB",
    icon: ShoppingBagIcon,
    hint: "Pick cards for sale on the right, compare sellers below, then copy a Discord name to contact them.",
  },
  {
    id: "wts",
    label: "WTS",
    icon: TagIcon,
    hint: "Pick your cards on the left to see who is looking to buy them, with bids where stated.",
  },
] as const;

const SAMPLE = `haerin.exe — 3:44 PM
HAVE
SeoYeon CC101 CC112
Mayu CC103
WANT
JiYeon CC102
Xinyu CC101
yeonji_stan — 3:52 PM
HAVE
ChaeYeon CC104
WANT
Nien CC301
Chiruka — 4:01 PM
WTS
SeoYeon CC101 $3
Mayu CC103 $5
PayPal or Wise
ezilama — 4:02 PM
WTB
JiYeon CC102 $4
Xinyu CC101 $2`;

type ImportState =
  | { status: "loading"; links: ExternalListLink[] }
  | {
      status: "loaded";
      links: ExternalListLink[];
      imports: ExternalListImport[];
      errors: { link: ExternalListLink; message: string }[];
    };

function toggle(set: Set<string>, key: string) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Traders, not posts: one person's two separate lists are still one trader. */
function traderCount(posts: readonly DeskPost[]) {
  return new Set(posts.map((post) => post.message.author)).size;
}

/**
 * Most traders first, by the same count the card's badge shows — narrowed by
 * the other grid's picks. A grid is never narrowed by its own picks, so picking
 * a card cannot reorder the grid it was picked from. Ties fall back to the
 * whole mode pool, then the card name, so the order stays stable.
 */
function byTraders(
  cards: DeskCard[],
  pool: ReadonlyMap<string, DeskCard>,
): DeskCard[] {
  return cards
    .map((card) => ({
      card,
      count: traderCount(card.posts),
      pooled: traderCount(pool.get(card.key)?.posts ?? []),
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.pooled - a.pooled ||
        deskLabel(a.card.item).localeCompare(deskLabel(b.card.item)),
    )
    .map(({ card }) => card);
}

function SelectionTray({
  selected,
  items,
  onToggle,
  empty,
}: {
  selected: ReadonlySet<string>;
  items: ReadonlyMap<string, ParsedItem>;
  onToggle: (key: string) => void;
  empty: string;
}) {
  return (
    <div className="flex max-h-28 min-h-12 flex-wrap items-center gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2">
      {selected.size === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        [...selected].map((key) => {
          const item = items.get(key);
          const label = item ? deskLabel(item) : key.split("|").join(" ");
          return (
            <button
              key={key}
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onToggle(key)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-sm text-primary"
            >
              {label}
              <XIcon className="size-3.5" />
            </button>
          );
        })
      )}
    </div>
  );
}

/**
 * Shown on an empty desk. The page can't see the extension yet (its content
 * scripts only run on discord.com), so "no posts" stands in for "not
 * installed" until plan 038 adds real presence detection. Paste stays the
 * fallback either way.
 */
function InstallCta({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
      <PuzzleIcon className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm">
          <span className="font-semibold">Get Objekt Match</span> — it collects
          trade posts as you scroll Discord, so you never paste again.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link
            href="/extension"
            onClick={() => track("match_install_cta_click")}
          >
            Get the extension
          </Link>
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

export function MatchClient() {
  const [mode, setMode] = useState<DeskMode>("wtt");
  const [raw, setRaw] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [offering, setOffering] = useState("");
  const [wanting, setWanting] = useState("");
  const [theirSearch, setTheirSearch] = useState("");
  const [nickname, setNickname] = useState("");
  const [owned, setOwned] = useState<OwnedEntry[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [savedPicks, setSavedPicks] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState<"mine" | "paste" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [imports, setImports] = useState<Map<string, ImportState>>(new Map());
  /** Post content key -> Discord message link, from extension deliveries. */
  const [links, setLinks] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [verified, setVerified] = useState<Map<string, VerificationState>>(
    new Map(),
  );
  const [building, setBuilding] = useState(false);
  const [sort, setSort] = useState<"popular" | "member" | "price">("popular");
  const [columns, setColumns] = useState<number>(DEFAULT_COLUMNS);
  const [storedCount, setStoredCount] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<SeenId>>(EMPTY_SEEN);
  const [hideSeen, setHideSeen] = useState(true);
  // Hidden until the stored choice is read, so a dismissed card never flashes.
  const [installCtaDismissed, setInstallCtaDismissed] = useState(true);
  // messageKey -> the SHA-256 ids that identify this post and its author.
  const [seenIds, setSeenIds] =
    useState<ReadonlyMap<string, PostSeenIds>>(EMPTY_SEEN_IDS);
  const { data: session } = useSession();
  // Persisted, never rendered — a ref keeps pastes out of the render path and
  // keeps `addPaste` free of a stale closure over the previous blocks.
  const blocksRef = useRef<StoredBlock[]>([]);
  const importStarted = useRef(new Set<string>());
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      setOffering(localStorage.getItem(OFFERING_KEY) ?? "");
      setWanting(localStorage.getItem(WANTING_KEY) ?? "");
      setTheirSearch(localStorage.getItem(THEIR_SEARCH_KEY) ?? "");
      setNickname(localStorage.getItem(NICK_KEY) ?? "");
      const savedCols = Number(localStorage.getItem(COLS_KEY));
      if (COLUMN_CHOICES.some((choice) => choice === savedCols))
        setColumns(savedCols);
      const oldPicks: unknown = JSON.parse(
        localStorage.getItem(PICKED_KEY) ?? "[]",
      );
      if (Array.isArray(oldPicks))
        setSavedPicks(
          oldPicks.filter((key): key is string => typeof key === "string"),
        );
      setSeen(loadLocalSeen());
      setHideSeen(loadHideSeen());
      setInstallCtaDismissed(localStorage.getItem(INSTALL_CTA_KEY) === "1");
      localStorage.removeItem("match:transcript:v1");
    } catch {
      /* A disabled or full store still allows a session. */
    }
    // The transcript is gzipped in IndexedDB, so reading it is async. `ready`
    // gates the settings writes below until it has landed.
    let cancelled = false;
    loadBlocks()
      .then((saved) => {
        if (cancelled) return;
        blocksRef.current = saved;
        setStoredCount(saved.length);
        setLinks(linksOf(saved));
        setMessages(analyzeTranscript(blocksToTranscript(saved)).messages);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(OFFERING_KEY, offering);
      localStorage.setItem(WANTING_KEY, wanting);
      localStorage.setItem(THEIR_SEARCH_KEY, theirSearch);
      localStorage.setItem(NICK_KEY, nickname);
      localStorage.setItem(COLS_KEY, String(columns));
    } catch {
      /* Keep the in-memory lists usable. */
    }
  }, [ready, offering, wanting, theirSearch, nickname, columns]);

  // Hashing is async, so ids arrive a beat after the messages do. Until then a
  // post has no id and stays visible, which is the right way round: a brief
  // flash of a hidden post beats hiding one the user never triaged.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      messages.map(async (message) => {
        const [post, author] = await Promise.all([
          postSeenId(message.author, message.body),
          authorSeenId(message.author),
        ]);
        return post && author
          ? ([message.key, { post, author }] as const)
          : null;
      }),
    ).then((entries) => {
      if (!cancelled) setSeenIds(new Map(entries.filter((e) => e !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [messages]);
  // Signing in merges both directions: what this browser knew goes up, what
  // other devices knew comes down.
  const userId = session?.user.id;
  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    void fetchRemoteSeen().then((remote) => {
      if (cancelled) return;
      const local = loadLocalSeen();
      const missing = [...local].filter((id) => !remote.has(id));
      if (missing.length) void pushRemoteSeen(missing);
      const merged = new Set([...local, ...remote]);
      saveLocalSeen(merged);
      setSeen(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);

  /** Merge a transcript into the desk. Returns how many posts it held. */
  const addPaste = useCallback(
    (text: string, messageLinks: Record<string, string> = {}): number => {
      const parsed = analyzeTranscript(text);
      if (!parsed.messages.length) {
        toast.error(
          "No trade posts found. Include the message text and Discord name/time lines when available.",
        );
        return 0;
      }
      setMessages((previous) => mergeTranscripts(previous, parsed.messages));
      // Dedupe before storing: the paste-scroll-paste workflow guarantees
      // overlapping selections, and traders repost the same list constantly.
      const next = mergeBlocks(blocksRef.current, text, messageLinks);
      blocksRef.current = next;
      setStoredCount(next.length);
      setLinks(linksOf(next));
      void saveBlocks(next).then((stored) => {
        if (!stored)
          toast.warning(
            "This paste is available for this session, but could not be saved in your browser.",
          );
      });
      setRaw("");
      setEditor(null);
      if (parsed.orphanLines)
        toast.warning(
          `Ignored ${parsed.orphanLines} lines above the first Discord name.`,
        );
      toast.success(`Read ${parsed.messages.length} posts. Matching updated.`);
      return parsed.messages.length;
    },
    [],
  );
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    try {
      addPaste(
        (await Promise.all(files.map((file) => file.text()))).join("\n"),
      );
    } catch {
      toast.error("Could not read those text files.");
    } finally {
      input.value = "";
    }
  };
  const loadInventory = useCallback(async (name: string) => {
    const nick = name.trim();
    if (!nick) return;
    setLoadingInv(true);
    try {
      const entries = await fetchInventoryByNickname(nick);
      setOwned(entries);
      setGive(new Set());
      setEditor(null);
      toast.success(`Loaded ${entries.length} objekts for ${nick}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load inventory.",
      );
    } finally {
      setLoadingInv(false);
    }
  }, []);

  // Posts handed over by the capture extension, which injects a script into
  // this tab rather than making the user download and re-import a file. The
  // protocol and the reason for the handshake are in `extension-handoff.ts`.
  const ownedCount = useRef(0);
  ownedCount.current = owned.length;
  useEffect(() => {
    if (!ready) return;
    const handled = new Map<string, number>();
    const post = (message: PageMessage) =>
      window.postMessage(message, window.location.origin);
    const onMessage = (event: MessageEvent) => {
      // Only this window: an injected script posts as the page itself, while
      // a frame or an opener on another origin cannot pass both checks.
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const message = readExtensionMessage(event.data);
      if (!message) return;
      if (message.type === "hello") {
        post({ source: PAGE_SOURCE, type: "ready" });
        return;
      }
      // Presence and hunt replies are the bridge's, handled where they are
      // asked for (`use-extension-presence`, `send-hunt`).
      if (message.type !== "import") return;
      let posts = handled.get(message.id);
      if (posts === undefined) {
        posts = addPaste(message.transcript, message.links);
        handled.set(message.id, posts);
        // Every new delivery opens its own search, including in an existing
        // desk tab with old selections. Saved personal wants stay separate.
        setTheirSearch(message.wants.trim().replace(/\s*\n\s*/g, ", "));
        setMode("wtt");
        setGive(new Set());
        setGet(new Set());
        if (message.wants.trim())
          setWanting((previous) =>
            previous.trim() ? previous : message.wants,
          );
        const nick = message.nickname.trim();
        if (nick) {
          setNickname(nick);
          if (!ownedCount.current) void loadInventory(nick);
        }
      }
      post({ source: PAGE_SOURCE, type: "received", id: message.id, posts });
    };
    window.addEventListener("message", onMessage);
    post({ source: PAGE_SOURCE, type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [ready, addPaste, loadInventory]);

  /**
   * Open a hunt: a one-shot search handed over from a grid ("what am I
   * missing") via `/match?hunt=1…`. Mirrors the extension delivery above —
   * a new search, fresh selections — but leaves the saved want list alone.
   * Offers only replace the typed haves in WTT; a WTB hunt never assumes the
   * user will give anything up.
   */
  const applyHunt = useCallback(
    (hunt: HuntParams) => {
      setMode(hunt.mode);
      setSort(hunt.mode === "wtb" ? "price" : "popular");
      setTheirSearch(hunt.wants.join(", "));
      setGive(new Set());
      setGet(new Set());
      if (hunt.mode === "wtt") setOffering(hunt.offers.join("\n"));
      const nick = hunt.nickname.trim();
      if (nick) {
        setNickname(nick);
        if (!ownedCount.current) void loadInventory(nick);
      }
      track("match_hunt_applied", {
        mode: hunt.mode,
        wants: hunt.wants.length,
        offers: hunt.offers.length,
      });
    },
    [loadInventory],
  );

  // Applied only once `ready` is true so it lands after the localStorage
  // restore, then stripped from the URL so a reload keeps the user's edits.
  useEffect(() => {
    if (!ready) return;
    const hunt = readHuntParams(new URLSearchParams(window.location.search));
    if (!hunt) return;
    window.history.replaceState(
      window.history.state,
      "",
      stripHuntParams(window.location.href),
    );
    applyHunt(hunt);
  }, [ready, applyHunt]);

  const mine = useMemo(
    () =>
      keyedItems([
        ...owned.map(
          (item): ParsedItem => ({
            member: item.member,
            season: item.season,
            collectionNo: stripVariantSuffix(item.collectionNo),
            raw: item.collectionId,
          }),
        ),
        ...parseOffering(offering),
      ]),
    [owned, offering],
  );
  const savedWants = useMemo(
    () => keyedItems(parseOffering(wanting)),
    [wanting],
  );
  const enriched = useMemo(
    () =>
      messages.map((message) => {
        const state = imports.get(message.key);
        if (state?.status !== "loaded") return message;
        return {
          ...message,
          haves: [
            ...keyedItems([
              ...message.haves,
              ...state.imports.flatMap((list) =>
                list.items.map(externalItemToParsed),
              ),
            ]).values(),
          ],
        };
      }),
    [messages, imports],
  );
  // A trader's updated list replaces the one it updated before anything is
  // hidden, so marking the newest handled cannot bring an older copy back.
  const current = useMemo(
    () => latestDeskPosts(indexDeskPosts(enriched)),
    [enriched],
  );
  // Triaged posts and muted traders drop out of the whole desk, not just the
  // contact list: a post the user has dealt with should not keep contributing
  // cards to the grids either.
  const indexed = useMemo(() => {
    if (!hideSeen) return current;
    return current.filter((post) => {
      const ids = seenIds.get(post.message.key);
      if (!ids) return true;
      return !seen.has(ids.post) && !seen.has(ids.author);
    });
  }, [current, hideSeen, seen, seenIds]);
  const hiddenCount = current.length - indexed.length;
  const allTheirItems = useMemo(() => {
    const items = new Map(savedWants);
    for (const post of indexed)
      for (const [key, item] of post.haves) items.set(key, item);
    return items;
  }, [indexed, savedWants]);
  const activeGive = useMemo(
    () => new Set([...give].filter((key) => mine.has(key))),
    [give, mine],
  );
  const theirQuery = useMemo(() => parseDeskQuery(theirSearch), [theirSearch]);
  const searchingTheirCards = mode !== "wts" && theirSearch.trim().length > 0;
  const matchesTheirSearch = useCallback(
    (post: DeskPost) =>
      !searchingTheirCards ||
      [...post.haves.values()].some((item) =>
        matchesDeskQuery(item, theirQuery),
      ),
    [searchingTheirCards, theirQuery],
  );
  // Posts matching both sides' picks: the traders to contact.
  const candidates = useMemo(
    () =>
      selectDeskPosts(indexed, mode, activeGive, get).filter(
        matchesTheirSearch,
      ),
    [indexed, mode, activeGive, get, matchesTheirSearch],
  );
  // Each grid is narrowed only by the picks on the other side. Narrowing it by
  // its own picks too made every card picked there hide or zero the rest of
  // that same grid — pick a card nobody wants and every count went to 0.
  const mineCandidates = useMemo(
    () =>
      selectDeskPosts(indexed, mode, EMPTY_KEYS, get).filter(
        matchesTheirSearch,
      ),
    [indexed, mode, get, matchesTheirSearch],
  );
  const theirCandidates = useMemo(
    () =>
      selectDeskPosts(indexed, mode, activeGive, EMPTY_KEYS).filter(
        matchesTheirSearch,
      ),
    [indexed, mode, activeGive, matchesTheirSearch],
  );
  // The whole mode pool, ignoring every pick: the tie-break for card order and
  // the lowest price in wtb.
  const pool = useMemo(
    () => selectDeskPosts(indexed, mode, EMPTY_KEYS, EMPTY_KEYS),
    [indexed, mode],
  );
  const poolDemand = useMemo(() => collectDeskCards(pool, "wants"), [pool]);
  const poolSupply = useMemo(() => collectDeskCards(pool, "haves"), [pool]);
  const offered = useMemo(
    () => collectDeskCards(theirCandidates, "haves"),
    [theirCandidates],
  );
  const demanded = useMemo(
    () => collectDeskCards(mineCandidates, "wants"),
    [mineCandidates],
  );
  // "Your side": most wants first.
  const myCards = useMemo(
    () =>
      byTraders(
        [...mine].flatMap(([key, item]): DeskCard[] => {
          const posts = demanded.get(key)?.posts ?? [];
          if (
            mode === "wtt" &&
            get.size > 0 &&
            posts.length === 0 &&
            !activeGive.has(key)
          )
            return [];
          return [{ key, item, posts }];
        }),
        poolDemand,
      ),
    [mine, demanded, poolDemand, activeGive, get, mode],
  );
  // "From your Discord paste": most haves first, unless another sort is chosen.
  const theirCards = useMemo(() => {
    const ranked = byTraders([...offered.values()], poolSupply);
    if (sort === "member")
      return ranked.sort((a, b) =>
        deskLabel(a.item).localeCompare(deskLabel(b.item), undefined, {
          numeric: true,
        }),
      );
    if (sort === "price" && mode === "wtb") {
      const price = (card: DeskCard) =>
        Math.min(
          ...(poolSupply.get(card.key)?.posts ?? card.posts).map(
            (post) =>
              askingPrice(post.message.pricing, card.key)?.amount ??
              Number.POSITIVE_INFINITY,
          ),
        );
      const prices = new Map(ranked.map((card) => [card.key, price(card)]));
      // Stable, so equal prices keep the most-haves order.
      return ranked.sort((a, b) => {
        const pa = prices.get(a.key) ?? Number.POSITIVE_INFINITY;
        const pb = prices.get(b.key) ?? Number.POSITIVE_INFINITY;
        return pa === pb ? 0 : pa < pb ? -1 : 1;
      });
    }
    return ranked;
  }, [offered, poolSupply, sort, mode]);
  const contactPosts = useMemo(
    () =>
      candidates
        .filter((post) => {
          if (mode === "wtb") return post.haves.size > 0;
          return [...post.wants.keys()].some((key) => mine.has(key));
        })
        .sort((a, b) => {
          const score = (post: DeskPost) =>
            [...post.wants.keys()].filter((key) => mine.has(key)).length;
          return score(b) - score(a);
        }),
    [candidates, mine, mode],
  );
  const searchSummary = !searchingTheirCards
    ? null
    : loadingInv && mode === "wtt"
      ? `Checking your inventory for trades matching “${theirSearch}”…`
      : mode === "wtt" && mine.size === 0
        ? `Searching for “${theirSearch}”. Add your objekts to check who wants something you own.`
        : candidates.length === 0
          ? `No ${mode === "wtb" ? "WTS" : "WTT"} posts in this paste offer cards matching “${theirSearch}”${activeGive.size || get.size ? " with your current selections" : ""}. Try clearing selections or importing more posts.`
          : mode === "wtt" && contactPosts.length === 0
            ? `No mutual trades found for “${theirSearch}” in this paste. ${candidates.length} WTT post${candidates.length === 1 ? " offers" : "s offer"} matching cards, but none lists any of your objekts in return.`
            : `${contactPosts.length} ${mode === "wtb" ? "WTS" : "WTT"} post${contactPosts.length === 1 ? " offers" : "s offer"} cards matching “${theirSearch}”${mode === "wtt" ? ` and ${contactPosts.length === 1 ? "lists" : "list"} objekts you own in return` : ""}.`;
  const linkedPosts = useMemo(
    () => indexed.filter((post) => post.message.listLinks.length > 0),
    [indexed],
  );
  const linkedListCount = useMemo(
    () =>
      linkedPosts.reduce(
        (count, post) => count + post.message.listLinks.length,
        0,
      ),
    [linkedPosts],
  );
  const linkedListProgress = useMemo(() => {
    let loading = 0;
    let loaded = 0;
    let failed = 0;
    for (const post of linkedPosts) {
      const state = imports.get(post.message.key);
      if (!state) continue;
      if (state.status === "loading") loading += state.links.length;
      else {
        loaded += state.imports.length;
        failed += state.errors.length;
      }
    }
    return { loading, loaded, failed };
  }, [imports, linkedPosts]);
  const linkedListRemaining =
    linkedListCount - linkedListProgress.loaded - linkedListProgress.failed;
  const images = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of owned) {
      const key = objektKey(item);
      if (key && item.thumbnailImage) map.set(key, item.thumbnailImage);
    }
    for (const state of imports.values())
      if (state.status === "loaded")
        for (const list of state.imports)
          for (const item of list.items) {
            const key = objektKey(item);
            if (key && item.imageUrl) map.set(key, item.imageUrl);
          }
    return map;
  }, [owned, imports]);

  /** Load every linked public list, four posts at a time. */
  const loadAllLinkedLists = useCallback((posts: DeskPost[]) => {
    const pending = posts.filter(
      (post) =>
        post.message.listLinks.length > 0 &&
        !importStarted.current.has(post.message.key),
    );
    if (!pending.length) return;
    for (const post of pending) importStarted.current.add(post.message.key);
    setImports((previous) => {
      const next = new Map(previous);
      for (const post of pending)
        next.set(post.message.key, {
          status: "loading",
          links: post.message.listLinks,
        });
      return next;
    });
    const version = generation.current;
    let paused = false;
    const deferred: DeskPost[] = [];
    const load = async (post: DeskPost) => {
      const results = await Promise.allSettled(
        post.message.listLinks.map(async (link) => {
          const response = await fetch(
            `/api/external-lists?url=${encodeURIComponent(link.url)}`,
          );
          if (response.status === 429 || response.status === 503)
            throw new ListImportsPausedError();
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error ?? "Could not import list.");
          return data as ExternalListImport;
        }),
      );
      if (generation.current !== version) return;
      // A list the server declined to fetch isn't unavailable, just not yet.
      // Hand the whole post back; any of its lists that did load are cached
      // server-side, so the retry costs nothing extra.
      if (
        results.some(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof ListImportsPausedError,
        )
      ) {
        paused = true;
        deferred.push(post);
        return;
      }
      const loaded: ExternalListImport[] = [];
      const errors: { link: ExternalListLink; message: string }[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") loaded.push(result.value);
        else
          errors.push({
            link: post.message.listLinks[i],
            message:
              result.reason instanceof Error
                ? result.reason.message
                : "Could not import list.",
          });
      });
      setImports((previous) =>
        new Map(previous).set(post.message.key, {
          status: "loaded",
          links: post.message.listLinks,
          imports: loaded,
          errors,
        }),
      );
    };
    let next = 0;
    const worker = async () => {
      while (!paused && next < pending.length) await load(pending[next++]);
    };
    void Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, worker),
    ).then(() => {
      if (!paused || generation.current !== version) return;
      // Posts that were declined or never started go back to "not loaded",
      // which brings back the button to load the rest.
      const retry = [...deferred, ...pending.slice(next)];
      for (const post of retry) importStarted.current.delete(post.message.key);
      setImports((previous) => {
        const cleared = new Map(previous);
        for (const post of retry) cleared.delete(post.message.key);
        return cleared;
      });
      toast.error("List imports are busy. Try again in a minute.");
    });
  }, []);

  const checkInventory = async (post: DeskPost) => {
    const nick = post.message.nickname;
    if (!nick || verified.get(nick)?.status === "pending") return;
    const version = generation.current;
    setVerified((prev) => new Map(prev).set(nick, { status: "pending" }));
    try {
      const inventory = await fetchInventoryForVerification(nick);
      if (version === generation.current)
        setVerified((prev) =>
          new Map(prev).set(
            nick,
            buildVerification(post.message.haves, inventory),
          ),
        );
    } catch (error) {
      if (version === generation.current)
        setVerified((prev) =>
          new Map(prev).set(nick, {
            status: "failed",
            reason:
              error instanceof Error
                ? error.message
                : "Could not check inventory.",
          }),
        );
    }
  };
  const clearPastes = () => {
    generation.current++;
    importStarted.current.clear();
    setMessages([]);
    blocksRef.current = [];
    setStoredCount(0);
    setLinks(new Map());
    void clearBlocks();
    setImports(new Map());
    setVerified(new Map());
    setGive(new Set());
    setGet(new Set());
    setSavedPicks([]);
    setTheirSearch("");
    setOpenPost(null);
    setConfirmClear(false);
    try {
      localStorage.removeItem(PICKED_KEY);
    } catch {
      /* Session already cleared. */
    }
  };
  const markSeen = (messageKey: string, kind: SeenKind) => {
    const ids = seenIds.get(messageKey);
    if (!ids) return;
    const id = kind === "author" ? ids.author : ids.post;
    const next = new Set(seen).add(id);
    setSeen(next);
    saveLocalSeen(next);
    if (userId) void pushRemoteSeen([id]);
    toast.success(
      kind === "author" ? "Trader muted." : "Post marked as handled.",
      {
        action: {
          label: "Undo",
          onClick: () => {
            const undone = new Set(next);
            undone.delete(id);
            setSeen(undone);
            saveLocalSeen(undone);
            if (userId) void dropRemoteSeen([id]);
          },
        },
      },
    );
  };
  const clearSeen = () => {
    setSeen(EMPTY_SEEN);
    saveLocalSeen(EMPTY_SEEN);
    if (userId) void clearRemoteSeen();
  };
  const toggleHideSeen = () => {
    const next = !hideSeen;
    setHideSeen(next);
    saveHideSeen(next);
  };
  const changeMode = (next: DeskMode) => {
    setMode(next);
    setGive(new Set());
    setGet(new Set());
    setSort(next === "wtb" ? "price" : "popular");
  };
  const toggleGive = (key: string) =>
    setGive((previous) => toggle(previous, key));
  const toggleGet = (key: string) =>
    setGet((previous) => toggle(previous, key));
  const useSavedWants = () => {
    setGet(
      new Set([
        ...savedWants.keys(),
        ...savedPicks.filter((key) => allTheirItems.has(key)),
      ]),
    );
    setEditor(null);
  };
  const saveSelection = async () => {
    const items = [...get].flatMap((key) =>
      allTheirItems.get(key) ? [allTheirItems.get(key) as ParsedItem] : [],
    );
    if (!items.length) return;
    setBuilding(true);
    try {
      const wants = await resolveForPoster(items);
      const stash = encodeGridTradeStash({
        username: "",
        cosmoId: nickname.trim(),
        haves: [],
        wants,
        date: new Date().toLocaleDateString("en-GB"),
        haveTitle: "Have",
        wantTitle: "Want",
      });
      window.location.href = `${sectionHref("/list")}?prefill=grid#${GRID_TRADE_HASH_PARAM}=${stash}`;
    } catch {
      toast.error("Could not create the list draft.");
      setBuilding(false);
    }
  };
  const focusedMatch = useMemo(() => {
    const message = enriched.find((post) => post.key === openPost);
    if (!message) return null;
    const offeredMine =
      mode === "wtb"
        ? []
        : [...mine]
            .filter(([key]) => activeGive.size === 0 || activeGive.has(key))
            .map(([, item]) => item);
    return matchTranscript(
      [message],
      indexOwned(offeredMine),
      mode === "wts" ? EMPTY_KEYS : get,
    )[0];
  }, [enriched, openPost, mine, activeGive, get, mode]);
  const selectionCount = activeGive.size + get.size;
  const needsInventory = mode !== "wtb" && mine.size === 0;
  const contactTitle =
    mode === "wts"
      ? "Buyers for your objekts"
      : mode === "wtb"
        ? "Sellers to contact"
        : "Traders to contact";
  const contactProps = {
    posts: contactPosts,
    mode,
    mine,
    give: activeGive,
    get,
    onOpen: setOpenPost,
    images,
    wanted: new Set([...savedWants.keys(), ...savedPicks]),
    onCheck: checkInventory,
    verified,
    onMarkSeen: markSeen,
    canMarkSeen: seenIds.size > 0,
    search: searchingTheirCards ? theirQuery : null,
    links,
    emptyText:
      searchSummary ??
      (mode === "wtt" && mine.size === 0
        ? "Add your objekts to check who wants something you own."
        : undefined),
  };
  // Lowest asking price for a card in "Their objekts" — wtb only, where a
  // price matters more than a trader count. Every other mode badges the
  // count instead; see `theirBadge` below.
  const priceCaption = (card: DeskCard) => {
    const prices = card.posts
      .flatMap((post) => {
        const price = askingPrice(post.message.pricing, card.key);
        return price ? [price] : [];
      })
      .sort((a, b) => a.amount - b.amount);
    return prices[0] ? `From ${formatPrice(prices[0])}` : "Ask for price";
  };
  // "My objekts": how many traders want each of the viewer's own cards — a
  // "want" badge, colored to match "Your side" above the grid.
  const traders = (card: DeskCard) => traderCount(card.posts);
  const mineBadge = (card: DeskCard): DeskBadge => {
    const count = traders(card);
    const who = mode === "wts" ? "buyer" : "trader";
    const plural = count === 1 ? "" : "s";
    const wants = count === 1 ? "wants" : "want";
    const rest = mode === "wts" ? "to buy this" : "this";
    return {
      kind: "count",
      count,
      tone: "want",
      full: `${count} ${who}${plural} ${wants} ${rest}`,
    };
  };
  // "Their objekts": how many traders have each card to offer — a "have"
  // badge, colored to match "From your Discord paste" above the grid. wtb
  // shows the asking price instead; a count of sellers is not what a buyer
  // is scanning for.
  const theirBadge = (card: DeskCard): DeskBadge => {
    if (mode === "wtb") return { kind: "text", text: priceCaption(card) };
    const count = traders(card);
    return {
      kind: "count",
      count,
      tone: "have",
      full: `${count} trader${count === 1 ? "" : "s"} ${count === 1 ? "has" : "have"} this`,
    };
  };

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 px-1 pb-12 sm:px-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Find your next trade
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste or capture your Discord trade channels — see who has what
            you’re missing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditor("mine")}>
            My lists
          </Button>
          <Button onClick={() => setEditor("paste")}>
            <ClipboardPasteIcon className="size-4" />
            {messages.length ? "Add posts" : "Paste Discord posts"}
          </Button>
        </div>
      </header>
      {ready && messages.length === 0 && !installCtaDismissed && (
        <InstallCta
          onDismiss={() => {
            setInstallCtaDismissed(true);
            try {
              localStorage.setItem(INSTALL_CTA_KEY, "1");
            } catch {
              /* Dismissed for this session only. */
            }
          }}
        />
      )}
      <section className="space-y-3" aria-label="Trading mode">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset
            className="inline-flex rounded-xl border bg-muted/50 p-1"
            aria-label="Choose WTT, WTB or WTS"
          >
            {MODES.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={mode === id ? "default" : "ghost"}
                aria-pressed={mode === id}
                onClick={() => changeMode(id)}
                className="min-w-24 rounded-lg"
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <label className="flex items-center gap-2" htmlFor="desk-columns">
              Per row
              <select
                id="desk-columns"
                value={columns}
                onChange={(event) => setColumns(Number(event.target.value))}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                {COLUMN_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
            <span>{messages.length.toLocaleString()} pasted posts</span>
            {messages.length > 0 ? (
              <button
                type="button"
                className="underline underline-offset-4 hover:text-foreground"
                onClick={() => setConfirmClear(true)}
              >
                Clear posts
              </button>
            ) : (
              <button
                type="button"
                className="underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  if (!mine.size)
                    setOffering("JiYeon CC102\nXinyu CC101\nNien CC301");
                  addPaste(SAMPLE);
                }}
              >
                Try a sample
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {MODES.find((entry) => entry.id === mode)?.hint}
        </p>
      </section>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"
        aria-live="polite"
      >
        <p className="text-sm">
          {needsInventory ? (
            <>
              <span className="block font-semibold">
                {loadingInv
                  ? "Loading your Cosmo inventory…"
                  : mode === "wtt"
                    ? "Add your haves to find mutual trades"
                    : "Add your haves to find buyers"}
              </span>
              <span className="text-muted-foreground">
                {loadingInv
                  ? "Matches will update when your cards are loaded."
                  : mode === "wtt"
                    ? "Load your Cosmo inventory or type the objekts you can offer. We’ll check who offers the cards you’re looking for and wants something you own in return."
                    : "Load your Cosmo inventory or type the objekts you can sell to find buyers who want them."}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">
                {contactPosts.length}{" "}
                {mode === "wtb" ? "WTS" : mode === "wts" ? "WTB" : "WTT"} post
                {contactPosts.length === 1 ? "" : "s"}
              </span>
              {selectionCount
                ? " match your selections"
                : mode === "wtb"
                  ? " with cards for sale"
                  : " want cards you have"}
              {searchingTheirCards && ` matching “${theirSearch}”`}.{" "}
              {selectionCount > 1 && (
                <span className="text-muted-foreground">
                  Each post matches at least one selected card on each side.
                </span>
              )}
            </>
          )}
          {storedCount >= MAX_BLOCKS && (
            <span className="text-muted-foreground">
              Holding the most recent {MAX_BLOCKS.toLocaleString()} posts; older
              ones are dropped as you paste.
            </span>
          )}
        </p>
        <div className="flex gap-2">
          {needsInventory && (
            <Button
              size="sm"
              disabled={loadingInv}
              onClick={() => setEditor("mine")}
            >
              Add haves or Cosmo inventory
            </Button>
          )}
          {(hiddenCount > 0 || (!hideSeen && seen.size > 0)) && (
            <Button size="sm" variant="ghost" onClick={toggleHideSeen}>
              {hideSeen ? `Show ${hiddenCount} handled` : "Hide handled posts"}
            </Button>
          )}
          {!hideSeen && seen.size > 0 && (
            <Button size="sm" variant="ghost" onClick={clearSeen}>
              Clear handled list
            </Button>
          )}
          {selectionCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGive(new Set());
                setGet(new Set());
              }}
            >
              Clear selections
            </Button>
          )}
          {mode !== "wts" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                resultsRef.current?.scrollIntoView({ block: "start" })
              }
            >
              See {mode === "wtb" ? "sellers" : "traders"}
              <ArrowDownIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {/* Stretched, not top-aligned: the two sides are read against each
          other, and panels of different heights made that harder. */}
      <div className="grid gap-4 md:grid-cols-2">
        <section
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
          aria-label={mode === "wtb" ? "Buying list" : "My objekts"}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                {mode === "wtb" ? "Your selection" : "Your side"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {mode === "wtb"
                  ? "I want to buy"
                  : mode === "wts"
                    ? "I want to sell"
                    : "My objekts"}
              </h2>
            </div>
            {mode !== "wtb" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditor("mine")}
              >
                <PlusIcon className="size-4" />
                {mine.size ? "Edit" : "Add objekts"}
              </Button>
            )}
          </div>
          {mode === "wtb" ? (
            <>
              <SelectionTray
                selected={get}
                items={allTheirItems}
                onToggle={toggleGet}
                empty="Choose cards for sale on the right →"
              />
              <div className="space-y-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                <p>You don’t need to offer any objekts to buy.</p>
                <p>
                  Compare the prices under each seller, then use their Discord
                  name button to copy their username and arrange the purchase.
                </p>
              </div>
              {(savedWants.size > 0 || savedPicks.length > 0) && (
                <Button variant="outline" onClick={useSavedWants}>
                  Use my saved wants
                </Button>
              )}
              {get.size > 0 && (
                <Button
                  variant="ghost"
                  disabled={building}
                  onClick={saveSelection}
                >
                  {building ? "Building…" : "Save selection as a list"}
                </Button>
              )}
            </>
          ) : (
            <>
              <SelectionTray
                selected={activeGive}
                items={mine}
                onToggle={toggleGive}
                empty={
                  mode === "wts"
                    ? "Select a card to find cash buyers"
                    : "Select a card to see what you could get"
                }
              />
              <p className="text-xs text-muted-foreground">
                {mode === "wtt" && get.size
                  ? "Showing your cards wanted by traders who have your selection."
                  : "Cards with interested people appear first."}
              </p>
              {mine.size === 0 ? (
                <div className="space-y-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {mode === "wtt"
                      ? "Your haves help narrow down which traders can offer the objekts you want in return."
                      : "Add your haves to see which buyers want your objekts."}
                  </p>
                  <Button
                    disabled={loadingInv}
                    onClick={() => setEditor("mine")}
                  >
                    {loadingInv ? "Loading inventory…" : "Add my objekts"}
                  </Button>
                </div>
              ) : (
                <DeskGrid
                  cards={myCards}
                  selected={activeGive}
                  onToggle={toggleGive}
                  images={images}
                  side="mine"
                  badge={mineBadge}
                  emptyText="None of your cards match these traders’ wants. Remove a selection on the right to see your collection again."
                  columns={columns}
                  poolKey={`${mode}|${mine.size}|${pool.length}`}
                />
              )}
            </>
          )}
        </section>
        <section
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
          aria-label={mode === "wts" ? "Cash buyers" : "Their objekts"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                From your Discord paste
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {mode === "wts"
                  ? contactTitle
                  : mode === "wtb"
                    ? "Objekts for sale"
                    : "Their objekts"}
              </h2>
            </div>
            {mode !== "wts" && (
              <select
                aria-label="Sort their objekts"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="popular">Most haves</option>
                <option value="member">Member</option>
                {mode === "wtb" && <option value="price">Lowest price</option>}
              </select>
            )}
          </div>
          {mode === "wts" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Cash buyers only. Copy a name to contact them in Discord.
              </p>
              <ContactResults {...contactProps} />
            </>
          ) : (
            <>
              {mode === "wtt" && (
                <SelectionTray
                  selected={get}
                  items={allTheirItems}
                  onToggle={toggleGet}
                  empty="Select a card to see what they want from you"
                />
              )}
              {mode === "wtt" &&
                (savedWants.size > 0 || savedPicks.length > 0) && (
                  <button
                    type="button"
                    className="text-xs text-primary underline underline-offset-4"
                    onClick={useSavedWants}
                  >
                    Use my saved wants
                  </button>
                )}
              <p className="text-xs text-muted-foreground">
                {mode === "wtb"
                  ? "Asking prices appear on each card. Select one to compare its sellers below."
                  : activeGive.size
                    ? "Only offers from traders who want your selected cards."
                    : "Choose either side to start. Offers update as you select cards."}
              </p>
              {searchSummary && (
                <p
                  role="status"
                  className="rounded-lg border bg-muted/30 p-3 text-sm"
                  data-testid="search-match-summary"
                >
                  {searchSummary}
                </p>
              )}
              {messages.length === 0 ? (
                <div className="space-y-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Paste the trade channel or import your text files.
                  </p>
                  <Button onClick={() => setEditor("paste")}>
                    Import Discord posts
                  </Button>
                </div>
              ) : (
                <DeskGrid
                  cards={theirCards}
                  selected={get}
                  onToggle={toggleGet}
                  images={images}
                  side="theirs"
                  search={theirSearch}
                  onSearchChange={setTheirSearch}
                  clearFilters={
                    theirSearch.trim() || activeGive.size || get.size
                      ? () => {
                          setTheirSearch("");
                          setGive(new Set());
                          setGet(new Set());
                        }
                      : undefined
                  }
                  badge={theirBadge}
                  emptyText={
                    mode === "wtb"
                      ? "No listed sale cards match. Remove a selection, open a linked list below, or add WTS posts."
                      : "No offers connect these selections yet. Remove a card, open a linked list below, or add more posts."
                  }
                  columns={columns}
                  poolKey={`${mode}|${pool.length}`}
                />
              )}
            </>
          )}
          {linkedPosts.length > 0 && (
            <div className="rounded-lg border bg-background px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-2xl space-y-1">
                  <p className="text-sm font-medium">
                    {linkedListCount} linked{" "}
                    {linkedListCount === 1 ? "list" : "lists"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Found public Objekt.top and Apollo.cafe lists in these
                    posts. Load them to include the cards traders list there and
                    surface more possible matches.
                  </p>
                </div>
                {linkedListProgress.loading > 0 ? (
                  <Button size="sm" disabled>
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading{" "}
                    {linkedListProgress.loaded + linkedListProgress.failed} of{" "}
                    {linkedListCount}
                  </Button>
                ) : linkedListProgress.loaded + linkedListProgress.failed <
                  linkedListCount ? (
                  <Button
                    size="sm"
                    onClick={() => loadAllLinkedLists(linkedPosts)}
                  >
                    {linkedListProgress.loaded + linkedListProgress.failed > 0
                      ? `Load ${linkedListRemaining} more ${linkedListRemaining === 1 ? "list" : "lists"}`
                      : `Load all ${linkedListCount} ${linkedListCount === 1 ? "list" : "lists"}`}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {linkedListProgress.loaded}{" "}
                    {linkedListProgress.loaded === 1 ? "list" : "lists"} loaded
                    {linkedListProgress.failed > 0 &&
                      ` · ${linkedListProgress.failed} unavailable`}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {mode !== "wts" && (
        <section
          ref={resultsRef}
          className="scroll-mt-20 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
          aria-label={contactTitle}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {contactTitle}{" "}
                <span className="text-muted-foreground">
                  ({contactPosts.length})
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "wtb"
                  ? "Prices belong to each seller. Copy their name to arrange the purchase in Discord."
                  : "See what they want from you and browse what you could get. Review the post for ratios and conditions."}
              </p>
            </div>
            {mode === "wtt" && get.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={building}
                onClick={saveSelection}
              >
                Save wants as a list
              </Button>
            )}
          </div>
          <ContactResults {...contactProps} />
        </section>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editor === "mine" ? "Your trade lists" : "Import Discord posts"}
            </DialogTitle>
            <DialogDescription>
              {editor === "mine"
                ? "Add the cards you can offer. Your typed lists stay in this browser."
                : "Paste message text with the Discord name/time lines, or import several text files. Repeated posts are combined."}
            </DialogDescription>
          </DialogHeader>
          {editor === "mine" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="cosmo-nickname" className="text-sm font-medium">
                  Load my Cosmo inventory
                </label>
                <div className="flex gap-2">
                  <Input
                    id="cosmo-nickname"
                    placeholder="Cosmo nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Enter" && void loadInventory(nickname)
                    }
                  />
                  <Button
                    disabled={loadingInv || !nickname.trim()}
                    onClick={() => loadInventory(nickname)}
                  >
                    {loadingInv ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      "Load"
                    )}
                  </Button>
                </div>
                {owned.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {owned.length} loaded ·{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setOwned([]);
                        setGive(new Set());
                      }}
                    >
                      Remove loaded inventory
                    </button>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="my-haves" className="text-sm font-medium">
                  Or type what I have
                </label>
                <Textarea
                  id="my-haves"
                  rows={5}
                  placeholder={"JiYeon CC102\nXinyu CC101\nNien CC301"}
                  value={offering}
                  onChange={(event) => setOffering(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {mine.size} distinct cards available to select on your side.
                </p>
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  My saved wants (optional)
                </summary>
                <label
                  htmlFor="my-wants"
                  className="mt-3 block text-sm text-muted-foreground"
                >
                  Save cards to compare later, or select them from the
                  right-hand grid.
                </label>
                <Textarea
                  id="my-wants"
                  className="mt-2"
                  rows={4}
                  placeholder="SeoYeon CC101"
                  value={wanting}
                  onChange={(event) => setWanting(event.target.value)}
                />
                {mode !== "wts" && savedWants.size > 0 && (
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={useSavedWants}
                  >
                    Select these wants
                  </Button>
                )}
              </details>
              <Button className="w-full" onClick={() => setEditor(null)}>
                Done — show my cards
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                aria-label="Discord posts"
                rows={9}
                placeholder={
                  "trader — 3:41 PM\nHAVE\nSeoYeon CC101\nWANT\nJiYeon CC102"
                }
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
              />
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.text,.md,text/plain"
                multiple
                className="hidden"
                onChange={importFiles}
                aria-label="Import text files"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!raw.trim()} onClick={() => addPaste(raw)}>
                  <ClipboardPasteIcon className="size-4" />
                  Add posts
                </Button>
                <Button
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                >
                  Import text files
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your pasted text stays in this browser. You can choose to load
                any linked public lists together after importing posts.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PostDialog
        match={focusedMatch}
        mode={mode}
        verification={
          focusedMatch?.message.nickname
            ? verified.get(focusedMatch.message.nickname)
            : undefined
        }
        picked={get}
        onToggle={toggleGet}
        link={openPost ? links.get(openPost) : undefined}
        linkedImport={openPost ? imports.get(openPost) : undefined}
        onOpenChange={(open) => !open && setOpenPost(null)}
      />
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear {messages.length} pasted posts?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the pasted posts, imported lists and current
              selections. Your own typed haves and wants are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep posts</AlertDialogCancel>
            <AlertDialogAction onClick={clearPastes}>
              Clear posts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
