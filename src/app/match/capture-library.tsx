"use client";

import {
  AlertTriangleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  type Capture,
  captureAge,
  captureLabel,
  filterLabel,
  formatAge,
  formatCoverage,
  isStale,
  MAX_CAPTURE_NAME,
  newPostsLabel,
  staleCaptures,
} from "@/lib/match/captures";

type LibraryTab = "all" | "on" | "old";

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/** The newest real scan among `captures`, or null when none has one. */
function newestScan(captures: readonly Capture[]): number | null {
  const scans = captures.flatMap((capture) =>
    capture.kind !== "paste" && capture.capturedAt !== null
      ? [capture.capturedAt]
      : [],
  );
  return scans.length ? Math.max(...scans) : null;
}

/**
 * The desk's way in. Everything else about captures lives in the panel, so this
 * has to carry the one thing that cannot wait to be opened: how fresh the desk
 * is, and whether any of it has gone old.
 */
export function CaptureButton({
  captures,
  now,
  open,
  onClick,
}: {
  captures: readonly Capture[];
  now: number;
  open: boolean;
  onClick: () => void;
}) {
  const on = captures.filter((capture) => capture.active);
  const old = staleCaptures(captures, now).length;
  const newest = newestScan(on);
  return (
    <Button variant="outline" aria-expanded={open} onClick={onClick}>
      Captures
      <span className="text-xs font-normal text-muted-foreground">
        {on.length} on
        {newest !== null && ` · newest ${formatAge(newest, now)}`}
      </span>
      {old > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
          <AlertTriangleIcon className="size-3" aria-hidden="true" />
          {old} old
        </span>
      )}
    </Button>
  );
}

