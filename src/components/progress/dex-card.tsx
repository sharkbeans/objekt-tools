"use client";

import { useState } from "react";
import type { ProgressCollection } from "@/lib/progress/types";
import { DexDetailDialog } from "./dex-detail-dialog";

interface Props {
  collection: ProgressCollection;
  address: string;
  ownershipLoaded: boolean;
  tradabilityLoaded: boolean;
  priority?: boolean;
}

export function DexCard({
  collection,
  address,
  ownershipLoaded,
  tradabilityLoaded,
  priority = false,
}: Props) {
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
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            className="w-full h-full object-cover"
          />
          <div
            className={`absolute inset-0 bg-black/[0.715] transition-opacity duration-200 ${
              ownershipLoaded && !owned ? "opacity-100" : "opacity-0"
            }`}
          />
          {ownershipLoaded && owned && collection.ownedCount > 1 && (
            <span className="absolute bottom-1 right-1 flex h-5.5 w-5.5 items-center justify-center rounded-full border-2 border-white/30 bg-black text-[11px] font-bold text-white leading-none">
              {collection.ownedCount}
            </span>
          )}
        </div>
        <p className="text-[10px] text-center text-muted-foreground leading-tight truncate">
          {collection.collectionNo}
        </p>
      </button>

      <DexDetailDialog
        collection={open ? collection : null}
        address={address}
        ownershipLoaded={ownershipLoaded}
        tradabilityLoaded={tradabilityLoaded}
        onOpenChange={setOpen}
      />
    </>
  );
}
