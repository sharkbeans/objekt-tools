"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import type { ObjektStructuralFilters } from "@/components/objekt/objekt-owned-picker";
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

const emptyFilters: ObjektStructuralFilters = {
  artist: [], member: [], season: [], class: [], on_offline: [],
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

  const res = await fetch(`/api/objekts/by-nickname/${encodeURIComponent(nickname)}`);
  if (res.status === 429) throw new Error("Too many requests. Try again later.");
  if (res.status === 404) throw new Error(`Cosmo user "${nickname}" not found.`);
  if (!res.ok) throw new Error("Failed to load inventory.");
  const data = await res.json();
  const results: OwnedEntry[] = data.results ?? [];
  inventoryCache.set(key, { data: results, expiresAt: Date.now() + INVENTORY_CACHE_TTL });
  return results;
}

// ── Shared filter bar ─────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
}: {
  filters: ObjektStructuralFilters;
  onChange: (partial: Partial<ObjektStructuralFilters>) => void;
}) {
  const filterOptions = useFilterOptions();

  const availableSeasons = filters.artist.length
    ? filters.artist.flatMap((a) => filterOptions.seasonsByArtist[a] ?? [])
    : filterOptions.allSeasons;
  const availableClasses = filters.artist.length
    ? filters.artist.flatMap((a) => filterOptions.classesByArtist[a] ?? [])
    : filterOptions.allClasses;
  const availableMembers = filters.artist.length
    ? filters.artist.flatMap((a) => filterOptions.membersByArtist[a] ?? [])
    : filterOptions.allMembers;

  function handleArtistChange(artists: string[]) {
    const newSeasons = artists.length
      ? artists.flatMap((a) => filterOptions.seasonsByArtist[a] ?? [])
      : filterOptions.allSeasons;
    const newClasses = artists.length
      ? artists.flatMap((a) => filterOptions.classesByArtist[a] ?? [])
      : filterOptions.allClasses;
    const newMembers = artists.length
      ? artists.flatMap((a) => filterOptions.membersByArtist[a] ?? [])
      : filterOptions.allMembers;
    onChange({
      artist: artists,
      season: filters.season.filter((s) => {
        const d = decodeGroupedValue(s);
        return d ? newSeasons.includes(d.item) : newSeasons.includes(s);
      }),
      class: filters.class.filter((c) => {
        const d = decodeGroupedValue(c);
        return d ? newClasses.includes(d.item) : newClasses.includes(c);
      }),
      member: filters.member.filter((m) => newMembers.includes(m)),
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
      <MultiSelect
        options={filterOptions.artists}
        value={filters.artist}
        onChange={handleArtistChange}
        placeholder="Artist"
        className="w-full sm:w-auto sm:min-w-28"
      />
      <MultiSelect
        options={availableMembers.map((m) => ({ label: m, value: m }))}
        value={filters.member}
        onChange={(v) => onChange({ member: v })}
        placeholder="Member"
        className="w-full sm:w-auto sm:min-w-32"
      />
      <SeasonMultiSelect
        options={availableSeasons}
        columns={filterOptions.seasonColumns}
        value={filters.season}
        onChange={(v) => onChange({ season: v })}
        placeholder="Season"
        className="w-full sm:w-auto sm:min-w-32"
      />
      <ClassMultiSelect
        options={availableClasses}
        columns={filterOptions.classColumns}
        value={filters.class}
        onChange={(v) => onChange({ class: v })}
        placeholder="Class"
        className="w-full sm:w-auto sm:min-w-28"
      />
      <MultiSelect
        options={validOnlineTypes.map((t) => ({
          label: t === "online" ? "Digital" : "Physical",
          value: t,
        }))}
        value={filters.on_offline}
        onChange={(v) => onChange({ on_offline: v })}
        placeholder="Type"
        className="w-full sm:w-auto sm:min-w-24"
      />
    </div>
  );
}

const GRID_CLASS = "md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";

// ── Inventory picker (have + cosmoId) ─────────────────────────────────────

function InventoryPicker({
  cosmoId,
  selected,
  onSelect,
  onDeselect,
}: {
  cosmoId: string;
  selected: ObjektEntry[];
  onSelect: (o: ObjektEntry) => void;
  onDeselect: (o: ObjektEntry) => void;
}) {
  const [inventory, setInventory] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textFilter, setTextFilter] = useState("");
  const [filters, setFilters] = useState<ObjektStructuralFilters>(emptyFilters);
  const lastFetchedRef = useRef<string>("");

  useEffect(() => {
    if (lastFetchedRef.current === cosmoId) return;
    lastFetchedRef.current = cosmoId;
    setLoading(true);
    setError(null);
    fetchByNickname(cosmoId)
      .then(setInventory)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load inventory."))
      .finally(() => setLoading(false));
  }, [cosmoId]);

  const filtered = useMemo(() => {
    let r = inventory;
    if (textFilter.trim()) r = r.filter((o) => objektMatchesSearch(o, textFilter));
    if (filters.artist.length) {
      r = r.filter((o) => {
        const a = getInventoryArtist(o);
        return a ? filters.artist.includes(a) : false;
      });
    }
    if (filters.member.length) r = r.filter((o) => filters.member.includes(o.member));
    if (filters.season.length) {
      r = r.filter((o) =>
        filters.season.some((s) => {
          const d = decodeGroupedValue(s);
          return d ? d.item === o.season && d.artistId === getInventoryArtist(o) : s === o.season;
        }),
      );
    }
    if (filters.class.length) {
      r = r.filter((o) =>
        filters.class.some((c) => {
          const d = decodeGroupedValue(c);
          return d ? d.item === o.class && d.artistId === getInventoryArtist(o) : c === o.class;
        }),
      );
    }
    if (filters.on_offline.length) r = r.filter((o) => filters.on_offline.includes(getInventoryType(o)));
    return r;
  }, [inventory, textFilter, filters]);

  if (loading) {
    return <ObjektGridPicker items={[]} selected={[]} onSelect={() => {}} onDeselect={() => {}} loading />;
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SearchIcon className="h-3 w-3" />
        Showing inventory for <span className="font-medium text-foreground">{cosmoId}</span>
      </div>
      <Input
        placeholder="Filter... e.g. JiWoo, Atom02"
        value={textFilter}
        onChange={(e) => setTextFilter(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-form-type="other"
      />
      <FilterBar
        filters={filters}
        onChange={(partial) => setFilters((prev) => ({ ...prev, ...partial }))}
      />
      <ObjektGridPicker
        items={filtered}
        selected={selected}
        onSelect={onSelect}
        onDeselect={onDeselect}
        compareBySerial
        maxSelections={50}
        emptyMessage="No matching objekts"
        gridClassName={GRID_CLASS}
      />
    </div>
  );
}

// ── Global picker (want, or have without cosmoId) ─────────────────────────

function GlobalPicker({
  selected,
  onSelect,
  onDeselect,
}: {
  selected: ObjektEntry[];
  onSelect: (o: ObjektEntry) => void;
  onDeselect: (o: ObjektEntry) => void;
}) {
  const [filters, setFilters] = useState<ObjektStructuralFilters>(emptyFilters);

  return (
    <div className="space-y-3">
      <FilterBar
        filters={filters}
        onChange={(partial) => setFilters((prev) => ({ ...prev, ...partial }))}
      />
      <ObjektPicker
        selected={selected}
        onSelect={onSelect}
        onDeselect={onDeselect}
        maxSelections={50}
        filters={filters}
        gridClassName={GRID_CLASS}
      />
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────

interface AddObjektDialogProps {
  open: boolean;
  section: "have" | "want";
  cosmoId?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (section: "have" | "want", entries: ObjektEntry[]) => void;
}

export function AddObjektDialog({
  open,
  section,
  cosmoId,
  onOpenChange,
  onConfirm,
}: AddObjektDialogProps) {
  const [selected, setSelected] = useState<ObjektEntry[]>([]);

  function handleOpen(next: boolean) {
    if (next) setSelected([]);
    onOpenChange(next);
  }

  function handleConfirm() {
    if (selected.length === 0) return;
    onConfirm(section, selected);
    onOpenChange(false);
  }

  const label = section === "have" ? "Have" : "Want";
  const useInventory = section === "have" && !!cosmoId;

  function handleSelect(o: ObjektEntry) {
    setSelected((prev) => [...prev, o]);
  }

  function handleDeselect(o: ObjektEntry) {
    setSelected((prev) =>
      prev.filter((s) =>
        o.serial != null ? s.serial !== o.serial : s.collectionId !== o.collectionId,
      ),
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add to {label}</DialogTitle>
          <DialogDescription>
            {useInventory
              ? `Pick from ${cosmoId}'s inventory.`
              : `Search for objekts to add to your ${label.toLowerCase()} list.`}
          </DialogDescription>
        </DialogHeader>

        {useInventory ? (
          <InventoryPicker
            cosmoId={cosmoId}
            selected={selected}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
          />
        ) : (
          <GlobalPicker
            selected={selected}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.length === 0}>
            Add {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
