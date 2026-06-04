"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { renderPosterToCanvas } from "@/lib/poster-canvas-render";
import {
  Loader2Icon,
  AlertCircleIcon,
  DownloadIcon,
  SunIcon,
  MoonIcon,
  ArrowLeftIcon,
  ImageIcon,
  CopyIcon,
  ShareIcon,
  ListIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parsePastedTrade } from "@/lib/paste-parser";
import { resolveForPoster, type ResolvedPosterItem } from "@/lib/poster-resolver";
import { PosterCanvas, getGridCols, getDisplayCount, type PosterData, type PosterTheme } from "@/components/poster/poster-canvas";
import { formatPosterAsText } from "@/lib/poster-text-format";
import { CosmoPickerDialog } from "@/components/poster/cosmo-picker-dialog";
import { AddObjektDialog, AddCustomWantDialog } from "@/components/poster/add-objekt-dialog";
import { useSession, signIn } from "@/lib/auth-client";
import { fetchInventoryByNickname } from "@/lib/cosmo-inventory";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { getSeasonPrefix } from "@/lib/season-prefix";
import { compareMembers, compareSeasons } from "@/lib/filter-options";

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
  haves: StoredItem[];
  wants: StoredItem[];
}

function storedItemToResolved(item: StoredItem): ResolvedPosterItem {
  return {
    parsed: {
      member: item.member ?? null,
      season: item.season ?? "",
      collectionNo: item.collectionNo ?? "",
      raw: item.rawLabel ?? `${item.member ?? ""} ${item.collectionNo ?? ""}`.trim(),
      ...(item.serial != null ? { serial: String(item.serial) } : {}),
      ...(item.quantity > 1 ? { quantity: item.quantity } : {}),
      ...(item.freeform ? { freeform: true as const } : {}),
      ...(item.onOffline ? { onOffline: item.onOffline as "online" | "offline" } : {}),
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

function resolvedToApiItem(item: ResolvedPosterItem, position: number) {
  return {
    collectionId: item.entry?.collectionId ?? null,
    collectionNo: item.entry?.collectionNo ?? item.parsed.collectionNo ?? null,
    member: item.entry?.member ?? item.parsed.member ?? null,
    season: item.entry?.season ?? item.parsed.season ?? null,
    class: item.entry?.class ?? null,
    thumbnailUrl: item.imageUrl ?? null,
    serial: item.parsed.serial ? parseInt(item.parsed.serial, 10) : null,
    objektId: (item.entry as ObjektEntry & { objektId?: string })?.objektId ?? null,
    quantity: item.parsed.quantity ?? 1,
    freeform: item.parsed.freeform ?? false,
    rawLabel: item.parsed.raw ?? null,
    onOffline: item.parsed.onOffline ?? null,
    position,
  };
}

function parseCollectionNo(value: string): number {
  const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function sortObjektEntries(entries: ObjektEntry[]): ObjektEntry[] {
  return [...entries].sort((a, b) => {
    const seasonCmp = compareSeasons(a.season, b.season);
    if (seasonCmp !== 0) return seasonCmp;
    const colCmp = parseCollectionNo(a.collectionNo) - parseCollectionNo(b.collectionNo);
    if (colCmp !== 0) return colCmp;
    return compareMembers(a.member, b.member);
  });
}

function sortResolvedItems(items: ResolvedPosterItem[]): ResolvedPosterItem[] {
  const withEntry = items.filter((i) => i.entry);
  const withoutEntry = items.filter((i) => !i.entry);
  withEntry.sort((a, b) => {
    const seasonCmp = compareSeasons(a.entry!.season, b.entry!.season);
    if (seasonCmp !== 0) return seasonCmp;
    const colCmp =
      parseCollectionNo(a.entry!.collectionNo) - parseCollectionNo(b.entry!.collectionNo);
    if (colCmp !== 0) return colCmp;
    return compareMembers(a.entry!.member, b.entry!.member);
  });
  return [...withEntry, ...withoutEntry];
}

type Stage = "input" | "resolving" | "preview";

const STASH_KEY = "poster-draft-stash";

function makeItem(entry: ObjektEntry): ResolvedPosterItem {
  const imageUrl = (entry as ObjektEntry & { frontImage?: string }).thumbnailImage
    ?? (entry as ObjektEntry & { frontImage?: string }).frontImage
    ?? null;
  return {
    parsed: {
      member: entry.member,
      season: entry.season,
      collectionNo: entry.collectionNo.replace(/[A-Za-z]$/, ""),
      raw: `${entry.member} ${getSeasonPrefix(entry.season)}${entry.collectionNo}`,
      ...(entry.serial != null ? { serial: String(entry.serial) } : {}),
    },
    entry,
    imageUrl,
  };
}

import { Suspense } from "react";

// ── Main page ────────────────────────────────────────────────────────────────

export function CreatePosterPage({ editId: editIdProp }: { editId?: string }) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const editId = editIdProp ?? searchParams.get("edit");

  // Redirect legacy ?edit=id URLs to the canonical /post/[id]/edit route
  useEffect(() => {
    const legacyId = searchParams.get("edit");
    if (legacyId && !editIdProp) {
      router.replace(`/post/${legacyId}/edit`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [text, setText] = useState("");
  const [cosmoId, setCosmoId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [posterData, setPosterData] = useState<PosterData | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [posterTheme, setPosterTheme] = useState<PosterTheme>("dark");
  const [groupByMember, setGroupByMember] = useState(false);
  const [groupByNumbers, setGroupByNumbers] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [colsPerRow, setColsPerRow] = useState(5);
  const userSetCols = useRef(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const [addDialogSection, setAddDialogSection] = useState<"have" | "want" | null>(null);
  const [customWantOpen, setCustomWantOpen] = useState(false);

  const [isLinked, setIsLinked] = useState(false);
  const [linkedNickname, setLinkedNickname] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [inventoryWarningOpen, setInventoryWarningOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Restore stashed draft after Discord login redirect
  useEffect(() => {
    const restore = searchParams.get("restore");
    if (!restore || !session) return;
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STASH_KEY);
    try {
      const stash = JSON.parse(raw) as {
        posterData: PosterData;
        posterTheme: PosterTheme;
        groupByMember: boolean;
        groupByNumbers: boolean;
        colsPerRow: number;
      };
      userSetCols.current = true;
      setPosterTheme(stash.posterTheme);
      setGroupByMember(stash.groupByMember);
      setGroupByNumbers(stash.groupByNumbers);
      setColsPerRow(stash.colsPerRow);
      setPosterData(stash.posterData);
      setStage("preview");
      setAutoSaving(true);
    } catch {
      toast.error("Could not restore your draft");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Pre-load a stored poster when ?edit=id is in the URL
  useEffect(() => {
    if (!editId) return;
    setStage("resolving");
    fetch(`/api/posters/${editId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: StoredPoster | null) => {
        if (!data) {
          toast.error("Could not load poster for editing");
          setStage("input");
          return;
        }
        userSetCols.current = true;
        setPosterTheme((data.theme as PosterTheme) ?? "dark");
        setGroupByMember(data.groupByMember);
        setGroupByNumbers(data.groupByNumbers);
        setColsPerRow(data.colsPerRow);
        if (data.cosmoId) setCosmoId(data.cosmoId);
        setPosterData({
          username: data.username ?? "",
          cosmoId: data.cosmoId ?? "",
          haves: data.haves.map(storedItemToResolved),
          wants: data.wants.map(storedItemToResolved),
          notes: data.notes ?? undefined,
          date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          haveTitle: data.haveTitle,
          wantTitle: data.wantTitle,
        });
        setStage("preview");
      })
      .catch(() => {
        toast.error("Failed to load poster");
        setStage("input");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Auto-assign colsPerRow when items change, unless user has manually set it
  useEffect(() => {
    if (!posterData || userSetCols.current) return;
    const haveCount = getDisplayCount(posterData.haves, groupByNumbers);
    const wantCount = getDisplayCount(posterData.wants, groupByNumbers);
    const count = Math.max(haveCount, wantCount);
    const autoCols = Math.max(getGridCols(count), 3);
    setColsPerRow(autoCols);
  }, [posterData, groupByNumbers]);

  // Fetch cosmo status to get the real cosmo nickname and linked state
  useEffect(() => {
    if (!session) return;
    fetch("/api/cosmo/status")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.nickname) {
          setCosmoId((prev) => prev || data.nickname);
          setLinkedNickname(data.nickname);
          setIsLinked(true);
        }
      })
      .catch(() => {});
  }, [session]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;

    const parsed = parsePastedTrade(text);
    if (parsed.errors.length > 0 && parsed.haves.length === 0 && parsed.wants.length === 0) {
      setParseErrors(parsed.errors);
      return;
    }
    setParseErrors(parsed.errors);
    setStage("resolving");

    try {
      const [resolvedHaves, resolvedWants] = await Promise.all([
        resolveForPoster(parsed.haves),
        resolveForPoster(parsed.wants),
      ]);

      const now = new Date();
      const date = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      userSetCols.current = false;
      setPosterData({
        username: cosmoId,
        cosmoId,
        haves: sortResolvedItems(resolvedHaves),
        wants: sortResolvedItems(resolvedWants),
        notes: parsed.notes,
        date,
        haveTitle: "Have",
        wantTitle: "Want",
      });
      setStage("preview");
    } catch {
      toast.error("Failed to resolve objekts");
      setStage("input");
    }
  }, [text, cosmoId]);

  const handleDownload = useCallback(async () => {
    if (!posterRef.current || !posterData) return;
    setDownloading(true);

    // Wait a tick for editable=false to apply (removes inputs/buttons from DOM)
    await new Promise((r) => setTimeout(r, 50));

    try {
      const canvas = await renderPosterToCanvas(
        posterData,
        posterTheme,
        groupByMember,
        groupByNumbers,
        colsPerRow,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
      );
      const fileName = `trade-poster-${Date.now()}.png`;

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const canShareFiles = isMobile && navigator.canShare?.({ files: [new File([], "t.png", { type: "image/png" })] });

      if (canShareFiles) {
        // Mobile: use Share API
        const file = new File([blob], fileName, { type: "image/png" });
        try {
          await navigator.share({ files: [file] });
          toast.success("Poster shared!");
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === "AbortError") return;
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
  }, [posterData, posterTheme, groupByMember, groupByNumbers, colsPerRow]);

  const handleCopyText = useCallback(async () => {
    if (!posterData) return;
    const text = formatPosterAsText(posterData);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  }, [posterData]);

  const handleBack = useCallback(() => {
    setStage("input");
    setPosterData(null);
    userSetCols.current = false;
  }, []);

  const doSaveAndShare = useCallback(async (data: PosterData) => {
    setSaving(true);
    try {
      const body = {
        username: data.username,
        cosmoId: data.cosmoId,
        notes: data.notes,
        theme: posterTheme,
        groupByMember,
        groupByNumbers,
        colsPerRow,
        haveTitle: data.haveTitle,
        wantTitle: data.wantTitle,
        haves: data.haves.map((item, i) => resolvedToApiItem(item, i)),
        wants: data.wants.map((item, i) => resolvedToApiItem(item, i)),
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
          throw new Error((err as { error?: string }).error ?? "Failed to save");
        }
        toast.success("Saved!");
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/list/${editId}`);
          setLinkCopied(true);
          toast.success("Link copied!");
        } catch {}
        router.push(`/list/${editId}`);
      } else {
        const res = await fetch("/api/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to save");
        }
        const { id } = (await res.json()) as { id: string };
        const listUrl = `${window.location.origin}/list/${id}`;
        toast.success("Saved!");
        try {
          await navigator.clipboard.writeText(listUrl);
          setLinkCopied(true);
          toast.success("Link copied!");
        } catch {}
        router.push(`/list/${id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [posterTheme, groupByMember, groupByNumbers, colsPerRow, editId, router]);

  // Auto-save after restoring a stashed draft post-login
  useEffect(() => {
    if (!autoSaving || !posterData) return;
    setAutoSaving(false);
    doSaveAndShare(posterData);
  }, [autoSaving, posterData, doSaveAndShare]);

  const handleSaveAndShare = useCallback(async () => {
    if (!posterData) return;

    // For new posters, require Discord login — show dialog instead of redirecting
    if (!editId && !session) {
      setSignInOpen(true);
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
          (h) => !h.parsed.freeform && h.entry?.collectionId,
        );
        if (checkableHaves.length > 0) {
          try {
            const inventory = await fetchInventoryByNickname(posterData.cosmoId);
            const ownedCollections = new Set(inventory.map((i) => i.collectionId));
            const ownedSet = new Set(
              inventory.map((i) => `${i.collectionId}:${i.serial}`),
            );
            const anyOwned = checkableHaves.some((h) => {
              const colId = h.entry!.collectionId;
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
  }, [posterData, posterTheme, groupByMember, groupByNumbers, colsPerRow, editId, session, doSaveAndShare, linkedNickname]);

  const handleSignInForSave = useCallback(() => {
    if (!posterData) return;
    sessionStorage.setItem(STASH_KEY, JSON.stringify({
      posterData,
      posterTheme,
      groupByMember,
      groupByNumbers,
      colsPerRow,
    }));
    signIn.social({ provider: "discord", callbackURL: `${window.location.origin}/post?restore=1` });
  }, [posterData, posterTheme, groupByMember, groupByNumbers, colsPerRow]);

  const handleAddItems = useCallback((section: "have" | "want", entries: ObjektEntry[]) => {
    setPosterData((prev) => {
      if (!prev) return prev;
      const key = section === "have" ? "haves" : "wants";
      const existing = prev[key];
      // Keep freeform items (custom wants) that have no backing entry
      const freeformItems = existing.filter((h) => !h.entry && h.parsed.freeform);
      const sortedEntries = sortObjektEntries(entries);
      const newItems = sortedEntries.map((e) => {
        const existingMatch = existing.find((h) => h.entry?.collectionId === e.collectionId);
        return existingMatch ?? makeItem(e);
      });
      return { ...prev, [key]: [...newItems, ...freeformItems] };
    });
    setAddDialogSection(null);
  }, []);

  const handleAddCustomWant = useCallback((label: string) => {
    setPosterData((prev) => {
      if (!prev) return prev;
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

  const handleRemoveItem = useCallback((section: "have" | "want", index: number) => {
    setPosterData((prev) => {
      if (!prev) return prev;
      const key = section === "have" ? "haves" : "wants";
      return {
        ...prev,
        [key]: prev[key].filter((_, i) => i !== index),
      };
    });
  }, []);

  const handlePickerConfirm = useCallback(async (haves: ObjektEntry[], wants: ObjektEntry[], searchedNickname: string) => {
    setCosmoId(searchedNickname);
    setStage("resolving");
    try {
      const resolvedHaves = sortObjektEntries(haves).map((entry) => makeItem(entry));
      const resolvedWants = sortObjektEntries(wants).map((entry) => makeItem(entry));

      const now = new Date();
      const date = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      userSetCols.current = false;
      setPosterData({
        username: searchedNickname,
        cosmoId: searchedNickname,
        haves: resolvedHaves,
        wants: resolvedWants,
        notes: undefined,
        date,
        haveTitle: "Have",
        wantTitle: "Want",
      });
      setStage("preview");
    } catch {
      toast.error("Failed to build poster");
      setStage("input");
    }
  }, []);

  const handleTextChange = useCallback((field: string, value: string) => {
    setPosterData((prev) => {
      if (!prev) return prev;
      // Direct PosterData fields
      if (field === "username" || field === "date" || field === "notes" || field === "haveTitle" || field === "wantTitle") {
        return { ...prev, [field]: value };
      }
      // Card label changes — we store these on the parsed.raw for display override
      // Format: "haveLabel:0", "wantLabel:3"
      const labelMatch = field.match(/^(have|want)Label:(\d+)$/);
      if (labelMatch) {
        const key = labelMatch[1] === "have" ? "haves" : "wants";
        const idx = parseInt(labelMatch[2], 10);
        const items = [...prev[key]];
        if (items[idx]) {
          items[idx] = {
            ...items[idx],
            parsed: { ...items[idx].parsed, raw: value },
            // Clear entry so the label override sticks (canvas uses raw when entry is null)
            entry: null,
          };
        }
        return { ...prev, [key]: items };
      }
      return prev;
    });
  }, []);

  const unresolvedHaves = posterData?.haves.filter((h) => h.error) ?? [];
  const unresolvedWants = posterData?.wants.filter((w) => w.error) ?? [];
  const hasUnresolved = unresolvedHaves.length > 0 || unresolvedWants.length > 0;

  return (
    <div className="max-w-4xl sm:mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Objekt Poster</h1>
          <p className="text-muted-foreground">
            Turn your trade list into a clean, shareable image in seconds
          </p>
        </div>
        {session && (
          <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0 mt-1">
            <Link href="/list/mine">
              <ListIcon className="h-4 w-4" />
              My Lists
            </Link>
          </Button>
        )}
      </div>

      {/* ── Input stage ── */}
      {stage === "input" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poster-cosmoid">Cosmo ID (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="poster-cosmoid"
                placeholder="Cosmo username"
                value={cosmoId}
                onChange={(e) => setCosmoId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && cosmoId.trim()) {
                    e.preventDefault();
                    openPicker();
                  }
                }}
                className="w-48 shrink-0"
              />
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 flex-1"
                onClick={openPicker}
              >
                <ImageIcon className="h-4 w-4" />
                Add Objekts
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Press Enter to open the objekt picker for that username.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="poster-text">Trade List</Label>
            <Textarea
              id="poster-text"
              placeholder={`**HAVE**\nsy AA201 #10\nHyeRin B205 x3\nKaede bb104, bb105\n\nWANT\nDaHyun BB345\nnaky bb343 bb344`}
              value={text}
              onChange={(e) => { setText(e.target.value); setParseErrors([]); }}
              rows={12}
              className="font-mono text-sm"
            />
            {parseErrors.length > 0 && (
              <div className="space-y-1">
                {parseErrors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive flex items-start gap-1">
                    <AlertCircleIcon className="h-3 w-3 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use HAVE / WANT as section headers. Supports shortforms like BB345, AA201, member aliases (SY, HR, DH).
              Add x3 after an objekt for quantity. Any unparseable text becomes poster notes.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isHydrated ? !text.trim() : undefined}
            className="gap-1.5"
          >
            <ImageIcon className="h-4 w-4" />
            Generate Poster
          </Button>
        </div>
      )}

      <CosmoPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialNickname={cosmoId}
        isLinked={isLinked}
        onConfirm={handlePickerConfirm}
      />

      {/* ── Resolving stage ── */}
      {stage === "resolving" && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Resolving objekts...
        </div>
      )}

      {/* ── Preview / Editor stage ── */}
      {stage === "preview" && posterData && (
        <div className="space-y-4">

          {/* Top controls bar */}
          <div className="flex flex-col gap-2">
            {/* Row 1: navigation + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleBack} className="gap-1.5">
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                <Button size="sm" variant="outline" onClick={handleCopyText} className="gap-1.5">
                  <CopyIcon className="h-4 w-4" />
                  Copy Text
                </Button>

                <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="gap-1.5">
                  {downloading ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <DownloadIcon className="h-4 w-4" />
                  )}
                  Download PNG
                </Button>

                <Button
                  size="sm"
                  onClick={handleSaveAndShare}
                  disabled={saving}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {saving ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShareIcon className="h-4 w-4" />
                  )}
                  {linkCopied ? "Link Copied!" : editId ? "Save Changes" : "Share Link"}
                </Button>
              </div>
            </div>

            {/* Row 2: poster settings */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Columns per row */}
              <div className="flex items-center gap-1.5">
                <select
                  value={colsPerRow}
                  onChange={(e) => { userSetCols.current = true; setColsPerRow(Number(e.target.value)); }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {Array.from({ length: 8 }, (_, i) => i + 3).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">per row</span>
              </div>

              {/* Group by members toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Group by Members</span>
                <Switch checked={groupByMember} onCheckedChange={setGroupByMember} />
              </div>

              {/* Group by numbers toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Combine Duplicates</span>
                <Switch checked={groupByNumbers} onCheckedChange={setGroupByNumbers} />
              </div>

              {/* Theme toggle */}
              <div className="flex items-center gap-2">
                <SunIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  checked={posterTheme === "dark"}
                  onCheckedChange={(checked) => setPosterTheme(checked ? "dark" : "light")}
                />
                <MoonIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Unresolved warnings */}
          {hasUnresolved && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3 space-y-1">
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                Some items could not be resolved
              </p>
              {[...unresolvedHaves, ...unresolvedWants].map((item, i) => (
                <p key={i} className="text-xs text-yellow-600 dark:text-yellow-400">
                  {item.error}
                </p>
              ))}
            </div>
          )}

          {/* Inline add dialog — opened by clicking the + card in either section */}
          {addDialogSection && (
            <AddObjektDialog
              open={!!addDialogSection}
              section={addDialogSection}
              cosmoId={posterData.cosmoId || undefined}
              initialSelected={
                (addDialogSection === "have" ? posterData.haves : posterData.wants)
                  .filter((item) => item.entry != null)
                  .map((item) => item.entry!)
              }
              onOpenChange={(open) => { if (!open) setAddDialogSection(null); }}
              onConfirm={handleAddItems}
            />
          )}

          <AddCustomWantDialog
            open={customWantOpen}
            onOpenChange={setCustomWantOpen}
            onConfirm={handleAddCustomWant}
          />

          {/* Poster canvas — always editable (except during download) */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <PosterCanvas
              ref={posterRef}
              data={posterData}
              theme={posterTheme}
              editable={!downloading}
              groupByMember={groupByMember}
              groupByNumbers={groupByNumbers}
              colsPerRow={colsPerRow}
              onTextChange={handleTextChange}
              onRemoveItem={handleRemoveItem}
              onAddItem={setAddDialogSection}
              onAddCustomWant={() => setCustomWantOpen(true)}
            />
          </div>
        </div>
      )}
      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign in to save</DialogTitle>
            <DialogDescription>
              A Discord account is required to save and share your list.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2"
            onClick={handleSignInForSave}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.003.02.014.04.03.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            Continue with Discord
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={inventoryWarningOpen} onOpenChange={setInventoryWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory mismatch</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>@{posterData?.cosmoId}</strong>{" "}doesn&apos;t own any of
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
