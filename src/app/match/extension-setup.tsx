"use client";

import { CheckIcon, ExternalLinkIcon, PuzzleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { DiscordIcon } from "@/components/discord-icon";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  browserStore,
  DISCORD_WEB_URL,
  EXTENSION_STORE_NAMES,
  EXTENSION_STORE_URLS,
  type ExtensionStore,
} from "@/lib/extension-links";
import { DEMO_STEPS, DemoSteps, DemoViewer } from "./extension-demo";

/**
 * The stores' own badges, used as published: Google asks for the bordered
 * one on a coloured background and only resizing is allowed, so they're served
 * as-is and sized by height alone. Each must link to its listing.
 */
const BADGES: Record<
  ExtensionStore,
  { src: string; width: number; height: number; alt: string }
> = {
  chrome: {
    src: "/extension/badges/chrome-web-store.png",
    width: 496,
    height: 150,
    alt: "Available in the Chrome Web Store",
  },
  firefox: {
    src: "/extension/badges/firefox-get-the-addon.svg",
    width: 172,
    height: 60,
    alt: "Get the Add-on for Firefox",
  },
};

/**
 * The store's own badge, greyed out and not a link, until its listing is live.
 * It is the badge that will replace it, at the same height, so the layout does
 * not change when the URL is filled in.
 */
function ComingSoonBadge({
  store,
  className,
}: {
  store: ExtensionStore;
  /** Sets the badge's height. */
  className: string;
}) {
  const { src, width, height } = BADGES[store];
  return (
    <span
      title="Coming soon"
      className="inline-block cursor-not-allowed select-none"
    >
      <Image
        src={src}
        alt={`${EXTENSION_STORE_NAMES[store]} add-on, coming soon`}
        width={width}
        height={height}
        unoptimized
        className={`w-auto opacity-50 grayscale ${className}`}
      />
    </span>
  );
}

/** A link to the store's listing, or its greyed-out badge while there is none. */
function StoreBadge({
  store,
  source,
  className,
}: {
  store: ExtensionStore;
  source: "empty" | "paste";
  /** Sets the badge's height. */
  className: string;
}) {
  const url = EXTENSION_STORE_URLS[store];
  if (!url) return <ComingSoonBadge store={store} className={className} />;
  const { src, width, height, alt } = BADGES[store];
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-block rounded-md transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:transform-none"
      onClick={() => track("match_install_cta_click", { source, store })}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        unoptimized
        className={`w-auto ${className}`}
      />
    </a>
  );
}

/**
 * A badge for every store, in the same order whichever browser is in use, so
 * Chrome and Firefox visitors see the same page. A store still waiting on its
 * listing shows greyed out, and gains its link once its URL is filled in.
 */
function InstallBadges() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StoreBadge store="chrome" source="empty" className="h-12" />
      <StoreBadge store="firefox" source="empty" className="h-12" />
    </div>
  );
}

/**
 * The offer to install the Objekt Match extension, and the proof it's worth
 * it: what it does, shown in three steps with a recording each.
 *
 * `compact` is the one-line version above the paste box. Presence keeps
 * updating after installation in another tab; phones and browsers with no
 * extension store get no prompt.
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
  /** A smaller offer above the paste box. */
  compact?: boolean;
}) {
  const [step, setStep] = useState(0);
  const progress = useRef<HTMLSpanElement>(null);
  const store = browserStore();
  if (!store) return null;
  const ready = installed === true;

  if (compact || ready) {
    return (
      <SlimOffer
        ready={ready}
        store={store}
        source={source}
        compact={compact}
      />
    );
  }

  return (
    <section
      aria-label="Objekt Match extension"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="grid gap-x-10 gap-y-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,9fr)_minmax(0,15fr)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Objekt Match extension
            </p>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Find who has your missing cards on Discord
            </h2>
            <p className="max-w-lg leading-relaxed text-muted-foreground">
              A browser extension that remembers the trade posts you scroll past
              in Discord and lines them up against your collection.
            </p>
          </div>

          <div className="space-y-3">
            <InstallBadges />
            <p className="text-xs text-muted-foreground">
              Works with Discord in this browser, not the Discord desktop app.
            </p>
            <Link
              href="/extension"
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-sm text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              How it works
            </Link>
          </div>
        </div>
        {/* Above the steps when stacked, so choosing one changes what's in
            view; beside them, spanning both rows, on wide screens. */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <DemoViewer
            active={step}
            progress={progress}
            onEnded={() =>
              setStep((current) => (current + 1) % DEMO_STEPS.length)
            }
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <DemoSteps active={step} onSelect={setStep} progress={progress} />
        </div>
      </div>
    </section>
  );
}

/**
 * The short forms: the one-line offer above the paste box, and the note that
 * the extension is already installed and what to do with it.
 */
function SlimOffer({
  ready,
  store,
  source,
  compact,
}: {
  ready: boolean;
  store: ExtensionStore;
  source: "empty" | "paste";
  compact: boolean;
}) {
  const action = ready ? (
    <Button
      asChild
      className="bg-[#5865F2] font-semibold text-white shadow-sm hover:bg-[#4752C4]"
    >
      <a href={DISCORD_WEB_URL} target="_blank" rel="noreferrer">
        <DiscordIcon className="size-4" />
        Open Discord in this browser
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      </a>
    </Button>
  ) : (
    <StoreBadge store={store} source={source} className="h-10" />
  );

  return (
    <section
      aria-label="Objekt Match extension"
      className={
        compact
          ? "rounded-xl border bg-muted/30 p-4"
          : "overflow-hidden rounded-xl border bg-card"
      }
    >
      <div
        className={
          compact
            ? "min-w-0"
            : "min-w-0 p-5 sm:p-6 md:flex md:items-center md:gap-6"
        }
      >
        <div className={`flex min-w-0 flex-1 ${compact ? "gap-3" : "gap-4"}`}>
          <span
            className={`flex shrink-0 items-center justify-center border border-[#a58cff]/20 bg-[#6d22ff]/10 text-[#6d22ff] dark:text-[#a58cff] ${compact ? "size-9 rounded-lg" : "size-12 rounded-xl"}`}
          >
            <PuzzleIcon
              className={compact ? "size-4" : "size-6"}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Objekt Match · Free browser extension
            </p>
            <h2
              className={
                compact
                  ? "mt-1 text-sm font-semibold"
                  : "mt-1 text-lg font-semibold"
              }
              aria-live="polite"
            >
              {ready
                ? "You’re ready to bring posts over"
                : "Skip the copy-pasting"}
            </h2>
            <p
              className={`mt-1 text-sm leading-relaxed text-muted-foreground ${compact ? "" : "max-w-lg"}`}
            >
              {ready ? (
                <>
                  Open a trade channel in Discord in this browser (not the
                  Discord app), search for your missing cards in the Objekt
                  Match panel, then press{" "}
                  <strong className="font-medium text-foreground">
                    Open in match
                  </strong>
                  .
                </>
              ) : (
                "Objekt Match collects posts as you scroll Discord, so you never paste a channel by hand."
              )}
            </p>
          </div>
        </div>
        <div
          className={
            compact
              ? "mt-3 flex flex-wrap items-center gap-4 pl-12"
              : "mt-5 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 pl-16 md:mt-0 md:flex-col md:gap-2.5 md:pl-0"
          }
        >
          {action}
          {!compact && ready && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              Extension installed
            </p>
          )}
          <Link
            href="/extension"
            target="_blank"
            rel="noreferrer"
            className="rounded-sm text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}
