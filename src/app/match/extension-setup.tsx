"use client";

import {
  CheckIcon,
  ExternalLinkIcon,
  PuzzleIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { extensionStoreForBrowser } from "@/lib/extension-links";

type StepState = "done" | "current" | "todo";

function SetupStep({
  n,
  state,
  title,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          state === "done"
            ? "bg-emerald-500 text-white"
            : state === "current"
              ? "bg-[#5865F2] text-white"
              : "border text-muted-foreground"
        }`}
      >
        {state === "done" ? <CheckIcon className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p
          className={`text-sm ${state === "todo" ? "text-muted-foreground" : "font-medium"} ${state === "done" ? "text-muted-foreground line-through decoration-muted-foreground/50" : ""}`}
        >
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

/**
 * The extension offered as a setup task, not an ad: a checklist whose first
 * step ticks itself when the extension's bridge answers (see
 * `useExtensionPresence`, which keeps listening after its timeout, so
 * installing in another tab flips it here without a reload). Desktop Chromium
 * only; renders nothing where the extension can't be installed.
 */
export function ExtensionSetup({
  installed,
  source,
  compact = false,
}: {
  /** null while the ping is unanswered. */
  installed: boolean | null;
  /** Analytics: which screen the install click came from. */
  source: "empty" | "paste";
  /** The paste dialog: the checklist alone, without the privacy column. */
  compact?: boolean;
}) {
  const store = extensionStoreForBrowser();
  if (!store && !installed) return null;
  const ready = installed === true;

  const status = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ready
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-amber-500/15 text-amber-400"
      }`}
      aria-live="polite"
    >
      <span
        className={`size-1.5 rounded-full ${ready ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`}
      />
      {ready
        ? "Extension installed"
        : installed === null
          ? "Checking…"
          : "Not installed"}
    </span>
  );

  const steps = (
    <ol className="space-y-4">
      <SetupStep
        n={1}
        state={ready ? "done" : "current"}
        title="Add Objekt Match to Chrome"
      >
        {!ready && store && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="bg-[#5865F2] font-semibold text-white hover:bg-[#4752C4]"
            >
              <a
                href={store.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => track("match_install_cta_click", { source })}
              >
                <PuzzleIcon className="size-4" />
                Add to Chrome, it’s free
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              This page ticks this step when it’s installed.
            </span>
          </div>
        )}
      </SetupStep>
      <SetupStep
        n={2}
        state={ready ? "current" : "todo"}
        title="Open a Discord trade channel in this browser and scroll as usual"
      >
        {ready && (
          <Button asChild size="sm" variant="outline">
            <a href="https://discord.com/app" target="_blank" rel="noreferrer">
              Open Discord
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </Button>
        )}
      </SetupStep>
      <SetupStep
        n={3}
        state="todo"
        title="Press “Open in match” in the Objekt Match panel. The posts land here."
      />
    </ol>
  );

  if (compact)
    return (
      <div className="space-y-4 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/[0.06] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {ready
              ? "Bring posts in with Objekt Match"
              : "Skip the copy-pasting"}
          </p>
          {status}
        </div>
        {steps}
      </div>
    );

  return (
    <section
      aria-label="Set up the Objekt Match extension"
      className="overflow-hidden rounded-2xl border border-[#5865F2]/40 bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-[#5865F2]/[0.06] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2] text-white">
            <PuzzleIcon className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Set up Objekt Match</h2>
              <span className="rounded-full bg-[#5865F2]/20 px-2 py-0.5 text-xs font-medium text-[#aeb6ff]">
                Recommended
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Copy-pasting a busy channel is slow. The extension saves every
              trade post you scroll past, so you match against the whole
              channel.
            </p>
          </div>
        </div>
        {status}
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_16rem]">
        {steps}
        <div className="space-y-2 text-sm text-muted-foreground md:border-l md:pl-6">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <ShieldCheckIcon className="size-4 text-emerald-400" />
            What it never does
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>Read your Discord token or password</li>
            <li>Capture DMs or group DMs</li>
            <li>Upload posts before you press Open in match</li>
          </ul>
          <Link
            href="/extension"
            target="_blank"
            className="inline-block pt-1 text-xs underline underline-offset-4 hover:text-foreground"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}
