"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Portal } from "radix-ui";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
import type { ObjektEntry } from "@/lib/cosmo/types";

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
  // The initiator's own trade post id
  myTradePostId: string;
  // Items the initiator can send (their haves)
  myHaves: TradeItem[];
  // The matched (recipient) trade post id
  matchedTradePostId: string;
  // Items the initiator wants to receive (match's haves)
  theirHaves: TradeItem[];
}

function tradeItemToObjektEntry(item: TradeItem): ObjektEntry {
  return {
    collectionId: item.collectionId,
    artist: item.artist ?? "",
    member: item.member ?? "",
    collectionNo: item.collectionNo ?? "",
    season: item.season ?? "",
    class: item.class ?? "",
    serial: item.serial ?? undefined,
    objektId: item.objektId ?? undefined,
    thumbnailImage: item.thumbnailUrl ?? undefined,
  };
}

function formatLabel(item: { collectionId: string; collectionNo?: string | null; member?: string | null; serial?: number | null }) {
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
  const [theirSelected, setTheirSelected] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

  const baseEntries = useMemo(
    () => theirHaves.map(tradeItemToObjektEntry),
    [theirHaves],
  );
  const [theirObjektEntries, setTheirObjektEntries] = useState<ObjektEntry[]>(baseEntries);

  useEffect(() => {
    setTheirObjektEntries(baseEntries);
    const missing = baseEntries.filter((e) => !e.thumbnailImage);
    if (missing.length === 0) return;
    const uniqueIds = [...new Set(missing.map((e) => e.collectionId))];
    Promise.all(uniqueIds.map((id) => fetchThumbnail(id).then((url) => ({ id, url })))).then(
      (results) => {
        const byId = new Map(results.map(({ id, url }) => [id, url]));
        setTheirObjektEntries((prev) =>
          prev.map((e) =>
            e.thumbnailImage ? e : { ...e, thumbnailImage: byId.get(e.collectionId) ?? undefined }
          )
        );
      }
    );
  }, [baseEntries]);

  function handleMouseEnter(e: React.MouseEvent<HTMLButtonElement>, item: TradeItem) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPos({ top: rect.top, left: rect.right + 8 });
    const collectionId = item.collectionId;
    const cached = thumbnailCache.get(collectionId);
    setHoverImage(item.thumbnailUrl ?? cached ?? null);
    fetchThumbnail(collectionId).then(setHoverImage);
  }

  function handleMouseLeave() {
    setHoverImage(null);
    setHoverPos(null);
  }

  function toggleMy(item: TradeItem) {
    setMySelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 10) next.add(item.id);
      return next;
    });
  }

  function handleTheirSelect(o: ObjektEntry) {
    setTheirSelected((prev) => [...prev, o]);
  }

  function handleTheirDeselect(o: ObjektEntry) {
    setTheirSelected((prev) =>
      prev.filter((h) =>
        o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId
      )
    );
  }

  async function handleSubmit() {
    if (mySelected.size === 0 || theirSelected.length === 0) return;

    const myItems = myHaves.filter((i) => mySelected.has(i.id));
    const theirItems = theirSelected;

    const missingObjektId = myItems.find((i) => !i.objektId);
    if (missingObjektId) {
      toast.error(`"${formatLabel(missingObjektId)}" has no objekt ID. Please use serial-specific have items.`);
      return;
    }

    const missingTheirObjektId = theirItems.find((o) => !o.objektId);
    if (missingTheirObjektId) {
      toast.error(`"${formatLabel(missingTheirObjektId)}" has no objekt ID. Please select a specific serial.`);
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
            season: i.season,
            class: i.class,
            artist: i.artist,
            serial: i.serial,
            thumbnailUrl: i.thumbnailUrl,
          })),
          theirObjekts: theirItems.map((o) => ({
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

  const myRatio = mySelected.size;
  const theirRatio = theirSelected.length;
  const ratioLabel = myRatio > 0 && theirRatio > 0 ? ` (${myRatio}:${theirRatio})` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a Trade Offer{ratioLabel}</DialogTitle>
          <DialogDescription>
            Select the objekts you will send and those you want to receive. Up to 10 per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">
              You offer{mySelected.size > 0 ? ` (${mySelected.size} selected)` : ""}
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
                  onMouseEnter={(e) => handleMouseEnter(e, item)}
                  onMouseLeave={handleMouseLeave}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">
              You will receive{theirSelected.length > 0 ? ` (${theirSelected.length} selected)` : ""}
            </p>
            {theirObjektEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No have items available.</p>
            ) : (
              <ObjektGridPicker
                items={theirObjektEntries}
                selected={theirSelected}
                onSelect={handleTheirSelect}
                onDeselect={handleTheirDeselect}
                compareBySerial
                maxSelections={10}
              />
            )}
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
            disabled={mySelected.size === 0 || theirSelected.length === 0 || loading}
          >
            {loading ? "Initiating..." : "Send a Trade Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