function CaptureCard({
  capture,
  posts,
  traders,
  now,
  canRescan,
  onToggle,
  onRename,
  onRemove,
  onRescan,
}: {
  capture: Capture;
  posts: number;
  /** Absent when there is nothing to count them against. */
  traders: number | undefined;
  now: number;
  canRescan: boolean;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (capture: Capture) => void;
  onRescan: (capture: Capture) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const label = captureLabel(capture);
  const old = isStale(capture, now);
  const coverage = formatCoverage(capture, { now });
  const fresh = newPostsLabel(capture, posts);
  const finish = () => {
    if (draft !== null) onRename(capture.id, draft);
    setDraft(null);
  };
  return (
    <li
      className={`space-y-2 rounded-xl border bg-background p-3 ${old ? "border-amber-400/40" : ""}`}
      data-testid="capture-row"
      data-active={capture.active}
    >
      <div className="flex items-center gap-2.5">
        <Switch
          checked={capture.active}
          onCheckedChange={() => onToggle(capture.id)}
          aria-label={`Show posts from ${label}`}
        />
        {draft === null ? (
          <>
            <p
              className="min-w-0 flex-1 truncate font-medium"
              title={filterLabel(capture.filters, 40) || label}
            >
              {label}
            </p>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Rename ${label}`}
              onClick={() => setDraft(capture.name ?? label)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <span
              className={`shrink-0 text-xs ${old ? "text-amber-400" : "text-muted-foreground"}`}
            >
              {captureAge(capture, now)}
            </span>
          </>
        ) : (
          <>
            <Input
              autoFocus
              aria-label="Capture name"
              className="h-8 min-w-0 flex-1"
              maxLength={MAX_CAPTURE_NAME}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finish}
              onKeyDown={(event) => {
                if (event.key === "Enter") finish();
                if (event.key === "Escape") setDraft(null);
              }}
            />
            <Button size="sm" variant="outline" onClick={finish}>
              Done
            </Button>
          </>
        )}
      </div>
      <div
        className={`space-y-0.5 pl-[2.875rem] text-[13px] ${capture.active ? "" : "opacity-60"}`}
      >
        {traders !== undefined && (
          <p>
            <span className="font-medium">
              {traders === 0
                ? "No traders have your wants"
                : `${plural(traders, "trader")} ${traders === 1 ? "has" : "have"} your wants`}
            </span>
            {fresh && <span className="text-emerald-400"> · {fresh}</span>}
          </p>
        )}
        <p className="text-muted-foreground">
          {[
            coverage,
            plural(posts, "post"),
            traders === undefined ? fresh : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex gap-1 pl-[2.875rem]">
        {canRescan && capture.kind === "search" && (
          <Button size="sm" variant="outline" onClick={() => onRescan(capture)}>
            <RefreshCwIcon className="size-3.5" />
            Rescan
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={`Delete ${label}`}
          onClick={() => onRemove(capture)}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

/**
 * Where a trader manages what they have captured.
 *
 * A side panel rather than a dialog, and non-modal: turning a capture off is
 * only useful if the desk beside it can be seen changing, so it stays open
 * until it is closed and the page behind stays live. The desk moves over to
 * make room (see `MatchClient`), rather than disappearing under it.
 */
export function CaptureLibrary({
  open,
  onOpenChange,
  captures,
  counts,
  traders,
  now,
  canRescan,
  onNew,
  onToggle,
  onRename,
  onRemove,
  onRescan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captures: readonly Capture[];
  counts: ReadonlyMap<string, number>;
  traders: ReadonlyMap<string, number>;
  now: number;
  canRescan: boolean;
  onNew: () => void;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (capture: Capture) => void;
  onRescan: (targets: readonly Capture[]) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const on = captures.filter((capture) => capture.active);
  const old = captures.filter((capture) => isStale(capture, now));
  const rescannable = old.filter((capture) => capture.kind === "search");
  const shown = tab === "on" ? on : tab === "old" ? old : captures;
  const tabs: { id: LibraryTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: captures.length },
    { id: "on", label: "On", count: on.length },
    { id: "old", label: "Old", count: old.length },
  ];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col gap-4 overflow-y-auto border-l bg-card p-5 shadow-lg outline-none sm:w-[26rem]"
          // Undo toasts and the desk itself are outside it, and neither should
          // close it: it is meant to be used alongside them.
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            // Escape in the name box cancels the rename, not the whole panel.
            if (event.target instanceof HTMLInputElement)
              event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                Captures
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[13px] text-muted-foreground">
                {captures.length} saved · {on.length} on the desk
              </DialogPrimitive.Description>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={onNew}>
                <PlusIcon className="size-4" />
                New capture
              </Button>
              <DialogPrimitive.Close asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close captures"
                >
                  <XIcon className="size-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <fieldset
            className="flex gap-1 rounded-lg bg-background p-1"
            aria-label="Filter captures"
          >
            {tabs.map(({ id, label, count }) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? "secondary" : "ghost"}
                aria-pressed={tab === id}
                className="flex-1"
                onClick={() => setTab(id)}
              >
                {label} {count}
              </Button>
            ))}
          </fieldset>

          {on.length === 0 && captures.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              All captures are off, so the desk is empty. Turn one on to see its
              posts.
            </p>
          )}

          {shown.length ? (
            <ul className="space-y-2.5">
              {shown.map((capture) => (
                <CaptureCard
                  key={capture.id}
                  capture={capture}
                  posts={counts.get(capture.id) ?? 0}
                  traders={traders.get(capture.id)}
                  now={now}
                  canRescan={canRescan}
                  onToggle={onToggle}
                  onRename={onRename}
                  onRemove={onRemove}
                  onRescan={(target) => onRescan([target])}
                />
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              {tab === "old" ? "Nothing old here." : "No captures here."}
            </p>
          )}

          {old.length > 0 && (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 px-3 py-2.5">
              <p className="text-[13px] text-amber-400">
                {old.length === 1
                  ? "1 capture is over 3 days old"
                  : `${old.length} captures are over 3 days old`}
              </p>
              {canRescan && rescannable.length > 0 && (
                <Button size="sm" onClick={() => onRescan(rescannable)}>
                  Rescan old
                </Button>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The desk is showing posts from a scan past the 72-hour line.
 *
 * Trades close fast, so an old list reads as a live offer and costs someone a
 * message to a trader who no longer has the card. Every way out of this dialog
 * snoozes it through `onDismiss`, and the panel keeps marking those captures.
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
  // Earlier posts have no scan time, only the age of the newest one.
  const age = (capture: Capture) =>
    capture.capturedAt === null
      ? ""
      : capture.kind === "paste"
        ? `newest post ${formatAge(capture.capturedAt, now)}`
        : formatAge(capture.capturedAt, now);
  const title =
    stale.length !== 1
      ? `${stale.length} captures are over 3 days old`
      : stale[0].kind === "paste"
        ? "Your earlier posts are over 3 days old"
        : `This capture is from ${age(stale[0])}`;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Traders may have moved these cards since.{" "}
            {extensionInstalled
              ? "Run a new scan to see who still has them."
              : "Capture newer posts to see who still has them."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1 text-sm">
          {stale.map((capture) => (
            <li key={capture.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {captureLabel(capture)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {age(capture)}
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
            {extensionInstalled ? "Run a new scan" : "New capture"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
