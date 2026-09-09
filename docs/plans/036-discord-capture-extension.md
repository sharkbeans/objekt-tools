# Plan 036: Discord extension — capture, then hand off to `/match`

## Implementation update (2026-09-09)

Phases 1–3 implemented on `proto/discord-paste-match` in `extensions/discord-capture`.
Chrome/Chromium first; Firefox and direct IndexedDB handoff deferred. Phase 4 still
requires a week of real usage and an owner decision; Phase 5 remains deferred.
Live Discord acceptance is outstanding; automated fixtures and the unpacked-extension
Chromium smoke test do not replace the two-minute real-channel check.

The shared parser required ISO UTC header support for lossless file handoff. Text export
checks boundaries and refuses ambiguous content or indexes above the existing `/match`
40,000-post limit. Deploy the updated app before using those exports on production.
Captured records remain uncapped locally. See the extension README for build/install,
validation, permissions, storage behavior and all remaining manual checks.

---

The original specification follows.

> **Executor instructions**: This is a **spec + discovery handoff**. Phase 1 is
> ready to build; later phases carry decisions that must be settled with the
> repo owner first (see "Open questions"). Read the whole document before
> starting — "Evidence already gathered" contains measurements taken against a
> real channel export that you should **not** re-derive, and "Rejected
> approaches" lists paths explored and closed this session for reasons that
> still hold.
>
> **Drift check (run first)**:
> `git diff --stat 1460b8f..HEAD -- src/lib/paste-parser.ts src/lib/discord/ src/lib/match/`
> The extension depends on those paths being pure, portable TypeScript. If they
> changed, re-run the purity check in "The engine ports as-is" before trusting
> this plan.

## Status

- **Priority**: P1 (extends the acquisition bet in plan 035)
- **Effort**: L
- **Risk**: MEDIUM (new surface, no changes to trade-critical paths; see STOP conditions on Discord automation)
- **Depends on**: 035 (steps 1–6, all DONE)
- **Category**: growth / activation
- **Planned at**: commit `1460b8f`, 2026-09-09
- **Branch**: not created yet. `/match` work lives on `proto/discord-paste-match`

## Why this matters

Plan 035 made the user the transport: they select messages in Discord, copy,
and paste into `/match`. That works, but the copy-paste loop is manual and
Discord virtualises its message list, so each paste reaches only a few screens.

This plan removes the copying. A browser extension reads the messages Discord
has **already rendered on the user's screen**, parses them with the existing
engine, and hands the result to `/match`. Same product, same matching, no
clipboard.

Three ceilings we hit on `/match` disappear as a side effect:

| Ceiling | Why it goes away |
| --- | --- |
| Load-time cap (`MAX_BLOCKS`) | Messages are parsed once as they render, never re-parsed in bulk |
| No usable timestamps | The DOM carries a real ISO instant; the clipboard carries `"3:41 PM"` |
| Range listings unsearchable | Full message text is present, so `CC101-108` expands locally |

## Evidence already gathered

**Do not re-derive this.** Measured 2026-09-09 against the real
`~/Downloads/objekt_trade/` export (6 Discrub pages, one `#objekt-trade` day).

### What a day of the channel actually contains

```
3,069  raw messages
-1,707  exact reposts, deduped by content key        (56%)
─────
 1,362  distinct posts
        ├─ 1,230  with typed items
        ├─    79  link-only (profile link → verifiable inventory)
        └─    53  genuinely dead                      (4%)
```

- **≈2.3 raw messages scrolled per actionable post indexed.**
- **47 distinct objekts per message** on average — posts are dense.
- 9,650 distinct objekts mentioned across the day; 1,417 unique posts/day.
- The shrinkage is **dedupe, not junk**. This is a dedicated trade channel, so
  scrolling is not wasted on chatter — half of what passes is already indexed.

### How much capture is enough

Want-lists of 30 objekts at three demand levels, against N indexed posts:

