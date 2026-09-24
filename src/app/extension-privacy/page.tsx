import type { Metadata } from "next";
import type { ReactNode } from "react";

// The privacy policy for the "Objekt Match" browser extension.
//
// Both the Chrome Web Store and addons.mozilla.org require a reachable policy
// URL, and the extension's own panel links here. It is a page in the app rather
// than a rendered copy of extensions/discord-capture/PRIVACY.md because that
// file is not tracked (the repo ignores *.md), so a build could never read it —
// keep the two in step by hand when either changes.
//
// Without this route, /extension-privacy fell through to the [address] profile
// page and rendered an empty profile for a user called "extension-privacy",
// with a 200, which is what a store reviewer following the link would have seen.

export const metadata: Metadata = {
  title: "Extension privacy policy | objekt.my",
  description:
    "What the Objekt Match browser extension collects, where it keeps it, and what leaves your device.",
};

const LAST_UPDATED = "2026-09-24";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4 hover:text-primary"
    >
      {children}
    </a>
  );
}

export default function ExtensionPrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8 px-4 py-10 text-sm leading-relaxed sm:text-base">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Privacy policy — Objekt Match</h1>
        <p className="text-muted-foreground">
          Last updated {LAST_UPDATED}. Applies to the browser extension
          &ldquo;Objekt Match&rdquo; for Chrome/Chromium and Firefox.
        </p>
      </header>

      <Section title="The short version">
        <p>
          The extension keeps a local index of Discord trade posts so you can
          match them against your own objekts. What it captures is kept in your
          browser. It has no account of its own and no analytics. The only
          server it talks to is objekt.my, the developer&rsquo;s own site, for
          the three things listed under &ldquo;What leaves your device&rdquo;
          below. On objekt.my pages it only listens for a list of missing
          objekts you send it by pressing a button.
        </p>
      </Section>

      <Section title="What it collects">
        <p>
          From the server channels you open, unless you have paused capture in
          that channel, and only from messages already rendered on screen in
          your own Discord tab. Capture is on in every server channel by default
          once you agree to it:
        </p>
        <List>
          <li>the message author&rsquo;s displayed name,</li>
          <li>the message text,</li>
          <li>the message timestamp,</li>
          <li>
            Discord&rsquo;s channel and message ids, used as storage keys so the
            same post is not stored twice.
          </li>
        </List>
        <p>
          It also stores what you type into the panel: your want list, your
          Cosmo nickname if you enter one, and your pace and page settings.
        </p>
        <p>
          To pace searches so Discord does not refuse them, it also keeps, on
          your device only: when each search request was sent over the last 10
          minutes, how long result pages took to load, the slower pace Discord
          last pushed a search to, which codes were searched in the last 30
          days, and when searching was last paused for a rate limit. These are
          never sent anywhere.
        </p>
      </Section>

      <Section title="What it does not collect">
        <List>
          <li>Your Discord token, password, email or account id.</li>
          <li>
            Direct messages or group DMs, or anything you have not opened.
          </li>
          <li>Attachments, images, voice, or embeds — text bodies only.</li>
          <li>
            Browsing history, or any activity on sites other than Discord. On
            objekt.my it reads nothing but the list you send it (see &ldquo;On
            objekt.my pages&rdquo; below).
          </li>
          <li>
            Analytics, telemetry, crash reports, or usage statistics of any
            kind.
          </li>
        </List>
      </Section>

      <Section title="Where it is stored">
        <p>In your browser, on your device:</p>
        <List>
          <li>
            captured posts in IndexedDB (database{" "}
            <code>objekt-discord-capture</code>), on the extension&rsquo;s own
            origin;
          </li>
          <li>
            settings, your want list (including one sent from objekt.my, and the
            list it replaced, kept for a day so you can undo), and your
            agreement record in extension storage.
          </li>
        </List>
        <p>
          The extension does not upload, back up, or sync its index.
          Uninstalling the extension removes both. <em>Clear captured posts</em>{" "}
          in the panel empties the index at any time.
        </p>
      </Section>

      <Section title="What leaves your device">
        <p>
          Everything below goes only to{" "}
          <Ext href="https://objekt.my">objekt.my</Ext>, over requests that
          carry no cookies and no credentials from the extension. Nothing is
          sent to Discord by the extension, and no third party, advertiser, or
          analytics provider is involved.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong>Card art.</strong> As you type your want list, the season,
            collection number and member of each line are sent to
            objekt.my&rsquo;s public collection search, to show the card&rsquo;s
            picture instead of a bare code. This happens as you type, without a
            button press. Nothing about your Discord activity is included.
          </li>
          <li>
            <strong>Opening a search in objekt.my/match.</strong> When you press{" "}
            <em>Open in match</em>, the posts from your last search — the author
            names, text and timestamps described above — are handed to an
            objekt.my/match tab (opened or reused) through a script the
            extension injects into it. Nothing is sent until you press the
            button. The match page keeps those posts in your browser&rsquo;s
            storage rather than uploading them, with two exceptions: links to
            external trade lists found inside posts are fetched through
            objekt.my&rsquo;s server so the lists can be imported, and if you
            are signed in to objekt.my, a one-way hash of each post you mark as
            seen — not its text — is saved to your account so it stays hidden on
            your other devices. The <em>Download</em> buttons in Settings write
            a file to your downloads folder instead, if you would rather keep a
            file.
          </li>
          <li>
            <strong>Inventory lookup.</strong> If you type a Cosmo nickname and
            press <em>Load</em>, the extension requests your objekts for that
            nickname from objekt.my once. The nickname is the only thing sent.
            Skip it by typing your haves instead.
          </li>
        </ol>
        <p>
          Access to objekt.my is a required permission — the extension cannot do
          its job without it — but each request above happens only when its
          trigger occurs (typing a want, pressing Open in match, pressing Load),
          not merely because the permission is held.
        </p>
      </Section>

      <Section title="On objekt.my pages">
        <p>
          On objekt.my pages the extension listens only for a list of missing
          objekts you send by pressing a button, and stores that want list
          locally. It reads nothing else from objekt.my pages and sends nothing
          back except that it is installed.
        </p>
        <List>
          <li>
            <strong>What it listens for.</strong> Two kinds of message the page
            posts to itself: &ldquo;is the extension installed?&rdquo;, and a
            list of missing objekts — up to 40 names such as &ldquo;SeoYeon
            CC101&rdquo;, plus your Cosmo nickname if the page knows it. It is
            only sent when you press <em>Find on Discord</em> or{" "}
            <em>Add to Objekt Match</em>.
          </li>
          <li>
            <strong>What it does with that list.</strong> Makes it the want list
            in the extension&rsquo;s panel, keeping the list it replaced so{" "}
            <em>Undo</em> can put it back. Your nickname is filled in only if
            the extension has none; one you typed is never overwritten. Then it
            switches to the Discord tab you used last, with its panel open, or
            opens Discord if you have no tab there.
          </li>
          <li>
            <strong>What it answers.</strong> That it is installed, and its
            version number, so the page can offer the button. Nothing else.
          </li>
          <li>
            <strong>What it does not do there.</strong> Read the page, your
            objekt.my account, or its cookies; make any request; or run on any
            site other than objekt.my and Discord.
          </li>
        </List>
      </Section>

      <Section title="Other people's posts">
        <p>
          A captured post is somebody else&rsquo;s writing, and their display
          name is personal data. You are the one collecting it, so treat it that
          way: keep exports to yourself, delete them when the trade is done, and
          clear the index when you are finished. The extension does not publish,
          share, or aggregate what you collect.
        </p>
      </Section>

      <Section title="Automated search">
        <p>
          If you separately agree to it, the extension can type your objekt
          codes into Discord&rsquo;s own search box and click through the result
          pages. This is automation of your Discord account, which
          Discord&rsquo;s{" "}
          <Ext href="https://discord.com/terms">Terms of Service</Ext> do not
          permit, and Discord may act on accounts that use it. It collects
          nothing beyond what is listed above, is off by default, and requires
          its own separate agreement.
        </p>
      </Section>

      <Section title="Your choices">
        <List>
          <li>
            Capture is off until you agree. After that it is on in every server
            channel you open; pause it from the panel in any channel you do not
            want read.
          </li>
          <li>
            <em>Withdraw consent</em> stops the extension reading Discord at
            all; the reader is detached, not just paused.
          </li>
          <li>
            <em>Clear captured posts</em> deletes the index.
          </li>
          <li>Removing the extension deletes everything it holds.</li>
        </List>
      </Section>

      <Section title="Contact">
        <p>
          Questions or a deletion request: open an issue at{" "}
          <Ext href="https://github.com/sharkbeans/objekt-tools/issues">
            github.com/sharkbeans/objekt-tools
          </Ext>
          , or use the developer contact on the extension&rsquo;s store listing.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">
        Not affiliated with Discord, MODHAUS or COSMO.
      </p>
    </article>
  );
}
