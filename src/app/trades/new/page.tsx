"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
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

  // State for the "Add ANY want" builder
  const [anyArtist, setAnyArtist] = useState<string[]>([]);
  const [anyMember, setAnyMember] = useState<string[]>([]);
  const [anySeason, setAnySeason] = useState<string[]>([]);
  const [anyClass, setAnyClass] = useState<string[]>([]);

  const availableAnyMembers = getAvailableMembers(anyArtist);
  const availableAnySeasons = getAvailableSeasons(anyArtist);
  const availableAnyClasses = getAvailableClasses(anyArtist);

  function handleAddAnyWant() {
    // Each selected value becomes its own ANY want chip
    const entries: AnyWant[] = [];
    for (const m of anyMember) entries.push({ isAny: true, member: m });
    for (const s of anySeason) {
      if (!anyMember.length) entries.push({ isAny: true, season: s, artist: anyArtist[0] });
    }
    for (const c of anyClass) {
      if (!anyMember.length && !anySeason.length) entries.push({ isAny: true, class: c });
    }
    if (!anyMember.length && !anySeason.length && !anyClass.length) {
      for (const a of anyArtist) entries.push({ isAny: true, artist: a });
    }
    if (entries.length === 0) return;
    setAnyWants((prev) => [...prev, ...entries]);
    setAnyArtist([]);
    setAnyMember([]);
    setAnySeason([]);
    setAnyClass([]);
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
                  onChange={(v) => {
                    setAnyArtist(v);
                    setAnyMember((prev) => prev.filter((m) => getAvailableMembers(v).includes(m)));
                    setAnySeason((prev) => prev.filter((s) => getAvailableSeasons(v).includes(s)));
                    setAnyClass((prev) => prev.filter((c) => getAvailableClasses(v).includes(c)));
                  }}
                  placeholder="Artist"
                  className="min-w-28"
                />
                <MultiSelect
                  options={availableAnyMembers.map((m) => ({ label: m, value: m }))}
                  value={anyMember}
                  onChange={setAnyMember}
                  placeholder="Member"
                  className="min-w-32"
                />
                <MultiSelect
                  options={availableAnySeasons.map((s) => ({ label: s, value: s }))}
                  value={anySeason}
                  onChange={setAnySeason}
                  placeholder="Season"
                  className="min-w-32"
                />
                <MultiSelect
                  options={availableAnyClasses.map((c) => ({ label: c, value: c }))}
                  value={anyClass}
                  onChange={setAnyClass}
                  placeholder="Class"
                  className="min-w-28"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddAnyWant}
                  disabled={!anyArtist.length && !anyMember.length && !anySeason.length && !anyClass.length}
                  className="h-9"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add
                </Button>
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
    </div>
  );
}