| indexed posts | hyped (92 hits/day) | median (3/day) | rare (2/day) |
| --- | --- | --- | --- |
| 25 | 30/30 | 0/30 | 0/30 |
| 100 | 30/30 | 28/30 | 0/30 |
| 200 | 30/30 | 30/30 | 0/30 |
| 1,000 | 30/30 | 30/30 | 30/30 |

One screen covers hyped objekts. ~200 posts (~460 raw messages) covers ordinary
ones. Rare objekts **cluster** — they sit together in a few specialist posts
rather than scattered thinly, so they arrive all at once around 1,000.

### The engine ports as-is

The matching engine is a closed graph of pure TypeScript with **zero external
dependencies** and no framework, server, DOM or network references:

```
paste-parser → filters, sanitize-text, season-prefix
transcript   → intent, price, remarks, filters, paste-parser
match        → transcript, paste-parser, season-prefix
trade-desk   → match, transcript, objekt-label, paste-parser
```

`src/lib/discord/verify.ts` is the only file in the set that calls `fetch`, and
it is not needed for capture. Verify with:

```bash
grep -ln "next/\|react\|window\.\|document\.\|process\.env\|fetch(" \
  src/lib/paste-parser.ts src/lib/discord/*.ts src/lib/filters.ts \
  src/lib/sanitize-text.ts src/lib/season-prefix.ts src/lib/objekt-label.ts | grep -v test
```

### Parse cost (why capture beats re-parsing)

`analyzeTranscript` costs ~0.25 ms per stored block — about **0.35 s per day**
of channel. `/match` re-parses its whole store on every load, which is why
`MAX_BLOCKS` exists. Parsing once at render time removes the cost entirely.

### Discord automation limits (measured + researched)

- Bulk export via Discrub **walls at ~2,600–3,200 messages**, reproducibly,
  across two sessions on different days. The refill pattern (wait 45 s → get
  ~500 more → wall again) is rate limiting, not connectivity.
- That ceiling is roughly **one day of channel volume**, so bulk backfill of 30+
  days is not reachable by export.
- Rate limits follow the **account token**, not the client — a custom script
  hits the same bucket as Discrub.
- Discord's message-search endpoint is user-only and its rate limit is
  **undocumented**; user tokens receive fewer rate-limit headers than bots
  (usually only `Retry-After`, `X-RateLimit-Global`, `X-RateLimit-Scope`), so it
  cannot be planned against, only reacted to.
