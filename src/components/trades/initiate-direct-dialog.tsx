"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ObjektGridPicker } from "@/components/objekt/objekt-grid-picker";
import {
  ObjektInventoryPicker,
  OwnedInventoryEmptyState,
} from "@/components/objekt/objekt-inventory-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { usePerRow } from "@/hooks/use-per-row";
import type { ObjektEntry } from "@/lib/cosmo/types";
import type { OwnedEntry } from "@/lib/cosmo-inventory";
import { fetchOwnedInventory } from "@/lib/cosmo-inventory";
import { objektMatchesWant } from "@/lib/wants-only-validation";

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
  isAny?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The trade post the initiator is responding to
  tradePostId: string;
  // Items the post owner has (initiator picks what they want to receive)
  theirHaves: TradeItem[];
  // Items the post owner wants (used to nudge matching objekts to the top of "You offer")
  theirWants?: TradeItem[];
}

const thumbnailCache = new Map<string, string | null>();

function fetchThumbnail(collectionId: string): Promise<string | null> {
  const cached = thumbnailCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);
  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find(
        (r: { collectionId: string }) => r.collectionId === collectionId,
      );
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
  theirWants = [],
}: Props) {
  const router = useRouter();
  const [mySelected, setMySelected] = useState<ObjektEntry[]>([]);
  const [theirSelected, setTheirSelected] = useState<ObjektEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    my?: string;
    their?: string;
    theirObjektId?: string;
  }>({});
  const { perRow, setPerRow } = usePerRow();

  const wantMatchers = useMemo(
    () =>
      theirWants.map((w) => ({
        isAny: w.isAny ?? false,
        collectionId: w.collectionId,
        member: w.member,
        season: w.season,
        class: w.class,
        artist: w.artist,
      })),
    [theirWants],
  );
  const prioritizeMyOffer = useCallback(
    (entry: OwnedEntry) =>
      wantMatchers.some((w) => objektMatchesWant(entry, w)),
    [wantMatchers],
  );

  const baseEntries = useMemo(
    () => theirHaves.map(tradeItemToObjektEntry),
    [theirHaves],
  );
  const [theirObjektEntries, setTheirObjektEntries] =
    useState<ObjektEntry[]>(baseEntries);

  useEffect(() => {
    setTheirObjektEntries(baseEntries);
    const missing = baseEntries.filter((e) => !e.thumbnailImage);
    if (missing.length === 0) return;
    const uniqueIds = [...new Set(missing.map((e) => e.collectionId))];
    Promise.all(
      uniqueIds.map((id) => fetchThumbnail(id).then((url) => ({ id, url }))),
    ).then((results) => {
      const byId = new Map(results.map(({ id, url }) => [id, url]));
      setTheirObjektEntries((prev) =>
        prev.map((e) =>
          e.thumbnailImage
            ? e
            : { ...e, thumbnailImage: byId.get(e.collectionId) ?? undefined },
        ),
      );
    });
  }, [baseEntries]);

  function handleTheirSelect(o: ObjektEntry) {
    setTheirSelected((prev) => [...prev, o]);
    setErrors((e) => ({ ...e, their: undefined, theirObjektId: undefined }));
  }

  function handleTheirDeselect(o: ObjektEntry) {
    setTheirSelected((prev) =>
      prev.filter((h) =>
        o.serial != null
          ? h.serial !== o.serial
          : h.collectionId !== o.collectionId,
      ),
    );
  }

  async function handleSubmit() {
    const newErrors: { my?: string; their?: string } = {};
    if (mySelected.length === 0)
      newErrors.my = "You must select at least 1 objekt to offer.";
    if (theirSelected.length === 0)
      newErrors.their = "You must select at least 1 objekt to receive.";
    if (newErrors.my || newErrors.their) {
      setErrors(newErrors);
      return;
    }

    const missingObjektId = theirSelected.find((o) => !o.objektId);
    if (missingObjektId) {
      setErrors((e) => ({
        ...e,
        theirObjektId: `"${missingObjektId.member} ${missingObjektId.collectionNo}" has no objekt ID. Please select a specific serial.`,
      }));
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a Trade Offer{ratioLabel}</DialogTitle>
          <DialogDescription>
            Select objekts from your inventory to send, then pick what you want
            to receive. Up to 10 per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">
              You offer
              {mySelected.length > 0 ? ` (${mySelected.length} selected)` : ""}
              {mySelected.length >= 10 && (
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  Maximum 10 reached
                </span>
              )}
            </p>
            {errors.my && (
              <p className="text-sm text-destructive mb-2">{errors.my}</p>
            )}
            <ObjektInventoryPicker
              fetchItems={fetchOwnedInventory}
              selected={mySelected}
              onSelect={(o) => {
                setMySelected((prev) => [...prev, o]);
                setErrors((e) => ({ ...e, my: undefined }));
              }}
              onDeselect={(o) =>
                setMySelected((prev) =>
                  prev.filter((h) =>
                    o.serial != null
                      ? h.serial !== o.serial
                      : h.collectionId !== o.collectionId,
                  ),
                )
              }
              emptyState={<OwnedInventoryEmptyState />}
              showFilterBar
              maxSelections={10}
              perRow={perRow}
              onPerRowChange={setPerRow}
              prioritize={prioritizeMyOffer}
            />
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">
              You will receive
              {theirSelected.length > 0
                ? ` (${theirSelected.length} selected)`
                : ""}
              {theirSelected.length >= 10 && (
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  Maximum 10 reached
                </span>
              )}
            </p>
            {errors.their && (
              <p className="text-sm text-destructive mb-2">{errors.their}</p>
            )}
            {errors.theirObjektId && (
              <p className="text-sm text-destructive mb-2">
                {errors.theirObjektId}
              </p>
            )}
            {theirObjektEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The other user has no have items listed on their post.
              </p>
            ) : (
              <ObjektGridPicker
                items={theirObjektEntries}
                selected={theirSelected}
                onSelect={handleTheirSelect}
                onDeselect={handleTheirDeselect}
                compareBySerial
                maxSelections={10}
                perRow={perRow}
                onPerRowChange={setPerRow}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Initiating..." : "Send a Trade Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
