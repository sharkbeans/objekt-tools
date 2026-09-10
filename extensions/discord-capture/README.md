# objekt.my trade capture

Chrome/Chromium and Firefox MV3 extension, built directly from the shared engine in `src/lib`.

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
`extensions/discord-capture/dist`. Reload Discord after loading or updating the extension.
Open a server trade channel, open the extension popup, and **agree to the disclosure** — until
then the content script attaches no observer and reads nothing. Then enable capture for that
channel. Browse normally. The badge counts distinct captured posts (including
non-actionable text); **Dump index** downloads blocks plus parsed items for inspection.
Capture remains enabled across sessions until paused. Enable only channels you intend
to collect. Clear captured posts through the popup; pause first to prevent recapture.

The content script reads only rendered message bodies, explicit author anchors and
machine timestamps. Missing or ambiguous author anchors are skipped, including grouped
posts whose referenced author has scrolled out of the DOM. No adjacent-author guessing,
Discord API calls, tokens, automated scrolling, or server-side message storage.

IndexedDB lives on the extension origin via its service worker, with one record per
shared `messageKey(author, body)`. Parsed results persist alongside `StoredBlock`; duplicate
renders do not parse again. Edited bodies produce new content keys, matching `/match`.
The index has no app load-time cap; browser quota/eviction still applies. Export regularly.

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
also pauses every channel. A `!` toolbar badge and popup error report failed storage writes.

## Automated validation

`npm run extension:smoke` builds and loads the actual MV3 bundle in a temporary Chromium
profile, fulfills Discord navigation with a local fixture, and checks the consent gate
(nothing is captured or annotated before agreement, and withdrawal detaches the reader),
capture, virtualized re-render dedupe, annotation updates, export downloads and pause. It never contacts Discord.
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

## Firefox

Run `npm run extension:build:firefox`. In Firefox 140 or newer, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select
`extensions/discord-capture/dist-firefox/manifest.json`. Reload Discord, then enable
capture for the trade channel using the extension popup. If Firefox shows the extension
as needing site access, grant access to Discord from the Extensions menu and reload.

The Firefox build uses an MV3 background event page and Firefox's Promise-based
`browser` API. The parser, storage and UI are shared with Chromium. After source changes,
rebuild, click **Reload** in about:debugging, and reload Discord. Temporary add-ons are
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
