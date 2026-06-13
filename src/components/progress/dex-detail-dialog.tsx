"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProgressCollection } from "@/lib/progress/types";

interface Props {
  collection: ProgressCollection | null;
  onOpenChange: (open: boolean) => void;
}

export function DexDetailDialog({ collection, onOpenChange }: Props) {
  return (
    <Dialog open={collection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-0 overflow-hidden">
        {collection && (
          <>
            <div className="relative aspect-[11/17] w-full">
              {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
              <img
                src={collection.frontImage}
                alt={collection.collectionNo}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4 space-y-1">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {collection.collectionNo}
                </DialogTitle>
              </DialogHeader>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>{collection.season}</p>
                <p>
                  {collection.class} ·{" "}
                  {collection.onOffline === "online" ? "Digital" : "Physical"}
                </p>
                <p className="font-medium text-foreground">
                  {collection.ownedCount > 0
                    ? `Owned ×${collection.ownedCount}`
                    : "Not owned"}
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
