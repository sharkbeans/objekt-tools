import Link from "next/link";
import { sectionHref } from "@/lib/sections";
import { formatTradesRetireDate } from "@/lib/trade/retirement";

// Shown on the trade pages while trades are frozen ahead of retirement
// (plan 039). Server- and client-renderable: no hooks.
export function TradesRetiringBanner() {
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-500/15 px-4 py-3 text-sm dark:border-amber-800"
    >
      <p>
        <span className="font-medium">
          Trades is retiring on {formatTradesRetireDate()}.
        </span>{" "}
        Finish your open trades by then. Looking for objekts?{" "}
        <Link
          href={sectionHref("/match", { currentSection: "trade" })}
          className="font-medium underline underline-offset-2"
        >
          Try Match
        </Link>
        .
      </p>
    </div>
  );
}
