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

  function toggle(artistId: string, item: string) {
    const encoded = encodeGroupedValue(artistId, item);
    if (value.includes(encoded)) {
      onChange(value.filter((v) => v !== encoded));
    } else {
      onChange([...value, encoded]);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const visibleColumns = columns
    .map((col) => ({
      ...col,
      items: col.items.filter((item) => options.includes(item)),
    }))
    .filter((col) => col.items.length > 0);

  // For the trigger label, show decoded item names
  const decodedLabels = value
    .map((v) => decodeGroupedValue(v)?.item)
    .filter((v): v is string => !!v);

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
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : decodedLabels.length <= 2 ? (
              decodedLabels.map((label, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-xs px-1.5 py-0"
                >
                  {label}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {value.length} selected
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-0.5 ml-1 shrink-0">
            {value.length > 0 && (
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
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x">
          {visibleColumns.map((col) => (
            <div key={col.artistId} className="flex flex-col min-w-22.5">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
                {col.label ?? col.artistId}
              </div>
              <div className="p-1">
                {col.items.map((item) => {
                  const selected = value.includes(
                    encodeGroupedValue(col.artistId, item),
                  );
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggle(col.artistId, item)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
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
                })}
              </div>
            </div>
          ))}
        </div>
        {value.length > 0 && (
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
