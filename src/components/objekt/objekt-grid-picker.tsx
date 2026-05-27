"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { TradePagination } from "@/components/trades/trade-pagination";
import { getSeasonPrefix } from "@/lib/season-prefix";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 36;

interface ObjektGridPickerProps {
  items: ObjektEntry[];
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  loading?: boolean;
  /** If true, compare by serial (owned objekts). Otherwise compare by collectionId. */
  compareBySerial?: boolean;
  maxSelections?: number;
  emptyMessage?: string;
  gridClassName?: string;
}

export function ObjektGridPicker({
  items,
  selected,
  onSelect,
  onDeselect,
  loading,
  compareBySerial = false,
  maxSelections = 10,
  emptyMessage = "No objekts found",
  gridClassName,
}: ObjektGridPickerProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  // Reset to page 1 when items change (e.g. filter/search)
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  // Clamp page if it exceeds total after filtering
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isSelected = (entry: ObjektEntry) =>
    compareBySerial
      ? selected.some((s) => s.serial != null && s.serial === entry.serial)
      : selected.some((s) => s.collectionId === entry.collectionId);

  function handleTap(entry: ObjektEntry) {
    if (isSelected(entry)) {
      onDeselect(entry);
    } else if (selected.length < maxSelections) {
      onSelect(entry);
    }
  }

  const pageUnselected = pageItems.filter((e) => !isSelected(e));
  const allPageSelected = pageItems.length > 0 && pageUnselected.length === 0;
  const remainingCapacity = Math.max(0, maxSelections - selected.length);
  const selectAllCount = Math.min(pageUnselected.length, remainingCapacity);

  function handleSelectAllPage() {
    if (allPageSelected) {
      for (const entry of pageItems) {
        if (isSelected(entry)) onDeselect(entry);
      }
      return;
    }
    let added = 0;
    for (const entry of pageUnselected) {
      if (added >= remainingCapacity) break;
      onSelect(entry);
      added++;
    }
  }

  if (loading) {
    return (
      <div className={cn("grid grid-cols-3 sm:grid-cols-5 gap-1", gridClassName)}>
        {Array.from({ length: PAGE_SIZE }).map((_, i) => (
          <div key={i} className="aspect-photocard rounded-sm bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <label className="inline-flex items-center justify-between gap-2 text-xs text-muted-foreground cursor-pointer select-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50">
          All
          {allPageSelected
            ? <span>({pageItems.length})</span>
            : selectAllCount > 0 && <span>({selectAllCount})</span>}
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={handleSelectAllPage}
            disabled={!allPageSelected && remainingCapacity === 0}
            className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
          />
        </label>
      </div>
      <div className={cn("grid grid-cols-3 sm:grid-cols-5 gap-1", gridClassName)}>
        {pageItems.map((entry, i) => {
          const sel = isSelected(entry);
          const url = entry.thumbnailImage;
          const key = compareBySerial ? `${entry.collectionId}-${entry.serial}` : entry.collectionId;
          return (
            <button
              key={`${key}-${i}`}
              type="button"
              className="relative rounded-sm overflow-hidden focus:outline-none"
              onClick={() => handleTap(entry)}
            >
              {url ? (
                <img
                  src={url}
                  alt={entry.collectionId}
                  className="w-full aspect-photocard object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-photocard bg-muted flex items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
                  {entry.member} {entry.collectionNo}
                </div>
              )}
              {/* Member + collection badge */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                <p className="text-[10px] text-white font-medium leading-tight wrap-break-word">
                  {entry.member}<br />{getSeasonPrefix(entry.season)}{entry.collectionNo.replace(/[A-Za-z]$/, "")}
                </p>
              </div>
              {/* Serial badge for owned */}
              {entry.serial != null && (
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded font-mono">
                  #{String(entry.serial).padStart(5, "0")}
                </div>
              )}
              {/* Selection checkmark overlay */}
              {sel && (
                <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <TradePagination
        page={safePage}
        totalPages={totalPages}
        total={items.length}
        limit={PAGE_SIZE}
        onPageChange={setPage}
        itemLabel="objekts"
      />
    </div>
  );
}
