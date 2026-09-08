"use client";

import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ClipboardPasteIcon,
  Loader2Icon,
  PlusIcon,
  ShoppingBagIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
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
import type { ParsedItem } from "@/lib/paste-parser";
import { resolveForPoster } from "@/lib/poster/poster-resolver";
import { stripVariantSuffix } from "@/lib/season-prefix";
import { sectionHref } from "@/lib/sections";
import { ContactResults } from "./desk-contacts";
import { DeskGrid } from "./desk-grid";
import { PostDialog } from "./post-dialog";

const RAW_KEY = "match:raw:v1";
const NICK_KEY = "match:nickname:v1";
const OFFERING_KEY = "match:offering:v1";
const WANTING_KEY = "match:wants:v1";
const PICKED_KEY = "match:picked:v1";
const COLS_KEY = "match:columns:v1";
const COLUMN_CHOICES = [4, 5, 6, 7, 8, 10, 12] as const;
const DEFAULT_COLUMNS = 8;
const EMPTY_KEYS = new Set<string>();
const MODES = [
  {
    id: "trade",
    label: "Trade",
    icon: ArrowLeftRightIcon,
    hint: "Choose what you can give or what you want. The other side shows cards connected through the same trader.",
  },
  {
    id: "buy",
    label: "Buy",
    icon: ShoppingBagIcon,
    hint: "Pick cards for sale on the right, compare sellers below, then copy a Discord name to contact them.",
  },
  {
    id: "sell",
    label: "Sell",
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

export function MatchClient() {
  const [mode, setMode] = useState<DeskMode>("trade");
  const [raw, setRaw] = useState("");
  const [storedRaw, setStoredRaw] = useState("");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [offering, setOffering] = useState("");
  const [wanting, setWanting] = useState("");
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
  const [verified, setVerified] = useState<Map<string, VerificationState>>(
    new Map(),
  );
  const [building, setBuilding] = useState(false);
  const [sort, setSort] = useState<"popular" | "member" | "price">("popular");
  const [listLimit, setListLimit] = useState(12);
  const [columns, setColumns] = useState<number>(DEFAULT_COLUMNS);
  const importStarted = useRef(new Set<string>());
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(RAW_KEY) ?? "";
      setStoredRaw(savedRaw);
      setMessages(analyzeTranscript(savedRaw).messages);
      setOffering(localStorage.getItem(OFFERING_KEY) ?? "");
      setWanting(localStorage.getItem(WANTING_KEY) ?? "");
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
      localStorage.removeItem("match:transcript:v1");
    } catch {
      /* A disabled or full store still allows a session. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (storedRaw) localStorage.setItem(RAW_KEY, storedRaw);
      else localStorage.removeItem(RAW_KEY);
    } catch {
      toast.warning(
        "This paste is available for this session, but is too large to save in your browser.",
      );
    }
  }, [ready, storedRaw]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(OFFERING_KEY, offering);
      localStorage.setItem(WANTING_KEY, wanting);
      localStorage.setItem(NICK_KEY, nickname);
      localStorage.setItem(COLS_KEY, String(columns));
    } catch {
      /* Keep the in-memory lists usable. */
    }
  }, [ready, offering, wanting, nickname, columns]);

  const addPaste = useCallback((text: string) => {
    const parsed = analyzeTranscript(text);
    if (!parsed.messages.length) {
      toast.error(
        "No trade posts found. Include the message text and Discord name/time lines when available.",
      );
      return;
    }
    setMessages((previous) => mergeTranscripts(previous, parsed.messages));
    // Keep a headerless chunk separate from earlier named posts on reload.
    const source = parsed.headerless ? `Unknown poster — 00:00\n${text}` : text;
    setStoredRaw((previous) => (previous ? `${previous}\n${source}` : source));
    setRaw("");
    setEditor(null);
    if (parsed.orphanLines)
      toast.warning(
        `Ignored ${parsed.orphanLines} lines above the first Discord name.`,
      );
    toast.success(`Read ${parsed.messages.length} posts. Matching updated.`);
  }, []);
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
  const loadInventory = async () => {
    if (!nickname.trim()) return;
    setLoadingInv(true);
    try {
      const entries = await fetchInventoryByNickname(nickname.trim());
      setOwned(entries);
      setGive(new Set());
      setEditor(null);
      toast.success(`Loaded ${entries.length} objekts for ${nickname.trim()}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load inventory.",
      );
    } finally {
      setLoadingInv(false);
    }
  };

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
  const indexed = useMemo(() => indexDeskPosts(enriched), [enriched]);
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
  const candidates = useMemo(
    () => selectDeskPosts(indexed, mode, activeGive, get),
    [indexed, mode, activeGive, get],
  );
  const offered = useMemo(
    () => collectDeskCards(candidates, "haves"),
    [candidates],
  );
  const demanded = useMemo(
    () => collectDeskCards(candidates, "wants"),
    [candidates],
  );
  const myCards = useMemo(
    () =>
      [...mine]
        .flatMap(([key, item]): DeskCard[] => {
          const posts = demanded.get(key)?.posts ?? [];
          if (
            mode === "trade" &&
            get.size > 0 &&
            posts.length === 0 &&
            !activeGive.has(key)
          )
            return [];
          return [{ key, item, posts }];
        })
        .sort(
          (a, b) =>
            b.posts.length - a.posts.length ||
            deskLabel(a.item).localeCompare(deskLabel(b.item)),
        ),
    [mine, demanded, activeGive, get, mode],
  );
  const theirCards = useMemo(
    () =>
      [...offered.values()].sort((a, b) => {
        if (sort === "member")
          return deskLabel(a.item).localeCompare(deskLabel(b.item), undefined, {
            numeric: true,
          });
        if (sort === "price" && mode === "buy") {
          const price = (card: DeskCard) =>
            Math.min(
              ...card.posts.map(
                (post) =>
                  askingPrice(post.message.pricing, card.key)?.amount ??
                  Number.POSITIVE_INFINITY,
              ),
            );
          const pa = price(a);
          const pb = price(b);
          if (pa !== pb) return pa < pb ? -1 : 1;
        }
        return (
          b.posts.length - a.posts.length ||
          deskLabel(a.item).localeCompare(deskLabel(b.item))
        );
      }),
    [offered, sort, mode],
  );
  const contactPosts = useMemo(
    () =>
      candidates
        .filter((post) => {
          if (mode === "buy") return post.haves.size > 0;
          if (mode === "sell")
            return [...post.wants.keys()].some((key) => mine.has(key));
          if (activeGive.size || get.size) return true;
          return [...post.wants.keys()].some((key) => mine.has(key));
        })
        .sort((a, b) => {
          const score = (post: DeskPost) =>
            [...post.wants.keys()].filter((key) => mine.has(key)).length;
          return score(b) - score(a);
        }),
    [candidates, mine, mode, activeGive, get],
  );
  const linkedPosts = useMemo(
    () => indexed.filter((post) => post.message.listLinks.length > 0),
    [indexed],
  );
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

  // Fetch only after opening a post. Clearing the paste invalidates pending work.
  useEffect(() => {
    const message = messages.find((post) => post.key === openPost);
    if (!message?.listLinks.length || importStarted.current.has(message.key))
      return;
    importStarted.current.add(message.key);
    const version = generation.current;
    setImports((previous) =>
      new Map(previous).set(message.key, {
        status: "loading",
        links: message.listLinks,
      }),
    );
    void Promise.allSettled(
      message.listLinks.map(async (link) => {
        const response = await fetch(
          `/api/external-lists?url=${encodeURIComponent(link.url)}`,
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not import list.");
        return data as ExternalListImport;
      }),
    ).then((results) => {
      if (generation.current !== version) return;
      const loaded: ExternalListImport[] = [];
      const errors: { link: ExternalListLink; message: string }[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") loaded.push(result.value);
        else
          errors.push({
            link: message.listLinks[i],
            message:
              result.reason instanceof Error
                ? result.reason.message
                : "Could not import list.",
          });
      });
      setImports((previous) =>
        new Map(previous).set(message.key, {
          status: "loaded",
          links: message.listLinks,
          imports: loaded,
          errors,
        }),
      );
    });
  }, [messages, openPost]);

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
    setStoredRaw("");
    setImports(new Map());
    setVerified(new Map());
    setGive(new Set());
    setGet(new Set());
    setSavedPicks([]);
    setOpenPost(null);
    setConfirmClear(false);
    try {
      localStorage.removeItem(PICKED_KEY);
    } catch {
      /* Session already cleared. */
    }
  };
  const changeMode = (next: DeskMode) => {
    setMode(next);
    setGive(new Set());
    setGet(new Set());
    setSort(next === "buy" ? "price" : "popular");
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
      mode === "buy"
        ? []
        : [...mine]
            .filter(([key]) => activeGive.size === 0 || activeGive.has(key))
            .map(([, item]) => item);
    return matchTranscript(
      [message],
      indexOwned(offeredMine),
      mode === "sell" ? EMPTY_KEYS : get,
    )[0];
  }, [enriched, openPost, mine, activeGive, get, mode]);
  const selectionCount = activeGive.size + get.size;
  const contactTitle =
    mode === "sell"
      ? "Buyers for your objekts"
      : mode === "buy"
        ? "Sellers to contact"
        : "Traders to contact";
  const contactProps = {
    posts: contactPosts,
    mode,
    mine,
    give: activeGive,
    get,
    onOpen: setOpenPost,
    onChoose: (left: string[], right: string[]) => {
      setGive(new Set(left));
      setGet(new Set(right));
    },
    onCheck: checkInventory,
    verified,
  };
  const priceCaption = (card: DeskCard) => {
    if (mode !== "buy")
      return `${card.posts.length} trader${card.posts.length === 1 ? "" : "s"}`;
    const prices = card.posts
      .flatMap((post) => {
        const price = askingPrice(post.message.pricing, card.key);
        return price ? [price] : [];
      })
      .sort((a, b) => a.amount - b.amount);
    return prices[0] ? `From ${formatPrice(prices[0])}` : "Ask for price";
  };

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 px-1 pb-12 sm:px-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Find your next trade
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your collection. Their posts. The people who connect them.
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
      <section className="space-y-3" aria-label="Trading mode">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset
            className="inline-flex rounded-xl border bg-muted/50 p-1"
            aria-label="Choose Trade, Buy or Sell"
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
          <span className="font-semibold">
            {contactPosts.length}{" "}
            {mode === "buy" ? "seller" : mode === "sell" ? "buyer" : "trade"}{" "}
            post{contactPosts.length === 1 ? "" : "s"}
          </span>
          {selectionCount
            ? " match your selections"
            : mode === "buy"
              ? " with cards for sale"
              : " want cards you have"}
          .{" "}
          {selectionCount > 1 && (
            <span className="text-muted-foreground">
              Each post must match every selected card.
            </span>
          )}
        </p>
        <div className="flex gap-2">
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
          {mode !== "sell" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                resultsRef.current?.scrollIntoView({ block: "start" })
              }
            >
              See {mode === "buy" ? "sellers" : "traders"}
              <ArrowDownIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <section
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
          aria-label={mode === "buy" ? "Buying list" : "My objekts"}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                {mode === "buy" ? "Your selection" : "Your side"}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {mode === "buy"
                  ? "I want to buy"
                  : mode === "sell"
                    ? "I want to sell"
                    : "My objekts"}
              </h2>
            </div>
            {mode !== "buy" && (
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
          {mode === "buy" ? (
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
                  mode === "sell"
                    ? "Select a card to find cash buyers"
                    : "Select a card to see what you could get"
                }
              />
              <p className="text-xs text-muted-foreground">
                {mode === "trade" && get.size
                  ? "Showing your cards wanted by traders who have your selection."
                  : "Cards with interested people appear first."}
              </p>
              {mine.size === 0 ? (
                <div className="space-y-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Load your Cosmo inventory or type the cards you’re offering.
                  </p>
                  <Button onClick={() => setEditor("mine")}>
                    Add my objekts
                  </Button>
                </div>
              ) : (
                <DeskGrid
                  cards={myCards}
                  selected={activeGive}
                  onToggle={toggleGive}
                  images={images}
                  side="mine"
                  caption={(card) =>
                    `${card.posts.length} ${mode === "sell" ? "buying" : "want this"}`
                  }
                  emptyText="None of your cards match these traders’ wants. Remove a selection on the right to see your collection again."
                  columns={columns}
                />
              )}
            </>
          )}
        </section>
        <section
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
          aria-label={mode === "sell" ? "Cash buyers" : "Their objekts"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                From your Discord paste
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {mode === "sell"
                  ? contactTitle
                  : mode === "buy"
                    ? "Objekts for sale"
                    : "Their objekts"}
              </h2>
            </div>
            {mode !== "sell" && (
              <select
                aria-label="Sort their objekts"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="popular">Most offers</option>
                <option value="member">Member</option>
                {mode === "buy" && <option value="price">Lowest price</option>}
              </select>
            )}
          </div>
          {mode === "sell" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Cash buyers only. Copy a name to contact them in Discord.
              </p>
              <ContactResults {...contactProps} />
            </>
          ) : (
            <>
              {mode === "trade" && (
                <SelectionTray
                  selected={get}
                  items={allTheirItems}
                  onToggle={toggleGet}
                  empty="Select a card to see what they want from you"
                />
              )}
              {mode === "trade" &&
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
                {mode === "buy"
                  ? "Asking prices appear on each card. Select one to compare its sellers below."
                  : activeGive.size
                    ? "Only offers from traders who want your selected cards."
                    : "Choose either side to start. Offers update as you select cards."}
              </p>
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
                  caption={priceCaption}
                  emptyText={
                    mode === "buy"
                      ? "No listed sale cards match. Remove a selection, open a linked list below, or add WTS posts."
                      : "No offers connect these selections yet. Remove a card, open a linked list below, or add more posts."
                  }
                  columns={columns}
                />
              )}
            </>
          )}
          {linkedPosts.length > 0 && (
            <details className="rounded-lg border bg-background px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                {linkedPosts.length} linked post
                {linkedPosts.length === 1 ? "" : "s"} to explore
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Open a post to import its Objekt.top or Apollo cards. These
                lists may reveal more matches.
              </p>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {linkedPosts.slice(0, listLimit).map((post) => (
                  <button
                    type="button"
                    key={post.message.key}
                    onClick={() => setOpenPost(post.message.key)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">{post.message.author}</span>
                    <span className="shrink-0 text-xs text-primary">
                      {imports.get(post.message.key)?.status === "loaded"
                        ? "View post"
                        : "Open & import"}
                    </span>
                  </button>
                ))}
                {linkedPosts.length > listLimit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setListLimit((limit) => limit + 12)}
                  >
                    Show more linked posts
                  </Button>
                )}
              </div>
            </details>
          )}
        </section>
      </div>
      {mode !== "sell" && (
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
                {mode === "buy"
                  ? "Prices belong to each seller. Copy their name to arrange the purchase in Discord."
                  : "Each result connects one trader’s offers and wants. Copy their name to discuss the trade; ratios and conditions are in the post."}
              </p>
            </div>
            {mode === "trade" && get.size > 0 && (
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
                      event.key === "Enter" && void loadInventory()
                    }
                  />
                  <Button
                    disabled={loadingInv || !nickname.trim()}
                    onClick={loadInventory}
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
                {mode !== "sell" && savedWants.size > 0 && (
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
                Your pasted text stays in this browser. Linked public lists load
                when you open their post.
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
