"use client";

import { AlertTriangleIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type Capture,
  captureLabel,
  coverageBar,
  filterLabel,
  formatAge,
  formatCoverage,
  STALE_AFTER_MS,
  timelineSpan,
} from "@/lib/match/captures";

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/** "scanned 2h ago", or what the row can honestly say without a date. */
function capturedLine(capture: Capture, now: number) {
  const verb = capture.kind === "paste" ? "added" : "scanned";
  return capture.capturedAt === null
    ? "added before dates were kept"
    : `${verb} ${formatAge(capture.capturedAt, now)}`;
}

function OldBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangleIcon className="size-3" aria-hidden="true" />
      Old
    </span>
  );
}

/**
 * One capture on the shared axis, so gaps between scans read at a glance. The
 * exact span is always printed beside it: this is a picture of that text, not
 * the only place it lives.
 */
function CoverageBar({
  capture,
  span,
}: {
  capture: Capture;
  span: { start: number; end: number } | null;
}) {
  const bar = span && coverageBar(capture, span);
  if (!bar) return null;
  return (
    <div
      className="relative mt-2 h-1.5 w-full rounded-full bg-muted"
      aria-hidden="true"
    >
      <div
        className="absolute inset-y-0 rounded-full bg-primary"
        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
      />
    </div>
  );
}

function CaptureRow({
  capture,
  posts,
  now,
  span,
  canRescan,
  onToggle,
  onRemove,
  onRescan,
}: {
  capture: Capture;
  posts: number;
  now: number;
  span: { start: number; end: number } | null;
  canRescan: boolean;
  onToggle: (id: string) => void;
  onRemove: (capture: Capture) => void;
  onRescan: (capture: Capture) => void;
}) {
  const label = captureLabel(capture);
  const coverage = formatCoverage(capture);
  const old =
    capture.capturedAt !== null && now - capture.capturedAt > STALE_AFTER_MS;
  return (
    <li
      className="flex items-start gap-3 px-4 py-3"
      data-testid="capture-row"
      data-active={capture.active}
    >
      <Switch
        className="mt-0.5"
        checked={capture.active}
        onCheckedChange={() => onToggle(capture.id)}
        aria-label={`Show posts from ${label}`}
      />
      <div
        className={`min-w-0 flex-1 ${capture.active ? "" : "opacity-55"}`}
        title={capture.filters.length ? filterLabel(capture.filters, 40) : ""}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-sm font-medium">{label}</p>
          {old && <OldBadge />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[coverage, plural(posts, "post"), capturedLine(capture, now)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <CoverageBar capture={capture} span={span} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canRescan && capture.kind === "search" && (
          <Button size="sm" variant="ghost" onClick={() => onRescan(capture)}>
            <RefreshCwIcon className="size-3.5" />
            Scan again
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${label}`}
          title="Remove this capture"
          onClick={() => onRemove(capture)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </li>
  );
}

/**
 * The searches behind the desk: when each ran, what it looked for and which
 * stretch of the channel it reached, with a switch for whether its posts count.
 *
 * Open by default, because the point is to be told. An undated pool of posts is
 * how a five-day-old list ends up looking like a live offer.
 */
export function CaptureTimeline({
  captures,
  counts,
  now,
  canRescan,
  onToggle,
  onRemove,
  onRescan,
}: {
  captures: readonly Capture[];
  counts: ReadonlyMap<string, number>;
  now: number;
  canRescan: boolean;
  onToggle: (id: string) => void;
  onRemove: (capture: Capture) => void;
  onRescan: (capture: Capture) => void;
}) {
  const span = useMemo(() => timelineSpan(captures, now), [captures, now]);
  if (!captures.length) return null;
  const on = captures.filter((capture) => capture.active).length;
  return (
    <details open className="rounded-2xl border bg-card" aria-label="Captures">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <h2 className="text-sm font-semibold">Captures</h2>
        <p className="text-xs text-muted-foreground">
          {on === captures.length
            ? `${plural(on, "capture")} on the desk`
            : `${on} of ${plural(captures.length, "capture")} on the desk`}
        </p>
      </summary>
      {on === 0 && (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          All captures are off, so the desk is empty. Turn one on to see its
          posts.
        </p>
      )}
      <ul className="max-h-80 divide-y overflow-y-auto border-t">
        {captures.map((capture) => (
          <CaptureRow
            key={capture.id}
            capture={capture}
            posts={counts.get(capture.id) ?? 0}
            now={now}
            span={span}
            canRescan={canRescan}
            onToggle={onToggle}
            onRemove={onRemove}
            onRescan={onRescan}
          />
        ))}
      </ul>
      {span && (
        <p className="flex justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{new Date(span.start).toLocaleDateString()}</span>
          <span>Now</span>
        </p>
      )}
    </details>
  );
}

/**
 * The desk is showing posts from a scan past the 72-hour line.
 *
 * Trades close fast, so an old list reads as a live offer and costs someone a
 * message to a trader who no longer has the card. Every way out of this dialog
 * snoozes it through `onDismiss`, and the list keeps marking those captures old.
 */
export function StaleCapturesAlert({
  open,
  stale,
  now,
  extensionInstalled,
  onRescan,
  onTurnOff,
  onDismiss,
}: {
  open: boolean;
  stale: readonly Capture[];
  now: number;
  extensionInstalled: boolean;
  onRescan: () => void;
  onTurnOff: () => void;
  onDismiss: () => void;
}) {
  const title =
    stale.length === 1
      ? `This capture is from ${formatAge(stale[0].capturedAt ?? now, now)}`
      : `${stale.length} captures are over 3 days old`;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Traders may have moved these cards since.{" "}
            {extensionInstalled
              ? "Run a new scan to see who still has them."
              : "Import newer posts to see who still has them."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1 text-sm">
          {stale.map((capture) => (
            <li key={capture.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {captureLabel(capture)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {capture.capturedAt !== null &&
                  formatAge(capture.capturedAt, now)}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={onTurnOff}>
            Turn off old captures
          </AlertDialogAction>
          <AlertDialogAction onClick={onRescan}>
            {extensionInstalled ? "Run a new scan" : "Import new posts"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
