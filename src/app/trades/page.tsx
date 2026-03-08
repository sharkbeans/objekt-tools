import { Suspense } from "react";
import { TradesContent } from "./trades-content";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Browse Trades</h1>
        <p className="text-muted-foreground">Find someone to trade Objekts with</p>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
        Traders self-report what they have. Always verify ownership on{" "}
        <a
          href="https://objekt.top"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          objekt.top
        </a>{" "}
        before trading.
      </p>

      <Suspense>
        <TradesContent />
      </Suspense>
    </div>
  );
}
