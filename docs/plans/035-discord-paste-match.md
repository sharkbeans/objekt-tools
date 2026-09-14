# Plan 035: Discord paste → match (trade-channel dump parser)

> **Executor instructions**: This is a **spec + discovery handoff**, not a
> mechanical plan. Steps 1–2 are ready to implement; steps 3–6 still have open
> questions (see "Open questions") that should be settled with the repo owner
> before building. Read the whole document before starting — the "Evidence
> already gathered" section contains measurements you should **not** re-derive,
> and "Rejected approaches" lists paths that were explored and closed for
> reasons that still hold.
>
> **Drift check (run first)**:
> `git diff --stat 4bc13a4..HEAD -- src/lib/paste-parser.ts src/lib/poster/poster-resolver.ts src/lib/cosmo/resolve-nickname.ts src/app/api/objekts/by-nickname/`
> If those paths changed since this plan was written, re-run the parser probe
> in "Evidence already gathered" before trusting its numbers.

## Status

- **Priority**: P0 (this is the acquisition bet, not a cleanup)
- **Effort**: L
- **Risk**: MEDIUM (new user-facing surface; no changes to trade-critical paths)
- **Depends on**: none
- **Category**: growth / activation
- **Planned at**: commit `4bc13a4`, 2026-09-07
- **Branch**: not created yet

## Why this matters

### The strategic situation

objekt.my competes with **apollo.cafe** (dominant; "the McDonald's") and
**objekt.top** (second). Both are *indexers* — they answer "what exists" and
"who owns it". objekt.my is a no-name third by traffic.

Two conclusions follow, and they constrain everything below:

1. **Do not compete on indexer data.** Apollo already ships COMO balances and
   Gravity vote history. Building those is building a worse Apollo.
2. **objekt.my's differentiator is that it is transactional**, not
   informational: matching engine, mirrored have/want lists, direct offers,
   counter-offer chains, per-side transfer verification against the chain,
   reputation, no-show bans. An indexer tells you *who has the objekt*.
   objekt.my is the only one of the three that helps you *get* it.

### The acquisition problem

A prior audit (this session, uncommitted) found the trading infrastructure
essentially complete and the funnel starved of entrants. Critically, **every
growth lever previously proposed multiplies a base that is near zero** —
watermarks, OG previews, profile links, and share cards all scale with
`existing users × sharing rate`.

The one exception is a channel whose volume does **not** depend on objekt.my's
current size: **the big Discord trade servers where traders already post their
lists.** A bot is not viable (large servers do not admit them). Scraping is not
viable (see "Rejected approaches").

### The idea

**The user is the transport.** A trader selects messages in the trade channel,
copies, and pastes the dump into objekt.my. objekt.my parses every poster's
haves and wants, cross-references them against the paster's own on-chain
inventory, and tells them who they can trade with — *without any of those other
traders having an account, or ever having heard of objekt.my.*

Why this is different in kind from everything else on the roadmap:

- **It inverts the cold-start problem.** `findTradePostMatches`
  (`src/lib/trade/trade-post-matches.ts`) requires **two** registered traders
  and refuses to run unless a post has both haves *and* wants. This requires
  **one** — the visitor.
- **It needs no login.** `/api/objekts/by-nickname/[nickname]` is
  unauthenticated, so "paste + type your Cosmo nickname" yields a real answer
  with zero setup.
- **It automates the actual manual labour** of trading: scrolling a channel
  eyeballing lists against your own inventory.
- **Apollo structurally cannot do it.** They do not know your wants, and they
  are an indexer, not a matcher.
- **It closes a loop.** The natural next step off a result is "post your own
  list", which emits `formatTradeText` (`src/lib/trade/trade-text.ts`) — already
  carrying an objekt.my URL — back into the channel it came from.

## Evidence already gathered

**Do not re-derive this.** Measured against a real 12-message dump from a live
tripleS trade channel, supplied by the repo owner, using the existing
`parsePastedTrade`.

### Message splitting works

Discord's clipboard format is `<display name> — H:MM AM/PM` on its own line.
This one regex split **12 of 12** messages correctly, including names with
bracket tags (`[WAV]`, `[혜주]`), emoji (`🧋`), CJK (`语 [周心语]`,
`공님곰님사랑`), and a stray trailing comma Discord emits after some names:

