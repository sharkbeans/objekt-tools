"use client";

import Link from "next/link";

export function ClaimBanner({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm flex items-center justify-between gap-4">
      <span className="text-muted-foreground">
        {isSignedIn
          ? "Link your Cosmo account to track your own progress."
          : "Sign in to track and claim your own dex."}
      </span>
      <Link
        href={isSignedIn ? "/link" : "/sign-in"}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isSignedIn ? "Link Cosmo" : "Sign in"}
      </Link>
    </div>
  );
}
