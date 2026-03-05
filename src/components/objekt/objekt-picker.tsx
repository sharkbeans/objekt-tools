"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ObjektEntry, ObjektListResponse } from "@/lib/cosmo/types";

interface ObjektPickerProps {
  selected: ObjektEntry[];
  onSelect: (objekt: ObjektEntry) => void;
  onDeselect: (objekt: ObjektEntry) => void;
  maxSelections?: number;
}

export function ObjektPicker({
  selected,
  onSelect,
  onDeselect,
  maxSelections = 10,
}: ObjektPickerProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<ObjektListResponse>({
    queryKey: ["objekts", page],
    queryFn: async () => {
      const res = await fetch(`/api/cosmo/inventory?page=${page}&size=30`);
      if (!res.ok) throw new Error("Failed to fetch objekts");
      return res.json();
    },
  });

  const filteredObjekts =
    data?.objekts.filter((o) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        o.member?.toLowerCase().includes(q) ||
        o.collectionId.toLowerCase().includes(q) ||
        o.artist?.toLowerCase().includes(q) ||
        o.collectionNo?.toLowerCase().includes(q) ||
        o.season?.toLowerCase().includes(q) ||
        o.class?.toLowerCase().includes(q)
      );
    }) ?? [];

  const isSelected = (objekt: ObjektEntry) =>
    selected.some((s) => s.collectionId === objekt.collectionId);

  function handleClick(objekt: ObjektEntry) {
    if (isSelected(objekt)) {
      onDeselect(objekt);
    } else if (selected.length < maxSelections) {
      onSelect(objekt);
    }
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Failed to load objekts. Make sure your Cosmo account is linked.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Filter by artist, member, collection..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading objekts...
        </div>
      ) : (
        <>
          <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
            {filteredObjekts.map((objekt) => (
              <button
                key={objekt.collectionId}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-accent transition-colors ${
                  isSelected(objekt) ? "bg-primary/10 font-medium" : ""
                }`}
                onClick={() => handleClick(objekt)}
              >
                <span>
                  <span className="text-muted-foreground">{objekt.artist}</span>
                  {" "}
                  {objekt.member}
                  {" "}
                  <span className="font-mono">{objekt.collectionNo}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {objekt.season} · {objekt.class}
                </span>
              </button>
            ))}
          </div>

          {filteredObjekts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No objekts found
            </p>
          )}

          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {selected.length}/{maxSelections} selected
        </p>
      )}
    </div>
  );
}
