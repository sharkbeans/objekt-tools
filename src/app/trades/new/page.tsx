"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/auth-client";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { TradeFilters, defaultFilters, type TradeFilterState } from "@/components/trades/trade-filters";
import {
  validArtists,
  validClasses,
  validSeasons,
  classArtistMap,
  seasonArtistMap,
  membersByArtist,
  type ValidArtist,
} from "@/lib/filters";

export type AnyWant = {
  isAny: true;
  artist?: string;
  member?: string;
  season?: string;
  class?: string;
};

function anyWantLabel(w: AnyWant): string {
  if (w.member) return `Any ${w.member}`;
  if (w.season && w.artist) return `Any ${w.artist} ${w.season}`;
  if (w.season) return `Any ${w.season}`;
  if (w.artist) return `Any ${w.artist}`;
  if (w.class) return `Any ${w.class}`;
  return "Any";
}

function anyWantKey(w: AnyWant): string {
  return [w.artist, w.member, w.season, w.class].join("|");
}

function useObjektImages(items: { collectionId: string }[]) {
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!items.length) return;
    const unique = [...new Set(items.map((i) => i.collectionId).filter(Boolean))];
    unique.forEach((collectionId) => {
      fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
        .then((res) => res.json())
        .then((data) => {
          const match = data.results?.find((r: any) => r.collectionId === collectionId);
          const url = match?.thumbnailImage ?? match?.frontImage;
          if (url) setImages((prev) => new Map(prev).set(collectionId, url));
        })
        .catch(() => {});
    });
  }, [items.map((i) => i.collectionId).join(",")]);

  return images;
}

function getAvailableSeasons(artists: string[]): string[] {
  if (!artists.length) return [...validSeasons];
  const seasons = new Set<string>();
  for (const a of artists) {
    const map = seasonArtistMap.find((m) => m.artistId === a);
    for (const s of map?.seasons ?? []) seasons.add(s);
  }
  return [...validSeasons].filter((s) => seasons.has(s));
}

function getAvailableClasses(artists: string[]): string[] {
  if (!artists.length) return [...validClasses];
  const classes = new Set<string>();
  for (const a of artists) {
    const map = classArtistMap.find((m) => m.artistId === a);
    for (const c of map?.classes ?? []) classes.add(c);
  }
  return [...validClasses].filter((c) => classes.has(c));
}

function getAvailableMembers(artists: string[]): string[] {
  const source = artists.length
    ? artists.flatMap((a) => membersByArtist[a as ValidArtist] ?? [])
    : Object.values(membersByArtist).flat();
  return [...new Set(source)];
}

