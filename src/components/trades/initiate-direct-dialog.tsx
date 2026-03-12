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
import type { ObjektEntry } from "@/lib/cosmo/types";
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
  // The trade post the initiator is responding to
  tradePostId: number;
  // Items the post owner has (initiator picks what they want to receive)
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

function TheirObjektOption({
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

export function InitiateDirectDialog({
  open,
  onOpenChange,
  tradePostId,
  theirHaves,
}: Props) {
  const router = useRouter();
  const [mySelected, setMySelected] = useState<ObjektEntry[]>([]);
  const [theirSelected, setTheirSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggleTheir(item: TradeItem) {
    setTheirSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 10) next.add(item.id);
      return next;
    });
  }

  async function handleSubmit() {
    if (mySelected.length === 0 || theirSelected.size === 0) return;

    const theirItems = theirHaves.filter((i) => theirSelected.has(i.id));

    setLoading(true);
    try {
      const res = await fetch(`/api/trades/${tradePostId}/initiate-direct`, {
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
          theirObjekts: theirItems.map((i) => ({
            objektId: i.objektId ?? "",
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

  const ratioLabel =
    mySelected.length > 0 && theirSelected.size > 0
      ? ` (${mySelected.length}:${theirSelected.size})`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Initiate Trade{ratioLabel}</DialogTitle>
          <DialogDescription>
            Select objekts from your inventory to send, then pick what you want to receive. Up to 10 per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">
              You will send{mySelected.length > 0 ? ` (${mySelected.length} selected)` : ""}
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

          <div>
            <p className="text-sm font-medium mb-2">
              You will receive{theirSelected.size > 0 ? ` (${theirSelected.size} selected)` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {theirHaves.length === 0 && (
                <p className="text-sm text-muted-foreground">No have items available.</p>
              )}
              {theirHaves.map((item) => (
                <TheirObjektOption
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
            disabled={mySelected.length === 0 || theirSelected.size === 0 || loading}
          >
            {loading ? "Initiating..." : "Initiate Trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
