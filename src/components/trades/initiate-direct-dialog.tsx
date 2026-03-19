"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const thumbnailCache = new Map<string, string | null>();

function fetchThumbnail(collectionId: string): Promise<string | null> {
  const cached = thumbnailCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);
  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find((r: { collectionId: string }) => r.collectionId === collectionId);
      const url = (match as { thumbnailImage?: string; frontImage?: string } | undefined)?.thumbnailImage ?? (match as { thumbnailImage?: string; frontImage?: string } | undefined)?.frontImage ?? null;
      thumbnailCache.set(collectionId, url);
      return url;
    })
    .catch(() => {
      thumbnailCache.set(collectionId, null);
      return null;
    });
}
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
import { Portal } from "radix-ui";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { cn } from "@/lib/utils";

interface TradeItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  artist?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
  thumbnailUrl?: string | null;
  objektId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The trade post the initiator is responding to
  tradePostId: string;
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
  onMouseEnter,
  onMouseLeave,
}: {
  item: TradeItem;
  selected: boolean;
  onClick: () => void;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
}) {
  const rightMeta = [
    item.season,
    item.class,
    item.serial != null ? `#${String(item.serial).padStart(5, "0")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left transition-colors w-full",
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50"
      )}
    >
      <span>
        <span className="text-muted-foreground">{item.artist}</span>{" "}
        {item.member}{" "}
        <span className="font-mono">{item.collectionNo}</span>
      </span>
      {rightMeta && (
        <span className="text-xs text-muted-foreground shrink-0 ml-3">{rightMeta}</span>
      )}
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
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

  function handleTheirMouseEnter(e: React.MouseEvent<HTMLButtonElement>, item: TradeItem) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPos({ top: rect.top, left: rect.right + 8 });
    const cached = thumbnailCache.get(item.collectionId);
    setHoverImage(item.thumbnailUrl ?? cached ?? null);
    fetchThumbnail(item.collectionId).then(setHoverImage);
  }

  function handleTheirMouseLeave() {
    setHoverImage(null);
    setHoverPos(null);
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
    if (mySelected.length === 0 || theirSelected.size === 0) return;

    const theirItems = theirHaves.filter((i) => theirSelected.has(i.id));

    const missingObjektId = theirItems.find((i) => !i.objektId);
    if (missingObjektId) {
      toast.error(`"${formatLabel(missingObjektId)}" has no objekt ID. Please select a specific serial.`);
      return;
    }

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
            season: o.season,
            class: o.class,
            artist: o.artist,
            serial: o.serial,
            thumbnailUrl: o.thumbnailImage,
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
        toast.error(data.error ?? "Failed to Send a Trade Offer");
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
          <DialogTitle>Send a Trade Offer{ratioLabel}</DialogTitle>
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
                  onMouseEnter={(e) => handleTheirMouseEnter(e, item)}
                  onMouseLeave={handleTheirMouseLeave}
                />
              ))}
            </div>
          </div>
        </div>

        {hoverImage && hoverPos && (
          <Portal.Root>
            <div
              className="objekt-hover-preview"
              style={{ top: hoverPos.top, left: hoverPos.left }}
            >
              <img src={hoverImage} alt="" className="w-24 h-auto block" />
            </div>
          </Portal.Root>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mySelected.length === 0 || theirSelected.size === 0 || loading}
          >
            {loading ? "Initiating..." : "Send a Trade Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
