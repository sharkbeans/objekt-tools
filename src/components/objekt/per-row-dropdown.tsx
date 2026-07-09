"use client";

import { ChevronDownIcon, LayoutGridIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PER_ROW_OPTIONS } from "@/hooks/use-per-row";
import { cn } from "@/lib/utils";

interface PerRowDropdownProps {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}

export function PerRowDropdown({
  value,
  onChange,
  className,
}: PerRowDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
        >
          <LayoutGridIcon className="h-4 w-4" />
          {value} / row
          <ChevronDownIcon className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(v) => onChange(Number(v))}
        >
          {PER_ROW_OPTIONS.map((n) => (
            <DropdownMenuRadioItem key={n} value={String(n)}>
              {n} per row
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
