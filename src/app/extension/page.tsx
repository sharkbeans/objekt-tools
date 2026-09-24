import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StoreButtons } from "./store-buttons";

// Landing page for the "Objekt Match" browser extension. Root-only (see
// ROOT_ONLY_PREFIXES) so the store listings and in-app CTAs share one stable
// URL. The "never does" list is lifted from the extension's PRIVACY.md, which
// is untracked — keep it in step with /extension-privacy when either changes.

export const metadata: Metadata = {
  title: "Objekt Match extension | objekt.my",
  description:
    "Scroll your Discord trade channels as usual. Objekt Match remembers every post and shows who has what you're missing.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ExtensionPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-10 px-4 py-10 text-sm leading-relaxed sm:text-base">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold">Objekt Match</h1>
        <p className="text-lg">
          Scroll your trade channels as usual. Objekt Match remembers every post
          and shows who has what you&rsquo;re missing.
        </p>
        <p className="text-muted-foreground">
          A browser extension for Discord. It keeps the trade posts you already
          scroll past, then opens them in{" "}
          <Link href="/match" className="underline underline-offset-4">
            objekt.my/match
          </Link>{" "}
          against your grids and your collection, so you never copy-paste a
          channel again.
        </p>
        <StoreButtons />
      </header>

      <Section title="What it never does">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>It never asks for or reads your Discord token or password.</li>
          <li>It never calls the Discord API.</li>
          <li>Direct messages and group DMs are never captured.</li>
          <li>
            Captured posts are stored only in your browser. Nothing is uploaded,
            backed up or synced.
          </li>
          <li>
            No post leaves your device until you press <em>Open in match</em>.
          </li>
          <li>No analytics, telemetry or ads.</li>
        </ul>
      </Section>

      <Section title="Search mode (optional)">
        <p>
          Besides passive capture, the extension can search for you: it types
          your objekt codes into Discord&rsquo;s own search box and pages
          through the results. This is off by default and needs its own,
          separate agreement.
        </p>
        <p className="text-muted-foreground">
          Be aware that it drives Discord&rsquo;s search on your account.
          Discord&rsquo;s terms don&rsquo;t allow automating a user account, and
          Discord may act on accounts that do. Passive capture is the safer way
          to use Objekt Match.
        </p>
      </Section>

      <p className="text-muted-foreground">
        Full details in the{" "}
        <Link
          href="/extension-privacy"
          className="underline underline-offset-4 hover:text-primary"
        >
          extension privacy policy
        </Link>
        .
      </p>
    </article>
  );
}
