"use client";

import { useEffect, useState } from "react";
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
import { Plus, Minus, ArrowRight } from "lucide-react";

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
  // Cosmo username of the other party
  theirCosmoUsername: string;
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

type ObjektMeta = { thumbnailImage: string | null; season: string; class: string; artist: string };
const metaCache = new Map<string, ObjektMeta>();

function fetchObjektMeta(collectionId: string): Promise<ObjektMeta> {
  const cached = metaCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);
  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find((r: any) => r.collectionId === collectionId);
      const meta: ObjektMeta = {
        thumbnailImage: match?.thumbnailImage ?? match?.frontImage ?? null,
        season: match?.season ?? "",
        class: match?.class ?? "",
        artist: match?.artist ?? "",
      };
      metaCache.set(collectionId, meta);
      return meta;
    })
    .catch(() => {
      const empty: ObjektMeta = { thumbnailImage: null, season: "", class: "", artist: "" };
      metaCache.set(collectionId, empty);
      return empty;
    });
}

function ObjektThumb({ objekt }: { objekt: ObjektEntry }) {
  const [url, setUrl] = useState<string | null>(objekt.thumbnailImage ?? null);

  useEffect(() => {
    if (!url && objekt.collectionId) {
      fetchObjektMeta(objekt.collectionId).then((m) => setUrl(m.thumbnailImage));
    }
  }, [objekt.collectionId, url]);

  if (!url) {
    return (
      <div className="w-10 h-14 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground text-center leading-tight px-0.5">
        {objekt.collectionNo || "?"}
      </div>
    );
  }
  return (
    <div className="relative group/thumb">
      <img src={url} alt="" className="w-10 h-auto rounded shadow" />
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 pointer-events-none
                      opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150">
        {/* bubble tail */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-l border-t border-border rotate-45" />
        <div className="relative bg-popover border border-border rounded-md px-2 py-1 shadow-md
                        text-[10px] text-popover-foreground whitespace-nowrap text-center leading-snug">
          <span className="font-medium">{objekt.member} {objekt.collectionNo}</span>
          {objekt.serial != null && (
            <span className="block text-muted-foreground">#{String(objekt.serial).padStart(5, "0")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CounterOfferDialog({
  open,
  onOpenChange,
  tradeId,
  mySides,
  theirSides,
  theirAddress,
  theirCosmoUsername,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ my?: string; their?: string; myObjektId?: string; theirObjektId?: string; noChange?: string }>({});

  // "My objekts" = what the counter-offerer will send
  const [mySelected, setMySelected] = useState<ObjektEntry[]>(() =>
    mySides.map(sideToObjektEntry)
  );

  // "Their objekts" = what the counter-offerer wants from the other party
  const [theirSelected, setTheirSelected] = useState<ObjektEntry[]>(() =>
    theirSides.map(sideToObjektEntry)
  );

  // Enrich initial entries that came from TradeSide (no season/class/artist)
  useEffect(() => {
    const allInitial = [...mySides, ...theirSides];
    const uniqueIds = [...new Set(allInitial.map((s) => s.collectionId))];
    Promise.all(uniqueIds.map((id) => fetchObjektMeta(id).then((meta) => ({ id, meta })))).then(
      (results) => {
        const byId = new Map(results.map(({ id, meta }) => [id, meta]));
        const enrich = (entries: ObjektEntry[]): ObjektEntry[] =>
          entries.map((o) => {
            const meta = byId.get(o.collectionId);
            if (!meta || (o.season && o.class)) return o;
            return {
              ...o,
              season: o.season || meta.season,
              class: o.class || meta.class,
              artist: o.artist || meta.artist,
              thumbnailImage: o.thumbnailImage || meta.thumbnailImage || undefined,
            };
          });
        setMySelected((prev) => enrich(prev));
        setTheirSelected((prev) => enrich(prev));
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track original items to show diff
  const originalMyIds = new Set(mySides.map((s) => s.objektId));
  const originalTheirIds = new Set(theirSides.map((s) => s.objektId));

  async function handleSubmit() {
    const newErrors: { my?: string; their?: string } = {};
    if (mySelected.length === 0) newErrors.my = "You must select at least 1 objekt to send.";
    if (theirSelected.length === 0) newErrors.their = "You must select at least 1 objekt to receive.";
    if (newErrors.my || newErrors.their) {
      setErrors(newErrors);
      return;
    }

    // Check all items have objektId
    const missingMy = mySelected.find((o) => !o.objektId);
    if (missingMy) {
      setErrors((e) => ({ ...e, myObjektId: `"${formatLabel(missingMy)}" has no objekt ID.` }));
      return;
    }
    const missingTheir = theirSelected.find((o) => !o.objektId);
    if (missingTheir) {
      setErrors((e) => ({ ...e, theirObjektId: `"${formatLabel(missingTheir)}" has no objekt ID.` }));
      return;
    }

    // Check if anything actually changed
    const myIds = new Set(mySelected.map((o) => o.objektId));
    const theirIds = new Set(theirSelected.map((o) => o.objektId));
    const sameMyObjekts = myIds.size === originalMyIds.size && [...myIds].every((id) => originalMyIds.has(id!));
    const sameTheirObjekts = theirIds.size === originalTheirIds.size && [...theirIds].every((id) => originalTheirIds.has(id!));
    if (sameMyObjekts && sameTheirObjekts) {
      setErrors((e) => ({ ...e, noChange: "Counter-offer must differ from the original trade." }));
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

        <div className="space-y-5">
          {/* Trade preview */}
          {(mySelected.length > 0 || theirSelected.length > 0) && (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Trade Preview</p>
                <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1.5">You send</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mySelected.length > 0 ? (
                        mySelected.map((o) => (
                          <ObjektThumb key={o.objektId ?? o.collectionId} objekt={o} />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Nothing selected</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-6 h-6 text-muted-foreground mt-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1.5">You receive</p>
                    <div className="flex flex-wrap gap-1.5">
                      {theirSelected.length > 0 ? (
                        theirSelected.map((o) => (
                          <ObjektThumb key={o.objektId ?? o.collectionId} objekt={o} />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Nothing selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* My side - what I will send */}
          <div>
            <p className="text-base font-semibold mb-1">
              You will send
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Pick from your inventory{mySelected.length > 0 ? ` · ${mySelected.length} selected` : ""}
              {mySelected.length >= 10 && <span className="ml-2">· Maximum 10 reached</span>}
            </p>
            {errors.my && <p className="text-sm text-destructive mb-2">{errors.my}</p>}
            {errors.myObjektId && <p className="text-sm text-destructive mb-2">{errors.myObjektId}</p>}
            <ObjektOwnedPicker
              selected={mySelected}
              onSelect={(o) => {
                setMySelected((prev) => [...prev, o]);
                setErrors((e) => ({ ...e, my: undefined, myObjektId: undefined, noChange: undefined }));
              }}
              onDeselect={(o) => {
                setMySelected((prev) =>
                  prev.filter((h) =>
                    o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId
                  )
                );
                setErrors((e) => ({ ...e, noChange: undefined }));
              }}
              maxSelections={10}
            />
          </div>

          <Separator />

          {/* Their side - what I want from them */}
          <div>
            <p className="text-base font-semibold mb-1">
              You want from{" "}
              <span className="text-primary">@{theirCosmoUsername}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Browse their inventory{theirSelected.length > 0 ? ` · ${theirSelected.length} selected` : ""}
              {theirSelected.length >= 10 && <span className="ml-2">· Maximum 10 reached</span>}
            </p>
            {errors.their && <p className="text-sm text-destructive mb-2">{errors.their}</p>}
            {errors.theirObjektId && <p className="text-sm text-destructive mb-2">{errors.theirObjektId}</p>}
            <ObjektUserPicker
              address={theirAddress}
              selected={theirSelected}
              onSelect={(o) => {
                setTheirSelected((prev) => [...prev, o]);
                setErrors((e) => ({ ...e, their: undefined, theirObjektId: undefined, noChange: undefined }));
              }}
              onDeselect={(o) => {
                setTheirSelected((prev) =>
                  prev.filter((h) =>
                    o.serial != null ? h.serial !== o.serial : h.collectionId !== o.collectionId
                  )
                );
                setErrors((e) => ({ ...e, noChange: undefined }));
              }}
              maxSelections={10}
            />
          </div>

          {/* Diff summary */}
          {hasChanges && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Changes from original</p>
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

        {errors.noChange && (
          <p className="text-sm text-destructive">{errors.noChange}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Counter-Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
