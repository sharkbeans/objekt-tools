"use client";

import { CheckIcon, ExternalLinkIcon, PuzzleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  browserStore,
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
  if (!url) return null;
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
 * A badge for every store whose listing is live, the one for the browser in
 * use first. A store still waiting on its listing gets a line saying so
 * instead, and gains its badge once its URL is filled in.
 */
function InstallBadges({ detected }: { detected: ExtensionStore }) {
  const order: ExtensionStore[] =
    detected === "firefox" ? ["firefox", "chrome"] : ["chrome", "firefox"];
  const soon = order.filter((store) => !EXTENSION_STORE_URLS[store]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {order.map((store) => (
          <StoreBadge
            key={store}
            store={store}
            source="empty"
            className="h-12"
          />
        ))}
      </div>
      {soon.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {soon.map((store) => EXTENSION_STORE_NAMES[store]).join(" and ")}{" "}
          add-on coming soon.
        </p>
      )}
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
    // The compact offer has nothing to say to a browser with no listing yet.
    if (!ready && !EXTENSION_STORE_URLS[store]) return null;
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
            <InstallBadges detected={store} />
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
    <Button asChild variant="secondary" className="border border-foreground/15">
      <a href="https://discord.com/app" target="_blank" rel="noreferrer">
        Open Discord
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
                  Scroll a trade channel on Discord, then press{" "}
                  <strong className="font-medium text-foreground">
                    Open in match
                  </strong>{" "}
                  in the Objekt Match panel.
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
