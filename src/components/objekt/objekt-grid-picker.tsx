"use client";

import { Check, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PerRowDropdown } from "@/components/objekt/per-row-dropdown";
import { TradePagination } from "@/components/trades/trade-pagination";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { makePosterItem } from "@/lib/poster-item";
import { getNumberGroupKey } from "@/lib/poster-item-grouping";
import { getSeasonPrefix } from "@/lib/season-prefix";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 40;

function getScrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

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
  /** When set, the grid uses this many columns instead of the fixed 3/5 layout. */
  perRow?: number;
  /** When set together with `perRow`, renders a per-row dropdown in the header. */
  onPerRowChange?: (n: number) => void;
  /** Items shown per page. Defaults to 40. */
  pageSize?: number;
  /** Shows selected items in a pinned row above the main grid. */
  showSelectedRow?: boolean;
  /** Label for the pinned selected row. */
  selectedRowLabel?: string;
  /** Optional label shown above the main grid content. */
  mainGridLabel?: string;
  /** When true, merges duplicate selected entries into one card with a quantity badge. */
  combineSelectedDuplicates?: boolean;
}

type PickerEntry = ObjektEntry & { quantity?: number };

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
  perRow,
  onPerRowChange,
  pageSize = DEFAULT_PAGE_SIZE,
  showSelectedRow = false,
  selectedRowLabel = "Selected",
  mainGridLabel,
  combineSelectedDuplicates = false,
}: ObjektGridPickerProps) {
  const [page, setPage] = useState(1);
  const belowSelectedRef = useRef<HTMLDivElement>(null);
  const pendingAnchorTopRef = useRef<number | null>(null);
  const gridStyle = useMemo(
    () =>
      perRow !== undefined
        ? { gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }
        : undefined,
    [perRow],
  );
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const displayedSelected = useMemo<PickerEntry[]>(() => {
    if (!combineSelectedDuplicates) return selected;

    const grouped = new Map<string, PickerEntry>();
    for (const entry of selected) {
      const key = getNumberGroupKey(makePosterItem(entry));
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity = (existing.quantity ?? 1) + 1;
      } else {
        grouped.set(key, { ...entry, quantity: 1 });
      }
    }

    return [...grouped.values()].map((entry) =>
      (entry.quantity ?? 1) > 1 ? entry : { ...entry, quantity: undefined },
    );
  }, [combineSelectedDuplicates, selected]);
  const itemsResetKey = useMemo(
    () =>
      items
        .map(
          (entry) =>
            entry.objektId ?? `${entry.collectionId}:${entry.serial ?? ""}`,
        )
        .join("|"),
    [items],
  );
  const loadingSkeletonKeys = useMemo(
    () =>
      Array.from(
        { length: pageSize },
        (_, index) => `grid-skeleton-${index + 1}`,
      ),
    [pageSize],
  );

  // Reset to page 1 when items change (e.g. filter/search)
  useEffect(() => {
    if (itemsResetKey || items.length === 0) {
      setPage(1);
    }
  }, [items.length, itemsResetKey]);

  // Clamp page if it exceeds total after filtering
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  const isSelected = (entry: ObjektEntry) =>
    compareBySerial
      ? selected.some((s) =>
          entry.serial != null
            ? (s.serial ?? null) === entry.serial
            : s.collectionId === entry.collectionId,
        )
      : selected.some((s) => s.collectionId === entry.collectionId);

  // Selecting/deselecting can grow or shrink the pinned selected-row panel
  // above, shifting this grid down or up. Capture this grid's viewport
  // position before the change so the layout effect below can measure the
  // resulting shift and cancel it out, keeping the cursor over the same card.
  function captureScrollAnchor() {
    const el = belowSelectedRef.current;
    if (el) pendingAnchorTopRef.current = el.getBoundingClientRect().top;
  }

  useLayoutEffect(() => {
    const before = pendingAnchorTopRef.current;
    pendingAnchorTopRef.current = null;
    if (before == null) return;
    const el = belowSelectedRef.current;
    if (!el) return;
    const after = el.getBoundingClientRect().top;
    const delta = after - before;
    if (delta === 0) return;
    const scrollParent = getScrollParent(el);
    if (scrollParent) {
      scrollParent.scrollTop += delta;
    } else {
      window.scrollBy(0, delta);
    }
  });

  function handleTap(entry: ObjektEntry) {
    if (isSelected(entry)) {
      captureScrollAnchor();
      onDeselect(entry);
    } else if (selected.length < maxSelections) {
      captureScrollAnchor();
      onSelect(entry);
    }
  }

  const pageUnselected = pageItems.filter((e) => !isSelected(e));
  const allPageSelected = pageItems.length > 0 && pageUnselected.length === 0;
  const remainingCapacity = Math.max(0, maxSelections - selected.length);
  const selectAllCount = Math.min(pageUnselected.length, remainingCapacity);

  function handleSelectAllPage() {
    captureScrollAnchor();
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

  function renderGrid(
    entries: PickerEntry[],
    keyPrefix: string,
    variant: "picker" | "selected" = "picker",
  ) {
    return (
      <div
        className={cn(
          perRow === undefined
            ? "grid grid-cols-3 sm:grid-cols-5 gap-1"
            : "grid gap-1",
          gridClassName,
        )}
        style={gridStyle}
      >
        {entries.map((entry) => {
          const sel = isSelected(entry);
          const showPickerState = variant === "picker" && sel;
          const url = entry.thumbnailImage;
          const key =
            entry.objektId ??
            (entry.serial != null
              ? `${entry.collectionId}-${entry.serial}`
              : entry.collectionId);
          return (
            <button
              key={`${keyPrefix}-${key}`}
              type="button"
              className={cn(
                "relative rounded-sm overflow-hidden focus:outline-none ring-2 ring-inset ring-transparent transition-colors",
                showPickerState && "ring-green-500",
              )}
              onClick={() => handleTap(entry)}
            >
              {url ? (
                <div className="relative w-full aspect-photocard">
                  <Image
                    src={url}
                    alt={entry.collectionId}
                    fill
                    className="object-cover"
                    sizes={
                      perRow !== undefined
                        ? `${Math.round(100 / perRow)}vw`
                        : "(min-width: 640px) 20vw, 33vw"
                    }
                  />
                </div>
              ) : (
                <div className="w-full aspect-photocard bg-muted flex items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
                  {entry.member} {entry.collectionNo}
                </div>
              )}
              {/* Member + collection badge */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                <p className="text-[10px] text-white font-medium leading-tight wrap-break-word">
                  {entry.member}
                  <br />
                  {getSeasonPrefix(entry.season)}
                  {entry.collectionNo.replace(/[A-Za-z]$/, "")}
                </p>
              </div>
              {/* Serial badge for owned */}
              {entry.serial != null && (
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded font-mono">
                  #{String(entry.serial).padStart(5, "0")}
                </div>
              )}
              {variant === "selected" && (
                <div className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground shadow transition-colors hover:bg-destructive">
                  <XIcon className="h-3.5 w-3.5" strokeWidth={3} />
                </div>
              )}
              {variant === "selected" &&
                entry.quantity != null &&
                entry.quantity > 1 && (
                  <div className="absolute bottom-1 left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-black text-[11px] font-bold text-white">
                    {entry.quantity}
                  </div>
                )}
              {/* Selection tint + checkmark badge */}
              {showPickerState && (
                <>
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          perRow === undefined
            ? "grid grid-cols-3 sm:grid-cols-5 gap-1"
            : "grid gap-1",
          gridClassName,
        )}
        style={gridStyle}
      >
        {loadingSkeletonKeys.map((key) => (
          <div
            key={key}
            className="aspect-photocard rounded-sm bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  const shouldShowSelectedRow = showSelectedRow && selected.length > 0;

  if (items.length === 0 && !shouldShowSelectedRow) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          {onPerRowChange && perRow !== undefined ? (
            <PerRowDropdown value={perRow} onChange={onPerRowChange} />
          ) : (
            <span />
          )}
          <label className="inline-flex items-center justify-between gap-2 text-xs text-muted-foreground cursor-pointer select-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50">
            All
            {allPageSelected ? (
              <span>({pageItems.length})</span>
            ) : (
              selectAllCount > 0 && <span>({selectAllCount})</span>
            )}
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={handleSelectAllPage}
              disabled={!allPageSelected && remainingCapacity === 0}
              className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        </div>
      )}
      {shouldShowSelectedRow && (
        <div className="space-y-2 border-b-2 border-border pb-4">
          <p className="px-0.5 text-sm font-semibold tracking-wide text-foreground sm:text-base">
            {selectedRowLabel} ({selected.length})
          </p>
          {renderGrid(displayedSelected, "selected", "selected")}
        </div>
      )}
      <div ref={belowSelectedRef}>
        {items.length > 0 ? (
          <>
            {mainGridLabel && (
              <p className="px-0.5 pt-1 text-sm font-semibold tracking-wide text-foreground sm:text-base">
                {mainGridLabel}
              </p>
            )}
            {renderGrid(pageItems, "page")}
            <TradePagination
              page={safePage}
              totalPages={totalPages}
              total={items.length}
              limit={pageSize}
              onPageChange={setPage}
              itemLabel="objekts"
            />
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
