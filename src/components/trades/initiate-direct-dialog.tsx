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
import { Separator } from "@/components/ui/separator";
import { ObjektOwnedPicker } from "@/components/objekt/objekt-owned-picker";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
import type { ObjektEntry } from "@/lib/cosmo/types";

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

const thumbnailCache = new Map<string, string | null>();

function fetchThumbnail(collectionId: string): Promise<string | null> {
  const cached = thumbnailCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);
  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find((r: { collectionId: string }) => r.collectionId === collectionId);
      const url = match?.thumbnailImage ?? match?.frontImage ?? null;
      thumbnailCache.set(collectionId, url);
      return url;
    })
    .catch(() => {
      thumbnailCache.set(collectionId, null);
      return null;
    });
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

export function InitiateDirectDialog({
  open,
  onOpenChange,
  tradePostId,
  theirHaves,
}: Props) {
  const router = useRouter();
  const [mySelected, setMySelected] = useState<ObjektEntry[]>([]);
  const [theirSelected, setTheirSelected] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);

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
    if (mySelected.length === 0 || theirSelected.length === 0) return;

    const missingObjektId = theirSelected.find((o) => !o.objektId);
    if (missingObjektId) {
      toast.error(`"${missingObjektId.member} ${missingObjektId.collectionNo}" has no objekt ID. Please select a specific serial.`);
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
    mySelected.length > 0 && theirSelected.length > 0
      ? ` (${mySelected.length}:${theirSelected.length})`
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
              You offer{mySelected.length > 0 ? ` (${mySelected.length} selected)` : ""}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mySelected.length === 0 || theirSelected.length === 0 || loading}
          >
            {loading ? "Initiating..." : "Send a Trade Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
