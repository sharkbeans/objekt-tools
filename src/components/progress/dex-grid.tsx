"use client";

import type { ProgressCollection } from "@/lib/progress/types";
import { DexCard } from "./dex-card";

interface Props {
  collections: ProgressCollection[];
  perRow: number;
  address: string;
  ownershipLoaded: boolean;
  tradabilityLoaded: boolean;
}

export function DexGrid({
  collections,
  perRow,
  address,
  ownershipLoaded,
  tradabilityLoaded,
}: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
    >
      {collections.map((c, index) => (
        <DexCard
          key={c.collectionId}
          collection={c}
          address={address}
          ownershipLoaded={ownershipLoaded}
          tradabilityLoaded={tradabilityLoaded}
          priority={index < perRow}
        />
      ))}
    </div>
  );
}
