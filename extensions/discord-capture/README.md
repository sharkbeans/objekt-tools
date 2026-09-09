# Discord capture prototype

Chrome/Chromium MV3 extension, built directly from the shared engine in `src/lib`.

```sh
npm ci
npm run extension:build
npm run extension:test
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
`extensions/discord-capture/dist`. Reload Discord after loading or updating the extension.
Open a server trade channel, open the extension popup, and enable capture for that
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
Firefox packaging is deferred; Phase 4 search awaits a week of Phase 3 usage and an owner
decision. Phase 5 pooling remains deferred.

## Transcript handoff

Choose **Export transcript (.txt)**, open `https://objekt.my/match`, and use **Import text files**.
The shared parser now accepts ISO UTC timestamps. Deploy this branch's app parser before
importing into production; older app versions do not recognize these headers.
Exports validate every author, timestamp and message boundary before downloading. Ambiguous
header-like body text stops the export rather than inventing another trader. The JSON dump
remains available for inspection. `/match` retains its 40,000-post cap, so text exports above
that limit stop with an explanation; the extension itself keeps the complete local index.
