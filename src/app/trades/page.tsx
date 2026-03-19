import { Suspense } from "react";
import { TradesContent } from "./trades-content";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Browse Trades</h1>
        <p className="text-muted-foreground">Find someone to trade Objekts with</p>
      </div>

<Suspense>
        <TradesContent />
      </Suspense>
    </div>
  );
}
