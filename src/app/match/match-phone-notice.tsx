"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { sectionHref } from "@/lib/sections";
import { DEMO_STEPS, DemoSteps, DemoViewer } from "./extension-demo";

/**
 * What /match shows on a phone or tablet instead of the matcher. Posts arrive
 * through the browser extension, which these browsers can't run, or by copying
 * a whole Discord channel, which isn't practical there, so there is nothing to
 * do on the page. It says so, and uses the space to show what the extension
 * does, so there's a reason to come back on a computer.
 */
export function MatchPhoneNotice() {
  const [step, setStep] = useState(0);
  const progress = useRef<HTMLSpanElement>(null);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-1 pt-6 pb-12 sm:px-4">
      <section aria-labelledby="match-phone-title" className="space-y-4">
        <div className="space-y-1.5">
          <h1
            id="match-phone-title"
            className="text-2xl font-bold tracking-tight"
          >
            Match only works on desktop
          </h1>
          <p className="text-muted-foreground">
            Open objekt.my on a desktop browser to use it.
          </p>
        </div>
        <DemoViewer
          crop
          captions={false}
          active={step}
          progress={progress}
          onEnded={() =>
            setStep((current) => (current + 1) % DEMO_STEPS.length)
          }
        />
        <DemoSteps
          active={step}
          onSelect={setStep}
          progress={progress}
          compact
        />
      </section>
      <p className="text-sm text-muted-foreground">
        Hunting a grid? Press <strong>Save grid</strong> on your{" "}
        <Link
          href={sectionHref("/collection")}
          className="underline underline-offset-4 hover:text-foreground"
        >
          collection
        </Link>{" "}
        page, then open Match on desktop.
      </p>
    </div>
  );
}