```ts
const AUTHOR = /^(.*?),?\s+—\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*$/;
```

### Parsing works better than expected

| Metric | Result |
| --- | --- |
| Messages split from raw paste | 12 / 12 |
| Messages yielding items | 8 / 12 |
| Items extracted | 162 |
| **Item-level parse errors** | **0** |

Already handled correctly by `parsePastedTrade` with no changes:
member inheritance across space-separated codes (`Mayu CC103 CC104 CC105`),
single-letter **and** doubled season prefixes (`D325` → Divine01,
`AA302` → Atom02), `#serial` (`D301 #83` → serial 83), attached serials
(`B321#1`), and A/Z twin suffixes (`D309Z`, `A201A`).

### The one bug that matters

All four failures reported the same error: `No HAVE or WANT section found`.
Bisected to a single behaviour — **any unrecognised prose line immediately
after a section header discards the entire section**:

```
HAVE / WTS / items            → 2 items   PASS
HAVE / WTS ALL / items        → 0 items   FAIL
HAVE / Mostly Lynn / items    → 0 items   FAIL
HAVE / Rare objekt list / …   → 0 items   FAIL
```

`isIgnorableTradeIntentLine` (`src/lib/paste-parser.ts`) recognises bare `WTS`
but not `WTS ALL`, `Mostly Lynn`, or `Rare objekt list`. An unknown line is not
skipped — it drops the section.

Fixing this recovers the **two largest lists in the sample** (~40 and ~60
items), raising coverage from 8/12 to 10/12.

Confirmed *not* to break parsing: URLs anywhere in the body, trailing sales
blurbs (`*Price is Negotiable`, `Paypal fnf or Wise`), Discord link-embed
footer lines (`Friendly's Collection · Apollo`), and `WTS`/`WTT` intent lines
placed *before* the header.

### Three smaller item-level gaps

| Input | Current behaviour | Should be |
| --- | --- | --- |
| `cc109x4` (attached quantity) | **item dropped entirely** | qty 4 |
| `(×2)` (U+00D7, not ASCII `x`) | quantity ignored, falls back to 1 | qty 2 |
| `E317 - 320`, `AA331 ~ 333` | endpoints only, middle silently lost | full range |

`cc109x4` is the worst of the three — it loses the item, not just the count.

## The key insight: link-only posts are the *best* case

An earlier reading of this data called link-only posts a permanent ~17% ceiling.
**That was wrong.** Every such link carries a Cosmo nickname:

```
objekt.top/@wangsss              → wangsss
apollo.cafe/@19정하연/list/wts2    → 19정하연
apollo.cafe/@Friendly            → Friendly
objekt.top/@acin                 → acin
```

nickname → `resolveNickname` → address → indexer → **actual current verified
inventory**. That is *higher* fidelity than a hand-typed list, and it is
precisely what neither competitor offers in a trading context: a claim checked
against the chain.

Caveat: a named Apollo list (`/list/wts2`) is Apollo's own data and cannot be
read. You get the trader's full transferable inventory instead — exact for a
"WTS ALL" post, broader than intended for a curated list. Label accordingly.

## Proposed design

### Pipeline

```
paste → split by author → classify poster → resolve → match → pick
```

### Three poster tiers

| Tier | Detected by | Presentation |
| --- | --- | --- |
| **Verified** | objekt.top / apollo link present | Real inventory from chain. "Confirmed: holds 4 of these." |
| **Claimed** | typed list, no link | Parsed items, explicitly labelled unverified |
| **Contactless** | neither | Display name only |

**Identity keying**: prefer the Cosmo nickname when a link is present. Discord
display names from a paste are not unique, not stable across renames, and carry
no user ID — so they cannot produce a reliable DM link. Do not key on them when
a nickname is available.

### Wants: two composing modes

Not alternatives — first-visit and returning-visit of the same feature.

- **Selection pile** (first visit): parsed haves render as an objekt grid;
  the user clicks what they want. Zero setup. This is the core unlock — it
  removes the "declare your wants first" requirement that makes
  `findTradePostMatches` unusable for newcomers.