export default function NewTradePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [haves, setHaves] = useState<ObjektEntry[]>([]);
  const [wants, setWants] = useState<ObjektEntry[]>([]);
  const [anyWants, setAnyWants] = useState<AnyWant[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<TradeFilterState>(defaultFilters);

  // State for the "Add ANY want" dropdowns
  const [anyArtist, setAnyArtist] = useState<string[]>([]);
  const [anyMember, setAnyMember] = useState<string[]>([]);
  const [anySeason, setAnySeason] = useState<string[]>([]);
  const [anyClass, setAnyClass] = useState<string[]>([]);

  const availableAnyMembers = getAvailableMembers(anyArtist);
  const availableAnySeasons = getAvailableSeasons(anyArtist);
  const availableAnyClasses = getAvailableClasses(anyArtist);

  const wantImages = useObjektImages(wants);

  // Build a want from a single filter value and add/remove it automatically
  function syncAnyWant(
    prev: AnyWant[],
    added: string[],
    removed: string[],
    makeWant: (v: string) => AnyWant,
  ): AnyWant[] {
    const key = (w: AnyWant) => anyWantKey(w);
    const removedKeys = new Set(removed.map((v) => key(makeWant(v))));
    return [
      ...prev.filter((w) => !removedKeys.has(key(w))),
      ...added.filter((v) => !prev.some((w) => key(w) === key(makeWant(v)))).map(makeWant),
    ];
  }

  function handleArtistChange(next: string[]) {
    const prev = anyArtist;
    const added = next.filter((v) => !prev.includes(v));
    const removed = prev.filter((v) => !next.includes(v));
    setAnyArtist(next);
    setAnyMember((m) => m.filter((v) => getAvailableMembers(next).includes(v)));
    setAnySeason((s) => s.filter((v) => getAvailableSeasons(next).includes(v)));
    setAnyClass((c) => c.filter((v) => getAvailableClasses(next).includes(v)));
    // Only add/remove artist-level chips when no sub-filters are active
    setAnyWants((w) => {
      if (anyMember.length || anySeason.length || anyClass.length) return w;
      return syncAnyWant(w, added, removed, (a) => ({ isAny: true, artist: a }));
    });
  }

  function handleMemberChange(next: string[]) {
    const prev = anyMember;
    const added = next.filter((v) => !prev.includes(v));
    const removed = prev.filter((v) => !next.includes(v));
    setAnyMember(next);
    // When adding first member, remove bare artist chips
    setAnyWants((w) => {
      let result = syncAnyWant(w, added, removed, (m) => ({ isAny: true, member: m }));
      if (added.length && !prev.length) {
        result = result.filter((x) => !anyArtist.some((a) => anyWantKey(x) === anyWantKey({ isAny: true, artist: a })));
      }
      if (next.length === 0 && anyArtist.length) {
        result = syncAnyWant(result, anyArtist, [], (a) => ({ isAny: true, artist: a }));
      }
      return result;
    });
  }

  function handleSeasonChange(next: string[]) {
    const prev = anySeason;
    const added = next.filter((v) => !prev.includes(v));
    const removed = prev.filter((v) => !next.includes(v));
    setAnySeason(next);
    if (anyMember.length) return; // members take precedence
    setAnyWants((w) => {
      let result = syncAnyWant(w, added, removed, (s) => ({ isAny: true, season: s, artist: anyArtist[0] }));
      if (added.length && !prev.length) {
        result = result.filter((x) => !anyArtist.some((a) => anyWantKey(x) === anyWantKey({ isAny: true, artist: a })));
      }
      if (next.length === 0 && anyArtist.length && !anyMember.length) {
        result = syncAnyWant(result, anyArtist, [], (a) => ({ isAny: true, artist: a }));
      }
      return result;
    });
  }

  function handleClassChange(next: string[]) {
    const prev = anyClass;
    const added = next.filter((v) => !prev.includes(v));
    const removed = prev.filter((v) => !next.includes(v));
    setAnyClass(next);
    if (anyMember.length || anySeason.length) return;
    setAnyWants((w) => {
      let result = syncAnyWant(w, added, removed, (c) => ({ isAny: true, class: c }));
      if (added.length && !prev.length) {
        result = result.filter((x) => !anyArtist.some((a) => anyWantKey(x) === anyWantKey({ isAny: true, artist: a })));
      }
      if (next.length === 0 && anyArtist.length && !anyMember.length && !anySeason.length) {
        result = syncAnyWant(result, anyArtist, [], (a) => ({ isAny: true, artist: a }));
      }
      return result;
    });
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Please sign in to create a trade.
        </p>
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
          haves: haves.map((o) => ({
            collectionId: o.collectionId,
            collectionNo: o.collectionNo,
            member: o.member,
            season: o.season,
            class: o.class,
            serial: o.serial,
            objektId: o.objektId,
          })),
          wants: [
            ...wants.map((o) => ({
              collectionId: o.collectionId,
              collectionNo: o.collectionNo,
              member: o.member,
              season: o.season,
              class: o.class,
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Trade</h1>
        <p className="text-muted-foreground">
          Select what you have and what you want
        </p>
      </div>

      <TradeFilters filters={filters} onChange={setFilters} showSort={false} showFilterMode={false} />

      <Tabs defaultValue="have">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="have">Have ({haves.length})</TabsTrigger>
          <TabsTrigger value="want">Want ({wants.length + anyWants.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="have">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What do you have?</CardTitle>
              <CardDescription>
                Select objekts you want to trade away
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ObjektOwnedPicker
                selected={haves}
                onSelect={(o) => setHaves((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setHaves((prev) =>
                    prev.filter((h) =>
                      o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId,
                    ),
                  )
                }
                filters={filters}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="want" className="space-y-3">
          {/* ANY want builder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Add ANY want</CardTitle>
              <CardDescription>
                Accept any objekt matching a filter — e.g. &quot;Any HeeJin&quot; or &quot;Any artms Atom01&quot;
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <MultiSelect
                  options={validArtists.map((a) => ({ label: a, value: a }))}
                  value={anyArtist}
                  onChange={handleArtistChange}
                  placeholder="Artist"
                  className="min-w-28"
                />
                <MultiSelect
                  options={availableAnyMembers.map((m) => ({ label: m, value: m }))}
                  value={anyMember}
                  onChange={handleMemberChange}
                  placeholder="Member"
                  className="min-w-32"
                />
                <MultiSelect
                  options={availableAnySeasons.map((s) => ({ label: s, value: s }))}
                  value={anySeason}
                  onChange={handleSeasonChange}
                  placeholder="Season"
                  className="min-w-32"
                />
                <MultiSelect
                  options={availableAnyClasses.map((c) => ({ label: c, value: c }))}
                  value={anyClass}
                  onChange={handleClassChange}
                  placeholder="Class"
                  className="min-w-28"
                />
              </div>
              {anyWants.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {anyWants.map((w, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs">
                      {anyWantLabel(w)}
                      <button
                        type="button"
                        onClick={() => setAnyWants((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Specific objekt want picker */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">What do you want?</CardTitle>
              <CardDescription>
                Select specific objekts you&apos;re looking for
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Note (optional)</Label>
            <Input
              id="description"
              placeholder="Any additional details about this trade..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-4 items-center">
            <Button
              onClick={handleSubmit}
              disabled={submitting || haves.length === 0 || (wants.length === 0 && anyWants.length === 0)}
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
                  <p className="text-xs font-medium text-muted-foreground mb-2">HAVE</p>
                  <div className="flex flex-wrap gap-2 items-start">
                    {haves.map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        {item.thumbnailImage ? (
                          <img
                            src={item.thumbnailImage}
                            alt={item.collectionId}
                            className="w-20 h-auto rounded-md border"
                          />
                        ) : (
                          <div className="w-20 h-28 rounded-md border bg-muted animate-pulse" />
                        )}
                        <span className="text-[10px] text-muted-foreground text-center max-w-20 truncate">
                          {item.member && item.collectionNo ? `${item.member} ${item.collectionNo}` : item.collectionId}
                        </span>
                        {item.serial != null && (
                          <span className="text-[10px] text-muted-foreground">#{String(item.serial).padStart(5, "0")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(wants.length > 0 || anyWants.length > 0) && (
                <>
                  <Separator orientation="vertical" className="h-auto" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-2">WANT</p>
                    <div className="flex flex-wrap gap-2 items-start">
                      {anyWants.map((w, i) => (
                        <div key={`any-${i}`} className="flex flex-col items-center gap-1">
                          <div className="w-20 h-28 rounded-md border bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center p-1">
                            {anyWantLabel(w)}
                          </div>
                        </div>
                      ))}
                      {wants.map((item, i) => {
                        const url = wantImages.get(item.collectionId) ?? item.thumbnailImage;
                        return (
                          <div key={i} className="flex flex-col items-center gap-1">
                            {url ? (
                              <img
                                src={url}
                                alt={item.collectionId}
                                className="w-20 h-auto rounded-md border"
                              />
                            ) : (
                              <div className="w-20 h-28 rounded-md border bg-muted animate-pulse" />
                            )}
                            <span className="text-[10px] text-muted-foreground text-center max-w-20 truncate">
                              {item.member && item.collectionNo ? `${item.member} ${item.collectionNo}` : item.collectionId}
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
                  <p className="text-sm font-medium text-muted-foreground mb-2">HAVE</p>
                  <div className="flex flex-col gap-1">
                    {haves.map((item, i) => (
                      <div key={i} className="text-sm px-2 py-1 rounded border border-border flex items-center justify-between">
                        <span>{item.member && item.collectionNo ? `${item.member} ${item.collectionNo}` : item.collectionId}</span>
                        {item.serial != null && (
                          <span className="text-xs text-muted-foreground">#{String(item.serial).padStart(5, "0")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(wants.length > 0 || anyWants.length > 0) && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground mb-2">WANT</p>
                  <div className="flex flex-col gap-1">
                    {anyWants.map((w, i) => (
                      <div key={`any-${i}`} className="text-sm px-2 py-1 rounded border border-border">
                        {anyWantLabel(w)}
                      </div>
                    ))}
                    {wants.map((item, i) => (
                      <div key={i} className="text-sm px-2 py-1 rounded border border-border">
                        {item.member && item.collectionNo ? `${item.member} ${item.collectionNo}` : item.collectionId}
                      </div>
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
    </div>
  );
}
