"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import {
  Loader2Icon,
  AlertCircleIcon,
  DownloadIcon,
  SunIcon,
  MoonIcon,
  ArrowLeftIcon,
  ImageIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { parsePastedTrade } from "@/lib/paste-parser";
import { resolveForPoster, type ResolvedPosterItem } from "@/lib/poster-resolver";
import { PosterCanvas, getGridCols, type PosterData, type PosterTheme } from "@/components/poster/poster-canvas";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { getSeasonPrefix } from "@/lib/season-prefix";

type Stage = "input" | "resolving" | "preview";

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
    },
    entry,
    imageUrl,
  };
}

// ── Side-by-side Add panel ──────────────────────────────────────────────────

interface AddPanelProps {
  onAdd: (section: "have" | "want", entry: ObjektEntry) => void;
  posterData: PosterData;
}

function AddPanel({ onAdd, posterData }: AddPanelProps) {
  const addedHaves: ObjektEntry[] = posterData.haves
    .filter((h) => h.entry)
    .map((h) => h.entry!);
  const addedWants: ObjektEntry[] = posterData.wants
    .filter((w) => w.entry)
    .map((w) => w.entry!);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider">
          Add to Have
        </p>
        <ObjektPicker
          selected={addedHaves}
          onSelect={(entry) => onAdd("have", entry)}
          onDeselect={() => {}}
          maxSelections={999}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider">
          Add to Want
        </p>
        <ObjektPicker
          selected={addedWants}
          onSelect={(entry) => onAdd("want", entry)}
          onDeselect={() => {}}
          maxSelections={999}
        />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CreatePosterPage() {
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [cosmoId, setCosmoId] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [posterData, setPosterData] = useState<PosterData | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [posterTheme, setPosterTheme] = useState<PosterTheme>("dark");
  const [groupByMember, setGroupByMember] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [colsPerRow, setColsPerRow] = useState(4);
  const posterRef = useRef<HTMLDivElement>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Auto-fill cosmoId from session
  useEffect(() => {
    if (session?.user?.name && !cosmoId) {
      setCosmoId(session.user.name);
    }
  }, [session?.user?.name]);

  const handleGenerate = useCallback(async () => {
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

      const autoCols = Math.max(
        getGridCols(resolvedHaves.length),
        getGridCols(resolvedWants.length),
        3,
      );
      setColsPerRow(autoCols);

      setPosterData({
        username: cosmoId,
        cosmoId,
        haves: resolvedHaves,
        wants: resolvedWants,
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
    if (!posterRef.current) return;
    setShowAddPanel(false);
    setDownloading(true);

    // Wait a tick for editable=false to apply (removes inputs/buttons from DOM)
    await new Promise((r) => setTimeout(r, 50));

    // Pre-convert all poster images to data URLs so html-to-image doesn't need
    // to fetch them itself. This is required for mobile Chrome (SVG foreignObject
    // canvas taint) and mobile Safari (CORS cache poisoning from crossOrigin img).
    const imgs = Array.from(posterRef.current.querySelectorAll<HTMLImageElement>("img"));
    const originalSrcs = imgs.map((img) => img.src);
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.src;
        if (!src || src.startsWith("data:")) return;
        try {
          const res = await fetch(src, { mode: "cors", cache: "no-store" });
          if (!res.ok) return;
          const blob = await res.blob();
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              img.src = reader.result as string;
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } catch {
          // leave original — better than blank
        }
      }),
    );

    try {
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: false,
      });

      // On mobile with Share API file support, share the image; otherwise download
      const canShareFiles = navigator.canShare?.({ files: [new File([], "t.png", { type: "image/png" })] });
      if (navigator.share && canShareFiles) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `trade-poster-${Date.now()}.png`, { type: "image/png" });
        await navigator.share({ files: [file] });
        toast.success("Poster shared!");
      } else {
        const link = document.createElement("a");
        link.download = `trade-poster-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Poster downloaded!");
      }
    } catch (err) {
      // User cancelling share sheet throws AbortError — don't show error for that
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to generate poster:", err);
      toast.error("Failed to generate poster image. Try again.");
    } finally {
      // Restore original srcs so the live poster still displays correctly
      imgs.forEach((img, i) => { img.src = originalSrcs[i]; });
      setDownloading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setShowAddPanel(false);
    setStage("input");
    setPosterData(null);
  }, []);

  const handleAdd = useCallback((section: "have" | "want", entry: ObjektEntry) => {
    setPosterData((prev) => {
      if (!prev) return prev;
      const newItem = makeItem(entry);
      const list = section === "have" ? prev.haves : prev.wants;
      if (list.some((h) => h.entry?.collectionId === entry.collectionId)) return prev;
      return {
        ...prev,
        [section === "have" ? "haves" : "wants"]: [...list, newItem],
      };
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
      <div>
        <h1 className="text-2xl font-bold">Trade Poster</h1>
        <p className="text-muted-foreground">
          Paste your trade list and generate a shareable poster image
        </p>
      </div>

      {/* ── Input stage ── */}
      {stage === "input" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poster-cosmoid">Cosmo ID</Label>
            <Input
              id="poster-cosmoid"
              placeholder="Your Cosmo username (shown on poster)"
              value={cosmoId}
              onChange={(e) => setCosmoId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="poster-text">Trade List</Label>
            <Textarea
              id="poster-text"
              placeholder={`HAVE\nSeoYeon AA201 #10\nHyeRin B205 x3\nKaede bb104, bb105\n\nWANT\nDaHyun BB345\nnaky bb343 bb344`}
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

          <Button onClick={handleGenerate} disabled={!text.trim()} className="gap-1.5">
            <ImageIcon className="h-4 w-4" />
            Generate Poster
          </Button>
        </div>
      )}

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
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleBack} className="gap-1.5">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
              {/* Columns per row */}
              <div className="flex items-center gap-1.5">
                <select
                  value={colsPerRow}
                  onChange={(e) => setColsPerRow(Number(e.target.value))}
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

              {/* Theme toggle */}
              <div className="flex items-center gap-2">
                <SunIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  checked={posterTheme === "dark"}
                  onCheckedChange={(checked) => setPosterTheme(checked ? "dark" : "light")}
                />
                <MoonIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>

              <Button size="sm" onClick={handleDownload} disabled={downloading} className="gap-1.5">
                {downloading ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
                Download PNG
              </Button>
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

          {/* Add panel — side by side */}
          {showAddPanel && (
            <div className="rounded-lg border border-border p-4">
              <AddPanel onAdd={handleAdd} posterData={posterData} />
            </div>
          )}

          {/* Poster canvas — always editable (except during download) */}
          <div className="space-y-2">
            {/* Add Objekts button — right-aligned above canvas */}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowAddPanel((v) => !v)}
                className="gap-1.5"
              >
                {showAddPanel ? <XIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                {showAddPanel ? "Close" : "Add Objekts"}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <PosterCanvas
                ref={posterRef}
                data={posterData}
                theme={posterTheme}
                editable={!downloading}
                groupByMember={groupByMember}
                colsPerRow={colsPerRow}
                onTextChange={handleTextChange}
                onRemoveItem={handleRemoveItem}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
