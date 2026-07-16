"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** true selects icon "b" (e.g. the loading spinner), false selects "a" */
  swapped: boolean;
  iconA: ReactNode;
  iconB: ReactNode;
  className?: string;
}

/**
 * Cross-fades two icons in the same slot — see
 * .claude/skills/transitions-dev/09-icon-swap.md. Pure CSS; the state
 * attribute drives which icon is visible.
 */
export function IconSwap({ swapped, iconA, iconB, className }: Props) {
  return (
    <span
      className={cn("t-icon-swap", className)}
      data-state={swapped ? "b" : "a"}
    >
      <span className="t-icon" data-icon="a">
        {iconA}
      </span>
      <span className="t-icon" data-icon="b">
        {iconB}
      </span>
    </span>
  );
}
