"use client";

import {
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  PuzzleIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { extensionStoreForBrowser } from "@/lib/extension-links";

/**
 * An optional shortcut alongside importing posts. Presence keeps updating
 * after installation in another tab; unsupported browsers get no prompt.
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
  const store = extensionStoreForBrowser();
  if (!store) return null;
  const ready = installed === true;

  const action = ready ? (
    <Button asChild variant="secondary" className="border border-foreground/15">
      <a href="https://discord.com/app" target="_blank" rel="noreferrer">
        Open Discord
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      </a>
    </Button>
  ) : (
    <Button
      asChild
      className="border border-[#a58cff]/30 bg-[#6d22ff]/15 font-semibold text-[#6d22ff] hover:bg-[#6d22ff]/25 focus-visible:border-[#a58cff] focus-visible:ring-[#a58cff]/30 dark:text-[#a58cff]"
      size={compact ? "sm" : "default"}
    >
      <a
        href={store.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => track("match_install_cta_click", { source })}
      >
        Add to Chrome
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      </a>
    </Button>
  );

  const details = (
    <Link
      href="/extension"
      target="_blank"
      rel="noreferrer"
      className="rounded-sm text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      How it works
    </Link>
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
              Objekt Match ·{" "}
              {compact ? "Free Chrome extension" : "Chrome extension"}
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
                : "Search 1,000+ trade posts at once"}
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
                "Capture posts as you scroll Discord, then search, filter and sort the objekts here to find your next trade."
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
          {!compact && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {ready ? (
                <>
                  <CheckIcon className="size-3.5" aria-hidden="true" />
                  Extension installed
                </>
              ) : (
                "Free · Optional"
              )}
            </p>
          )}
          {details}
        </div>
      </div>
      {!compact && !ready && (
        <div className="grid items-center gap-3 px-5 pb-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-6 sm:pb-6">
          <figure className="min-w-0 space-y-3">
            <Image
              src="/extension/discord-search-cropped.webp"
              alt="Objekt Match searching Discord for SeoYeon CC101 through CC108 and collecting matching posts."
              width={960}
              height={720}
              className="h-auto w-full rounded-lg border"
            />
            <figcaption className="text-center text-sm font-medium">
              Search Discord
            </figcaption>
          </figure>
          <ArrowRightIcon
            className="mx-auto size-5 rotate-90 text-muted-foreground sm:-mt-8 sm:rotate-0"
            aria-hidden="true"
          />
          <figure className="min-w-0 space-y-3">
            <Image
              src="/extension/match-results-cropped.webp"
              alt="Objekt Match showing your cards, trade posts, and matching cards from other traders."
              width={960}
              height={720}
              className="h-auto w-full rounded-lg border"
            />
            <figcaption className="text-center text-sm font-medium">
              Find mutual trades
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
