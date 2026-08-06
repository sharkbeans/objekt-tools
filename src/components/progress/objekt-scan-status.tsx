"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  longWait?: boolean;
  compact?: boolean;
  className?: string;
  /**
   * Flips the leading spinner into a drawn check and settles the label.
   * Drive it with `useScanComplete` so the check has time to play before
   * the status unmounts.
   */
  done?: boolean;
}

/** Time for the check to finish drawing before the status may leave. */
const CHECK_MS = 700;
/** Length of the collapse-out; keep in step with --resize-dur. */
const EXIT_MS = 300;

/**
 * Runs a scan status through pending → done → exiting → gone.
 *
 * The status outlives the work it describes so the check can draw, but it
 * never gates the content: callers should swap skeletons for real content the
 * moment their data lands and let the check play over it. `exiting` then
 * collapses the row away.
 *
 * Returns `visible: false` immediately when `pending` was never true (cached
 * data, warm navigations) — the check is a payoff for having waited, not a
 * badge on every render.
 */
export function useScanComplete(pending: boolean) {
  const [phase, setPhase] = useState<"idle" | "pending" | "done" | "exiting">(
    pending ? "pending" : "idle",
  );

  useEffect(() => {
    if (pending) {
      setPhase("pending");
      return;
    }
    setPhase((prev) => (prev === "pending" ? "done" : prev));
  }, [pending]);

  useEffect(() => {
    if (phase === "done") {
      const timeout = window.setTimeout(() => setPhase("exiting"), CHECK_MS);
      return () => window.clearTimeout(timeout);
    }
    if (phase === "exiting") {
      const timeout = window.setTimeout(() => setPhase("idle"), EXIT_MS);
      return () => window.clearTimeout(timeout);
    }
  }, [phase]);

  return {
    visible: phase !== "idle",
    // Stays true through the exit so the check doesn't reset mid-collapse.
    done: phase === "done" || phase === "exiting",
    exiting: phase === "exiting",
  };
}

export function ObjektScanStatus({
  label,
  longWait = false,
  compact = false,
  done = false,
  className,
}: Props) {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    setTakingLonger(false);
    if (!longWait || done) return;
    const timeout = window.setTimeout(() => setTakingLonger(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [longWait, done]);

  // The trailing ellipsis reads as "still working" — drop it once the check
  // lands so the settled state doesn't contradict itself.
  const text = done ? label.replace(/…$/, "") : label;
  const iconSize = compact ? "size-3.5" : "size-4";

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <span
          className={cn("t-icon-swap shrink-0", compact ? "mt-0.75" : "mt-0.5")}
          data-state={done ? "b" : "a"}
          aria-hidden="true"
        >
          <span className="t-icon" data-icon="a">
            <Loader2Icon
              className={cn(iconSize, "animate-spin text-(--shimmer-base)")}
            />
          </span>
          <span className="t-icon" data-icon="b">
            {/* Bob and blur are tuned down from the :root defaults, which are
                sized for a large standalone success icon rather than a 16px
                glyph sitting on a line of text. */}
            <span
              className="t-success-check text-green-600 dark:text-green-400 [--check-blur-from:4px] [--check-rotate-from:60deg] [--check-y-amount:6px]"
              data-state={done ? "in" : "out"}
            >
              <svg className={iconSize} viewBox="0 0 24 24" fill="none">
                <title>Complete</title>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </span>

        <div className="min-w-0">
          <span
            className={cn(
              "block font-medium",
              compact ? "text-sm" : "text-base",
              done ? "text-(--shimmer-base)" : "t-shimmer",
            )}
            data-text={text}
          >
            {text}
          </span>
          {takingLonger && (
            <span className="block text-sm text-muted-foreground">
              The indexer is taking longer than usual. This can take up to about
              20 seconds.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
