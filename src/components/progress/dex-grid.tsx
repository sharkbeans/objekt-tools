"use client";

import type { ProgressCollection } from "@/lib/progress/types";
import { DexCard } from "./dex-card";

interface Props {
  collections: ProgressCollection[];
  perRow: number;
}

export function DexGrid({ collections, perRow }: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
    >
      {collections.map((c) => (
        <DexCard key={c.collectionId} collection={c} />
      ))}
    </div>
  );
}
