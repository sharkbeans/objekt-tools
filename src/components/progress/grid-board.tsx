"use client";

import { useState } from "react";
import type { Edition } from "@/lib/edition";
import { EDITION_LABELS } from "@/lib/edition";
import type { ProgressCollection } from "@/lib/progress/types";
import { DexDetailDialog } from "./dex-detail-dialog";

interface Props {
  edition: Edition;
  firsts: ProgressCollection[];
  specials: ProgressCollection[];
  address: string;
}

// 3x3 grid slots (row/col, 1-indexed), skipping the center cell reserved for
// the reward SCO. Editions 1-2 use all 8 outer cells; edition 3 uses only
// the 4 orthogonal (diamond) cells and leaves the corners empty.
const FULL_SLOTS = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 1],
  [2, 3],
  [3, 1],
  [3, 2],
  [3, 3],
] as const;

const DIAMOND_SLOTS = [
  [1, 2],
  [2, 1],
  [2, 3],
  [3, 2],
] as const;

function FirstCell({
  collection,
  onOpen,
}: {
  collection: ProgressCollection;
  onOpen: () => void;
}) {
  const owned = collection.ownedCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-11/17 w-full overflow-hidden rounded"
    >
      {owned ? (
        // biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets.
        <img
          src={collection.thumbnailImage}
          alt={collection.collectionNo}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded bg-muted/40 text-sm font-medium text-muted-foreground">
          {collection.collectionNo.replace(/[A-Za-z]$/, "")}
        </div>
      )}
      {owned && collection.ownedCount > 1 && (
        <span className="absolute bottom-1 right-1 flex h-5.5 w-5.5 items-center justify-center rounded-full border-2 border-white/30 bg-black text-[11px] font-bold text-white leading-none">
          {collection.ownedCount}
        </span>
      )}
    </button>
  );
}

function RewardCell({
  collection,
  onOpen,
}: {
  collection: ProgressCollection;
  onOpen: () => void;
}) {
  const owned = collection.ownedCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-11/17 w-full overflow-hidden rounded ring-2 ring-primary/70"
    >
      {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
      <img
        src={collection.thumbnailImage}
        alt={collection.collectionNo}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      {!owned && <div className="absolute inset-0 bg-black/[0.715]" />}
      <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
        Reward
      </span>
    </button>
  );
}

export function GridBoard({ edition, firsts, specials, address }: Props) {
  const [active, setActive] = useState<ProgressCollection | null>(null);

  if (firsts.length === 0) return null;

  const slots = edition === 3 ? DIAMOND_SLOTS : FULL_SLOTS;
  const owned = firsts.filter((c) => c.ownedCount > 0).length;

  // Prefer an owned SCO for the preview so multi-owned duplicates surface,
  // otherwise fall back to the first known SCO for this edition.
  const reward = specials.find((c) => c.ownedCount > 0) ?? specials[0] ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-medium">
          {EDITION_LABELS[edition]} Edition
        </h4>
        <span className="text-xs text-muted-foreground">
          {owned}/{firsts.length}
        </span>
      </div>
      <div className="grid w-full max-w-[min(90vw,360px)] grid-cols-3 grid-rows-3 gap-2">
        {firsts.slice(0, slots.length).map((c, i) => {
          const [row, col] = slots[i];
          return (
            <div key={c.collectionId} style={{ gridRow: row, gridColumn: col }}>
              <FirstCell collection={c} onOpen={() => setActive(c)} />
            </div>
          );
        })}
        <div style={{ gridRow: 2, gridColumn: 2 }}>
          {reward ? (
            <RewardCell collection={reward} onOpen={() => setActive(reward)} />
          ) : (
            <div className="flex aspect-11/17 w-full items-center justify-center rounded bg-muted/20 text-muted-foreground">
              ?
            </div>
          )}
        </div>
      </div>

      <DexDetailDialog
        collection={active}
        address={address}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      />
    </div>
  );
}
