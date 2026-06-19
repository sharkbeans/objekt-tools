"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TiltCard } from "@/components/tilt-card";
import type { ProgressCollection } from "@/lib/progress/types";

interface Props {
  collection: ProgressCollection | null;
  onOpenChange: (open: boolean) => void;
}

function artistLabel(artist?: string) {
  if (!artist) return null;
  return artist === "artms" ? "ARTMS" : artist;
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="secondary" className="gap-1.5 rounded-md px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </Badge>
  );
}

function FlipCard({ collection }: { collection: ProgressCollection }) {
  const [flipped, setFlipped] = useState(false);
  const [backLoaded, setBackLoaded] = useState(false);

  return (
    <TiltCard
      className="aspect-11/17 w-full select-none rounded perspective-distant"
      onClick={() => setFlipped((prev) => !prev)}
    >
      <div
        className="relative size-full transition-transform duration-300 [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        {/* Front */}
        <div className="absolute inset-0 overflow-hidden rounded [backface-visibility:hidden]">
          {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
          <img
            src={collection.frontImage}
            alt={collection.collectionNo}
            className="h-full w-full object-cover"
          />
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 overflow-hidden rounded [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          {collection.backImage && (
            // biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets.
            <img
              src={collection.backImage}
              alt={collection.collectionNo}
              loading="lazy"
              className="h-full w-full object-cover"
              onLoad={() => setBackLoaded(true)}
            />
          )}
          {!backLoaded && (
            <div
              className="h-full w-full bg-black"
              style={
                collection.accentColor
                  ? { backgroundColor: collection.accentColor }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </TiltCard>
  );
}

export function DexDetailDialog({ collection, onOpenChange }: Props) {
  const c = collection;
  const artist = artistLabel(c?.artist);

  const title = c
    ? [c.season, c.member, c.collectionNo].filter(Boolean).join(" ")
    : "";

  return (
    <Dialog open={c !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl! gap-0 overflow-hidden p-0">
        {c && (
          <div className="flex flex-col sm:flex-row">
            {/* Card — left */}
            <div className="flex w-full shrink-0 items-center justify-center bg-background p-5 sm:w-90">
              <FlipCard collection={c} />
            </div>

            {/* Details — right */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:max-h-[80vh]">
              <DialogHeader className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {c.collectionId}
                </p>
                <DialogTitle className="text-lg">{title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Objekt attributes for {title}
                </DialogDescription>
              </DialogHeader>

              {/* Attributes */}
              <div className="flex flex-wrap gap-1.5">
                {artist && <Pill label="Artist" value={artist} />}
                {c.member && <Pill label="Member" value={c.member} />}
                <Pill label="Season" value={c.season} />
                <Pill label="Class" value={c.class} />
                <Pill
                  label="Type"
                  value={c.onOffline === "online" ? "Digital" : "Physical"}
                />
                <Pill label="Collection No." value={c.collectionNo} />
              </div>

              {/* Ownership */}
              <div className="flex items-center gap-3 pt-1 text-sm">
                <span className="font-medium text-foreground">
                  {c.ownedCount > 0 ? `Owned ×${c.ownedCount}` : "Not owned"}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