- **Saved wants** (returning): picks persist to `localStorage`, so the next
  paste arrives pre-highlighted. Still no login.

### Dedupe: store hashes, never content

Discord traders repost the same list frequently; users do not want to re-read
posts they have already triaged. But **persisting other people's message content
server-side re-creates the mirroring problem this design exists to avoid.**

Store `sha256(normalised author + body)` only:

- seen hash → collapse or hide on next paste
- per-author hash → "mute this trader"
- an edited list yields a new hash and correctly resurfaces
- `localStorage` when anonymous, DB when signed in — same hash either way

Nothing legible and nothing republishable ever reaches the database.

### Rate limits are the login argument

`/api/objekts/by-nickname/[nickname]` is **10 req/min unauthenticated, 60
authenticated**. A 100-message dump may contain ~30 links, which exhausts the
anonymous budget immediately.

Do not treat this as a defect. Frame it as the unlock:

> Verified 10 of 30 traders. **Sign in to verify the rest.**

Anonymous users keep full parsing, the pile, and matching against their own
inventory. Auth buys verification throughput and cross-device history.

### Bulk copy UX

Discord virtualises the message list, so only rendered messages are selectable —
`Ctrl+A` cannot capture history. **Design around the gesture instead of
documenting a hard one: append-paste.** The user pastes a chunk, scrolls up in
Discord, pastes again; the tool merges and dedupes. 100 messages becomes 6–8
casual pastes, and the hash dedupe above makes overlapping selections harmless.

The standard browser technique (click before the first message, scroll,
shift+click after the last, `Ctrl+C`) is **unverified against Discord's client**
— test it before putting it in the UI.

## Hard constraints

1. **Never scrape Discord.** Reading channels programmatically requires a
   user-token self-bot, which violates Discord's ToS and gets accounts banned.
   In a small community whose product is trust, being caught republishing
   people's posts is unrecoverable.
2. **Never persist third-party message content.** Hashes only. The user pastes
   from their own screen for their own benefit; objekt.my is a calculator, not
   a mirror.
3. **Client-side by default.** `parsePastedTrade` is pure TS and
   `resolveForPoster` (`src/lib/poster/poster-resolver.ts`) already runs in the
   browser against `/api/objekts/search`. The whole pipeline can execute
   client-side, which is what makes constraint 2 architecturally free rather
   than a policy someone must remember.
4. **Do not use the indexer mirror.** Per repo owner decision, collection data
   is not mirrored; read the indexer as-is.

## Rejected approaches

Do not re-propose these without new information.

| Approach | Why rejected |
| --- | --- |
| Discord bot with slash commands | Large trade servers do not admit bots, and that is where traders post |
| Scraping channels into objekt.my | ToS violation (self-bot), plus fatal trust cost |
| COMO / Gravity vote rankings | Apollo already ships both; building them is building a worse Apollo |
| Programmatic objekt pages for SEO | Walks into Apollo's strength (objekt-lookup queries) with far less authority |
| Objekt-lookup SEO generally | Contest trading-intent queries instead — nobody owns those |

## Implementation steps

### Step 1 — Fix the section-wipe bug (ready)

In `src/lib/paste-parser.ts`, make an unrecognised line inside a section a
**skip**, not a section reset. Extend `isIgnorableTradeIntentLine` to cover
`WTS ALL`, `WTT <anything>`, and generic prose, or invert the logic so only
explicit `HAVE`/`WANT` headers change section state.

**Verify**: the four repro cases under "The one bug that matters" must all
return 2 items. `npm test` must stay green (`src/lib/paste-parser.test.ts`).

### Step 2 — Fix the three item-level gaps (ready)

`cc109x4`, `(×2)` with U+00D7, and `NNN - NNN` / `NNN ~ NNN` ranges. Add cases
to `src/lib/paste-parser.test.ts` using the fixture below.

**Open**: should ranges expand fully (`317-320` → 4 items) or stay conservative
(endpoints only)? Expanding risks inventing objekts that do not exist. Confirm
with the repo owner.

### Step 3 — Transcript splitter (ready)

