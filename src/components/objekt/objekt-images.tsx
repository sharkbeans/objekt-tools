"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  anyWantLabel,
  formatSeasonNumberLabel,
  formatShortLabel,
} from "@/lib/objekt-label";

export interface ObjektImageItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
  isAny?: boolean;
  artist?: string | null;
  thumbnailUrl?: string | null;
  quantity?: number;
  customLabel?: string;
}

export function formatSerial(serial: number) {
  return `#${String(serial).padStart(5, "0")}`;
}

export function objektTopUrl(
  item: ObjektImageItem,
  cosmoNickname?: string | null,
): string | null {
  if (!cosmoNickname || item.isAny) return null;
  const parts = [
    item.artist,
    item.season,
    item.member,
    item.collectionNo,
  ].filter(Boolean);
  if (item.serial != null) parts.push(`#${item.serial}`);
  if (!parts.length) return null;
  return `https://objekt.top/@${cosmoNickname}?search=${encodeURIComponent(parts.join(" "))}`;
}

export function objektTopUrlWant(item: ObjektImageItem): string | null {
  if (item.isAny) return null;
  const parts = [
    item.artist,
    item.season,
    item.member,
    item.collectionNo,
  ].filter(Boolean);
  if (!parts.length) return null;
  return `https://objekt.top/?search=${encodeURIComponent(parts.join(" "))}`;
}

export function useObjektImages(items: ObjektImageItem[]) {
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!items.length) return;

    const next = new Map<string, string>();
    const missing = new Set<string>();

    for (const item of items) {
      if (item.isAny) continue;
      if (item.thumbnailUrl) next.set(item.collectionId, item.thumbnailUrl);
      else if (item.collectionId) missing.add(item.collectionId);
    }

    setImages(next);

    if (missing.size === 0) return;

    const params = new URLSearchParams();
    for (const collectionId of missing) {
      params.append("collection_id", collectionId);
    }

    fetch(`/api/objekts/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setImages((prev) => {
          const updated = new Map(prev);
          for (const match of data.results ?? []) {
            const url = match.thumbnailImage ?? match.frontImage;
            if (url) updated.set(match.collectionId, url);
          }
          return updated;
        });
      })
      .catch(() => {});
  }, [items]);

  return images;
}

export function ObjektImages({
  items,
  images,
  label,
  showSerial,
  cosmoNickname,
  isWant,
  gridStyle,
  editable,
  onRemove,
  onAdd,
  onAddCustomWant,
}: {
  items: ObjektImageItem[];
  images: Map<string, string>;
  label: string;
  showSerial?: boolean;
  cosmoNickname?: string | null;
  isWant?: boolean;
  gridStyle: { gridTemplateColumns: string };
  editable?: boolean;
  onRemove?: (id: number) => void;
  onAdd?: () => void;
  onAddCustomWant?: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      <div className="grid gap-2 items-start" style={gridStyle}>
        {items.map((item) => {
          const removeButton = editable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive/90 text-xs font-bold leading-none text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"
              aria-label="Remove item"
            >
              &times;
            </button>
          );

          if (item.isAny) {
            return (
              <div
                key={item.id}
                className="group relative flex flex-col items-center gap-1"
              >
                <div className="w-full aspect-80/123 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground text-center p-1">
                  {item.customLabel ?? anyWantLabel(item)}
                </div>
                {removeButton}
              </div>
            );
          }
          const url = images.get(item.collectionId);
          const link = isWant
            ? objektTopUrlWant(item)
            : objektTopUrl(item, cosmoNickname);
          const imgEl = (
            <div className="relative">
              {url ? (
                <Image
                  src={url}
                  alt={item.collectionId}
                  width={80}
                  height={123}
                  className="w-full h-auto rounded-md border"
                  unoptimized
                />
              ) : (
                <div className="w-full aspect-80/123 rounded-md border bg-muted animate-pulse" />
              )}
              {showSerial && item.serial != null && (
                <div className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">
                  {formatSerial(item.serial)}
                </div>
              )}
              {item.quantity != null && item.quantity > 1 && (
                <div className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-black text-[11px] font-bold text-white">
                  {item.quantity}
                </div>
              )}
            </div>
          );
          return (
            <div
              key={item.id}
              className="group relative flex flex-col items-center gap-1"
            >
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                >
                  {imgEl}
                </a>
              ) : (
                imgEl
              )}
              {removeButton}
              <span className="text-center text-xs leading-tight">
                <span className="block text-muted-foreground">
                  {item.member ?? formatShortLabel(item)}
                </span>
                {item.member && (
                  <span className="block text-muted-foreground">
                    {formatSeasonNumberLabel(item)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {editable && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add objekt"
            className="flex aspect-80/123 w-full items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/40 text-2xl font-normal text-muted-foreground/70 opacity-70 transition-opacity hover:opacity-100"
          >
            +
          </button>
        )}
        {editable && isWant && onAddCustomWant && (
          <button
            type="button"
            onClick={onAddCustomWant}
            aria-label="Add custom want"
            className="col-span-2 flex aspect-160/123 w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-muted-foreground/40 text-muted-foreground/70 opacity-70 transition-opacity hover:opacity-100"
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Custom Want
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
