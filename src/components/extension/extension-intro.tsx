"use client";

import {
  CheckCircle2Icon,
  EyeIcon,
  Loader2Icon,
  LockIcon,
  MessageSquareOffIcon,
  PuzzleIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { PAGE_SOURCE, type PageMessage } from "@/lib/match/extension-handoff";
import { type SectionId, sectionHref } from "@/lib/sections";

/** Remembered "Not now", so the intro is offered once rather than every time. */
export const EXTENSION_INTRO_DISMISSED_KEY = "extension-intro-dismissed:v1";

export function introDismissed(): boolean {
  try {
    return localStorage.getItem(EXTENSION_INTRO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(EXTENSION_INTRO_DISMISSED_KEY, "1");
  } catch {
    // Private mode or blocked storage: the intro just shows again next time.
  }
}

const POINTS = [
  {
    icon: EyeIcon,
    text: "Reads the trade posts you scroll past in Discord — nothing else.",
  },
  {
    icon: LockIcon,
    text: "Everything stays in your browser. No account, nothing uploaded.",
  },
  {
    icon: MessageSquareOffIcon,
    text: "Never touches your DMs or your Discord login.",
  },
];

/**
 * A short, skippable introduction to the Objekt Match extension, shown the
 * first time someone asks to find objekts on Discord without it.
 *
 * Deliberately not a gate: "Not now" is as visible as the install button and
 * carries on to /match, and choosing it means the intro isn't offered again.
 * Installing happens in a new tab; the extension announces itself to this
 * page once it is added (see `useExtensionPresence`), so `installed` flips
 * and the caller can offer the next step without a reload.
 */
export function ExtensionIntro({
  storeUrl,
  installed,
  count,
  currentSection,
  onSkip,
  onSend,
  sending = false,
}: {
  storeUrl: string;
  installed: boolean;
  /** How many objekts are about to be looked for. */
  count: number;
  currentSection?: SectionId;
  onSkip: () => void;
  onSend: () => void;
  sending?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  // Back from the store and still no answer. An older store version has no
  // objekt.my bridge to answer with, and neither does a grid served from a
  // host the bridge doesn't run on — so waiting must never be a dead end.
  const [unanswered, setUnanswered] = useState(false);

  // Coming back from the store tab: ask again, in case the announcement was
  // missed while this tab was in the background.
  useEffect(() => {
    if (!opened || installed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      const message: PageMessage = { source: PAGE_SOURCE, type: "ping" };
      window.postMessage(message, window.location.origin);
      clearTimeout(timer);
      timer = setTimeout(() => setUnanswered(true), 3000);
    };
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [opened, installed]);

  if (installed)
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4 text-center">
        <CheckCircle2Icon className="mx-auto size-8 text-green-500" />
        <div className="space-y-1">
          <p className="font-semibold">Objekt Match is ready</p>
          <p className="text-sm text-muted-foreground">
            Add your {count} missing objekt{count === 1 ? "" : "s"} to it, then
            open your Discord trade channel. Posts that have them get flagged as
            you scroll.
          </p>
        </div>
        <Button onClick={onSend} disabled={sending} className="w-full gap-1.5">
          {sending && <Loader2Icon className="size-4 animate-spin" />}
          Add to Objekt Match
        </Button>
      </div>
    );

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <PuzzleIcon className="size-5 text-primary" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold">Let Objekt Match look for you</p>
          <p className="text-sm text-muted-foreground">
            A free Chrome extension. Scroll your Discord trade channel as usual
            and it spots who has what you&rsquo;re missing — no copy-pasting.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      {opened && unanswered ? (
        <div className="space-y-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            Added it already? It may need a page reload, or an update to show up
            here. You can carry on either way — its <em>Open in match</em>{" "}
            button brings Discord posts to Match.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => {
              track("extension_intro_unanswered_continue");
              onSkip();
            }}
          >
            Continue to Match
          </Button>
        </div>
      ) : opened ? (
        <p className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Come back to this tab once it&rsquo;s added.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button asChild className="flex-1">
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              setOpened(true);
              track("extension_intro_install");
            }}
          >
            Add to Chrome — it&rsquo;s free
          </a>
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            rememberDismissed();
            track("extension_intro_skip");
            onSkip();
          }}
        >
          Not now — I&rsquo;ll paste posts
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href={sectionHref(
            "/extension",
            currentSection ? { currentSection } : undefined,
          )}
          target="_blank"
          className="underline underline-offset-4 hover:text-foreground"
        >
          How it works
        </Link>
      </p>
    </div>
  );
}
