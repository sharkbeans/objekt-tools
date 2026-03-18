"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ObjektEntry } from "@/lib/cosmo/types";
import { makeTradeItemTags, searchFilter } from "@/lib/filter-utils";
import { Portal } from "radix-ui";

type OwnedEntry = ObjektEntry & { serial: number; objektId: string };

const thumbnailCache = new Map<string, string | null>();

function fetchThumbnail(collectionId: string): Promise<string | null> {
  const cached = thumbnailCache.get(collectionId);
  if (cached !== undefined) return Promise.resolve(cached);

  return fetch(`/api/objekts/search?q=${encodeURIComponent(collectionId)}`)
    .then((res) => res.json())
    .then((data) => {
      const match = data.results?.find(
        (r: any) => r.collectionId === collectionId,
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

async function fetchUserObjekts(address: string): Promise<OwnedEntry[]> {
  const res = await fetch(`/api/objekts/user/${encodeURIComponent(address)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

interface ObjektUserPickerProps {
  address: string;
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
}

export function ObjektUserPicker({
  address,
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
}: ObjektUserPickerProps) {
  const [query, setQuery] = useState("");
  const [inventory, setInventory] = useState<OwnedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchUserObjekts(address)
      .then((results) => {
        setInventory(results);
        setError(null);
      })
      .catch(() => setError("Failed to load their objekts"))
      .finally(() => setLoading(false));
  }, [address]);

  const filtered = useMemo(() => {
    let result = inventory;

    const searchText = query.trim().toLowerCase();
    if (searchText) {
      const queries = searchText
        .split(",")
        .map((group) =>
          group.trim().split(" ").map((t) => t.trim()).filter(Boolean),
        )
        .filter((group) => group.length > 0);

      result = result.filter((o) => {
        const tags = makeTradeItemTags(o);
        return queries.some((group) =>
          group.every((term) =>
            term.startsWith("!")
              ? !searchFilter(term.slice(1), o, tags)
              : searchFilter(term, o, tags),
          ),
        );
      });
    }

    return result;
  }, [inventory, query]);

  const isSelected = (entry: OwnedEntry) =>
    selected.some((s) => s.serial != null && s.serial === entry.serial);

  function handleSelect(entry: OwnedEntry) {
    if (isSelected(entry) || selected.length >= maxSelections) return;
    onSelect({
      collectionId: entry.collectionId,
      artist: entry.artist,
      member: entry.member,
      collectionNo: entry.collectionNo,
      season: entry.season,
      class: entry.class,
      serial: entry.serial,
      objektId: entry.objektId,
      thumbnailImage: entry.thumbnailImage ?? thumbnailCache.get(entry.collectionId) ?? undefined,
    });
    setHoverImage(null);
    setHoverPos(null);
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, collectionId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverPos({ top: rect.top, left: rect.right + 8 });
      setHoverImage(thumbnailCache.get(collectionId) ?? null);

      fetchThumbnail(collectionId).then((url) => {
        setHoverImage(url);
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverImage(null);
    setHoverPos(null);
  }, []);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search their objekts... e.g. JiWoo, Atom02"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          Loading their objekts...
        </div>
      ) : error ? (
        <div className="text-sm text-destructive text-center py-4">{error}</div>
      ) : inventory.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          No transferable objekts found for this user.
        </div>
      ) : (
        <div className="border rounded-md max-h-60 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.slice(0, 24).map((entry) => (
              <button
                key={entry.serial}
                type="button"
                disabled={isSelected(entry)}
                className={`picker-item ${isSelected(entry) ? "opacity-40" : ""}`}
                onClick={() => handleSelect(entry)}
                onMouseEnter={(e) => handleMouseEnter(e, entry.collectionId)}
                onMouseLeave={handleMouseLeave}
              >
                <span>
                  <span className="text-muted-foreground">{entry.artist}</span>{" "}
                  {entry.member}{" "}
                  <span className="font-mono">{entry.collectionNo}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.season} · {entry.class} · #{String(entry.serial).padStart(5, "0")}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching objekts
            </div>
          )}
          {filtered.length > 24 && (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
              Showing 24 of {filtered.length} — use search to narrow down
            </div>
          )}
        </div>
      )}

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

      {selected.length > 0 && (
        <p className="text-base font-medium">Selected Wants</p>
      )}

      {selected.length > 0 && (
        <div className="border rounded-md divide-y">
          {selected.map((objekt) => (
            <div
              key={objekt.serial ?? objekt.collectionId}
              className="picker-selected-row"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverPos({ top: rect.top, left: rect.right + 8 });
                if (objekt.thumbnailImage) {
                  setHoverImage(objekt.thumbnailImage);
                } else {
                  fetchThumbnail(objekt.collectionId).then(setHoverImage);
                }
              }}
              onMouseLeave={handleMouseLeave}
            >
              <span>
                <span className="text-muted-foreground">{objekt.artist}</span>{" "}
                {objekt.member}{" "}
                <span className="font-mono">{objekt.collectionNo}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {objekt.season} · {objekt.class}{objekt.serial != null ? ` · #${String(objekt.serial).padStart(5, "0")}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onDeselect(objekt)}
                  className="text-red-500/80 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {selected.length}/{maxSelections} selected
        </p>
      )}
    </div>
  );
}
