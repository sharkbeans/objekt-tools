"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProgressCollection } from "@/lib/progress/types";

interface Props {
  collection: ProgressCollection | null;
  onOpenChange: (open: boolean) => void;
}

function artistLabel(artist?: string) {
  if (!artist) return null;
  return artist === "artms" ? "ARTMS" : artist;
}

export function DexDetailDialog({ collection, onOpenChange }: Props) {
  const c = collection;
  const artist = artistLabel(c?.artist);

  const title = c
    ? [c.season, c.member, c.collectionNo].filter(Boolean).join(" ")
    : "";

  return (
    <Dialog open={c !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        {c && (
          <div className="flex flex-col sm:flex-row">
            {/* Image — left */}
            <div className="relative aspect-[11/17] w-full shrink-0 bg-muted sm:w-60">
              {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
              <img
                src={c.frontImage}
                alt={c.collectionNo}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Details — right */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="text-lg">{title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Objekt attributes for {title}
                </DialogDescription>
              </DialogHeader>

              {/* Attributes */}
              <div className="flex flex-wrap gap-1.5">
                {artist && <Chip label="Artist" value={artist} />}
                {c.member && <Chip label="Member" value={c.member} />}
                <Chip label="Season" value={c.season} />
                <Chip label="Class" value={c.class} />
                <Chip
                  label="Type"
                  value={c.onOffline === "online" ? "Digital" : "Physical"}
                />
                <Chip label="Collection No." value={c.collectionNo} />
                {c.accentColor && (
                  <Chip
                    label="Accent"
                    value={c.accentColor}
                    swatch={c.accentColor}
                  />
                )}
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

function Chip({
  label,
  value,
  swatch,
}: {
  label: string;
  value: string;
  swatch?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {swatch && (
        <span
          className="h-3 w-3 rounded-sm ring-1 ring-black/20"
          style={{ backgroundColor: swatch }}
        />
      )}
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}
