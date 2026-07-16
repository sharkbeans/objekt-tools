"use client";

import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  classArtistMap,
  seasonArtistMap,
  validClasses,
  validSeasons,
} from "@/lib/filters";
import {
  decodeGroupedValue,
  encodeGroupedValue,
} from "@/lib/objekt-filters/grouped";
import { cn } from "@/lib/utils";

// Values are stored as "artistId::item" to scope selections per-artist.
// e.g. "tripleS::Atom01", "artms::Special"
export { decodeGroupedValue, encodeGroupedValue };

interface GroupedMultiSelectProps {
  columns: { artistId: string; label?: string; items: string[] }[];
  options: string[];
  value: string[]; // encoded "artistId::item" values
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

function GroupedMultiSelect({
  columns,
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
}: GroupedMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Flatten into one deduplicated list of item labels, each mapped to every
  // artist column that offers it (season/class names repeat across artists,
  // e.g. tripleS and ARTMS both have "Atom01") — a click toggles all of an
  // item's encoded "artistId::item" values together, so the dropdown reads
  // as a single flat list (objekt-explorer style) while filtering still
  // scopes matches per-artist under the hood.
  const itemArtists = new Map<string, string[]>();
  for (const col of columns) {
    for (const item of col.items) {
      if (!options.includes(item)) continue;
      const artists = itemArtists.get(item);
      if (artists) artists.push(col.artistId);
      else itemArtists.set(item, [col.artistId]);
    }
  }
  const uniqueItems = [...itemArtists.keys()];
  const filteredItems = search
    ? uniqueItems.filter((item) =>
        item.toLowerCase().includes(search.toLowerCase()),
      )
    : uniqueItems;

  function encodedValuesFor(item: string) {
    return (itemArtists.get(item) ?? []).map((artistId) =>
      encodeGroupedValue(artistId, item),
    );
  }

  function toggle(item: string) {
    const encoded = encodedValuesFor(item);
    const allSelected = encoded.every((v) => value.includes(v));
    if (allSelected) {
      onChange(value.filter((v) => !encoded.includes(v)));
    } else {
      onChange([...value, ...encoded.filter((v) => !value.includes(v))]);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  // For the trigger label, show deduplicated decoded item names
  const decodedLabels = [
    ...new Set(
      value
        .map((v) => decodeGroupedValue(v)?.item)
        .filter((v): v is string => !!v),
    ),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 min-w-28 justify-between px-3 font-normal",
            className,
          )}
        >
          <span className="flex items-center gap-1 overflow-hidden">
            {decodedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : decodedLabels.length <= 2 ? (
              decodedLabels.map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="text-xs px-1.5 py-0"
                >
                  {label}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {decodedLabels.length} selected
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-0.5 ml-1 shrink-0">
            {decodedLabels.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={clear}
                onKeyDown={(e) => e.key === "Enter" && clear(e as any)}
                className="text-muted-foreground hover:text-foreground rounded p-0.5"
              >
                <XIcon className="h-3 w-3" />
              </span>
            )}
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0">
        {uniqueItems.length > 8 && (
          <div className="border-b px-2 py-1.5">
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <div
          className="max-h-60 overflow-y-auto p-1"
          onWheel={(e) => {
            e.currentTarget.scrollTop += e.deltaY;
            e.stopPropagation();
          }}
        >
          {filteredItems.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No options
            </p>
          ) : (
            filteredItems.map((item) => {
              const selected = encodedValuesFor(item).every((v) =>
                value.includes(v),
              );
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggle(item)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground",
                    )}
                  >
                    {selected && <CheckIcon className="h-3 w-3" />}
                  </span>
                  {item}
                </button>
              );
            })
          )}
        </div>
        {decodedLabels.length > 0 && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent text-center"
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Pre-built column configs
const CLASS_COLUMNS = classArtistMap.map((entry) => ({
  artistId: entry.artistId,
  items: validClasses.filter((c) => entry.classes.includes(c)),
}));

const SEASON_COLUMNS = seasonArtistMap.map((entry) => ({
  artistId: entry.artistId,
  items: validSeasons.filter((s) => entry.seasons.includes(s)),
}));

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  columns?: { artistId: string; label?: string; items: string[] }[];
}

export function ClassMultiSelect(props: MultiSelectProps) {
  return (
    <GroupedMultiSelect
      columns={props.columns ?? CLASS_COLUMNS}
      {...props}
      placeholder={props.placeholder ?? "Class"}
    />
  );
}

export function SeasonMultiSelect(props: MultiSelectProps) {
  return (
    <GroupedMultiSelect
      columns={props.columns ?? SEASON_COLUMNS}
      {...props}
      placeholder={props.placeholder ?? "Season"}
    />
  );
}
