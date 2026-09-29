"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingState } from "@/components/page-shell";
import { buttonVariants } from "@/components/ui/button";
import {
  clearStoredCosmoIdentity,
  readStoredCosmoAddress,
  readStoredCosmoUsername,
} from "@/lib/cosmo-username-storage";
import { sectionHref } from "@/lib/sections";
import { ProgressSearch } from "./progress-search";

export function CollectionHomeRedirect({
  walletUnresolved = false,
}: {
  walletUnresolved?: boolean;
}) {
  const router = useRouter();
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    // The by-wallet resolver bounced us back here because the stored address
    // no longer maps to a Cosmo nickname — the usual cause being a rename.
    // Drop the whole saved identity: keeping the username would just send us
    // to its 404 (it was renamed away too), and keeping the address would
    // ping-pong through the resolver forever.
    if (walletUnresolved) clearStoredCosmoIdentity();

    const savedAddress = readStoredCosmoAddress();
    if (savedAddress) {
      router.replace(
        sectionHref(`/collection/by-wallet/${savedAddress}`, {
          currentSection: "collect",
        }),
      );
      return;
    }

    const savedNickname = readStoredCosmoUsername();
    if (savedNickname) {
      router.replace(
        sectionHref(`/collection/${encodeURIComponent(savedNickname)}`, {
          currentSection: "collect",
        }),
      );
      return;
    }

    setCheckedStorage(true);
  }, [router, walletUnresolved]);

  if (!checkedStorage) {
    return <LoadingState label="Opening your collection..." />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12">
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
          className={buttonVariants({ size: "lg" })}
        >
          Link Cosmo account
        </Link>
        <Link
          href={sectionHref("/", { currentSection: "collect" })}
          className={buttonVariants({ variant: "outline", size: "lg" })}
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
