"use client";

import type { ProgressCollection } from "@/lib/progress/types";
import { DexCard } from "./dex-card";

interface Props {
  collections: ProgressCollection[];
}

export function DexGrid({ collections }: Props) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {collections.map((c) => (
        <DexCard key={c.collectionId} collection={c} />
      ))}
    </div>
  );
}
