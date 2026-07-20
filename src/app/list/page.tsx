"use client";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  Link2Icon,
  ListIcon,
  Loader2Icon,
  LockIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ListLinkField } from "@/components/list-link-field";
import {
  type AnyWant,
  AnyWantPicker,
} from "@/components/objekt/any-want-picker";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { ObjektInventoryPicker } from "@/components/objekt/objekt-inventory-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { AddCustomWantDialog } from "@/components/poster/add-objekt-dialog";
import { PasteListDialog } from "@/components/poster/paste-list-dialog";
import {
  getDisplayCount,
  getGridCols,
  type PosterData,
} from "@/components/poster/poster-canvas";
import {
  PosterCard,
  type PosterSummary,
} from "@/components/poster/poster-summary-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { signIn, useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { fetchInventoryByNickname } from "@/lib/cosmo-inventory";
import { compareMembers, compareSeasons } from "@/lib/filter-options";
import {
  decodeGridTradeStash,
  GRID_TRADE_HASH_PARAM,
} from "@/lib/grid-trade-stash";
import { renderPosterToCanvas } from "@/lib/poster-canvas-render";
import {
  makeAnyWantItem,
  makePosterItem,
  resolvedItemToApiInput,
} from "@/lib/poster-item";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { formatPosterAsText } from "@/lib/poster-text-format";
import { sectionAbsoluteUrl, sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface StoredItem {
  id: number;
  collectionId: string | null;
  collectionNo: string | null;
  member: string | null;
  season: string | null;
  class: string | null;
  thumbnailUrl: string | null;
  serial: number | null;
  objektId: string | null;
  quantity: number;
  freeform: boolean;
  isAny?: boolean;
  artist?: string | null;
  rawLabel: string | null;
  onOffline: string | null;
  position: number;
}

interface StoredPoster {
  id: string;
  userId: string | null;
  version: number;
  username: string | null;
  cosmoId: string | null;
  notes: string | null;
  haveTitle: string;
  wantTitle: string;
  theme: string;
  groupByMember: boolean;
  groupByNumbers: boolean;
  colsPerRow: number;
  wantsOnly?: boolean;
  haves: StoredItem[];
  wants: StoredItem[];
}

function DiscordIcon({ className }: { className: string }) {
  return (
    <svg
      className={`${className} fill-current`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function DiscordChip({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  const icon = <DiscordIcon className="h-4 w-4 shrink-0" />;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex w-fit max-w-[11rem] items-center gap-2 rounded-full bg-[#5865F2] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#4752C4]"
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <span className="inline-flex w-fit max-w-[11rem] items-center gap-2 rounded-full bg-[#5865F2] px-3 py-1.5 text-xs font-medium text-white">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function storedItemToResolved(item: StoredItem): ResolvedPosterItem {
  return {
    parsed: {
      member: item.member ?? null,
      season: item.season ?? "",
      collectionNo: item.collectionNo ?? "",
      raw:
        item.rawLabel ??
        `${item.member ?? ""} ${item.collectionNo ?? ""}`.trim(),
      ...(item.serial != null ? { serial: String(item.serial) } : {}),
      ...(item.quantity > 1 ? { quantity: item.quantity } : {}),
      ...(item.freeform ? { freeform: true as const } : {}),
      ...(item.isAny ? { isAny: true as const, class: item.class } : {}),
      ...(item.artist ? { artist: item.artist } : {}),
      ...(item.onOffline
        ? { onOffline: item.onOffline as "online" | "offline" }
        : {}),
    },
    entry: item.collectionId
      ? {
          collectionId: item.collectionId,
          collectionNo: item.collectionNo ?? "",
          member: item.member ?? "",
          season: item.season ?? "",
          class: item.class ?? "",
          thumbnailImage: item.thumbnailUrl ?? undefined,
          artist: "",
        }
      : null,
    imageUrl: item.thumbnailUrl ?? null,
  };
}

function parseCollectionNo(value: string): number {
  const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function sortResolvedItems(items: ResolvedPosterItem[]): ResolvedPosterItem[] {
  const withEntry = items.filter(
    (
      item,
    ): item is ResolvedPosterItem & {
      entry: NonNullable<ResolvedPosterItem["entry"]>;
    } => item.entry != null,
  );
  const withoutEntry = items.filter((i) => !i.entry);
  withEntry.sort((a, b) => {
    const seasonCmp = compareSeasons(a.entry.season, b.entry.season);
    if (seasonCmp !== 0) return seasonCmp;
    const colCmp =
      parseCollectionNo(a.entry.collectionNo) -
      parseCollectionNo(b.entry.collectionNo);
    if (colCmp !== 0) return colCmp;
    return compareMembers(a.entry.member, b.entry.member);
  });
  return [...withEntry, ...withoutEntry];
}

// Appends imported items, skipping ones already present (by serial for
// haves, by collection for wants) so re-pasting the same list is a no-op.
function mergeImportedItems(
  existing: ResolvedPosterItem[],
  imported: ResolvedPosterItem[],
  compareBySerial: boolean,
): ResolvedPosterItem[] {
  const result = [...existing];
  for (const item of imported) {
    if (item.entry) {
      const dup = result.some((r) => {
        if (!r.entry || r.entry.collectionId !== item.entry?.collectionId)
          return false;
        if (!compareBySerial) return true;
        const rSerial =
          r.parsed.serial != null
            ? parseInt(r.parsed.serial, 10)
            : (r.entry.serial ?? null);
        const iSerial =
          item.parsed.serial != null
            ? parseInt(item.parsed.serial, 10)
            : (item.entry.serial ?? null);
        return rSerial === iSerial;
      });
      if (dup) continue;
    }
    result.push(item);
  }
  return result;
}

function rememberCosmoUsername(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  localStorage.setItem("cosmousername", trimmed);
}

function formatPosterDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function emptyPosterData(): PosterData {
  return {
    username: "",
    cosmoId: "",
    haves: [],
    wants: [],
    notes: undefined,
    date: "",
    haveTitle: "Have",
    wantTitle: "Want",
  };
}

const STASH_KEY = "poster-draft-stash";
const COSMO_USERNAME_STORAGE_KEYS = [
  "cosmousername",
  "cosmoUsername",
  "progress-last-nickname",
];
const PICKER_GRID_CLASS = "md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";

type SearchShortcutFilters = Pick<ObjektFilterState, "member" | "season">;

const emptySearchShortcutFilters: SearchShortcutFilters = {
  member: [],
  season: [],
};

function withSearchShortcutFilters(
  filters: ObjektFilterState,
  shortcuts: SearchShortcutFilters,
): ObjektFilterState {
  return {
    ...filters,
    member: [...new Set([...filters.member, ...shortcuts.member])],
    season: [...new Set([...filters.season, ...shortcuts.season])],
  };
}

function withoutSearchShortcutFilters(
  current: ObjektFilterState,
  displayed: ObjektFilterState,
  shortcuts: SearchShortcutFilters,
): ObjektFilterState {
  return {
    ...displayed,
    member: [
      ...new Set([
        ...current.member.filter((value) => displayed.member.includes(value)),
        ...displayed.member.filter(
          (value) => !shortcuts.member.includes(value),
        ),
      ]),
    ],
    season: [
      ...new Set([
        ...current.season.filter((value) => displayed.season.includes(value)),
        ...displayed.season.filter(
          (value) => !shortcuts.season.includes(value),
        ),
      ]),
    ],
  };
}

// ── Main page ────────────────────────────────────────────────────────────────

export function CreatePosterPage({ editId: editIdProp }: { editId?: string }) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const legacyEditId = searchParams.get("edit");
  const restoreParam = searchParams.get("restore");
  const editId = editIdProp ?? legacyEditId;

  // Redirect legacy ?edit=id URLs to the canonical /list/[id]/edit route
  useEffect(() => {
    if (legacyEditId && !editIdProp) {
      router.replace(
        sectionHref(`/list/${legacyEditId}/edit`, { currentSection: "list" }),
      );
    }
  }, [editIdProp, legacyEditId, router]);

  const [cosmoId, setCosmoId] = useState("");
  const [haveNickname, setHaveNickname] = useState<string | null>(null);
  const lastSearchAt = useRef(0);
  const [posterData, setPosterData] = useState<PosterData>(emptyPosterData);
  const [editLoading, setEditLoading] = useState(!!editId);
  const [groupByMember, setGroupByMember] = useState(false);
  const [groupByNumbers, setGroupByNumbers] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [colsPerRow, setColsPerRow] = useState(5);
  const userSetCols = useRef(false);
  const [filters, setFilters] = useState<ObjektFilterState>(defaultFilters);
  const [haveSearchShortcuts, setHaveSearchShortcuts] =
    useState<SearchShortcutFilters>(emptySearchShortcutFilters);
  const [wantSearchShortcuts, setWantSearchShortcuts] =
    useState<SearchShortcutFilters>(emptySearchShortcutFilters);
  const [step, setStep] = useState<"have" | "want">("have");
  const [customWantOpen, setCustomWantOpen] = useState(false);
  const [anyWantOpen, setAnyWantOpen] = useState(false);
  const [wantsOnly, setWantsOnly] = useState(false);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const [linkedNickname, setLinkedNickname] = useState<string | null>(null);
  const [cosmoStatusLoaded, setCosmoStatusLoaded] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [inventoryWarningOpen, setInventoryWarningOpen] = useState(false);
  const [listOnlyWarningOpen, setListOnlyWarningOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const [latestPosters, setLatestPosters] = useState<PosterSummary[] | null>(
    null,
  );
  const [latestMatchCounts, setLatestMatchCounts] = useState<
    Record<string, number>
  >({});
  const [hasMounted, setHasMounted] = useState(false);

  const totalItems = posterData.haves.length + posterData.wants.length;
  const displayedHaveFilters = useMemo(
    () => withSearchShortcutFilters(filters, haveSearchShortcuts),
    [filters, haveSearchShortcuts],
  );
  const displayedWantFilters = useMemo(
    () => withSearchShortcutFilters(filters, wantSearchShortcuts),
    [filters, wantSearchShortcuts],
  );

  const handleHaveFiltersChange = useCallback(
    (next: ObjektFilterState) => {
      setFilters((current) =>
        withoutSearchShortcutFilters(current, next, haveSearchShortcuts),
      );
    },
    [haveSearchShortcuts],
  );

  const handleWantFiltersChange = useCallback(
    (next: ObjektFilterState) => {
      setFilters((current) =>
        withoutSearchShortcutFilters(current, next, wantSearchShortcuts),
      );
    },
    [wantSearchShortcuts],
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setPosterData((prev) =>
      prev.date ? prev : { ...prev, date: formatPosterDate() },
    );
  }, []);

  // Auto-disable wantsOnly if all wants are removed
  useEffect(() => {
    if (posterData.wants.length === 0 && wantsOnly) setWantsOnly(false);
  }, [posterData.wants.length, wantsOnly]);

  // Dashboard preview: only on the plain "new list" landing (not while
  // editing an existing poster, or once the user starts building one).
  useEffect(() => {
    if (editId || !session) {
      setLatestPosters(null);
      return;
    }
    let cancelled = false;
    fetch("/api/posters/mine?page=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setLatestPosters(data?.posters ?? []);
          setLatestMatchCounts(data?.matchCounts ?? {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLatestPosters([]);
          setLatestMatchCounts({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editId, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCosmoId((prev) => {
      if (prev.trim()) return prev;
      for (const key of COSMO_USERNAME_STORAGE_KEYS) {
        const saved = localStorage.getItem(key)?.trim();
        if (saved) return saved;
      }
      return prev;
    });
  }, []);

  // Restore stashed draft after Discord login redirect
  useEffect(() => {
    if (!restoreParam || !session) return;
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STASH_KEY);
    try {
      const stash = JSON.parse(raw) as {
        posterData: PosterData;
        groupByMember: boolean;
        groupByNumbers: boolean;
        colsPerRow: number;
        wantsOnly: boolean;
      };
      userSetCols.current = true;
      setGroupByMember(stash.groupByMember);
      setGroupByNumbers(stash.groupByNumbers);
      setColsPerRow(stash.colsPerRow);
      setWantsOnly(stash.wantsOnly ?? false);
      setPosterData(stash.posterData);
      setAutoSaving(true);
    } catch {
      toast.error("Could not restore your draft");
    }
  }, [restoreParam, session]);

  // Prefill from the grid board's "Trade" dialog — no session gate (unlike
  // the Discord-login restore above) since this is a same-tab handoff, and
  // no auto-save so the user can review/edit before saving. The draft arrives
  // in the URL fragment (not sessionStorage) because the grid board can live
  // on a different section subdomain.
  const prefillParam = searchParams.get("prefill");
  useEffect(() => {
    if (prefillParam !== "grid") return;
    const match = window.location.hash.match(
      new RegExp(`[#&]${GRID_TRADE_HASH_PARAM}=([^&]+)`),
    );
    if (!match) return;
    // Strip the fragment so a refresh doesn't re-apply the prefill.
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    const posterData = decodeGridTradeStash(match[1]);
    if (!posterData) {
      toast.error("Could not load your trade list");
      return;
    }
    // Same as the ?edit=id flow: seed the username and kick off the
    // inventory load so the Have picker can render the prefilled items.
    // Can't rely on localStorage having the username — the grid board may
    // be on a different section subdomain (different origin).
    if (posterData.cosmoId) {
      rememberCosmoUsername(posterData.cosmoId);
      setCosmoId(posterData.cosmoId);
      setInventoryCount(null);
      setHaveNickname(posterData.cosmoId);
    }
    setPosterData(posterData);
  }, [prefillParam]);

  // Pre-load a stored poster when ?edit=id is in the URL
  useEffect(() => {
    if (!editId) return;
    setEditLoading(true);
    fetch(`/api/posters/${editId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StoredPoster | null) => {
        if (!data) {
          toast.error("Could not load poster for editing");
          setEditLoading(false);
          return;
        }
        userSetCols.current = true;
        setGroupByMember(data.groupByMember);
        setGroupByNumbers(data.groupByNumbers);
        setColsPerRow(data.colsPerRow);
        setWantsOnly(data.wantsOnly ?? false);
        if (data.cosmoId) {
          setCosmoId(data.cosmoId);
          setInventoryCount(null);
          setHaveNickname(data.cosmoId);
        }
        setPosterData({
          username: data.username ?? "",
          cosmoId: data.cosmoId ?? "",
          haves: data.haves.map(storedItemToResolved),
          wants: data.wants.map(storedItemToResolved),
          notes: data.notes ?? undefined,
          date: formatPosterDate(),
          haveTitle: data.haveTitle,
          wantTitle: data.wantTitle,
        });
        setEditLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load poster");
        setEditLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Auto-assign colsPerRow when items change, unless user has manually set it
  useEffect(() => {
    if (userSetCols.current) return;
    const haveCount = getDisplayCount(posterData.haves, groupByNumbers);
    const wantCount = getDisplayCount(posterData.wants, groupByNumbers);
    const count = Math.max(haveCount, wantCount);
    const autoCols = Math.max(getGridCols(count), 3);
    setColsPerRow(autoCols);
  }, [posterData, groupByNumbers]);

  // Fetch cosmo status to get the real cosmo nickname and linked state
  useEffect(() => {
    if (!session) {
      setLinkedNickname(null);
      setCosmoStatusLoaded(false);
      return;
    }
    let cancelled = false;
    setCosmoStatusLoaded(false);
    fetch("/api/cosmo/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.nickname) {
          setCosmoId((prev) => {
            if (prev.trim()) return prev;
            rememberCosmoUsername(data.nickname);
            return data.nickname;
          });
          setLinkedNickname(data.nickname);
        } else {
          setLinkedNickname(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLinkedNickname(null);
      })
      .finally(() => {
        if (!cancelled) setCosmoStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Auto-load the Have inventory the first time a username becomes available
  useEffect(() => {
    if (cosmoId.trim() && haveNickname === null) {
      lastSearchAt.current = Date.now();
      setInventoryCount(null);
      setHaveNickname(cosmoId.trim());
    }
  }, [cosmoId, haveNickname]);

  // Fill the display name / cosmoId once we know whose inventory this is
  useEffect(() => {
    if (!haveNickname) return;
    setPosterData((prev) =>
      prev.cosmoId
        ? prev
        : { ...prev, cosmoId: haveNickname, username: haveNickname },
    );
  }, [haveNickname]);

  const searchInventory = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const now = Date.now();
      const elapsed = now - lastSearchAt.current;
      if (
        lastSearchAt.current !== 0 &&
        elapsed < 3000 &&
        trimmed !== haveNickname
      ) {
        toast.error(
          `Please wait ${Math.ceil((3000 - elapsed) / 1000)}s before searching again.`,
        );
        return;
      }
      lastSearchAt.current = now;
      setInventoryCount(null);
      setHaveNickname(trimmed);
    },
    [haveNickname],
  );

  const fetchHaveInventory = useCallback(
    () => fetchInventoryByNickname(haveNickname ?? ""),
    [haveNickname],
  );

  const goToStep = useCallback((next: "have" | "want") => {
    setStep(next);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleDownload = useCallback(async () => {
    setDownloading(true);

    try {
      const canvas = await renderPosterToCanvas(
        posterData,
        "dark",
        groupByMember,
        groupByNumbers,
        colsPerRow,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png",
        ),
      );
      const fileName = `trade-poster-${Date.now()}.png`;

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const canShareFiles =
        isMobile &&
        navigator.canShare?.({
          files: [new File([], "t.png", { type: "image/png" })],
        });

      if (canShareFiles) {
        // Mobile: use Share API
        const file = new File([blob], fileName, { type: "image/png" });
        try {
          await navigator.share({ files: [file] });
          toast.success("Poster shared!");
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === "AbortError")
            return;
          // Share API blocked (gesture timeout etc.) — fall back to download
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = fileName;
          link.href = blobUrl;
          link.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          toast.success("Poster downloaded!");
        }
      } else {
        // Desktop: direct download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileName;
        link.href = blobUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        toast.success("Poster downloaded!");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to generate poster:", err);
      toast.error(`Failed: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }, [posterData, groupByMember, groupByNumbers, colsPerRow]);

  const handleCopyText = useCallback(async () => {
    const text = formatPosterAsText(posterData);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  }, [posterData]);

  const doSaveAndShare = useCallback(
    async (data: PosterData) => {
      setSaving(true);
      try {
        const body = {
          username: data.username,
          cosmoId: data.cosmoId,
          notes: data.notes,
          groupByMember,
          groupByNumbers,
          colsPerRow,
          wantsOnly,
          haveTitle: data.haveTitle,
          wantTitle: data.wantTitle,
          haves: data.haves.map((item, i) => resolvedItemToApiInput(item, i)),
          wants: data.wants.map((item, i) => resolvedItemToApiInput(item, i)),
        };

        if (editId) {
          const token = localStorage.getItem(`poster-edit-token:${editId}`);
          const headers: HeadersInit = { "Content-Type": "application/json" };
          if (token) headers["x-poster-edit-token"] = token;
          const res = await fetch(`/api/posters/${editId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              (err as { error?: string }).error ?? "Failed to save",
            );
          }
          toast.success("Saved!");
          try {
            await navigator.clipboard.writeText(
              sectionAbsoluteUrl(`/list/${editId}`),
            );
            setLinkCopied(true);
            toast.success("Link copied!");
          } catch {}
          router.push(
            sectionHref(`/list/${editId}`, { currentSection: "list" }),
          );
        } else {
          const res = await fetch("/api/posters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              (err as { error?: string }).error ?? "Failed to save",
            );
          }
          const { id } = (await res.json()) as { id: string };
          const listUrl = sectionAbsoluteUrl(`/list/${id}`);
          toast.success("Saved!");
          try {
            await navigator.clipboard.writeText(listUrl);
            setLinkCopied(true);
            toast.success("Link copied!");
          } catch {}
          router.push(sectionHref(`/list/${id}`, { currentSection: "list" }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to save: ${msg}`);
      } finally {
        setSaving(false);
      }
    },
    [groupByMember, groupByNumbers, colsPerRow, wantsOnly, editId, router],
  );

  const handleSaveAndShare = useCallback(async () => {
    // For new posters, require Discord login — show dialog instead of redirecting
    if (!editId && !session) {
      setSignInOpen(true);
      return;
    }

    if (!editId && session && !cosmoStatusLoaded) {
      toast.error("Checking your Cosmo link. Try again in a moment.");
      return;
    }

    if (!editId && session && !linkedNickname) {
      setListOnlyWarningOpen(true);
      return;
    }

    // Pre-save guard: if the poster's cosmoId matches the linked account, check
    // that the owner actually holds at least one have. If zero are owned the
    // availability check on the list view would immediately delete it.
    if (linkedNickname && posterData.cosmoId) {
      const isOwnList =
        posterData.cosmoId.toLowerCase() === linkedNickname.toLowerCase();
      if (isOwnList) {
        const checkableHaves = posterData.haves.filter(
          (
            h,
          ): h is ResolvedPosterItem & {
            entry: NonNullable<ResolvedPosterItem["entry"]>;
          } => !h.parsed.freeform && h.entry?.collectionId != null,
        );
        if (checkableHaves.length > 0) {
          try {
            const inventory = await fetchInventoryByNickname(
              posterData.cosmoId,
            );
            const ownedCollections = new Set(
              inventory.map((i) => i.collectionId),
            );
            const ownedSet = new Set(
              inventory.map((i) => `${i.collectionId}:${i.serial}`),
            );
            const anyOwned = checkableHaves.some((h) => {
              const colId = h.entry.collectionId;
              const serial =
                h.parsed.serial != null ? parseInt(h.parsed.serial, 10) : null;
              return serial != null
                ? ownedSet.has(`${colId}:${serial}`)
                : ownedCollections.has(colId);
            });
            if (!anyOwned) {
              setInventoryWarningOpen(true);
              return;
            }
          } catch {
            // Inventory fetch failed — let the save proceed rather than blocking
          }
        }
      }
    }

    await doSaveAndShare(posterData);
  }, [
    posterData,
    editId,
    session,
    cosmoStatusLoaded,
    linkedNickname,
    doSaveAndShare,
  ]);

  // Auto-save after restoring a stashed draft post-login or post-link, but
  // send it through the same guards as a manual save.
  useEffect(() => {
    if (!autoSaving) return;
    if (session && !cosmoStatusLoaded) return;
    setAutoSaving(false);
    void handleSaveAndShare();
  }, [autoSaving, session, cosmoStatusLoaded, handleSaveAndShare]);

  const handleSignInForSave = useCallback(() => {
    sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({
        posterData,
        groupByMember,
        groupByNumbers,
        colsPerRow,
        wantsOnly,
      }),
    );
    signIn.social({
      provider: "discord",
      callbackURL: sectionAbsoluteUrl("/list?restore=1"),
    });
  }, [posterData, groupByMember, groupByNumbers, colsPerRow, wantsOnly]);

  const stashDraft = useCallback(() => {
    sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({
        posterData,
        groupByMember,
        groupByNumbers,
        colsPerRow,
        wantsOnly,
      }),
    );
  }, [posterData, groupByMember, groupByNumbers, colsPerRow, wantsOnly]);

  const handleLinkCosmoForMatching = useCallback(() => {
    stashDraft();
    window.location.href = sectionHref(
      `/link?returnTo=${encodeURIComponent(sectionAbsoluteUrl("/list?restore=1"))}`,
      { currentSection: "list" },
    );
  }, [stashDraft]);

  const handleCreateListOnly = useCallback(() => {
    setListOnlyWarningOpen(false);
    void doSaveAndShare(posterData);
  }, [doSaveAndShare, posterData]);

  const handleSelectHave = useCallback((entry: ObjektEntry) => {
    setPosterData((prev) => ({
      ...prev,
      haves: [...prev.haves, makePosterItem(entry)],
    }));
  }, []);

  const handleDeselectHave = useCallback((entry: ObjektEntry) => {
    setPosterData((prev) => ({
      ...prev,
      haves: prev.haves.filter((h) => {
        if (!h.entry) return true;
        if (entry.serial != null) {
          const hSerial =
            h.parsed.serial != null
              ? parseInt(h.parsed.serial, 10)
              : (h.entry.serial ?? null);
          return hSerial !== entry.serial;
        }
        return h.entry.collectionId !== entry.collectionId;
      }),
    }));
  }, []);

  const handleSelectWant = useCallback((entry: ObjektEntry) => {
    setPosterData((prev) => ({
      ...prev,
      wants: [...prev.wants, makePosterItem(entry)],
    }));
  }, []);

  const handleDeselectWant = useCallback((entry: ObjektEntry) => {
    setPosterData((prev) => ({
      ...prev,
      wants: prev.wants.filter(
        (w) => !w.entry || w.entry.collectionId !== entry.collectionId,
      ),
    }));
  }, []);

  const handlePasteImport = useCallback(
    (
      importedHaves: ResolvedPosterItem[],
      importedWants: ResolvedPosterItem[],
      notes?: string,
    ) => {
      userSetCols.current = false;
      setPosterData((prev) => ({
        ...prev,
        haves: sortResolvedItems(
          mergeImportedItems(prev.haves, importedHaves, true),
        ),
        wants: sortResolvedItems(
          mergeImportedItems(prev.wants, importedWants, false),
        ),
        notes: prev.notes ?? notes,
      }));
    },
    [],
  );

  const handleAddCustomWant = useCallback((label: string) => {
    setPosterData((prev) => {
      const item: ResolvedPosterItem = {
        parsed: {
          member: null,
          season: "",
          collectionNo: "",
          raw: label,
          freeform: true,
        },
        entry: null,
        imageUrl: null,
      };
      return { ...prev, wants: [...prev.wants, item] };
    });
  }, []);

  const anyWants = useMemo<AnyWant[]>(
    () =>
      posterData.wants.flatMap((item) =>
        item.parsed.isAny
          ? [
              {
                isAny: true as const,
                ...(item.parsed.artist ? { artist: item.parsed.artist } : {}),
                ...(item.parsed.member ? { member: item.parsed.member } : {}),
                ...(item.parsed.season ? { season: item.parsed.season } : {}),
                ...(item.parsed.class ? { class: item.parsed.class } : {}),
              },
            ]
          : [],
      ),
    [posterData.wants],
  );

  const handleAnyWantsChange = useCallback((next: AnyWant[]) => {
    setPosterData((prev) => ({
      ...prev,
      wants: [
        ...prev.wants.filter((w) => !w.parsed.isAny),
        ...next.map((w) => makeAnyWantItem(w)),
      ],
    }));
  }, []);

  const handleTextChange = useCallback(
    (
      field: "username" | "haveTitle" | "wantTitle" | "notes",
      value: string,
    ) => {
      setPosterData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const selectedHaveEntries = useMemo<ObjektEntry[]>(
    () =>
      posterData.haves.flatMap((item) => {
        if (!item.entry) return [];
        const serial =
          item.parsed.serial != null
            ? parseInt(item.parsed.serial, 10)
            : item.entry.serial;
        return [{ ...item.entry, serial }];
      }),
    [posterData.haves],
  );

  const selectedWantEntries = useMemo<ObjektEntry[]>(
    () => posterData.wants.flatMap((item) => (item.entry ? [item.entry] : [])),
    [posterData.wants],
  );

  const saveActionLabel = linkCopied
    ? "Link Copied!"
    : editId
      ? "Save Changes"
      : "Create List";

  // Once a user's Discord-linked Cosmo account is known, the have-inventory
  // owner is fixed to that identity — no reason to let them retype it. Stays
  // editable if cosmoId was set to something else (e.g. editing an older
  // poster made for a different username before/without linking).
  const isCosmoLinked = !!(
    session &&
    linkedNickname &&
    cosmoId.trim().toLowerCase() === linkedNickname.toLowerCase()
  );

  return (
    <div className="mx-auto w-full max-w-7xl pb-20 space-y-4">
      {!editId &&
        latestPosters &&
        latestPosters.length > 0 &&
        totalItems === 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Active Lists</h1>
              {session && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 border-border bg-transparent px-4"
                >
                  <Link
                    href={sectionHref("/list/mine", { currentSection: "list" })}
                  >
                    <ListIcon className="h-4 w-4" />
                    My Lists
                  </Link>
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {latestPosters
                .slice()
                .sort((a, b) => {
                  const matchDelta =
                    (latestMatchCounts[b.id] ?? 0) -
                    (latestMatchCounts[a.id] ?? 0);
                  if (matchDelta !== 0) return matchDelta;
                  return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                  );
                })
                .slice(0, 3)
                .map((p) => (
                  <PosterCard
                    key={p.id}
                    poster={p}
                    matchCount={latestMatchCounts[p.id]}
                  />
                ))}
            </div>
          </section>
        )}

      <section className="space-y-4 border-t border-border pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Create List</h1>
            <p className="text-muted-foreground">
              Select what you have and what you want
            </p>
          </div>
          <PasteListDialog onImport={handlePasteImport} />
        </div>

        {editLoading ? (
          <div className="rounded-xl border border-border bg-background/40 px-4 py-12">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Loading list...
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
            <div className="space-y-4 min-w-0">
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                <div>
                  <Label
                    htmlFor="poster-cosmoid"
                    className="text-lg font-semibold leading-none tracking-tight text-foreground"
                  >
                    Cosmo Username
                  </Label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative sm:max-w-80 flex-1">
                    <Input
                      id="poster-cosmoid"
                      placeholder="Enter your Cosmo username"
                      value={cosmoId}
                      readOnly={isCosmoLinked}
                      onChange={(e) => {
                        if (isCosmoLinked) return;
                        setCosmoId(e.target.value);
                      }}
                      onBlur={() => {
                        if (isCosmoLinked) return;
                        rememberCosmoUsername(cosmoId);
                        searchInventory(cosmoId);
                      }}
                      onKeyDown={(e) => {
                        if (isCosmoLinked) return;
                        if (e.key === "Enter" && cosmoId.trim()) {
                          e.preventDefault();
                          rememberCosmoUsername(cosmoId);
                          searchInventory(cosmoId);
                        }
                      }}
                      className={cn(
                        "h-12 bg-background text-base md:text-base",
                        isCosmoLinked && "pr-9 text-muted-foreground",
                      )}
                    />
                    {isCosmoLinked && (
                      <LockIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    )}
                  </div>
                  {!isCosmoLinked && (
                    <Button
                      type="button"
                      className="h-12 gap-2 px-4 sm:flex-1"
                      disabled={!hasMounted || !cosmoId.trim()}
                      onClick={() => {
                        rememberCosmoUsername(cosmoId);
                        searchInventory(cosmoId);
                      }}
                    >
                      <SearchIcon className="h-4 w-4" />
                      Load Inventory
                    </Button>
                  )}
                </div>
                {isCosmoLinked ? (
                  <p className="text-xs text-muted-foreground">
                    Linked to your Cosmo account
                    {inventoryCount !== null && ` · ${inventoryCount} objekts`}
                  </p>
                ) : (
                  haveNickname &&
                  (inventoryCount !== null ? (
                    <p className="text-xs text-muted-foreground">
                      Inventory loaded · {inventoryCount} objekts
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Showing inventory for @{haveNickname}
                    </p>
                  ))
                )}
              </div>

              <div ref={tabsRef}>
                <Tabs
                  value={step}
                  onValueChange={(v) => setStep(v as "have" | "want")}
                >
                  <TabsList className="grid h-12 w-full grid-cols-2">
                    <TabsTrigger
                      value="have"
                      className="h-full py-0 text-base leading-none sm:text-md data-[state=active]:!border-white data-[state=active]:!bg-white data-[state=active]:!text-black dark:data-[state=active]:!bg-white dark:data-[state=active]:!text-black"
                    >
                      Have ({posterData.haves.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="want"
                      className="h-full py-0 text-base leading-none sm:text-md data-[state=active]:!border-white data-[state=active]:!bg-white data-[state=active]:!text-black dark:data-[state=active]:!bg-white dark:data-[state=active]:!text-black"
                    >
                      Want ({posterData.wants.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="have">
                    <Card className="border-0 sm:border py-2 sm:py-6 gap-3 sm:gap-6 shadow-none sm:shadow-sm">
                      <CardHeader className="px-0 sm:px-6 gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            Select Haves
                          </CardTitle>
                          <CardDescription>
                            {haveNickname
                              ? `Showing inventory for @${haveNickname}`
                              : "Enter a Cosmo username above and load their inventory"}
                          </CardDescription>
                        </div>
                        <ObjektFilterBar
                          filters={displayedHaveFilters}
                          onChange={handleHaveFiltersChange}
                          showSearch={false}
                          showSort={false}
                          showFilterMode={false}
                        />
                      </CardHeader>
                      <CardContent className="px-0 sm:px-6">
                        {haveNickname ? (
                          <ObjektInventoryPicker
                            fetchItems={fetchHaveInventory}
                            selected={selectedHaveEntries}
                            onSelect={handleSelectHave}
                            onDeselect={handleDeselectHave}
                            onLoaded={setInventoryCount}
                            maxSelections={50}
                            gridClassName={PICKER_GRID_CLASS}
                            pageSize={35}
                            filters={filters}
                            onShortcutFiltersChange={setHaveSearchShortcuts}
                            searchPlaceholder="Search your inventory... e.g. sy cc101"
                            showSelectedRow
                            selectedRowLabel="Offered"
                            mainGridLabel="Inventory"
                            combineSelectedDuplicates={groupByNumbers}
                            emptyState={
                              <div className="text-sm text-muted-foreground text-center py-4">
                                No transferable objekts found for this user.
                              </div>
                            }
                          />
                        ) : (
                          <div className="text-sm text-muted-foreground text-center py-8">
                            Load a Cosmo inventory to select haves
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="want" className="space-y-3">
                    <Card className="border-0 sm:border py-2 sm:py-6 gap-3 sm:gap-6 shadow-none sm:shadow-sm">
                      <CardHeader className="px-0 sm:px-6 pb-3 gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            Select Wants
                          </CardTitle>
                          <CardDescription>
                            Select specific objekts you&apos;re looking for
                          </CardDescription>
                        </div>
                        <ObjektFilterBar
                          filters={displayedWantFilters}
                          onChange={handleWantFiltersChange}
                          showSearch={false}
                          showSort={false}
                          showFilterMode={false}
                        />
                      </CardHeader>
                      <CardContent className="px-0 sm:px-6 space-y-3">
                        <ObjektPicker
                          selected={selectedWantEntries}
                          onSelect={handleSelectWant}
                          onDeselect={handleDeselectWant}
                          maxSelections={50}
                          filters={filters}
                          onShortcutFiltersChange={setWantSearchShortcuts}
                          gridClassName={PICKER_GRID_CLASS}
                          showSelectedRow
                          selectedRowLabel="Wanted"
                          combineSelectedDuplicates={groupByNumbers}
                        />
                        <button
                          type="button"
                          onClick={() => setCustomWantOpen(true)}
                          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          Can&apos;t find an objekt? Add a custom want
                        </button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overscroll-contain">
              <Card>
                <CardHeader className="gap-3 border-b border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Your list</CardTitle>
                      <CardDescription>
                        {posterData.haves.length} haves ·{" "}
                        {posterData.wants.length} wants
                      </CardDescription>
                    </div>

                    {session ? (
                      <DiscordChip label={session.user.name ?? "Discord"} />
                    ) : (
                      <DiscordChip
                        label="Sign in"
                        onClick={() => setSignInOpen(true)}
                      />
                    )}
                  </div>

                  {editId && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyText}
                          className="h-9 gap-2 border-border bg-transparent"
                        >
                          <CopyIcon className="h-4 w-4" />
                          Copy Text
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDownload}
                          disabled={downloading}
                          className="h-9 gap-2 border-border bg-transparent"
                        >
                          {downloading ? (
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                          ) : (
                            <DownloadIcon className="h-4 w-4" />
                          )}
                          Download PNG
                        </Button>
                      </div>
                      <ListLinkField
                        label="Edit link"
                        value={sectionAbsoluteUrl(`/list/${editId}/edit`)}
                      />
                    </>
                  )}

                  {autoSaving && (
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2Icon className="h-3 w-3 animate-spin" />
                      Saving draft...
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label
                        htmlFor="any-want-toggle"
                        className="text-sm font-medium"
                      >
                        Accept any objekt matching my filters
                      </Label>
                      <Switch
                        id="any-want-toggle"
                        checked={anyWantOpen}
                        onCheckedChange={setAnyWantOpen}
                      />
                    </div>
                    {anyWantOpen && (
                      <AnyWantPicker
                        value={anyWants}
                        onChange={handleAnyWantsChange}
                      />
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <Label
                        htmlFor="wants-only"
                        className="text-sm font-medium"
                        title={
                          posterData.wants.length === 0
                            ? "Add at least one want item to enable this"
                            : undefined
                        }
                      >
                        Only accept offers from my want list
                      </Label>
                      <Switch
                        id="wants-only"
                        checked={wantsOnly}
                        onCheckedChange={setWantsOnly}
                        disabled={posterData.wants.length === 0}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      Appearance
                    </p>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Group by Members</span>
                      <Switch
                        checked={groupByMember}
                        onCheckedChange={setGroupByMember}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Combine Duplicates</span>
                      <Switch
                        checked={groupByNumbers}
                        onCheckedChange={setGroupByNumbers}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor="poster-notes"
                      className="text-xs text-muted-foreground"
                    >
                      Notes
                    </Label>
                    <Textarea
                      id="poster-notes"
                      value={posterData.notes ?? ""}
                      onChange={(e) =>
                        handleTextChange("notes", e.target.value)
                      }
                      rows={3}
                      className="text-sm"
                      placeholder="Add any notes (any SCO offer (3:1) might reject, etc.)"
                    />
                  </div>

                  {step === "have" ? (
                    <Button
                      onClick={() => goToStep("want")}
                      className="h-10 w-full gap-2"
                    >
                      Continue to Want
                      <ArrowRightIcon className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => goToStep("have")}
                        className="h-10 gap-2 border-border bg-transparent"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleSaveAndShare}
                        disabled={saving || (!!session && !cosmoStatusLoaded)}
                        className="h-10 flex-1 gap-2"
                      >
                        {saving ? (
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2Icon className="h-4 w-4" />
                        )}
                        {saveActionLabel}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </section>

      <AddCustomWantDialog
        open={customWantOpen}
        onOpenChange={setCustomWantOpen}
        onConfirm={handleAddCustomWant}
      />
      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How do you want to save this list?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSignInForSave}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <DiscordIcon className="size-5 text-[#5865F2]" />
              <span className="font-medium">Continue with Discord</span>
              <span className="text-sm text-muted-foreground">
                Save it with a share link. Link Cosmo next for trade matching.
              </span>
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={() => {
                setSignInOpen(false);
                void handleDownload();
              }}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <DownloadIcon className="size-5 text-muted-foreground" />
              <span className="font-medium">
                {downloading ? "Saving image..." : "Save image only"}
              </span>
              <span className="text-sm text-muted-foreground">
                Download a picture of your list — no account, no share link.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={inventoryWarningOpen}
        onOpenChange={setInventoryWarningOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory mismatch</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>@{posterData.cosmoId}</strong> doesn&apos;t own any of
              these objekts in their inventory. Either enter a different Cosmo
              username, or use Download PNG only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInventoryWarningOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={listOnlyWarningOpen} onOpenChange={setListOnlyWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How do you want to save this list?</DialogTitle>
            <DialogDescription>
              Your list is saved either way.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleLinkCosmoForMatching}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <Link2Icon className="size-5 text-primary" />
              <span className="font-medium">Link Cosmo</span>
              <span className="text-sm text-muted-foreground">
                Post it for trade and get matches from other users.
              </span>
            </button>
            <button
              type="button"
              onClick={handleCreateListOnly}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            >
              <ListIcon className="size-5 text-muted-foreground" />
              <span className="font-medium">Create list only</span>
              <span className="text-sm text-muted-foreground">
                Save it with a share link. No trade post or trade matches.
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CreatePosterPageWrapper({ editId }: { editId?: string }) {
  return (
    <Suspense>
      <CreatePosterPage editId={editId} />
    </Suspense>
  );
}

export default CreatePosterPageWrapper;
