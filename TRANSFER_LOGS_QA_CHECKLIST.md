# Transfer Logs QA Checklist

Use this checklist to validate all transfer log events and bad-actor scenarios using 2 Objekt Trade accounts and 2 Cosmo accounts.

## Test Accounts

- `OT-A` linked to `User1`
- `OT-B` linked to `User2`

## Objekt Inventory (prepare before starting)

- In `User1`:
  - [ ] `Objekt_A (#00001)` (objekt used in trade)
  - [ ] `Objekt_A (#00002)` (same objekt, different serial, non-trade)
  - [ ] `Objekt_D (Extra)` (non-trade objekt)
- In `User2`:
  - [ ] `Objekt_B (#00001)` (objekt used in trade)
  - [ ] `Objekt_B (#00002)` (same objekt, different serial, non-trade)
  - [ ] `Objekt_E (Extra)` (non-trade objekt)

## Global Rules

- Create a **fresh active trade per test case**.
- After each Cosmo transfer, click/check transfer detection in trade page before next action.
- Record outcomes immediately.
- For each test, save screenshots of:
  - active trade status section
  - transfer logs table
- Note: warning logs are deduped per `objektId + event`; repeating same bad action on same objekt may not create a second warning row.

## Result Template

Copy this table section for each test case:

| Field         | Value |
| ------------- | ----- |
| Test ID       |       |
| Trade ID      |       |
| Date/Time     |       |
| Action        |       |
| Expected Logs |       |
| Actual Logs   |       |
| Pass/Fail     |       |
| Notes         |       |

---

## T1 Happy Path After Accept

**Goal:** verify normal `sent` and `confirmed` logs.

### Steps

1. Create trade: `Objekt_A <-> Objekt_B`.
2. Accept the trade.
3. `User1` sends `Objekt_A (#00001)` to `User2` intended recipient address.
4. `User2` sends `Objekt_B (#00001)` to `User1` intended recipient address.
5. Trigger transfer check after each send.

### Expected

- `sent` then `confirmed` logs for each side.
- No `wrong_objekt` or `wrong_recipient` logs.
- Trade status progresses to `completed`.

---

## T2 Pre-Accept Correct Transfer

**Goal:** verify `pre_accept_sent` and `pre_accept_confirmed`.

### Steps

1. Create fresh trade: `Objekt_A <-> Objekt_B`.
2. Do **not** accept.
3. `User1` sends `Objekt_A (#00001)` directly to `User2` intended recipient address.
4. Trigger transfer check.

### Expected

- `pre_accept_sent` and `pre_accept_confirmed` appear for `Objekt_A (#00001)`.
- Pre-accept warning state appears in UI.

---

## T3 Wrong Recipient Before Accept

**Goal:** verify `wrong_recipient` during pending phase.

### Steps

1. Create fresh trade.
2. Keep trade in `pending` (not accepted).
3. `User1` sends `Objekt_A (#00001)` to a wrong address (not the intended recipient address in trade).
4. Trigger transfer check.

### Expected

- `wrong_recipient` log appears.
- No successful `sent/confirmed` for that side from this transfer.

---

## T4 Wrong Recipient After Accept

**Goal:** verify `wrong_recipient` during accepted/partial phase.

### Steps

1. Create fresh trade and accept it.
2. `User1` sends `Objekt_A (#00001)` to wrong address.
3. Trigger transfer check.

### Expected

- `wrong_recipient` log appears.
- Side does not move to confirmed from that wrong transfer.

---

## T5 Wrong Objekt Before Accept

**Goal:** verify `wrong_objekt` before acceptance.

### Steps

1. Create fresh trade.
2. Keep trade pending.
3. `User1` sends `Objekt_A (#00002)` (same objekt, wrong serial for this trade) to `User2` trade-relevant receiving side.
4. Trigger transfer check.

### Expected

- `wrong_objekt` log appears.
- Log row shows red warning style in UI.

---

## T6 Wrong Objekt After Accept

**Goal:** verify `wrong_objekt` after acceptance.

### Steps

1. Create fresh trade and accept it.
2. `User2` sends `Objekt_B (#00002)` to `User1` (between trade party addresses).
3. Trigger transfer check.

### Expected

- `wrong_objekt` log appears.
- Normal side completion should not happen unless correct trade objekt is sent.

---

## T7 Wrong Objekt To Unrelated Third-Party Address (Negative Test)

**Goal:** verify out-of-scope transfers are not logged for this trade.

### Steps

1. Create fresh trade.
2. `User1` sends `Objekt_D (Extra)` to an unrelated third-party address not in this trade.
3. Trigger transfer check.

### Expected

- No `wrong_objekt` log for this trade from this transfer.

---

## T8 Mixed Bad Then Good (Same Objekt)

**Goal:** verify recovery behavior when user corrects after bad transfer.

### Steps

1. Create fresh trade and accept.
2. `User1` sends `Objekt_A (#00001)` to wrong address first.
3. Trigger transfer check.
4. `User1` sends `Objekt_A (#00001)` correctly to intended recipient.
5. Trigger transfer check again.

### Expected

- `wrong_recipient` remains in logs as warning history.
- Correct transfer later generates normal progress (`sent`/`confirmed` path).

---

## T9 Dedup Check (Repeat Same Bad Action)

**Goal:** verify warning log dedup behavior.

### Steps

1. Create fresh trade.
2. Repeat the same bad action twice with same objekt (example: wrong recipient twice for `Objekt_A (#00001)`).
3. Trigger transfer check after each attempt.

### Expected

- Only one warning row for that `objektId + event` pair.

---

## T10 Dual Bad Actors In One Trade

**Goal:** verify both warning types can coexist.

### Steps

1. Create fresh trade and accept.
2. `User1` does wrong recipient using `Objekt_A (#00001)`.
3. `User2` sends non-trade objekt (`Objekt_E (Extra)`) between party addresses.
4. Trigger transfer check.

### Expected

- Both `wrong_recipient` and `wrong_objekt` logs present in same trade timeline.
- Suspicious/warning state visible.

---

## Final Sign-Off Checklist

Mark all as complete before sign-off.

- [ ] `pre_accept_sent` observed
- [ ] `pre_accept_confirmed` observed
- [ ] `sent` observed
- [ ] `confirmed` observed
- [ ] `wrong_recipient` observed
- [ ] `wrong_objekt` observed
- [ ] negative test (`wrong_objekt` to third party) verified as not logged
- [ ] dedup behavior verified
- [ ] mixed bad->good flow verified
- [ ] evidence screenshots saved for each test

## Optional Debug Notes

- If expected log is missing, verify:
  - trade was created before transfer timing window check
  - sender wallet and recipient wallet match the trade side addresses
  - transfer check endpoint was triggered after transfer
  - you used a fresh trade to avoid dedup confusion
