"use client";

import { useState } from "react";
import type { ProgressCollection } from "@/lib/progress/types";
import { DexDetailDialog } from "./dex-detail-dialog";

interface Props {
  collection: ProgressCollection;
}

export function DexCard({ collection }: Props) {
  const owned = collection.ownedCount > 0;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex flex-col gap-1 text-left w-full"
      >
        <div className="relative aspect-[11/17] rounded overflow-hidden w-full">
          {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
          <img
            src={collection.thumbnailImage}
            alt={collection.collectionNo}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {!owned && <div className="absolute inset-0 bg-black/[0.715]" />}
          {owned && collection.ownedCount > 1 && (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
              ×{collection.ownedCount}
            </span>
          )}
        </div>
        <p className="text-[10px] text-center text-muted-foreground leading-tight truncate">
          {collection.collectionNo}
        </p>
      </button>

      <DexDetailDialog
        collection={open ? collection : null}
        onOpenChange={setOpen}
      />
    </>
  );
}
