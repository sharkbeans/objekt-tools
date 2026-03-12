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
import { cn } from "@/lib/utils";

interface TradeItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  thumbnailUrl?: string | null;
  objektId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The initiator's own trade post id
  myTradePostId: string;
  // Items the initiator can send (their haves)
  myHaves: TradeItem[];
  // The matched (recipient) trade post id
  matchedTradePostId: string;
  // Items the initiator wants to receive (match's haves)
  theirHaves: TradeItem[];
}

function formatLabel(item: TradeItem) {
  const name =
    item.collectionNo && item.member
      ? `${item.member} ${item.collectionNo}`
      : item.collectionId;
  const serial =
    item.serial != null ? ` #${String(item.serial).padStart(5, "0")}` : "";
  return name + serial;
}

function ObjektOption({
  item,
  selected,
  onClick,
}: {
  item: TradeItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-left transition-colors w-full",
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50"
      )}
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt={item.collectionId}
          className="w-10 h-auto rounded"
        />
      )}
      <span>{formatLabel(item)}</span>
    </button>
  );
}

export function InitiateTradeDialog({
  open,
  onOpenChange,
  myTradePostId,
  myHaves,
  matchedTradePostId,
  theirHaves,
}: Props) {
  const router = useRouter();
  const [mySelected, setMySelected] = useState<Set<number>>(new Set());
  const [theirSelected, setTheirSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggleMy(item: TradeItem) {
    setMySelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 10) next.add(item.id);
      return next;
    });
  }

  function toggleTheir(item: TradeItem) {
    setTheirSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 10) next.add(item.id);
      return next;
    });
  }

  async function handleSubmit() {
    if (mySelected.size === 0 || theirSelected.size === 0) return;

    const myItems = myHaves.filter((i) => mySelected.has(i.id));
    const theirItems = theirHaves.filter((i) => theirSelected.has(i.id));

    const missingObjektId = myItems.find((i) => !i.objektId);
    if (missingObjektId) {
      toast.error(`"${formatLabel(missingObjektId)}" has no objekt ID. Please use serial-specific have items.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/trades/${myTradePostId}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchedTradePostId,
          myObjekts: myItems.map((i) => ({
            objektId: i.objektId,
            collectionId: i.collectionId,
            collectionNo: i.collectionNo,
            member: i.member,
            serial: i.serial,
            thumbnailUrl: i.thumbnailUrl,
          })),
          theirObjekts: theirItems.map((i) => ({
            objektId: i.objektId,
            collectionId: i.collectionId,
            collectionNo: i.collectionNo,
            member: i.member,
            serial: i.serial,
            thumbnailUrl: i.thumbnailUrl,
          })),
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        router.push(`/active-trades/${data.id}`);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to initiate trade");
        return;
      }

      toast.success("Trade initiated! Waiting for the other user to accept.");
      onOpenChange(false);
      router.push(`/active-trades/${data.id}`);
    } finally {
      setLoading(false);
    }
  }

  const myRatio = mySelected.size;
  const theirRatio = theirSelected.size;
  const ratioLabel = myRatio > 0 && theirRatio > 0 ? ` (${myRatio}:${theirRatio})` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Initiate Trade{ratioLabel}</DialogTitle>
          <DialogDescription>
            Select the objekts you will send and those you want to receive. Up to 10 per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">
              You will send{mySelected.size > 0 ? ` (${mySelected.size} selected)` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {myHaves.length === 0 && (
                <p className="text-sm text-muted-foreground">No have items available.</p>
              )}
              {myHaves.map((item) => (
                <ObjektOption
                  key={item.id}
                  item={item}
                  selected={mySelected.has(item.id)}
                  onClick={() => toggleMy(item)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              You will receive{theirSelected.size > 0 ? ` (${theirSelected.size} selected)` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {theirHaves.length === 0 && (
                <p className="text-sm text-muted-foreground">No have items available.</p>
              )}
              {theirHaves.map((item) => (
                <ObjektOption
                  key={item.id}
                  item={item}
                  selected={theirSelected.has(item.id)}
                  onClick={() => toggleTheir(item)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mySelected.size === 0 || theirSelected.size === 0 || loading}
          >
            {loading ? "Initiating..." : "Initiate Trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
