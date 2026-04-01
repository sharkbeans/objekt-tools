import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { TradesContent } from "./trades-content";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const pageParam = firstValue(params.page);
  const page = Number(pageParam ?? "1");
  const pageNumber = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;

  const canonicalParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "page") continue;

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value) canonicalParams.append(key, value);
    }
  }

  const hasQueryFilters = canonicalParams.toString().length > 0;
  const canonical =
    canonicalParams.size > 0
      ? `/trades?${canonicalParams.toString()}`
      : "/trades";
  const shouldIndex = pageNumber === 1 && !hasQueryFilters;

  return {
    title: "Browse Trades | Objekt Trade",
    description: "TESTING",
    alternates: {
      canonical,
    },
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
    },
  };
}

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Browse Trades</h1>
          <p className="text-muted-foreground">
            Find someone to trade Objekts with
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/trades/new">New Trade</Link>
        </Button>
      </div>

      <Suspense>
        <TradesContent />
      </Suspense>
    </div>
  );
}
