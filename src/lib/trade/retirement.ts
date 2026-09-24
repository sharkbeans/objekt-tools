// Trades (posts, offers, counter-offers, on-chain verification) are being
// retired in favour of Match and Lists — see docs/plans/039-retire-trades.md.
// While frozen, endpoints that start NEW trade activity answer 410; the
// endpoints that let in-flight trades finish (accept, cancel,
// check-transfers, transfer-logs, the expire cron) keep working until the
// retire date so nobody is stranded or banned mid-trade.
//
// Client-safe: imported by the trade pages' banner as well as API routes.

export const TRADES_RETIRE_DATE = "2026-10-01";

export const TRADES_FROZEN = true;

export const TRADES_RETIRED_ERROR = "Trades are retiring — use Match or Lists.";

// "1 October 2026" — formatted in UTC so SSR and the browser agree.
export function formatTradesRetireDate(): string {
  return new Date(`${TRADES_RETIRE_DATE}T00:00:00Z`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
}
