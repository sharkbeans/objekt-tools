# Cosmo Objekt Trade System Plan

## Current State

-   Trade posts are **"bulletin board" style** --- users list what they
    have and want by `collectionId`
    -   Example: `Atom01 JiWoo 101Z`
-   No **serial numbers** are stored --- trades only track
    **collection-level info**, not specific objekt instances
-   No **agreed trade concept** --- there's no mechanism for two users
    to commit to a specific trade
    -   Example: User A sends objekt X to User B, User B sends objekt Y
        to User A
-   **objekt.top indexer** tracks every objekt with:
    -   `owner`
    -   `serial`
    -   `transferable`
    -   full transfer history (`from`, `to`, `timestamp`, `hash`)

------------------------------------------------------------------------

# The Problem

Unlike **CS2 / Steam** where trades are **atomic (simultaneous
exchange)**, Cosmo only allows **one‑way transfers**.

This means a trade requires **trust**: 1. One user sends their objekt
first 2. They hope the other user reciprocates

We need to build a system that **tracks and verifies this process.**

------------------------------------------------------------------------

# Phase 1: Add Serial Numbers to Trade Posts

## Goal

When creating a trade, the **"have" side references specific objekts
(with serial numbers)** instead of just collection types.

## Schema Changes

Modify `schema.ts`.

Add new columns to `trade_post_have`:

-   `serial` (integer, nullable)
-   `objektId` (text, nullable)

### Purpose

**serial** - Allows displaying `#1234` in UI

**objektId** - The objekt.top ID - Allows future ownership / transfer
tracking

`trade_post_want` **does not require serial numbers** because users
typically want *any copy* of a collection.

------------------------------------------------------------------------

## API Changes

### Update Owned Route

Stop **deduplicating by collection**.

Return **individual objekts**, including: - `collectionId` - `serial` -
`objektId`

This allows users to **choose specific objekts** to offer.

------------------------------------------------------------------------

## UI Changes

### New Trade Page

Update the **"have" picker** so users select:

-   specific objekts
-   including serial numbers

Instead of selecting only **collection types**.

------------------------------------------------------------------------

### Trade Display

Show serial numbers in:

-   `trade-card.tsx`
-   `trades/[id]/page.tsx`
-   any other trade display components

------------------------------------------------------------------------

# Phase 2: Agreed Trades & Transfer Tracking

## Goal

Once two users agree to trade, create an **Active Trade** that tracks
whether each side has sent their objekt.

------------------------------------------------------------------------

# Database Design

## Table: `active_trade`

    active_trade
    ├── id (serial PK)
    ├── trade_post_id (FK → trade_post, nullable)
    ├── status: "pending" | "partial" | "completed" | "cancelled" | "disputed"
    ├── created_at
    ├── updated_at

------------------------------------------------------------------------

## Table: `active_trade_side`

    active_trade_side
    ├── id (serial PK)
    ├── active_trade_id (FK → active_trade)
    ├── user_id (FK → user)
    ├── address (text)                # cosmo wallet address
    ├── objekt_id (text)              # objekt.top ID
    ├── collection_id (text)
    ├── serial (integer)
    ├── recipient_address (text)
    ├── status: "pending" | "sent" | "confirmed"
    ├── transfer_hash (text, nullable)
    ├── detected_at (timestamp, nullable)

------------------------------------------------------------------------

# Trade Flow

### Step 1 --- Initiate Trade

User A views a matching trade and clicks **"Initiate Trade"**.

User A selects specific objekts to exchange.

System creates:

-   `active_trade`
-   two `active_trade_side` entries

------------------------------------------------------------------------

### Step 2 --- Confirm Trade

User B reviews and **accepts the trade details**.

Both users now see a **trade status page**.

------------------------------------------------------------------------

### Step 3 --- Trade Status Page

UI shows:

-   objekt name
-   serial number
-   sender
-   recipient

Progress stepper:

    Agreed → User A Sent → User B Sent → Complete

Similar to **CSFloat trade UI**.

------------------------------------------------------------------------

# Transfer Detection

Transfers are verified using **objekt.top API**.

Endpoint example:

    /api/objekts/transfers/{slug}/{serial}

------------------------------------------------------------------------

## Detection Logic

When users open the **active trade page**:

1.  Query objekt.top API
2.  Check the current **owner address**
3.  If owner == expected recipient address:
    -   mark trade side as **sent**
    -   record `transfer_hash`
    -   set `detected_at`

------------------------------------------------------------------------

## Optional Cron Job

A periodic background job can also:

-   check active trades
-   verify transfers
-   update statuses automatically

------------------------------------------------------------------------

# Verification Methods

Two ways to verify a transfer:

### Method 1 --- Owner Check

Confirm that:

    current_owner == recipient_address

### Method 2 --- Transfer History Check

Look for transfer event:

    from → to

Matching:

-   sender wallet
-   recipient wallet

------------------------------------------------------------------------

# Development Priority

  -------------------------------------------------------------------------
  \#         Task                  Complexity
  ---------- --------------------- ----------------------------------------
  1          Add `serial` /        Low
             `objektId` to         
             `trade_post_have`     
             schema + migration    

  2          Update owned objekts  Low
             API to return         
             individual objekts    
             with serials          

  3          Update new trade page Medium
             to pick specific      
             objekts with serials  

  4          Show serials in trade Low
             card / trade detail   
             UI                    

  5          Design                Medium
             `active_trade` +      
             `active_trade_side`   
             tables                

  6          Build **Initiate      Medium
             Trade** flow          

  7          Build **active trade  Medium
             status page** with    
             progress stepper UI   

  8          Implement **transfer  Medium
             detection via         
             objekt.top API**      
  -------------------------------------------------------------------------

------------------------------------------------------------------------

# Summary

This system introduces:

-   **Serial‑level trade tracking**
-   **Mutual trade agreement**
-   **Transfer verification via objekt.top**
-   **Progress tracking UI**

The result is a **trust‑minimized trading system** even though Cosmo
transfers remain **one‑way transactions**.
