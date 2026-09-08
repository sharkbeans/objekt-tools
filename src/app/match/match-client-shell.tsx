"use client";

import dynamic from "next/dynamic";

// This screen restores a locally persisted transcript, nickname and form
// fields. Rendering that state on the server invites a hydration mismatch when
// the browser restores an earlier form snapshot from its back/forward cache.
// Mount it client-only so the first interactive render always owns the DOM.
const MatchClient = dynamic(
  () => import("./match-client").then((module) => module.MatchClient),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="mx-auto w-full max-w-[120rem] px-1 py-8 text-sm text-muted-foreground sm:px-4"
      >
        Loading matcher…
      </div>
    ),
  },
);

export function MatchClientShell() {
  return <MatchClient />;
}
