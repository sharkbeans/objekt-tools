"use client";

import type { ProgressCollection } from "@/lib/progress/types";
import { DexGrid } from "./dex-grid";

interface Props {
  season: string;
  collections: ProgressCollection[];
  perRow: number;
  address: string;
}

export function SeasonSection({ season, collections, perRow, address }: Props) {
  const owned = collections.filter((c) => c.ownedCount > 0).length;
  const total = collections.length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-sm">{season}</h3>
        <span className="text-xs text-muted-foreground">
          {owned}/{total}
        </span>
      </div>
      <DexGrid collections={collections} perRow={perRow} address={address} />
    </div>
  );
}
