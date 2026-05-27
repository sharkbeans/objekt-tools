"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { Button } from "@/components/ui/button";
import {
  ClassMultiSelect,
  decodeGroupedValue,
  SeasonMultiSelect,
} from "@/components/ui/class-multi-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { normalizeArtistId } from "@/lib/artist-utils";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { getArtistForMember } from "@/lib/filter-utils";
import { validOnlineTypes } from "@/lib/filters";
import { objektMatchesSearch } from "@/lib/objekt-search";

type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

type InventoryFilters = {
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  on_offline: string[];
};

const emptyInventoryFilters: InventoryFilters = {
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
};

function getInventoryArtist(entry: ObjektEntry): string | null {
  return normalizeArtistId(getArtistForMember(entry.member) ?? entry.artist);
}

function getInventoryType(entry: ObjektEntry): "online" | "offline" {
  return entry.collectionNo.toLowerCase().endsWith("z") ? "offline" : "online";
}

const INVENTORY_CACHE_TTL = 90_000;
const inventoryCache = new Map<string, { data: OwnedEntry[]; expiresAt: number }>();

async function fetchByNickname(nickname: string): Promise<OwnedEntry[]> {
  const key = nickname.toLowerCase();
  const cached = inventoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const res = await fetch(
    `/api/objekts/by-nickname/${encodeURIComponent(nickname)}`,
  );
  if (res.status === 429)
    throw new Error("Too many requests. Try again later.");
  if (res.status === 404)
    throw new Error(`Cosmo user "${nickname}" not found.`);
  if (!res.ok) throw new Error("Failed to load inventory.");
  const data = await res.json();
  const results: OwnedEntry[] = data.results ?? [];
  inventoryCache.set(key, { data: results, expiresAt: Date.now() + INVENTORY_CACHE_TTL });
  return results;
}

type Step = "haves" | "wants";

interface CosmoPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled nickname. If provided and isLinked=true, auto-searches on open. */
  initialNickname?: string;
  /** Whether the current user is authed+linked to a Cosmo account. */
  isLinked?: boolean;
  onConfirm: (
    haves: ObjektEntry[],
    wants: ObjektEntry[],
    searchedNickname: string,
  ) => void;
}