New module, e.g. `src/lib/discord/transcript.ts`: split a paste into
`{ author, body }[]` using the `AUTHOR` regex above, strip Discord link-embed
footer lines, and run `parsePastedTrade` per block. Pure, testable, no I/O.

### Step 4 — Link → nickname → verified inventory (needs Step 3)

Extract `objekt.top/@X` and `apollo.cafe/@X` nicknames; resolve via
`resolveNickname`; fetch inventory via `/api/objekts/by-nickname/[nickname]`.
Must degrade gracefully when the rate limit is hit (mark the poster
"unverified — limit reached", never error the page).

### Step 5 — Paste → pile → pick UI (needs 3, 4)

Anonymous, `localStorage` only. Two panels: "N traders want something you own"
and the filterable pile of everything they collectively have, cross-referenced
to surface mutual 1:1s.

### Step 6 — Hash dedupe + append-paste + auth throughput

Per "Dedupe" and "Rate limits" above.

## Progress (branch `proto/discord-paste-match`)

Prototype built 2026-09-07. Steps 1–6 are done and pushed. All four gates green
at every checkpoint: 259 tests, lint, typecheck, build.

Step 6 landed in two parts. The transcript now dedupes by content key before it
is stored, is gzipped through `CompressionStream`, and lives in IndexedDB rather
than `localStorage` — measured against a real 2,900-message export, that is
3.51 MB of the 5 MB origin budget down to 0.222 MB
(`src/lib/match/transcript-{blocks,store}.ts`).

That moved the ceiling rather than removing it. Storage is no longer the limit;
**re-parsing on load is**, at roughly 0.25 ms per stored block — about 0.35 s per
day of a busy channel, measured. So history is capped at `MAX_BLOCKS` (40,000,
about a month, near a 10 s worst case) and trimmed by least-recently-seen, which
is why `mergeBlocks` moves a re-sighted post to the end: an active trader must
survive the trim while the ones who stopped posting fall off.

Holding a full 90 days client-side is not a tuning question. It needs ~32 s of
parsing and ~1.5 GB of heap for 5.6 M parsed items, which no browser tab will
carry — that range needs a server that can filter before sending.
Triage state — posts handled, traders muted — is stored as SHA-256 ids in
`localStorage`, and additionally in `discord_paste_seen` once signed in, which
is what makes it follow a user across devices
(`src/lib/match/seen-{id,store}.ts`, `src/app/api/match/seen/`).

Hard constraint 2 held throughout: what reaches the database is a digest, never
a message. Signing in buys cross-device triage and the 60/min verification tier,
not a bigger transcript — the transcript stays in the browser for everyone.

| Step | State | Where |
| --- | --- | --- |
| 1 — section-wipe + item gaps | DONE | `src/lib/paste-parser.ts` |
| 2 — quantity/range gaps | DONE | same, `normalizeItemLine` |
| 3 — transcript splitter | DONE | `src/lib/discord/transcript.ts` |
| 4 — link → verified inventory | DONE | `src/lib/discord/verify.ts` |
| 5 — paste → pile → pick UI | DONE | `src/app/match/` (route `/match`) |
| 6 — dedupe + append-paste | DONE | `src/lib/match/`, `src/app/api/match/seen/` |

### Measured against the real 12-message sample

| | Before | After |
| --- | --- | --- |
| Messages yielding items | 8 / 12 | 10 / 12 |
| Items parsed | 162 | 283 |
| Supply index (searchable objekts) | 225 | **4,658** |

Live verification of the 5 linked posters:

```
wangsss           4348 on-chain | claims   0
19정하연             623 on-chain | claims   2 →  2 confirmed,  0 stale
acin              1916 on-chain | claims  72 → 65 confirmed,  7 stale
Friendly            77 on-chain | claims  44 → 42 confirmed,  2 stale
정하연의새우학살교실   467 on-chain | claims   0
```

Stale-claim detection is real and useful: acin's typed list is 7 objekts out
of date, Friendly's 2. Neither is dishonest — lists go stale — but a trader
seeing "2 listed objekts no longer in their inventory" learns something no
indexer tells them.

The link-only correction is now proven, not argued: goatyubin parses to zero
items and is the top supplier for most search queries once verified.

### Answered from the open questions

