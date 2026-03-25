import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Disclaimer banner */}
      <div className="rounded-md border border-yellow-600/40 bg-yellow-950/30 px-4 py-3 flex items-start gap-3 max-w-2xl mx-auto mt-6">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-medium text-yellow-300">Trade at your own risk</p>
          <p className="text-muted-foreground">
            This site helps you find and coordinate Cosmo objekt trades, but we are not
            responsible for any lost objekts, fraud, or disputes that may occur. Always
            check your trade partner&apos;s{" "}
            <span className="text-foreground font-medium">reputation</span> before sending
            anything. Be aware that bad actors exist — if something feels off, trust your
            instincts and walk away.
          </p>
        </div>
      </div>

      {/* Hero */}
      <section className="text-center py-12 space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find Cosmo Objekt Trades
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Post what you have and what you want. Match with collectors who want what
          you have. Coordinate and verify your trade — all in one place.
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Button size="lg" asChild>
            <Link href="/trades">Browse Trades</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/sign-in">Sign in with Discord</Link>
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              1
            </div>
            <h3 className="font-semibold">Sign in with Discord</h3>
            <p className="text-sm text-muted-foreground">
              Discord login is required so your trade partner can contact you directly.
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              2
            </div>
            <h3 className="font-semibold">Link your Cosmo</h3>
            <p className="text-sm text-muted-foreground">
              Verify your Cosmo account by setting a short code in your profile status.
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              3
            </div>
            <h3 className="font-semibold">Post &amp; match</h3>
            <p className="text-sm text-muted-foreground">
              List what you have and what you want. We surface matching traders automatically.
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              4
            </div>
            <h3 className="font-semibold">Trade &amp; verify</h3>
            <p className="text-sm text-muted-foreground">
              Send objekts through Cosmo. We track the on-chain transfers so both sides are confirmed.
            </p>
          </div>
        </div>
      </section>

      {/* Safety note */}
      <section className="max-w-2xl mx-auto text-center space-y-3 pb-8">
        <h2 className="text-lg font-semibold">Before you trade</h2>
        <p className="text-sm text-muted-foreground">
          Always check the other person&apos;s profile before accepting or sending anything.
          Their trade history — completed trades, cancellations, and no-shows — is public.
          A clean record is a good sign. Use Discord to confirm details before committing.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/trades">Browse open trades</Link>
        </Button>
      </section>
    </div>
  );
}
