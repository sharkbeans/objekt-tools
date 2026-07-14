"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PosterData } from "@/components/poster/poster-canvas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { EDITION_LABELS, type Edition } from "@/lib/edition";
import { computeGriddable, getGridSlots } from "@/lib/grid-progress";
import { GRID_TRADE_STASH_KEY } from "@/lib/grid-trade-stash";
import { makePosterItem } from "@/lib/poster-item";
import type { ProgressCollection } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edition: Edition;
  firsts: ProgressCollection[];
  gridded: number;
  nickname: string;
  seasonCollections: ProgressCollection[];
}

function toEntry(c: ProgressCollection): ObjektEntry {
  return {
    collectionId: c.collectionId,
    artist: c.artist ?? "",
    member: c.member ?? "",
    collectionNo: c.collectionNo,
    season: c.season,
    class: c.class,
    thumbnailImage: c.thumbnailImage,
  };
}

export function GridTradeDialog({
  open,
  onOpenChange,
  edition,
  firsts,
  gridded,
  nickname,
  seasonCollections,
}: Props) {
  const router = useRouter();
  const [offerDupes, setOfferDupes] = useState(true);

  // Target the *next* grid past however many are already griddable now, so
  // this works whether nothing has been gridded yet (feature 2) or the user
  // wants to stack up for another grid on top of ones they can already do
  // (feature 3).
  const target = computeGriddable(firsts, gridded) + 1;
  const slots = getGridSlots(edition);

  const rows = useMemo(
    () =>
      firsts.map((c) => {
        const usable = c.ownedCount - gridded;
        const needed = Math.max(0, target - usable);
        return { collection: c, usable, needed };
      }),
    [firsts, gridded, target],
  );

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        rows.filter((r) => r.needed > 0).map((r) => r.collection.collectionId),
      ),
  );

  const dupes = useMemo(
    () =>
      seasonCollections.filter(
        (c) => c.class === "First" && c.transferableCount >= 2,
      ),
    [seasonCollections],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const wants = rows
      .filter((r) => selected.has(r.collection.collectionId))
      .map((r) => makePosterItem(toEntry(r.collection)));

    // One entry per offerable duplicate copy (not a single pre-aggregated
    // quantity) so the poster's "Combine Duplicates" toggle can actually
    // merge/split them, same as any other multi-copy have.
    const haves = offerDupes
      ? dupes.flatMap((c) =>
          Array.from({ length: c.transferableCount - 1 }, () =>
            makePosterItem(toEntry(c)),
          ),
        )
      : [];

    const posterData: PosterData = {
      username: nickname,
      cosmoId: nickname,
      haves,
      wants,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      haveTitle: "Have",
      wantTitle: "Want",
    };

    sessionStorage.setItem(
      GRID_TRADE_STASH_KEY,
      JSON.stringify({ posterData }),
    );
    onOpenChange(false);
    router.push(
      sectionHref("/list?prefill=grid", { currentSection: "collect" }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Trade for {firsts[0]?.member} {firsts[0]?.season}{" "}
            {EDITION_LABELS[edition]}
          </DialogTitle>
          <DialogDescription>
            Pick which FCOs you still need, then create a trade list with them
            as your wants.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto grid w-[85%] grid-cols-3 grid-rows-3 gap-2.5">
          {rows.slice(0, slots.length).map(({ collection: c, usable }, i) => {
            const isSelected = selected.has(c.collectionId);
            const [row, col] = slots[i];
            return (
              <div
                key={c.collectionId}
                style={{ gridRow: row, gridColumn: col }}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.collectionId)}
                  className={cn(
                    "relative w-full rounded-sm overflow-hidden focus:outline-none ring-2 ring-inset ring-transparent transition-colors",
                    isSelected && "ring-green-500",
                  )}
                >
                  {/* biome-ignore lint/performance/noImgElement: Indexer image URLs are already optimized card assets. */}
                  <img
                    src={c.thumbnailImage}
                    alt={c.collectionNo}
                    loading="lazy"
                    className="w-full aspect-photocard object-cover"
                  />
                  {usable <= 0 && (
                    <div className="absolute inset-0 bg-black/71.5" />
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                    <p className="text-[10px] text-white font-medium leading-tight">
                      {c.collectionNo}
                    </p>
                  </div>
                  {isSelected && (
                    <>
                      <div className="absolute inset-0 bg-black/25" />
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow">
                        <Check
                          className="w-3.5 h-3.5 text-white"
                          strokeWidth={3}
                        />
                      </div>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Offer my duplicates</p>
            <p className="text-xs text-muted-foreground">
              {dupes.length > 0
                ? `Add ${dupes.length} duplicate FCO${dupes.length === 1 ? "" : "s"} from this season as haves`
                : "No duplicate FCOs available to offer this season"}
            </p>
          </div>
          <Switch
            checked={offerDupes}
            onCheckedChange={setOfferDupes}
            disabled={dupes.length === 0}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0}>
            Create trade list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
