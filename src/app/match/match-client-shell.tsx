"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { isPhoneBrowser } from "@/lib/extension-links";
import { MatchPhoneNotice } from "./match-phone-notice";

function Loading() {
  return (
    <div
      role="status"
      className="mx-auto w-full max-w-[120rem] px-1 py-8 text-sm text-muted-foreground sm:px-4"
    >
      Loading matcher…
    </div>
  );
}

// This screen restores a locally persisted transcript, nickname and form
// fields. Rendering that state on the server invites a hydration mismatch when
// the browser restores an earlier form snapshot from its back/forward cache.
// Mount it client-only so the first interactive render always owns the DOM.
const MatchClient = dynamic(
  () => import("./match-client").then((module) => module.MatchClient),
  { ssr: false, loading: Loading },
);

const subscribe = () => () => {};

export function MatchClientShell() {
  // The user agent can't be read on the server, so the server render and the
  // hydrating one both see `null`, and the real answer arrives right after.
  // Phones are told to use a computer instead of getting the matcher.
  const phone = useSyncExternalStore<boolean | null>(
    subscribe,
    isPhoneBrowser,
    () => null,
  );
  if (phone === null) return <Loading />;
  return phone ? <MatchPhoneNotice /> : <MatchClient />;
}
