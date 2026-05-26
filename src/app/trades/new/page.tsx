"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { PasteImportDialog } from "@/components/trades/paste-import-dialog";
import {
  defaultFilters,
  type TradeFilterState,
  TradeFilters,
} from "@/components/trades/trade-filters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ClassMultiSelect,
  decodeGroupedValue,
  SeasonMultiSelect,
} from "@/components/ui/class-multi-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { artistLabel } from "@/lib/artist-utils";
import { useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { sanitizeNoteText } from "@/lib/sanitize-text";

export type AnyWant = {
  isAny: true;
  artist?: string;
  member?: string;
  season?: string;
  class?: string;
};

function anyWantLabel(w: AnyWant): string {
  const prefix = w.artist ? `${artistLabel(w.artist)} ` : "";
  if (w.member) return `Any ${w.member}`;
  if (w.season) return `Any ${prefix}${w.season}`;
  if (w.class) return `Any ${prefix}${w.class}`;
  return "Any";
}

function anyWantKey(w: AnyWant): string {
  return [w.artist, w.member, w.season, w.class].join("|");
}

function useObjektImages(
  items: {
    collectionId: string;
    thumbnailImage?: string | null;
    frontImage?: string | null;
  }[],
) {
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!items.length) return;
    const next = new Map<string, string>();
    const missing = new Set<string>();

    for (const item of items) {
      const imageUrl = item.thumbnailImage ?? item.frontImage;
      if (imageUrl) next.set(item.collectionId, imageUrl);
      else if (item.collectionId) missing.add(item.collectionId);
    }

    setImages(next);

    if (missing.size === 0) return;

    const params = new URLSearchParams();
    for (const collectionId of missing) {
      params.append("collection_id", collectionId);
    }

    fetch(`/api/objekts/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setImages((prev) => {
          const updated = new Map(prev);
          for (const match of data.results ?? []) {
            const url = match.thumbnailImage ?? match.frontImage;
            if (url) updated.set(match.collectionId, url);
          }
          return updated;
        });
      })
      .catch(() => {});
  }, [items.map((i) => i.collectionId).join(",")]);

  return images;
}

export default function NewTradePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const filterOptions = useFilterOptions();
  const [haves, setHaves] = useState<ObjektEntry[]>([]);
  const [wants, setWants] = useState<ObjektEntry[]>([]);
  const [anyWants, setAnyWants] = useState<AnyWant[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wantsOnly, setWantsOnly] = useState(false);
  const [filters, setFilters] = useState<TradeFilterState>(defaultFilters);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discordDismissed, setDiscordDismissed] = useState(true);

  useEffect(() => {
    setDiscordDismissed(
      localStorage.getItem("discord-banner-dismissed") === "1",
    );
  }, []);

  // Auto-disable wantsOnly if all wants are removed
  const hasWants = wants.length > 0 || anyWants.length > 0;
  useEffect(() => {
    if (!hasWants && wantsOnly) setWantsOnly(false);
  }, [hasWants, wantsOnly]);

  // Artist is only used to narrow the member dropdown, never stored as a want chip
  const [anyArtist, setAnyArtist] = useState<string[]>([]);

  const availableAnyMembers = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.membersByArtist[artist] ?? [])
    : filterOptions.allMembers;
  const availableAnySeasons = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.seasonsByArtist[artist] ?? [])
    : filterOptions.allSeasons;
  const availableAnyClasses = anyArtist.length
    ? anyArtist.flatMap((artist) => filterOptions.classesByArtist[artist] ?? [])
    : filterOptions.allClasses;

  const haveImages = useObjektImages(haves);
  const wantImages = useObjektImages(wants);

  function handlePasteImport(
    importedHaves: ObjektEntry[],
    importedWants: ObjektEntry[],
    notes?: string,
  ) {
    if (notes) setDescription(notes);
    setHaves((prev) => {
      const next = [...prev];
      for (const o of importedHaves) {
        if (!next.some((h) => h.serial != null && h.serial === o.serial)) {
          next.push(o);
        }
      }
      return next.slice(0, 10);
    });
    setWants((prev) => {
      const next = [...prev];
      for (const o of importedWants) {
        if (!next.some((w) => w.collectionId === o.collectionId)) {
          next.push(o);
        }
      }
      return next.slice(0, 10);
    });
  }

  const [activeTab, setActiveTab] = useState<"have" | "want">("have");
  const [anyWantOpen, setAnyWantOpen] = useState(false);
  const [previewHover, setPreviewHover] = useState<{
    image: string;
    top: number;
    left: number;
  } | null>(null);

  const handlePreviewMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>, image: string | undefined) => {
      if (!image) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // Tooltip image is w-24 (96px) wide, aspect ~2:3 so ~144px tall.
      // Flip upward if within 160px of the bottom of the viewport to avoid
      // the tooltip extending off-screen and triggering a scroll feedback loop.
      const previewHeight = 160;
      const top =
        rect.bottom + previewHeight > window.innerHeight
          ? Math.max(8, rect.bottom - previewHeight)
          : rect.top;
      setPreviewHover({ image, top, left: rect.right + 8 });
    },
    [],
  );

  const handlePreviewMouseLeave = useCallback(() => {
    setPreviewHover(null);
  }, []);

  function handleArtistChange(next: string[]) {
    setAnyArtist(next);
  }

  if (!session) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">
          Please sign in to create a trade.
        </p>
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  async function handleSubmit() {
    if (haves.length === 0 || (wants.length === 0 && anyWants.length === 0)) {
      toast.error("Select at least one objekt for both Have and Want");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description || undefined,
          wantsOnly,
          haves: haves.map((o) => ({
            collectionId: o.collectionId,
            collectionNo: o.collectionNo,
            member: o.member,
            season: o.season,
            class: o.class,
            serial: o.serial,
            objektId: o.objektId,
            thumbnailUrl: o.thumbnailImage,
          })),
          wants: [
            ...wants.map((o) => ({
              collectionId: o.collectionId,
              collectionNo: o.collectionNo,
              member: o.member,
              season: o.season,
              class: o.class,
              thumbnailUrl: o.thumbnailImage,
            })),
            ...anyWants.map((w) => ({
              collectionId: "",
              isAny: true,
              artist: w.artist,
              member: w.member,
              season: w.season,
              class: w.class,
            })),
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("Trade posted!");
      router.push(`/trades/${data.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create trade",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl sm:mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">New Trade</h1>
          <p className="text-muted-foreground">
            Select what you have and what you want
          </p>
        </div>
        <PasteImportDialog
          onImport={handlePasteImport}
          existingHaveCount={haves.length}
          existingWantCount={wants.length}
        />
      </div>

      <TradeFilters
        filters={filters}
        onChange={setFilters}
        showSort={false}
        showFilterMode={false}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "have" | "want")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="have">Have ({haves.length})</TabsTrigger>
          <TabsTrigger value="want">
            Want ({wants.length + anyWants.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="have">
          <Card className="border-0 sm:border py-2 sm:py-6 gap-3 sm:gap-6 shadow-none sm:shadow-sm">
            <CardHeader className="px-0 sm:px-6">
              <CardTitle className="text-lg">What do you have?</CardTitle>
              <CardDescription>
                Select objekts you want to trade away
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <ObjektOwnedPicker
                selected={haves}
                onSelect={(o) => setHaves((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setHaves((prev) =>
                    prev.filter((h) =>
                      o.serial != null
                        ? h.serial !== o.serial
                        : h.collectionId !== o.collectionId,
                    ),
                  )
                }
                filters={filters}
              />
            </CardContent>
          </Card>
          <Button className="w-full mt-3" onClick={() => setActiveTab("want")}>
            Wants →
          </Button>
        </TabsContent>

        <TabsContent value="want" className="space-y-3">
          {/* Specific objekt want picker */}
          <Card className="border-0 sm:border py-2 sm:py-6 gap-3 sm:gap-6 shadow-none sm:shadow-sm">
            <CardHeader className="px-0 sm:px-6 pb-3">
              <CardTitle className="text-lg">What do you want?</CardTitle>
              <CardDescription>
                Select specific objekts you&apos;re looking for
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6 space-y-3">
              <ObjektPicker
                selected={wants}
                onSelect={(o) => setWants((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setWants((prev) =>
                    prev.filter((w) => w.collectionId !== o.collectionId),
                  )
                }
                filters={filters}
              />
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="wants-only">Wants only</Label>
                  <p className="text-xs text-muted-foreground">
                    {wants.length === 0 && anyWants.length === 0
                      ? "Add at least one want item to enable this option"
                      : wantsOnly
                        ? "You will only accept offers containing at least one item from your want list"
                        : "You will receive trade offers from anyone, regardless of your want list"}
                  </p>
                </div>
                <Switch
                  id="wants-only"
                  checked={wantsOnly}
                  onCheckedChange={setWantsOnly}
                  disabled={wants.length === 0 && anyWants.length === 0}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="any-want-toggle">Add ANY want</Label>
                  <p className="text-xs text-muted-foreground">
                    Accept any objekt matching a filter — e.g. &quot;Any
                    HeeJin&quot; or &quot;Any Atom01&quot;
                  </p>
                </div>
                <Switch
                  id="any-want-toggle"
                  checked={anyWantOpen}
                  onCheckedChange={setAnyWantOpen}
                />
              </div>
              {anyWantOpen && (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    <MultiSelect
                      options={filterOptions.artists}
                      value={anyArtist}
                      onChange={handleArtistChange}
                      placeholder="Artist"
                      className="min-w-28"
                    />
                    <MultiSelect
                      options={availableAnyMembers.map((m) => ({
                        label: m,
                        value: m,
                      }))}
                      value={anyWants.flatMap((w) =>
                        w.member ? [w.member] : [],
                      )}
                      onChange={(next) => {
                        const prev = anyWants.flatMap((w) =>
                          w.member ? [w.member] : [],
                        );
                        const added = next.filter((v) => !prev.includes(v));
                        const removed = prev.filter((v) => !next.includes(v));
                        const removedKeys = new Set(
                          removed.map((m) =>
                            anyWantKey({ isAny: true, member: m }),
                          ),
                        );
                        setAnyWants((ws) => [
                          ...ws.filter((w) => !removedKeys.has(anyWantKey(w))),
                          ...added.map((m) => ({
                            isAny: true as const,
                            member: m,
                          })),
                        ]);
                      }}
                      placeholder="Member"
                      className="min-w-32"
                    />
                    <SeasonMultiSelect
                      options={availableAnySeasons}
                      columns={filterOptions.seasonColumns}
                      value={anyWants.flatMap((w) => {
                        if (!w.season) return [];
                        return [
                          w.artist ? `${w.artist}::${w.season}` : w.season,
                        ];
                      })}
                      onChange={(next) => {
                        const prev = anyWants.flatMap((w) => {
                          if (!w.season) return [];
                          return [
                            w.artist ? `${w.artist}::${w.season}` : w.season,
                          ];
                        });
                        const added = next.filter((v) => !prev.includes(v));
                        const removed = prev.filter((v) => !next.includes(v));
                        const removedKeys = new Set(
                          removed.map((s) => {
                            const d = decodeGroupedValue(s);
                            return anyWantKey({
                              isAny: true,
                              artist: d?.artistId,
                              season: d?.item ?? s,
                            });
                          }),
                        );
                        setAnyWants((ws) => [
                          ...ws.filter((w) => !removedKeys.has(anyWantKey(w))),
                          ...added.map((s) => {
                            const d = decodeGroupedValue(s);
                            return {
                              isAny: true as const,
                              artist: d?.artistId,
                              season: d?.item ?? s,
                            };
                          }),
                        ]);
                      }}
                      placeholder="Season"
                      className="min-w-32"
                    />
                    <ClassMultiSelect
                      options={availableAnyClasses}
                      columns={filterOptions.classColumns}
                      value={anyWants.flatMap((w) => {
                        if (!w.class) return [];
                        return [w.artist ? `${w.artist}::${w.class}` : w.class];
                      })}
                      onChange={(next) => {
                        const prev = anyWants.flatMap((w) => {
                          if (!w.class) return [];
                          return [
                            w.artist ? `${w.artist}::${w.class}` : w.class,
                          ];
                        });
                        const added = next.filter((v) => !prev.includes(v));
                        const removed = prev.filter((v) => !next.includes(v));
                        const removedKeys = new Set(
                          removed.map((c) => {
                            const d = decodeGroupedValue(c);
                            return anyWantKey({
                              isAny: true,
                              artist: d?.artistId,
                              class: d?.item ?? c,
                            });
                          }),
                        );
                        setAnyWants((ws) => [
                          ...ws.filter((w) => !removedKeys.has(anyWantKey(w))),
                          ...added.map((c) => {
                            const d = decodeGroupedValue(c);
                            return {
                              isAny: true as const,
                              artist: d?.artistId,
                              class: d?.item ?? c,
                            };
                          }),
                        ]);
                      }}
                      placeholder="Class"
                      className="min-w-28"
                    />
                  </div>
                  {anyWants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {anyWants.map((w, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="gap-1 text-xs"
                        >
                          {anyWantLabel(w)}
                          <button
                            type="button"
                            onClick={() =>
                              setAnyWants((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Button className="w-full" onClick={() => setActiveTab("have")}>
            ← Haves
          </Button>
        </TabsContent>
      </Tabs>

      {/* Trade Preview */}
      {(haves.length > 0 || wants.length > 0 || anyWants.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>How your trade post will appear</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Image row */}
            <div className="flex gap-6">
              {haves.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    HAVE
                  </p>
                  <div className="flex flex-wrap gap-2 items-start">
                    {haves.map((item, i) => {
                      const haveUrl =
                        haveImages.get(item.collectionId) ??
                        item.thumbnailImage;
                      return (
                        <div
                          key={i}
                          className="flex flex-col items-center gap-1"
                        >
                          <div className="relative group/thumb">
                            {haveUrl ? (
                              <img
                                src={haveUrl}
                                alt={item.collectionId}
                                className="w-20 h-auto rounded-md border"
                              />
                            ) : (
                              <div className="w-20 h-28 rounded-md border bg-muted animate-pulse" />
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setHaves((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-md"
                            >
                              <XIcon className="w-6 h-6 text-white" />
                            </button>
                          </div>
                          <span className="text-[10px] text-muted-foreground text-center max-w-20 truncate">
                            {item.member && item.collectionNo
                              ? `${item.member} ${item.collectionNo}`
                              : item.collectionId}
                          </span>
                          {item.serial != null && (
                            <span className="text-[10px] text-muted-foreground">
                              #{String(item.serial).padStart(5, "0")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(wants.length > 0 || anyWants.length > 0) && (
                <>
                  <Separator orientation="vertical" className="h-auto" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      WANT
                    </p>
                    <div className="flex flex-wrap gap-2 items-start">
                      {anyWants.map((w, i) => (
                        <div
                          key={`any-${i}`}
                          className="flex flex-col items-center gap-1"
                        >
                          <div className="relative group/thumb w-20 h-28 rounded-md border bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center p-1">
                            {anyWantLabel(w)}
                            <button
                              type="button"
                              onClick={() =>
                                setAnyWants((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-md"
                            >
                              <XIcon className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {wants.map((item, i) => {
                        const url =
                          wantImages.get(item.collectionId) ??
                          item.thumbnailImage;
                        return (
                          <div
                            key={i}
                            className="flex flex-col items-center gap-1"
                          >
                            <div className="relative group/thumb">
                              {url ? (
                                <img
                                  src={url}
                                  alt={item.collectionId}
                                  className="w-20 h-auto rounded-md border"
                                />
                              ) : (
                                <div className="w-20 h-28 rounded-md border bg-muted animate-pulse" />
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setWants((prev) =>
                                    prev.filter((_, j) => j !== i),
                                  )
                                }
                                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-md"
                              >
                                <XIcon className="w-6 h-6 text-white" />
                              </button>
                            </div>
                            <span className="text-[10px] text-muted-foreground text-center max-w-20 truncate">
                              {item.member && item.collectionNo
                                ? `${item.member} ${item.collectionNo}`
                                : item.collectionId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Text list row */}
            <div className="flex gap-6">
              {haves.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    HAVE
                  </p>
                  <div className="flex flex-col gap-1">
                    {haves.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        className="objekt-list-row group/row w-full text-left cursor-pointer hover:border-destructive/50 hover:bg-destructive/5"
                        onMouseEnter={(e) =>
                          handlePreviewMouseEnter(
                            e,
                            haveImages.get(item.collectionId) ??
                              item.thumbnailImage,
                          )
                        }
                        onMouseLeave={handlePreviewMouseLeave}
                        onClick={() =>
                          setHaves((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <span>
                          <span className="text-muted-foreground">
                            {item.artist}
                          </span>{" "}
                          {item.member}{" "}
                          <span className="font-mono">{item.collectionNo}</span>
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {item.season} · {item.class}
                          {item.serial != null
                            ? ` · #${String(item.serial).padStart(5, "0")}`
                            : ""}
                          <XIcon className="w-3 h-3 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 text-destructive" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(wants.length > 0 || anyWants.length > 0) && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    WANT
                  </p>
                  <div className="flex flex-col gap-1">
                    {anyWants.map((w, i) => (
                      <button
                        key={`any-${i}`}
                        type="button"
                        className="group/row text-sm px-2 py-1 rounded border border-border flex items-center justify-between w-full text-left cursor-pointer hover:border-destructive/50 hover:bg-destructive/5"
                        onClick={() =>
                          setAnyWants((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        {anyWantLabel(w)}
                        <XIcon className="w-3 h-3 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 text-destructive" />
                      </button>
                    ))}
                    {wants.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        className="objekt-list-row group/row w-full text-left cursor-pointer hover:border-destructive/50 hover:bg-destructive/5"
                        onMouseEnter={(e) =>
                          handlePreviewMouseEnter(
                            e,
                            wantImages.get(item.collectionId) ??
                              item.thumbnailImage,
                          )
                        }
                        onMouseLeave={handlePreviewMouseLeave}
                        onClick={() =>
                          setWants((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <span>
                          <span className="text-muted-foreground">
                            {item.artist}
                          </span>{" "}
                          {item.member}{" "}
                          <span className="font-mono">{item.collectionNo}</span>
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {item.season} · {item.class}
                          <XIcon className="w-3 h-3 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 text-destructive" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {description && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">{description}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Note (optional)</Label>
            <Input
              id="description"
              placeholder="Any additional details about this trade..."
              value={description}
              onChange={(e) => setDescription(sanitizeNoteText(e.target.value))}
            />
          </div>

          <div className="flex gap-4 items-center">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={
                submitting ||
                haves.length === 0 ||
                (wants.length === 0 && anyWants.length === 0)
              }
              className="flex-1"
            >
              {submitting ? "Posting..." : "Post Trade"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {haves.length} have, {wants.length + anyWants.length} want
            </p>
          </div>
        </CardContent>
      </Card>
      {previewHover && (
        <div
          className="objekt-hover-preview"
          style={{ top: previewHover.top, left: previewHover.left }}
        >
          <img src={previewHover.image} alt="" className="w-24 h-auto block" />
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post this trade?</AlertDialogTitle>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Your trade will be visible to everyone and open for offers.</p>
              {!discordDismissed && (
                <div className="rounded-md border border-[#5865F2]/40 bg-[#5865F2]/10 px-3 py-2.5 space-y-1.5">
                  <p className="font-medium text-[#7289da]">
                    Get notified on Discord
                  </p>
                  <p>
                    Join our server to receive Discord DM you when someone sends
                    a trade offer or responds to yours. Without it, you
                    won&apos;t receive any notifications.
                  </p>
                  <a
                    href="https://discord.gg/SWEm6RbJD3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block font-medium text-[#7289da] underline hover:text-[#5865F2] transition-colors"
                    onClick={() => {
                      localStorage.setItem("discord-banner-dismissed", "1");
                      setDiscordDismissed(true);
                    }}
                  >
                    Join Server →
                  </a>
                </div>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                handleSubmit();
              }}
            >
              Post Trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
