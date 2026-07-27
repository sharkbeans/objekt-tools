"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  readStoredCosmoAddress,
  readStoredCosmoUsername,
  storeCosmoUsername,
} from "@/lib/cosmo-username-storage";
import type { ProgressIdentityResponse } from "@/lib/progress/types";
import { sectionHref } from "@/lib/sections";
import { ProgressSearch } from "./progress-search";

export function CollectionHomeRedirect() {
  const router = useRouter();
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function open(nickname: string) {
      router.replace(
        sectionHref(`/collection/${encodeURIComponent(nickname)}`, {
          currentSection: "collect",
        }),
      );
    }

    // The saved wallet is the rename-proof handle, but it must never reach the
    // URL bar: resolve it to the account's current nickname here, then
    // navigate to that. The saved nickname is the fallback for when the
    // lookup can't answer (Cosmo down, wallet we've never resolved).
    async function openSavedCollection() {
      const savedAddress = readStoredCosmoAddress();
      const savedNickname = readStoredCosmoUsername();

      if (savedAddress) {
        try {
          const res = await fetch(
            `/api/progress/resolve-address/${savedAddress}`,
          );
          if (cancelled) return;
          if (res.ok) {
            const data: ProgressIdentityResponse = await res.json();
            storeCosmoUsername(data.nickname, data.address);
            open(data.nickname);
            return;
          }
        } catch {
          if (cancelled) return;
        }
      }

      if (savedNickname) {
        open(savedNickname);
        return;
      }

      setCheckedStorage(true);
    }

    void openSavedCollection();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checkedStorage) {
    return (
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-12 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        <span>Opening your collection...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Collection</h1>
        <p className="text-sm text-muted-foreground">
          Search any Cosmo username to view their collection, or link your own
          account.
        </p>
      </div>
      <ProgressSearch />
      <div className="flex flex-wrap gap-3">
        <Link
          href={sectionHref("/link", { currentSection: "collect" })}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Link Cosmo account
        </Link>
        <Link
          href={sectionHref("/", { currentSection: "collect" })}
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to home
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Once you view a collection, we&apos;ll bring you back to it
        automatically from here.
      </p>
    </div>
  );
}
