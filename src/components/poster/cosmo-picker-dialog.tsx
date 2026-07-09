"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  defaultFilters,
  ObjektFilterBar,
  type ObjektFilterState,
} from "@/components/objekt/objekt-filter-bar";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
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
import { fetchInventoryByNickname, type OwnedEntry } from "@/lib/cosmo-inventory";
import { objektMatchesStructuralFilters } from "@/lib/filter-utils";
import { objektMatchesSearch } from "@/lib/objekt-search";

type Step = "haves" | "wants";

interface CosmoPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled nickname. If provided, auto-searches on open. */
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
  isLinked: _isLinked = false,
  onConfirm,
}: CosmoPickerDialogProps) {
  const [step, setStep] = useState<Step>("haves");
  const [nickname, setNickname] = useState(initialNickname);
  const [inventory, setInventory] = useState<OwnedEntry[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [searchedNickname, setSearchedNickname] = useState<string | null>(null);

  const [haveFilter, setHaveFilter] = useState("");
  const [inventoryFilters, setInventoryFilters] =
    useState<ObjektFilterState>(defaultFilters);
  const [wantFilters, setWantFilters] = useState<ObjektFilterState>(defaultFilters);
  const [selectedHaves, setSelectedHaves] = useState<ObjektEntry[]>([]);
  const [selectedWants, setSelectedWants] = useState<ObjektEntry[]>([]);

  // 3s cooldown between searches
  const lastSearchAt = useRef<number>(0);
  const pendingSearchNickname = useRef<string | null>(null);

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
      setInventoryFilters(defaultFilters);
      setWantFilters(defaultFilters);
      lastSearchAt.current = 0;
      pendingSearchNickname.current = null;
    }
  }, [open]); // intentionally not including initialNickname — handled below

  // Sync nickname when initialNickname changes while dialog is open
  useEffect(() => {
    if (open) setNickname(initialNickname);
  }, [initialNickname]);

  // Auto-search on open when a pre-filled nickname is available
  useEffect(() => {
    if (open && initialNickname.trim()) {
      doSearch(initialNickname.trim());
    }
  }, [open]);

  function doSearch(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (inventoryLoading && pendingSearchNickname.current === trimmed) return;
    if (searchedNickname === trimmed) return;

    const now = Date.now();
    const elapsed = now - lastSearchAt.current;
    if (elapsed < 3000 && lastSearchAt.current !== 0) {
      const wait = Math.ceil((3000 - elapsed) / 1000);
      toast.error(`Please wait ${wait}s before searching again.`);
      return;
    }
    lastSearchAt.current = now;
    pendingSearchNickname.current = trimmed;

    setInventoryLoading(true);
    setInventoryError(null);
    setInventory([]);
    setSearchedNickname(null);
    setSelectedHaves([]);
    setHaveFilter("");
    setInventoryFilters(defaultFilters);

    fetchInventoryByNickname(trimmed)
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
      .finally(() => {
        pendingSearchNickname.current = null;
        setInventoryLoading(false);
      });
  }

  function handleSearch() {
    doSearch(nickname);
  }

  function handleNicknameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  function handleNicknameBlur() {
    handleSearch();
  }

  const filteredInventory = useMemo(() => {
    let result = inventory;

    if (haveFilter.trim()) {
      result = result.filter((o) => objektMatchesSearch(o, haveFilter));
    }

    result = result.filter((o) =>
      objektMatchesStructuralFilters(o, inventoryFilters),
    );

    return result;
  }, [inventory, haveFilter, inventoryFilters]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-5xl">
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
                  onBlur={handleNicknameBlur}
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
                  <ObjektFilterBar
                    filters={inventoryFilters}
                    onChange={setInventoryFilters}
                    showSearch={false}
                    showSort={false}
                    showFilterMode={false}
                    actions={
                      <div className="hidden sm:flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenChange(false)}
                        >
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
                    }
                  />
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
              <ObjektFilterBar
                filters={wantFilters}
                onChange={setWantFilters}
                showSearch={false}
                showSort={false}
                showFilterMode={false}
              />
              <ObjektPicker
                selected={selectedWants}
                onSelect={(o) => setSelectedWants((prev) => [...prev, o])}
                onDeselect={(o) =>
                  setSelectedWants((prev) =>
                    prev.filter((w) => w.collectionId !== o.collectionId),
                  )
                }
                maxSelections={50}
                filters={wantFilters}
                gridClassName={havesGridClassName}
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
