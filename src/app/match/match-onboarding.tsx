"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { DiscordIcon } from "@/components/discord-icon";
import { Button } from "@/components/ui/button";
import { browserStore } from "@/lib/extension-links";
import { ExtensionSetup } from "./extension-setup";

const DISCORD_BUTTON =
  "bg-[#5865F2] font-semibold text-white shadow-sm hover:bg-[#4752C4]";

function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "active" | "plain" | "done" | "optional" | "later";
  children: React.ReactNode;
}) {
  const active = state === "active";
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:p-5 ${
        active
          ? "border-[#5865F2]/50 bg-[#5865F2]/[0.06]"
          : state === "later"
            ? "opacity-60"
            : ""
      }`}
      aria-current={active ? "step" : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            active
              ? "bg-[#5865F2] text-white"
              : state === "done"
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {state === "done" ? <CheckIcon className="size-4" /> : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
        {state === "optional" && (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </div>
      {children}
    </li>
  );
}

/**
 * /match before any posts are in: the grids, filters and counts all need
 * posts to mean anything, so show how to get some instead. In a browser with an
 * extension store the extension leads, and the three steps below are the
 * by-hand way; elsewhere the steps come first and the first one gets the only
 * coloured button on the page. Never shown on a phone: the shell sends those to
 * a computer instead (see MatchPhoneNotice).
 */
export function MatchOnboarding({
  haveCount,
  loadingInv,
  extensionInstalled,
  lookingFor,
  onImport,
  onSample,
  onAddHaves,
}: {
  haveCount: number;
  loadingInv: boolean;
  extensionInstalled: boolean | null;
  /** A search carried over from a grid hunt or a previous visit. */
  lookingFor: string;
  onImport: () => void;
  onSample: () => void;
  onAddHaves: () => void;
}) {
  // Mounted only after the stored posts have loaded, so never server-rendered
  // and safe to read `navigator` up front.
  const [store] = useState(browserStore);
  // Lead with the extension in any browser that has a store, whether or not
  // that store's listing is live yet, so Chrome and Firefox visitors see the
  // same page.
  const extensionFirst = store !== null;

  return (
    <section aria-label="Get started" className="space-y-4">
      {extensionFirst && (
        <>
          <ExtensionSetup installed={extensionInstalled} source="empty" />
          <h2 className="pt-2 text-sm font-medium text-muted-foreground">
            Or bring posts over yourself
          </h2>
        </>
      )}
      <ol className="grid gap-3 md:grid-cols-3">
        <Step
          n={1}
          title="Import Discord posts"
          state={extensionFirst ? "plain" : "active"}
        >
          <p className="text-sm text-muted-foreground">
            Copy posts from a Discord trade channel and paste them here, or
            import the channel as text files.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button className={DISCORD_BUTTON} onClick={onImport}>
              <DiscordIcon className="size-4" />
              Import Discord posts
            </Button>
            <Button variant="outline" onClick={onSample}>
              Try a sample
            </Button>
          </div>
          {lookingFor && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              Then we’ll look for {lookingFor}.
            </p>
          )}
        </Step>
        <Step
          n={2}
          title="Add your objekts"
          state={haveCount > 0 ? "done" : "optional"}
        >
          <p className="text-sm text-muted-foreground">
            {haveCount > 0
              ? `${haveCount} card${haveCount === 1 ? "" : "s"} ready. We’ll find traders who want them.`
              : "Load your Cosmo inventory or type what you have, so we can find traders who want something you own."}
          </p>
          <Button
            variant="outline"
            className="mt-auto w-fit"
            disabled={loadingInv}
            onClick={onAddHaves}
          >
            {loadingInv
              ? "Loading inventory…"
              : haveCount > 0
                ? "Edit my objekts"
                : "Add my objekts"}
          </Button>
        </Step>
        <Step n={3} title="See who to DM" state="later">
          <p className="text-sm text-muted-foreground">
            We list the traders who have what you want and want what you have.
            Copy their name and message them on Discord.
          </p>
        </Step>
      </ol>
    </section>
  );
}
