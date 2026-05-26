"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 min-w-32 justify-between px-3 font-normal", className)}
        >
          <span className="flex items-center gap-1 overflow-hidden">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : value.length <= 2 ? (
              value.map((v) => (
                <Badge key={v} variant="secondary" className="text-xs px-1.5 py-0">
                  {options.find((o) => o.value === v)?.label ?? v}
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
      <PopoverContent className="w-52 p-0">
        {options.length > 8 && (
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
          {filtered.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No options</p>
          ) : (
            filtered.map((opt) => {
              const selected = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
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
                  {opt.label}
                </button>
              );
            })
          )}
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
