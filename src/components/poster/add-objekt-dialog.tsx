"use client";

import { SearchIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { ObjektInventoryPicker } from "@/components/objekt/objekt-inventory-picker";
import { ObjektPicker } from "@/components/objekt/objekt-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { fetchInventoryByNickname } from "@/lib/cosmo-inventory";

const GRID_CLASS = "md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";

function pickerActions(
  onCancel?: () => void,
  onConfirm?: () => void,
  confirmLabel?: string,
) {
  if (!onCancel && !onConfirm) return undefined;
  return (
    <>
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
    </>
  );
}

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
  const fetchItems = useCallback(
    () => fetchInventoryByNickname(cosmoId),
    [cosmoId],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SearchIcon className="h-3 w-3" />
        Showing inventory for{" "}
        <span className="font-medium text-foreground">{cosmoId}</span>
      </div>
      <ObjektInventoryPicker
        fetchItems={fetchItems}
        selected={selected}
        onSelect={onSelect}
        onDeselect={onDeselect}
        maxSelections={50}
        gridClassName={GRID_CLASS}
        showFilterBar
        filterBarActions={pickerActions(onCancel, onConfirm, confirmLabel)}
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
  const [filters, setFilters] = useState<ObjektFilterState>(defaultFilters);

  return (
    <div className="space-y-3">
      <ObjektFilterBar
        filters={filters}
        onChange={setFilters}
        showSearch={false}
        showSort={false}
        showFilterMode={false}
        actions={pickerActions(onCancel, onConfirm, confirmLabel)}
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
