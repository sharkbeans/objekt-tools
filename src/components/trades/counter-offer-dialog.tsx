"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import { ObjektUserPicker } from "@/components/objekt/objekt-user-picker";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { Plus, Minus } from "lucide-react";

interface TradeSide {
  id: number;
  userId: string;
  objektId: string;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  thumbnailUrl?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeId: string;
  // Current user's sides from the original trade (what they would send)
  mySides: TradeSide[];
  // Other party's sides from the original trade (what they would send)
  theirSides: TradeSide[];
  // Cosmo wallet address of the other party
  theirAddress: string;
}

function formatLabel(item: { collectionNo?: string | null; member?: string | null; collectionId: string; serial?: number | null }) {
  const name =
    item.collectionNo && item.member
      ? `${item.member} ${item.collectionNo}`
      : item.collectionId;
  const serial =
    item.serial != null ? ` #${String(item.serial).padStart(5, "0")}` : "";
  return name + serial;
}

// Convert a TradeSide into an ObjektEntry-like shape for the selected list
function sideToObjektEntry(side: TradeSide): ObjektEntry {
  return {
    collectionId: side.collectionId,
    artist: "",
    member: side.member ?? "",
    collectionNo: side.collectionNo ?? "",
    season: "",
    class: "",
    serial: side.serial ?? undefined,
    objektId: side.objektId,
    thumbnailImage: side.thumbnailUrl ?? undefined,
  };
}

export function CounterOfferDialog({
  open,
  onOpenChange,
  tradeId,
  mySides,
  theirSides,
  theirAddress,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // "My objekts" = what the counter-offerer will send
  const [mySelected, setMySelected] = useState<ObjektEntry[]>(() =>
    mySides.map(sideToObjektEntry)
  );

  // "Their objekts" = what the counter-offerer wants from the other party
  const [theirSelected, setTheirSelected] = useState<ObjektEntry[]>(() =>
    theirSides.map(sideToObjektEntry)
  );

  // Track original items to show diff
  const originalMyIds = new Set(mySides.map((s) => s.objektId));
  const originalTheirIds = new Set(theirSides.map((s) => s.objektId));

  async function handleSubmit() {
    if (mySelected.length === 0 || theirSelected.length === 0) return;

    // Check all items have objektId
    const missingMy = mySelected.find((o) => !o.objektId);
    if (missingMy) {
      toast.error(`"${formatLabel(missingMy)}" has no objekt ID.`);
      return;
    }
    const missingTheir = theirSelected.find((o) => !o.objektId);
    if (missingTheir) {
      toast.error(`"${formatLabel(missingTheir)}" has no objekt ID.`);
      return;
    }

    // Check if anything actually changed
    const myIds = new Set(mySelected.map((o) => o.objektId));
    const theirIds = new Set(theirSelected.map((o) => o.objektId));
    const sameMyObjekts = myIds.size === originalMyIds.size && [...myIds].every((id) => originalMyIds.has(id!));
    const sameTheirObjekts = theirIds.size === originalTheirIds.size && [...theirIds].every((id) => originalTheirIds.has(id!));
    if (sameMyObjekts && sameTheirObjekts) {
      toast.error("Counter-offer must differ from the original trade.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/active-trades/${tradeId}/counter-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myObjekts: mySelected.map((o) => ({
            objektId: o.objektId,
            collectionId: o.collectionId,
            collectionNo: o.collectionNo,
            member: o.member,
            serial: o.serial,
            thumbnailUrl: o.thumbnailImage,
          })),
          theirObjekts: theirSelected.map((o) => ({
            objektId: o.objektId,
            collectionId: o.collectionId,
            collectionNo: o.collectionNo,
            member: o.member,
            serial: o.serial,
            thumbnailUrl: o.thumbnailImage,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to create counter-offer");
        return;
      }

      toast.success("Counter-offer sent!");
      onOpenChange(false);
      router.push(`/active-trades/${data.id}`);
    } finally {
      setLoading(false);
    }
  }

  // Compute diff for display
  const myAdded = mySelected.filter((o) => !originalMyIds.has(o.objektId!));
  const myRemoved = mySides.filter((s) => !mySelected.some((o) => o.objektId === s.objektId));
  const theirAdded = theirSelected.filter((o) => !originalTheirIds.has(o.objektId!));
  const theirRemoved = theirSides.filter((s) => !theirSelected.some((o) => o.objektId === s.objektId));
  const hasChanges = myAdded.length > 0 || myRemoved.length > 0 || theirAdded.length > 0 || theirRemoved.length > 0;

  const ratioLabel =
    mySelected.length > 0 && theirSelected.length > 0
      ? ` (${mySelected.length}:${theirSelected.length})`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Counter-Offer{ratioLabel}</DialogTitle>
          <DialogDescription>
            Modify the trade proposal. You can change which objekts you send and browse the other party&apos;s inventory to pick what you want.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* My side - what I will send */}
          <div>
            <p className="text-sm font-medium mb-2">
              You will send{mySelected.length > 0 ? ` (${mySelected.length})` : ""}
            </p>
            <ObjektOwnedPicker
              selected={mySelected}
              onSelect={(o) => setMySelected((prev) => [...prev, o])}
              onDeselect={(o) =>
                setMySelected((prev) =>
                  prev.filter((h) =>
                    o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId
                  )
                )
              }
              maxSelections={10}
            />
          </div>

          <Separator />

          {/* Their side - what I want from them */}
          <div>
            <p className="text-sm font-medium mb-2">
              You want from them{theirSelected.length > 0 ? ` (${theirSelected.length})` : ""}
            </p>
            <ObjektUserPicker
              address={theirAddress}
              selected={theirSelected}
              onSelect={(o) => setTheirSelected((prev) => [...prev, o])}
              onDeselect={(o) =>
                setTheirSelected((prev) =>
                  prev.filter((h) =>
                    o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId
                  )
                )
              }
              maxSelections={10}
            />
          </div>

          {/* Diff summary */}
          {hasChanges && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Changes from original</p>
                <div className="space-y-1 text-xs">
                  {myAdded.map((o) => (
                    <div key={`add-my-${o.objektId}`} className="flex items-center gap-1.5 text-green-500">
                      <Plus className="w-3 h-3" />
                      <span>You send: {formatLabel(o)}</span>
                    </div>
                  ))}
                  {myRemoved.map((s) => (
                    <div key={`rm-my-${s.objektId}`} className="flex items-center gap-1.5 text-red-500">
                      <Minus className="w-3 h-3" />
                      <span>You send: {formatLabel(s)}</span>
                    </div>
                  ))}
                  {theirAdded.map((o) => (
                    <div key={`add-their-${o.objektId}`} className="flex items-center gap-1.5 text-green-500">
                      <Plus className="w-3 h-3" />
                      <span>You want: {formatLabel(o)}</span>
                    </div>
                  ))}
                  {theirRemoved.map((s) => (
                    <div key={`rm-their-${s.objektId}`} className="flex items-center gap-1.5 text-red-500">
                      <Minus className="w-3 h-3" />
                      <span>You want: {formatLabel(s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mySelected.length === 0 || theirSelected.length === 0 || loading}
          >
            {loading ? "Sending..." : "Send Counter-Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
