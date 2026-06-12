"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ObjektEntry } from "@/lib/cosmo/types";
import {
  fetchInventoryByNickname,
  getInventoryArtist,
  getInventoryType,
  type OwnedEntry,
} from "@/lib/cosmo-inventory";
import type { ObjektStructuralFilters } from "@/lib/filter-utils";
import { validOnlineTypes } from "@/lib/filters";
import { objektMatchesSearch } from "@/lib/objekt-search";

const emptyFilters: ObjektStructuralFilters = {
  artist: [],
  member: [],
  season: [],
  class: [],
  on_offline: [],
};

// ── Shared filter bar ─────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  filters: ObjektStructuralFilters;
  onChange: (partial: Partial<ObjektStructuralFilters>) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 flex-1 min-w-0">
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
      {(onCancel || onConfirm) && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onConfirm && (
            <Button size="sm" onClick={onConfirm}>
              {confirmLabel ?? "Confirm"}
            </Button>
          )}
        </div>
      )}
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
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  cosmoId: string;
  selected: ObjektEntry[];
  onSelect: (o: ObjektEntry) => void;
  onDeselect: (o: ObjektEntry) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
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
    fetchInventoryByNickname(cosmoId)
      .then(setInventory)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load inventory.",
        ),
      )
      .finally(() => setLoading(false));
  }, [cosmoId]);

  const filtered = useMemo(() => {
    let r = inventory;
    if (textFilter.trim())
      r = r.filter((o) => objektMatchesSearch(o, textFilter));
    if (filters.artist.length) {
      r = r.filter((o) => {
        const a = getInventoryArtist(o);
        return a ? filters.artist.includes(a) : false;
      });
    }
    if (filters.member.length)
      r = r.filter((o) => filters.member.includes(o.member));
    if (filters.season.length) {
      r = r.filter((o) =>
        filters.season.some((s) => {
          const d = decodeGroupedValue(s);
          return d
            ? d.item === o.season && d.artistId === getInventoryArtist(o)
            : s === o.season;
        }),
      );
    }
    if (filters.class.length) {
      r = r.filter((o) =>
        filters.class.some((c) => {
          const d = decodeGroupedValue(c);
          return d
            ? d.item === o.class && d.artistId === getInventoryArtist(o)
            : c === o.class;
        }),
      );
    }
    if (filters.on_offline.length)
      r = r.filter((o) => filters.on_offline.includes(getInventoryType(o)));
    return r;
  }, [inventory, textFilter, filters]);

  if (loading) {
    return (
      <ObjektGridPicker
        items={[]}
        selected={[]}
        onSelect={() => {}}
        onDeselect={() => {}}
        loading
      />
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SearchIcon className="h-3 w-3" />
        Showing inventory for{" "}
        <span className="font-medium text-foreground">{cosmoId}</span>
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
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
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
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  selected: ObjektEntry[];
  onSelect: (o: ObjektEntry) => void;
  onDeselect: (o: ObjektEntry) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const [filters, setFilters] = useState<ObjektStructuralFilters>(emptyFilters);

  return (
    <div className="space-y-3">
      <FilterBar
        filters={filters}
        onChange={(partial) => setFilters((prev) => ({ ...prev, ...partial }))}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
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

// ── Add Custom Want dialog ────────────────────────────────────────────────

interface AddCustomWantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (label: string) => void;
}

export function AddCustomWantDialog({
  open,
  onOpenChange,
  onConfirm,
}: AddCustomWantDialogProps) {
  const [text, setText] = useState("");

  function handleOpen(next: boolean) {
    if (next) setText("");
    onOpenChange(next);
  }

  function handleConfirm() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Custom Want</DialogTitle>
          <DialogDescription>e.g. "Any Atom02 FCO"</DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Type here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!text.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────

interface AddObjektDialogProps {
  open: boolean;
  section: "have" | "want";
  cosmoId?: string;
  initialSelected?: ObjektEntry[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (section: "have" | "want", entries: ObjektEntry[]) => void;
}

export function AddObjektDialog({
  open,
  section,
  cosmoId,
  initialSelected = [],
  onOpenChange,
  onConfirm,
}: AddObjektDialogProps) {
  const [selected, setSelected] = useState<ObjektEntry[]>(initialSelected);
  const initialSelectedRef = useRef(initialSelected);
  initialSelectedRef.current = initialSelected;

  function handleOpen(next: boolean) {
    if (next) setSelected(initialSelectedRef.current);
    onOpenChange(next);
  }

  function handleConfirm() {
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
        o.serial != null
          ? s.serial !== o.serial
          : s.collectionId !== o.collectionId,
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
            onCancel={() => onOpenChange(false)}
            onConfirm={handleConfirm}
            confirmLabel={`Apply (${selected.length})`}
          />
        ) : (
          <GlobalPicker
            selected={selected}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
            onCancel={() => onOpenChange(false)}
            onConfirm={handleConfirm}
            confirmLabel={`Apply (${selected.length})`}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Apply ({selected.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
