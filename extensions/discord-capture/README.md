# objekt.my trade capture

Chrome/Chromium and Firefox MV3 extension, built directly from the shared engine in `src/lib`.

What changed and why, per release: [`CHANGELOG.md`](./CHANGELOG.md).

Store-facing paperwork lives beside the code: [`PRIVACY.md`](./PRIVACY.md) (publish at
`https://objekt.my/extension-privacy`), [`STORE.md`](./STORE.md) (listing copy and permission
justifications), [`COMPLIANCE.md`](./COMPLIANCE.md) (policy review, including the one unresolved
conflict — Discord's terms do not allow the automated-search feature).

```sh
npm ci
npm run extension:build
npm run extension:test
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
`extensions/discord-capture/dist`. Open a server trade channel and click the toolbar button:
the panel appears in the page. **Agree to the disclosure** — until then the content script
attaches no observer and reads nothing. Then enable capture for that channel. Browse
normally. The badge counts distinct captured posts (including non-actionable text);
**Dump index** downloads blocks plus parsed items for inspection. Capture remains enabled
across sessions until paused. Enable only channels you intend to collect. Clear captured
posts through the panel; pause first to prevent recapture.

## The panel

The UI is a floating window inside the Discord page, not a toolbar popup — a popup closes
the moment it loses focus, and a search run takes minutes, so every glance at Discord used to
close the thing reporting on it. Drag it by the titlebar (or focus the titlebar and use the
arrow keys, shift for bigger steps), resize from the bottom-right corner, `—` collapses it to
the titlebar, `⤢` pops it out into a real browser window, `✕` closes it. Where it was left is
remembered per browser, including whether it was open, and it is clamped back on screen when
the window is smaller than it was.

It is an extension page in an iframe inside a closed shadow root: Discord's CSS cannot reach
it, Discord's scripts cannot see it, and the privileged calls (permission prompts, downloads)
happen in an extension document where browsers allow them. `src/panel-frame.ts` owns the
window chrome, `panel.html` + `src/panel.ts` own the UI, and `src/panel-geometry.ts` holds the
placement rules that the tests exercise without a browser.

Inside it: a channel strip at the top saying whether this channel is being collected, with
the switch for it (that switch used to live under Troubleshooting, which is the wrong place
for the control that decides whether the extension does anything at all); live counts under
the haves and wants boxes, saying how many lines the parser actually recognised, because a
list where half the lines are headings parses to half a list silently; a progress bar and a
Stop button that only exists while a run does; and per-step status lines that go red when
something failed rather than reporting errors somewhere else on the page. The palette follows
Discord's own light/dark setting, reported by the content script — not `prefers-color-scheme`,
which is a different setting and wrong about as often as it is right.

The toolbar button toggles the panel on Discord tabs and opens the pop-out window anywhere
else. Either way the panel acts on a specific Discord tab: the one it is embedded in, or —
from a window — the Discord tab you used most recently (`src/host-tab.ts`), so it no longer
matters which tab is in front. A Discord tab that was already open when the extension was
installed no longer needs a reload either; the worker injects the content script on demand.

The content script reads only rendered message bodies, explicit author anchors and
machine timestamps. Missing or ambiguous author anchors are skipped, including grouped
posts whose referenced author has scrolled out of the DOM. No adjacent-author guessing,
Discord API calls, tokens, automated scrolling, or server-side message storage.

IndexedDB lives on the extension origin via its service worker, with one record per
shared `messageKey(author, body)`. Parsed results persist alongside `StoredBlock`; duplicate
renders do not parse again. Edited bodies produce new content keys, matching `/match`.
The index has no app load-time cap; browser quota/eviction still applies. Export regularly.

## Search

A run types each collection code into Discord's own search box and lets Discord's client
issue the request; nothing here calls Discord's API or touches a token. What that costs the
user's account is in [`COMPLIANCE.md`](./COMPLIANCE.md#discord-terms-of-service) and behind
its own consent.

What the run refuses to do:

- **Type anywhere but the search box.** `execCommand` and the synthetic input events act on
  the document's selection, not on the element they are handed, so an insertion attempted
  while the message composer holds focus types the query into the composer — silently, since
  the search box then reads back empty and the attempt is retried. Every insertion, clearance
  and Enter is conditional on the search box actually holding focus. `search.test.ts` proves
  a detached field leaves the composer empty and presses no keys.
- **Keep firing at a client that has stopped answering.** Retries back off (750ms, doubling),
  and three queries in a row answered with the list already on screen ends the run with a
  rate-limit explanation rather than a fourth attempt.
- **Search a whole pasted want list.** 40 codes per run, and by default codes searched in the
  last 6 hours are skipped, so a repeat run continues through the list instead of restarting
  it (`search-plan.ts`). Untick the box to search everything.
- **Read user input as Discord search syntax.** Queries are stripped to letters, digits and
  single spaces, so a stray `from:` or quote cannot turn a search into a filter.

None of it is English-only any more. The search box was found by an accessible name
beginning with "Search", which meant a client in any other language reported the box as
missing and the whole feature was unavailable. The guard that matters is the role — the
composer is `role="textbox"`, search is `role="combobox"`, so a combobox is never the box
that posts to a channel — so a recognised name in any of a dozen languages is taken directly,
and an unrecognised one is taken only when it is the only combobox in the document.
Ambiguity still fails closed, which is the property worth keeping: being unable to search is
an inconvenience, typing into the wrong box is a message in a public channel. The pager reads
`aria-current="page"` and the digits in the button, rather than the words "Page 2". A pager
that renders no numbers at all still pages, on the result ids instead: a page counts as
walked only when every id that was on screen is gone. "The panel changed" is not enough —
Discord's list grows as the scroller reaches the bottom of a long page, and a query that
matched nothing leaves the last one's pager up, both of which move the ids without anything
being paged.

An empty results panel is now recognised as an answer rather than as a missing panel, so a
code nobody has posted costs one settle instead of the full grace period, and a panel that
actually disappears is diagnosed as the user having closed it. Stop takes effect on the next
poll instead of at the end of the settle budget. A run that dies with its tab reports as
interrupted — `pagehide` writes it where it can, and the panel treats a progress stamp older
than a minute as dead regardless.

## Running in the background

A run spends most of its life in a tab nobody is looking at, which is the point of the
panel. Three things have to hold for that to work:

- **Timers.** Chrome throttles `setTimeout` in a hidden tab — to a second after ten seconds,
  and to once a minute once it decides the page is idle — so a run pacing itself on 150ms
  polls does not slow down so much as stop. While hidden, the run asks the worker to keep
  time instead; the worker is not a tab and is not throttled. Both timers run and the first
  to finish wins, so a worker that has been torn down costs latency and never a hang
  (`wait.ts`, `wait.test.ts`).
- **The worker.** An MV3 service worker is torn down after thirty seconds without work, which
  mid-run takes the timer service and the open database with it. A run holds a named port
  open and pings it, which is the documented way to say "still working".
- **Cost per post.** A page of search results captures twenty-five posts at once. Each one
  used to pay for two `storage.local` reads, a fresh IndexedDB connection, a `remove()` write
  and a badge update. Consent and enabled channels are now cached for the worker's life and
  invalidated on change, the database connection is held open (and dropped if anything closes
  it underneath), the error clear only runs when there is an error, and badge/count updates
  are coalesced to at most one every 700ms.

The index also asks for `navigator.storage.persist()` once capture is agreed to, because
without it the store is best-effort and the browser may quietly evict a week of captures.
Troubleshooting → **Check this tab** reports whether that was granted and how full the store
is.

## When it stops working

Two failures used to be completely silent, which for a tool that runs unattended is the
worst kind:

- **Discord changes its markup.** Nothing throws; the selectors stop matching, every row
  reads as unreadable, and capture collects nothing while looking exactly like a quiet
  channel. The content script samples for that shape twice a minute — messages on screen,
  capture on for the channel, none of them readable — and two consecutive bad samples put a
  banner in the panel. `health.ts` holds the rule and `health.test.ts` the judgement calls
  (one unreadable post is an attachment; a screenful of them is a broken parser).
- **The extension is reloaded or updated.** Every content script already running is orphaned:
  `chrome.runtime` stops working and every message throws. The old code caught that and
  carried on scanning, so capture stopped for good and the badge simply never moved again.
  An orphaned script now detaches its observer, cancels any run, stops answering messages,
  and replaces the panel's contents with what to do about it.

  On an update the worker does better than that: it injects the new content script into
  every open Discord tab, so nobody has to reload anything. Two copies would otherwise share
  the page, both observing and both drawing a panel, so the arriving copy announces itself
  through a DOM event — those cross isolated worlds — and the older one stands down and takes
  its panel with it. A copy that has stood down answers no messages at all: its listeners
  outlive it when it was superseded rather than invalidated, and two instances both accepting
  "run a search" is two runs typing into the same box. The smoke test injects a second script
  and checks that one panel survives and the run still works.

  A first install opens the panel in a Discord tab if one is open, since an extension that
  installs and then does nothing gives no hint that a toolbar button is what starts it.
  <kbd>Alt+Shift+O</kbd> toggles the panel too.

## Validation still requiring a real Discord session

Browse a trade channel for two minutes; dump the index and inspect authors, range coverage,
and raw/distinct/actionable counts. Re-scroll and confirm no growth. The plan's 2.3 ratio
is an observed corpus average, not a selector test or a guaranteed acceptance threshold.
Synthetic fixtures cannot certify Discord's current DOM. No authenticated Discord browser
session was available during implementation.

Direct `/match` IndexedDB handoff is deferred. Chrome documents host-origin storage for
content scripts, but a real-origin spike is still required before introducing that contract.
Phase 4 search awaits a week of Phase 3 usage and an owner
decision. Phase 5 pooling remains deferred.

## Transcript handoff

Choose **Export transcript (.txt)**, open `https://objekt.my/match`, and use **Import text files**.
The shared parser now accepts ISO UTC timestamps. Deploy this branch's app parser before
importing into production; older app versions do not recognize these headers.
Exports validate every author, timestamp and message boundary before downloading. Ambiguous
header-like body text stops the export rather than inventing another trader. The JSON dump
remains available for inspection. `/match` retains its 40,000-post cap, so text exports above
that limit stop with an explanation; the extension itself keeps the complete local index.

## Inventory and annotations

Type haves and choose **Save typed haves**, or enter a Cosmo nickname and choose **Load
inventory**. The latter requests optional permission for `https://objekt.my/*` and calls
only the existing by-nickname endpoint, once per click, without cookies. Errors, rate
limits and unavailable inventory leave the saved haves intact. Loading replaces typed
haves; saving typed haves replaces loaded inventory. An empty typed list clears haves.

Enabled channels show **wants N of yours** for exact matches from the shared matcher.
Wildcards are deliberately not counted, matching `/match`. Inventory is a saved snapshot;
load again after trading to refresh it. Pausing removes annotations. Clearing the index
also pauses every channel. A `!` toolbar badge and panel error report failed storage writes.

## Automated validation

`npm run extension:smoke` builds and loads the actual MV3 bundle in a temporary Chromium
profile, fulfills Discord navigation with a local fixture, and checks: the floating panel
(opened the way the toolbar button opens it, dragged by its titlebar, held on screen,
restored where it was left after a reload, and genuinely closed to the page); both consent
gates; a whole search run end to end — real `execCommand` typing into a real contenteditable,
a real Enter, results captured and scoped to the run; the run state machine, including a run
whose reports stop arriving; capture with Discord behind another window; virtualized
re-render dedupe; annotation updates; export downloads; pause; and withdrawal. It never
contacts Discord.
Install the Playwright Chromium browser first if it is missing (`npx playwright install chromium`).
The Node tests cover structural attribution, IndexedDB transactions/reopens, ranges, ISO
round trips, ambiguous export rejection, and inventory failures. `npm test` includes the
shared engine import-graph purity guard.

Implementation checkpoints: Phase 1 capture, Phase 2 handoff, Phase 3 inventory/annotations.
All are implemented; the live two-minute capture check and subsequent week of real usage
remain manual acceptance steps. No Phase 4/5 implementation or direct-origin storage write
is included. Parser changes should bump the extension version; persisted parsed entries
currently use the initial parser schema, so clear/re-capture after incompatible engine changes.

## Consent

Two separate agreements, both stored in `storage.local` under `consent` and both revocable
from Troubleshooting → **Withdraw consent**:

- **Capture** — required before any message body is read. Enforced in the content script
  (the `MutationObserver` is attached on consent, detached on withdrawal) and again in the
  service worker, which refuses to store a post without it.
- **Search automation** — required before the extension types into Discord's search box.
  Agreeing to capture never grants this. It is presented as a risk warning because driving
  the search box is automation of a user account, which Discord's terms prohibit; see
  [`COMPLIANCE.md`](./COMPLIANCE.md#discord-terms-of-service).

Bumping `CONSENT_VERSION` in `src/consent.ts` re-asks everyone, and is the correct response
to any material change in what the extension collects.

## Releasing

```sh
npm run typecheck && npm run lint && npm run extension:test && npm run extension:smoke
npx web-ext lint --source-dir extensions/discord-capture/dist-firefox
npm run extension:package
```

`extension:package` rebuilds both targets from scratch and writes
`packages/objekt-capture-{chrome,firefox}-<version>.zip`. It rebuilds rather than zipping
whatever is on disk, because uploading the wrong folder costs review days, and it strips the
`version_name` build stamp so a package is not a different file every time it is built —
two builds of the same source produce byte-identical zips.

Before uploading: bump `version` in `manifest.json`; bump `CONSENT_VERSION` in
`src/consent.ts` as well if what the extension collects has changed materially, which
re-asks everyone. [`STORE.md`](./STORE.md) has the listing copy and every answer the two
dashboards ask for; [`COMPLIANCE.md`](./COMPLIANCE.md) has the checklist of what is still
outstanding, including the automated-search decision.

Persisted parsed entries use the parser schema they were captured with, so a parser change
that is not backwards compatible needs a clear-and-recapture, not just a version bump.

## Firefox

Run `npm run extension:build:firefox`. In Firefox 140 or newer, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select
`extensions/discord-capture/dist-firefox/manifest.json`. Click the toolbar button on a
Discord tab to show the panel, then enable capture for the trade channel from it. If Firefox shows the extension
as needing site access, grant access to Discord from the Extensions menu and reload.

The Firefox build uses an MV3 background event page and Firefox's Promise-based
`browser` API. The parser, storage and UI are shared with Chromium. After source changes,
rebuild, click **Reload** in about:debugging, and reload Discord (or just reopen the panel —
the worker reinjects the content script). Temporary add-ons are
removed when Firefox restarts; load the manifest again to resume testing. Export before
ending the test session. Permanent installation requires a Mozilla-signed package,
which this local prototype does not include.

Mozilla references: [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/),
[MV3 background differences](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

Firefox package validation (`npx web-ext lint --source-dir extensions/discord-capture/dist-firefox`)
passes with 0 errors, 0 warnings and 0 notices. Permanent installation still requires a
Mozilla-signed package.

### Wrong-manifest installation error

If Firefox says `background.service_worker is currently disabled`, an older Chrome-only
manifest was selected. Rebuild with `npm run extension:build:firefox` and select the
**generated** `dist-firefox/manifest.json`, not the source manifest in the parent folder.
Each build emits the manifest its own store expects, rather than one carrying both: `dist`
is Chrome-only (service worker, no `browser_specific_settings`) and `dist-firefox` is
Firefox-only (event page, with the gecko block and its data-collection declaration). The
source folder itself is not loadable — its JavaScript bundles exist only in the build output.
Chrome 116+ and Firefox 140+ (Android 142+, which is where `data_collection_permissions`
landed).