export function CosmoPickerDialog({
  open,
  onOpenChange,
  initialNickname = "",
  isLinked = false,
  onConfirm,
}: CosmoPickerDialogProps) {
  const filterOptions = useFilterOptions();
  const [step, setStep] = useState<Step>("haves");
  const [nickname, setNickname] = useState(initialNickname);
  const [inventory, setInventory] = useState<OwnedEntry[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [searchedNickname, setSearchedNickname] = useState<string | null>(null);

  const [haveFilter, setHaveFilter] = useState("");
  const [inventoryFilters, setInventoryFilters] = useState<InventoryFilters>(
    emptyInventoryFilters,
  );
  const [selectedHaves, setSelectedHaves] = useState<ObjektEntry[]>([]);
  const [selectedWants, setSelectedWants] = useState<ObjektEntry[]>([]);

  // 3s cooldown between searches
  const lastSearchAt = useRef<number>(0);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setNickname(initialNickname);
      setStep("haves");
      setSelectedHaves([]);
      setSelectedWants([]);
      setInventory([]);
      setInventoryError(null);
      setSearchedNickname(null);
      setHaveFilter("");
      setInventoryFilters(emptyInventoryFilters);
      lastSearchAt.current = 0;
    }
  }, [open]); // intentionally not including initialNickname — handled below

  // Sync nickname when initialNickname changes while dialog is open
  useEffect(() => {
    if (open) setNickname(initialNickname);
  }, [initialNickname]);

  // Auto-search on open only for authed+linked users with a pre-filled nickname
  useEffect(() => {
    if (open && isLinked && initialNickname.trim()) {
      doSearch(initialNickname.trim());
    }
  }, [open]);

  function doSearch(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const now = Date.now();
    const elapsed = now - lastSearchAt.current;
    if (elapsed < 3000 && lastSearchAt.current !== 0) {
      const wait = Math.ceil((3000 - elapsed) / 1000);
      toast.error(`Please wait ${wait}s before searching again.`);
      return;
    }
    lastSearchAt.current = now;

    setInventoryLoading(true);
    setInventoryError(null);
    setInventory([]);
    setSearchedNickname(null);
    setSelectedHaves([]);
    setHaveFilter("");
    setInventoryFilters(emptyInventoryFilters);

    fetchByNickname(trimmed)
      .then((results) => {
        setInventory(results);
        setSearchedNickname(trimmed);
        if (results.length === 0) {
          setInventoryError("No transferable objekts found for this user.");
        }
      })
      .catch((err) => {
        setInventoryError(
          err instanceof Error ? err.message : "Failed to load inventory.",
        );
      })
      .finally(() => setInventoryLoading(false));
  }

  function handleSearch() {
    doSearch(nickname);
  }

  function handleNicknameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  const filteredInventory = useMemo(() => {
    let result = inventory;

    if (haveFilter.trim()) {
      result = result.filter((o) => objektMatchesSearch(o, haveFilter));
    }

    if (inventoryFilters.artist.length) {
      result = result.filter((o) => {
        const artist = getInventoryArtist(o);
        return artist ? inventoryFilters.artist.includes(artist) : false;
      });
    }

    if (inventoryFilters.member.length) {
      result = result.filter((o) => inventoryFilters.member.includes(o.member));
    }

    if (inventoryFilters.season.length) {
      result = result.filter((o) =>
        inventoryFilters.season.some((season) => {
          const decoded = decodeGroupedValue(season);
          const artist = getInventoryArtist(o);
          return decoded
            ? decoded.item === o.season && decoded.artistId === artist
            : season === o.season;
        }),
      );
    }

    if (inventoryFilters.class.length) {
      result = result.filter((o) =>
        inventoryFilters.class.some((className) => {
          const decoded = decodeGroupedValue(className);
          const artist = getInventoryArtist(o);
          return decoded
            ? decoded.item === o.class && decoded.artistId === artist
            : className === o.class;
        }),
      );
    }

    if (inventoryFilters.on_offline.length) {
      result = result.filter((o) =>
        inventoryFilters.on_offline.includes(getInventoryType(o)),
      );
    }

    return result;
  }, [inventory, haveFilter, inventoryFilters]);

  const availableSeasons = inventoryFilters.artist.length
    ? inventoryFilters.artist.flatMap(
        (artist) => filterOptions.seasonsByArtist[artist] ?? [],
      )
    : filterOptions.allSeasons;
  const availableClasses = inventoryFilters.artist.length
    ? inventoryFilters.artist.flatMap(
        (artist) => filterOptions.classesByArtist[artist] ?? [],
      )
    : filterOptions.allClasses;
  const availableMembers = inventoryFilters.artist.length
    ? inventoryFilters.artist.flatMap(
        (artist) => filterOptions.membersByArtist[artist] ?? [],
      )
    : filterOptions.allMembers;

  function updateInventoryFilters(partial: Partial<InventoryFilters>) {
    setInventoryFilters((prev) => ({ ...prev, ...partial }));
  }

  function handleArtistFilterChange(artists: string[]) {
    const newSeasons = artists.length
      ? artists.flatMap((artist) => filterOptions.seasonsByArtist[artist] ?? [])
      : filterOptions.allSeasons;
    const newClasses = artists.length
      ? artists.flatMap((artist) => filterOptions.classesByArtist[artist] ?? [])
      : filterOptions.allClasses;
    const newMembers = artists.length
      ? artists.flatMap((artist) => filterOptions.membersByArtist[artist] ?? [])
      : filterOptions.allMembers;
    setInventoryFilters((prev) => ({
      ...prev,
      artist: artists,
      season: prev.season.filter((season) => {
        const decoded = decodeGroupedValue(season);
        return decoded
          ? newSeasons.includes(decoded.item)
          : newSeasons.includes(season);
      }),
      class: prev.class.filter((className) => {
        const decoded = decodeGroupedValue(className);
        return decoded
          ? newClasses.includes(decoded.item)
          : newClasses.includes(className);
      }),
      member: prev.member.filter((member) => newMembers.includes(member)),
    }));
  }

  function handleConfirmHaves() {
    if (selectedHaves.length === 0) {
      toast.error("Select at least one objekt for Have");
      return;
    }
    setStep("wants");
  }

  function handleConfirmWants() {
    onConfirm(selectedHaves, selectedWants, searchedNickname ?? nickname);
    onOpenChange(false);
  }

  const inventoryLoaded = searchedNickname !== null && !inventoryLoading;
  const havesGridClassName = "md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          step === "haves"
            ? "max-h-[90vh] overflow-y-auto md:max-w-5xl"
            : "max-w-lg max-h-[90vh] overflow-y-auto"
        }
      >
        {step === "haves" ? (
          <>
            <DialogHeader>
              <DialogTitle>Select Haves</DialogTitle>
              <DialogDescription>
                Load a Cosmo inventory and pick the objekts you have.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Nickname input + search button */}
              <div className="flex gap-2">
                <Input
                  placeholder="Cosmo username"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onKeyDown={handleNicknameKeyDown}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-bwignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={handleSearch}
                  disabled={!nickname.trim() || inventoryLoading}
                  className="gap-1.5 bg-white text-black hover:bg-white/90"
                >
                  {inventoryLoading ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Search
                      <SearchIcon className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              {inventoryError && !inventoryLoading && (
                <p className="text-sm text-destructive">{inventoryError}</p>
              )}

              {/* Loading skeleton */}
              {inventoryLoading && (
                <ObjektGridPicker
                  items={[]}
                  selected={[]}
                  onSelect={() => {}}
                  onDeselect={() => {}}
                  loading
                  gridClassName={havesGridClassName}
                />
              )}

              {/* Inventory picker */}
              {inventoryLoaded && inventory.length > 0 && (
                <>
                  <Input
                    placeholder="Filter... e.g. JiWoo, Atom02"
                    value={haveFilter}
                    onChange={(e) => setHaveFilter(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-bwignore="true"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 sm:flex-1 sm:min-w-0">
                      <MultiSelect
                        options={filterOptions.artists}
                        value={inventoryFilters.artist}
                        onChange={handleArtistFilterChange}
                        placeholder="Artist"
                        className="w-full sm:w-auto sm:min-w-28"
                      />
                      <MultiSelect
                        options={availableMembers.map((member) => ({
                          label: member,
                          value: member,
                        }))}
                        value={inventoryFilters.member}
                        onChange={(value) =>
                          updateInventoryFilters({ member: value })
                        }
                        placeholder="Member"
                        className="w-full sm:w-auto sm:min-w-32"
                      />
                      <SeasonMultiSelect
                        options={availableSeasons}
                        columns={filterOptions.seasonColumns}
                        value={inventoryFilters.season}
                        onChange={(value) =>
                          updateInventoryFilters({ season: value })
                        }
                        placeholder="Season"
                        className="w-full sm:w-auto sm:min-w-32"
                      />
                      <ClassMultiSelect
                        options={availableClasses}
                        columns={filterOptions.classColumns}
                        value={inventoryFilters.class}
                        onChange={(value) =>
                          updateInventoryFilters({ class: value })
                        }
                        placeholder="Class"
                        className="w-full sm:w-auto sm:min-w-28"
                      />
                      <MultiSelect
                        options={validOnlineTypes.map((type) => ({
                          label: type === "online" ? "Digital" : "Physical",
                          value: type,
                        }))}
                        value={inventoryFilters.on_offline}
                        onChange={(value) =>
                          updateInventoryFilters({ on_offline: value })
                        }
                        placeholder="Type"
                        className="w-full sm:w-auto sm:min-w-24"
                      />
                    </div>
                    <div className="hidden sm:flex items-center gap-2 ml-auto shrink-0">
                      <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleConfirmHaves}
                        disabled={selectedHaves.length === 0}
                      >
                        Confirm Haves ({selectedHaves.length}) →
                      </Button>
                    </div>
                  </div>
                  <ObjektGridPicker
                    items={filteredInventory}
                    selected={selectedHaves}
                    onSelect={(o) => setSelectedHaves((prev) => [...prev, o])}
                    onDeselect={(o) =>
                      setSelectedHaves((prev) =>
                        prev.filter((h) =>
                          o.serial != null
                            ? h.serial !== o.serial
                            : h.collectionId !== o.collectionId,
                        ),
                      )
                    }
                    compareBySerial
                    maxSelections={50}
                    emptyMessage="No matching objekts"
                    gridClassName={havesGridClassName}
                  />
                  {selectedHaves.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {selectedHaves.length} selected
                    </p>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmHaves}
                disabled={selectedHaves.length === 0}
              >
                Confirm Haves ({selectedHaves.length}) →
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Select Wants</DialogTitle>
              <DialogDescription>
                Search for any objekts you want.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <ObjektPicker
                selected={selectedWants}
                onSelect={(o) => setSelectedWants((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setSelectedWants((prev) =>
                    prev.filter((w) => w.collectionId !== o.collectionId),
                  )
                }
                maxSelections={50}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("haves")}>
                ← Back
              </Button>
              <Button onClick={handleConfirmWants}>
                {selectedWants.length > 0
                  ? `Generate Poster (${selectedHaves.length}H / ${selectedWants.length}W)`
                  : "Generate Poster (no wants)"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