- [Discrub](https://github.com/prathercc/discrub) (MIT) already implements
  search and needed **30 s randomised delays plus an automatic 10-minute rest
  after every 45 minutes** to survive. Treat those constants as hard-won data.
- [DiscordSearchExporter](https://github.com/Qubzy/DiscordSearchExporter)
  implements the render-and-parse approach and documents it explicitly as the
  way to work "without annoying rate limits".

### If search is ever added (Phase 4 only)

- **96.9%** of listed objekts are findable by literal search; the invisible
  **3.1%** are range listings (`YooYeon Full Grid CC101-108` contains neither
  `CC102` nor `CC107` as text). More queries cannot fix this — it is an index
  gap, not a query-coverage gap.
- Search hits collapse ~6:1 into distinct traders. Per objekt over 30 days:

| popularity | search hits | distinct posts | distinct traders |
| --- | --- | --- | --- |
| top 1% | 4,775 | 1,498 | 531 |
| median | 187 | 62 | 31 |
| bottom 25% | 62 | 31 | 31 |

- So **deep pagination is never needed**: popular objekts yield many traders on
  page one; rare objekts have only ~31 in existence over 30 days. A flat 1–2
  page cap suffices, which bounds a 30-objekt refresh at ~60 requests.

## Proposed design

### Flow

```
setup (once)   user enters Cosmo nickname or types haves
               → extension calls /api/objekts/by-nickname/[nickname]
               → stored locally.  ONLY network call the extension makes.

capture        user browses #objekt-trade in Discord web as normal
               → MutationObserver sees each rendered message element
               → DOM adapter reads { author, isoTimestamp, body }
               → existing parser produces { haves, wants, intent, pricing }
               → dedupe by messageKey(author, body)
               → append to local index (persists across sessions)

handoff        user clicks "Send to objekt.my"
               → transcript reaches /match, which already does everything:
                 desk, grids, contacts, verification, poster, trade text
```

**No requests are made to Discord.** The extension reads a page the user
already opened. This is the whole reason the design is viable — see STOP
conditions.

### The DOM adapter is the only genuinely new code

Everything downstream already exists and is tested. The adapter converts a
Discord message element into the shape `splitTranscript` already emits:
`{ author: string, body: string, time: MessageTime | null }`.

It **replaces** the fragile part rather than adding to it. Today
`transcript.ts` reverse-engineers a clipboard text format with regexes for
em-dashes, `Yesterday at`, locale variants and trailing commas. The DOM gives
all three fields structurally, including a machine-readable timestamp.

Build it against stable anchors — the `<time datetime="…">` element and
message-id attributes — never generated class names, which churn hardest.

### Handoff: two steps, cheapest first

1. **Export a transcript file.** `/match` already has "Import text files"
   ([match-client.tsx](../../src/app/match/match-client.tsx)). The extension
   renders its index back to transcript text via `blocksToTranscript` and
   offers a download. **Zero changes to objekt.my**, works today.
2. **Direct write, later.** A content script on the objekt.my origin can write
   `StoredBlock[]` straight into the `match:blocks:v2` IndexedDB entry that
   [transcript-store.ts](../../src/lib/match/transcript-store.ts) already reads.
   Seamless, but it makes the storage format a cross-repo contract — do not do
   this until the format has settled. **Verify content-script IndexedDB access
   to the host origin in a spike before planning on it.**

## Hard constraints

1. **Never drive Discord's API without an explicit user action per request.**
   Passive capture reads rendered DOM and issues nothing. This is what keeps the
   extension clear of the self-bot rule that Discord terminates accounts for,
   and it is the constraint that makes this plan viable at all. Plan 035's hard
   constraint 1 still stands.
2. **Never persist third-party message content server-side.** Unchanged from
   035 hard constraint 2. The handoff writes into the *user's own browser*, not
   objekt.my's database. The extension's index is local, exactly like
   `/match`'s.
3. **Reuse the engine, never fork it.** Two surfaces parsing trade posts
   differently is worse than one surface. If the extension needs a parser
   change, change it in `src/lib/` and consume it.
4. **A broken selector must degrade to nothing, never to wrong data.** Discord
   ships UI changes without notice. Mis-attributing objekts to the wrong trader
   is far worse than showing no annotations.

## Rejected approaches

Do not re-propose these without new information. All were explored 2026-09-09.

| Approach | Why rejected |
| --- | --- |
| Bulk export the channel with Discrub, daily | Walls at ~2,900 messages ≈ one day's volume; cannot backfill, and it is the self-bot mechanism 035 rules out |
| Custom script to fetch messages "slowly" | Rate limits follow the account token, not the client — same wall, plus you now maintain it |
| Rapid-fire one search per objekt in the have-list | 500–2,000 requests; each message returned ~47× redundantly; unambiguously a self-bot |
| Search per objekt to solve range listings | Cannot work — `CC102` is not in the text of `CC101-108`. Index gap, not query gap |
| Public pool of pasted messages | Deferred pending the objekt.top discussion; see 035 hard constraint 2 and Phase 5 |
| Asking server admins for a bot | Ruled out by the repo owner |

## Implementation steps

### Phase 1 — Capture (ready to build)

Prove the index is correct. No matching, no UI beyond what verifies the data.

1. MV3 extension skeleton: `manifest.json` + content script on
   `https://discord.com/channels/*`. Loads unpacked; no store submission needed
   to test.
2. **DOM adapter** — message element → `{ author, body, time }`. Anchor on
   `<time datetime>` and message-id attributes.
3. **MutationObserver** over the message list, handling virtualisation: capture
   on render, because Discord discards messages as you scroll past them.
4. Bundle the engine from `src/lib/` and parse each captured message.
5. Dedupe by `messageKey(author, body)`; persist to IndexedDB in the
   `StoredBlock[]` shape from
   [transcript-blocks.ts](../../src/lib/match/transcript-blocks.ts).
6. **Verification surface**: a captured-count badge and a "dump index" action.
7. **Add the engine purity guard** to the app repo — a test that walks the
   engine's import graph and fails on any framework, server or DOM import. The
   graph is clean today; this keeps extraction cheap rather than archaeological.

**Done when**: browsing `#objekt-trade` for two minutes yields an index whose
post count and objekt coverage match the ratios in "Evidence already gathered"
(~2.3 raw messages per actionable post), and re-scrolling the same stretch adds
nothing.

### Phase 2 — Matching via handoff to `/match` (needs 1)

1. `blocksToTranscript` over the index → downloadable `.txt`.
2. User imports it with `/match`'s existing "Import text files".
3. Confirm the round trip: the desk shows the same posts the extension captured.

**Done when**: capture → export → import produces in `/match` exactly what the
extension indexed, with no parser changes on either side.

### Phase 3 — Inventory and in-place annotation (needs 2)

Only now does the extension need to know what the user owns.

1. Cosmo nickname → `/api/objekts/by-nickname/[nickname]` from the extension.
2. `indexOwned` + `matchTranscript` locally.
3. Badge each rendered message in Discord ("wants 3 of yours").
4. Optionally, the direct IndexedDB handoff from "Handoff" step 2.

### Phase 4 — User-driven search (needs 3, and a decision)

**Do not start without settling Open question 2.** This is where the account
risk enters.

- One query per explicit user action; never a background sweep.
- Cap at 1–2 pages (see the trader-collapse table).
- Pace requests; honour `retry_after`; stop on repeated 429s.

### Phase 5 — Contributor whitelist / pool (deferred)

Deferred by the repo owner pending a discussion with the objekt.top developer.
Requires 035 hard constraint 2 to be revisited and rewritten first. Rep signal
is derivable from existing data: completed `activeTrade` count plus no live
`tradeBan`.

## Open questions for the repo owner

1. **Where does the extension live** — this repo (monorepo package) or its own?
   Affects how the engine is shared and whether the purity guard is enough.
2. **Does Phase 4 happen at all?** Passive capture may prove sufficient. Decide
   only after Phase 3 has run against real usage for a week.
3. **Firefox as well as Chrome?** MV3 differs between them; deciding late costs
   more than deciding now.
4. **Does a content script get IndexedDB access to the objekt.my origin?**
   Assumed yes, unverified. Settle in the Phase 1 spike, since the direct
   handoff depends on it.

## STOP conditions

- **Any design where the extension issues Discord API requests without a
  one-to-one user action** — stop and re-read Hard constraints. Background
  sweeps, prefetching, speculative pagination and "just slowly" all fail this.
- **Any design that stores third-party message content on objekt.my's server** —
  stop, and re-read 035 hard constraint 2.
- **Forking the parser into the extension** — stop. Consume `src/lib/`.
- Changes to `src/lib/trade/trade-post-matches.ts` or any
  `src/app/api/active-trades/**` path — this feature must not touch
  trade-critical code.

## Reference: relevant existing code

| Concern | File |
| --- | --- |
| List parser (Discord-hardened) | `src/lib/paste-parser.ts` |
| Message splitting + `messageKey` | `src/lib/discord/transcript.ts` |
| Matching + objekt keys | `src/lib/discord/match.ts` |
| Desk selection/indexing | `src/lib/discord/trade-desk.ts` |
| Storage shape to reuse | `src/lib/match/transcript-blocks.ts` |
| IndexedDB store `/match` reads | `src/lib/match/transcript-store.ts` |
| Existing file-import entry point | `src/app/match/match-client.tsx` |
| Unauthenticated inventory by nickname | `src/app/api/objekts/by-nickname/[nickname]/route.ts` |
| Prior plan (paste → match) | `docs/plans/035-discord-paste-match.md` |
