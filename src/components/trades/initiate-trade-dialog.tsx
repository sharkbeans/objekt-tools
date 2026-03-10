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
  myTradePostId: number;
  // Items the initiator can send (their haves)
  myHaves: TradeItem[];
  // The matched (recipient) trade post id
  matchedTradePostId: number;
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
  const [mySelected, setMySelected] = useState<TradeItem | null>(null);
  const [theirSelected, setTheirSelected] = useState<TradeItem | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!mySelected || !theirSelected) return;

    // Both sides must have an objektId (serial-specific objekt)
    if (!mySelected.objektId) {
      toast.error("Your selected objekt has no objekt ID. Please use a serial-specific have item.");
      return;
    }
    if (!theirSelected.objektId) {
      toast.error("Their selected objekt has no objekt ID.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/trades/${myTradePostId}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchedTradePostId,
          myObjekt: {
            objektId: mySelected.objektId,
            collectionId: mySelected.collectionId,
            collectionNo: mySelected.collectionNo,
            member: mySelected.member,
            serial: mySelected.serial,
            thumbnailUrl: mySelected.thumbnailUrl,
          },
          theirObjekt: {
            objektId: theirSelected.objektId,
            collectionId: theirSelected.collectionId,
            collectionNo: theirSelected.collectionNo,
            member: theirSelected.member,
            serial: theirSelected.serial,
            thumbnailUrl: theirSelected.thumbnailUrl,
          },
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Existing trade — redirect to it
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Initiate Trade</DialogTitle>
          <DialogDescription>
            Select which objekt you will send and which one you want to receive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">You will send</p>
            <div className="flex flex-col gap-2">
              {myHaves.length === 0 && (
                <p className="text-sm text-muted-foreground">No have items available.</p>
              )}
              {myHaves.map((item) => (
                <ObjektOption
                  key={item.id}
                  item={item}
                  selected={mySelected?.id === item.id}
                  onClick={() => setMySelected(item)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">You will receive</p>
            <div className="flex flex-col gap-2">
              {theirHaves.length === 0 && (
                <p className="text-sm text-muted-foreground">No have items available.</p>
              )}
              {theirHaves.map((item) => (
                <ObjektOption
                  key={item.id}
                  item={item}
                  selected={theirSelected?.id === item.id}
                  onClick={() => setTheirSelected(item)}
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
            disabled={!mySelected || !theirSelected || loading}
          >
            {loading ? "Initiating..." : "Initiate Trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
