"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string | number;
  className?: string;
}

/**
 * Re-enters each character with a blurred slide when the value changes —
 * see .claude/skills/transitions-dev/02-number-pop-in.md. Skips the replay
 * on first mount so the count doesn't animate in on initial page load.
 */
export function DigitPopIn({ value, className }: Props) {
  const str = String(value);
  const [animating, setAnimating] = useState(false);
  const mountedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: str drives replay on change even though the body doesn't reference it directly.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setAnimating(false);
    const raf = requestAnimationFrame(() => setAnimating(true));
    return () => cancelAnimationFrame(raf);
  }, [str]);

  const chars = str.split("");
  return (
    <span
      className={cn("t-digit-group", animating && "is-animating", className)}
    >
      {chars.map((ch, i) => {
        const fromEnd = chars.length - i;
        const stagger =
          fromEnd <= 2 ? String(fromEnd === 1 ? 2 : 1) : undefined;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: characters re-render as a full replaced set each animation.
            key={i}
            className="t-digit"
            data-stagger={stagger}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
