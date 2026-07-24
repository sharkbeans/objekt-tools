"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  longWait?: boolean;
  compact?: boolean;
  className?: string;
}

export function ObjektScanStatus({
  label,
  longWait = false,
  compact = false,
  className,
}: Props) {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    setTakingLonger(false);
    if (!longWait) return;
    const timeout = window.setTimeout(() => setTakingLonger(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [longWait]);

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="min-w-0">
        <span
          className={cn(
            "t-shimmer block font-medium",
            compact ? "text-sm" : "text-base",
          )}
          data-text={label}
        >
          {label}
        </span>
        {takingLonger && (
          <span className="block text-sm text-muted-foreground">
            The indexer is taking longer than usual. This can take up to about
            20 seconds.
          </span>
        )}
      </div>
    </div>
  );
}