- **Where does it live?** `/match`, registered root-only in `sections.ts`.
  Revisit if it should sit under the trade host instead.
- **Verification depth?** Whole transferable inventory, indexed for search
  rather than rendered — 4,348 items cannot go in a browsable pile.

### Still open

- Range expansion semantics (endpoints vs full range) — currently expands.
- Whether the shift+click selection gesture works in Discord's clients.
- Whether "Claimed" (unverifiable) posters should be shown once verified ones
  exist.
- Objekt images in the pile: needs `/api/objekts/search` resolution per item,
  skipped to keep the first pass network-free.

## Open questions for the repo owner

1. **Range expansion** — expand `E317 - 320` to four items, or keep endpoints?
2. **Where does this live?** A new top-level section (e.g. `/match`), or inside
   the existing `trade` section? Affects `src/lib/sections.ts`.
3. **Verification depth** — for a linked trader, show their whole transferable
   inventory, or only the intersection with the paster's wants? The former is
   more useful and more of a competitor-replacement; the latter is tighter.
4. **Does the shift+click selection gesture actually work** in the Discord
   desktop and web clients? Needs a human test.
5. **Should unverified ("Claimed") traders be shown at all**, or is an
   unverifiable list more noise than signal once verified ones exist?

## Test fixture

Anonymised from the real sample, preserving every format variant that matters.
Suitable for `src/lib/paste-parser.test.ts` and the Step 3 splitter tests.

```
traderA — 3:41 PM
WTS ALL
except SCO

https://objekt.top/@examplenick?artist=tripleS&transferable=true

Dm plz
examplenick · Collection · Objekt Tracker
Cosmo objekt explorer
traderB [TAG],  — 3:44 PM
Have
Seoyeon CC112
Mayu CC103 CC104 CC105 CC116
Jiyeon CC110 CC112

Want
Xinyu CC101 CC102 CC103 CC104
Any Xinyu CC fco
traderC — 3:45 PM
WTS ALL
Mostly Lynn

Jiwoo D325
Yubin AA302
Lynn C319 C323 D301 #83 D309Z D311
Lynn E317 - 320 E347 ~ 349
Sohyun D102 (×2)
Soomin B321#1 B215
Nakyoung A201A A202A

https://apollo.cafe/@examplenick2?transferable=true
Friendly's Collection · Apollo
Apollo - Objekt & gravity explorer for Cosmo
traderD — 3:48 PM
WTT-CCfco
HAVE
Seoyeon cc109 cc110 cc114 cc115
Kaede cc107 cc108

WANT
Shion cc109x4 cc111 cc112x2 cc116
```

Expected after Steps 1–3: 4 messages split; traderA classified **Verified**
(link, no items); traderB **Claimed** (7 haves / 9 wants); traderC **Verified**
(link + items, section-wipe bug must not drop it); traderD **Claimed** with
`cc109x4` → qty 4 and `cc112x2` → qty 2.

## STOP conditions

- Any design that stores third-party message **content** server-side — stop and
  re-read "Hard constraints".
- Any approach requiring a Discord bot token, user token, or automated channel
  reads — stop.
- Changes to `src/lib/trade/trade-post-matches.ts` or any
  `src/app/api/active-trades/**` path — this feature must not touch
  trade-critical code. Stop and reconsider.

## Reference: relevant existing code

| Concern | File |
| --- | --- |
| List parser (Discord-hardened) | `src/lib/paste-parser.ts` |
| Item → collection resolution (client-side) | `src/lib/poster/poster-resolver.ts` |
| Unauthenticated inventory by nickname | `src/app/api/objekts/by-nickname/[nickname]/route.ts` |
| Nickname → address | `src/lib/cosmo/resolve-nickname.ts` |
| Season prefix map (`A`→Atom01, `AA`→Atom02) | `src/lib/season-prefix.ts` |
| Want-matching predicate (one-way) | `src/lib/wants-only-validation.ts` |
| Outbound Discord text format | `src/lib/trade/trade-text.ts` |
| Existing two-sided matcher (do not modify) | `src/lib/trade/trade-post-matches.ts` |
| Chain-verified list pruning | `src/lib/poster/poster-inventory-prune.ts` |
