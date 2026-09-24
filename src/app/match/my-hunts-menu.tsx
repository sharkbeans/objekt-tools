"use client";

import { BookmarkIcon, Trash2Icon } from "lucide-react";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EDITION_LABELS } from "@/lib/edition";
import type { SavedHuntView } from "@/lib/hunts/saved-hunts";

async function fetchHunts(): Promise<SavedHuntView[] | null> {
  try {
    const res = await fetch("/api/hunts", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { hunts?: SavedHuntView[] };
    return Array.isArray(data.hunts) ? data.hunts : null;
  } catch {
    return null;
  }
}

/** Keep a click on the row's delete button from also choosing the row. */
function stop(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The hunts saved on this account — set up on any device, picked up here.
 * Each carries wants recomputed from current ownership, so choosing one opens
 * exactly what is still missing. Hidden until there is at least one.
 */
export function MyHuntsMenu({
  onApply,
}: {
  onApply: (hunt: SavedHuntView) => void;
}) {
  const [hunts, setHunts] = useState<SavedHuntView[]>([]);

  const refresh = useCallback(async () => {
    const next = await fetchHunts();
    if (next) setHunts(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (hunt: SavedHuntView) => {
    const res = await fetch(`/api/hunts/${encodeURIComponent(hunt.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("Couldn’t delete that hunt.");
      return;
    }
    setHunts((current) => current.filter((h) => h.id !== hunt.id));
  };

  if (!hunts.length) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // Wants move as the user collects; show today's, not the mount's.
        if (open) void refresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <BookmarkIcon className="size-4" />
          My hunts
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Saved hunts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hunts.map((hunt) => {
          const missing = hunt.wants.length;
          const status = !hunt.available
            ? "can’t read this wallet right now"
            : missing
              ? `${missing} missing`
              : "nothing missing";
          return (
            <DropdownMenuItem
              key={hunt.id}
              disabled={!hunt.available || !missing}
              onSelect={() => onApply(hunt)}
              className="items-start gap-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {hunt.member} {hunt.season} {EDITION_LABELS[hunt.edition]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {hunt.mode === "wtt" ? "Trade" : "Buy"} · {status}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Delete the ${hunt.member} ${hunt.season} hunt`}
                className="pointer-events-auto rounded p-1 text-muted-foreground hover:text-destructive"
                onPointerDown={stop}
                onPointerUp={stop}
                onClick={(event) => {
                  stop(event);
                  void remove(hunt);
                }}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
