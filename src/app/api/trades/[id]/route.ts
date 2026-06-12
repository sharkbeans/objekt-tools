import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import {
  activeTrade,
  tradePost,
  tradePostHave,
  tradePostWant,
} from "@/lib/db/schema";

interface TradeItemInput {
  collectionId: string;
  collectionNo?: string;
  member?: string;
  season?: string;
  class?: string;
  thumbnailUrl?: string;
  serial?: number;
  objektId?: string;
  isAny?: boolean;
  artist?: string;
}

// GET /api/trades/[id] — get single trade with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tradeId } = await params;

  const trade = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, tradeId),
    with: {
      haves: { where: (h, { isNull }) => isNull(h.deletedAt) },
      wants: { where: (w, { isNull }) => isNull(w.deletedAt) },
      user: {
        columns: {
          id: true,
          name: true,
          image: true,
          discordId: true,
          discordUsername: true,
        },
        with: {
          cosmoAccount: {
            columns: { nickname: true, address: true },
          },
        },
      },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...trade,
    cosmoNickname: trade.user.cosmoAccount?.nickname ?? null,
    cosmoAddress: trade.user.cosmoAccount?.address ?? null,
    discordId: trade.user.discordId ?? null,
    discordUsername: trade.user.discordUsername ?? null,
  });
}

// PATCH /api/trades/[id] — update trade post
// Supports: status change, description edit, haves/wants edit
// Description can always be edited (even with active trades).
// Haves/wants can only be edited when "open" AND no active trades reference this post.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;
  const body = await request.json();
  const {
    status: newStatus,
    description,
    haves,
    wants,
  } = body as {
    status?: string;
    description?: string | null;
    haves?: TradeItemInput[];
    wants?: TradeItemInput[];
  };

  const existing = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, tradeId),
      eq(tradePost.userId, session.user.id),
    ),
    columns: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Trade not found or not yours" },
      { status: 404 },
    );
  }

  // Status change
  if (newStatus !== undefined) {
    if (existing.status === "in_trade") {
      return NextResponse.json(
        {
          error:
            "Cannot modify a trade post while it is part of an active trade",
        },
        { status: 400 },
      );
    }
    const validStatuses = ["open", "closed"] as const;
    if (!validStatuses.includes(newStatus as (typeof validStatuses)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const [updated] = await db
      .update(tradePost)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(
        and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
      )
      .returning();

    return NextResponse.json(updated);
  }

  // Description-only edit (allowed even with active trades)
  if (description !== undefined && !haves && !wants) {
    if (description && description.length > 500) {
      return NextResponse.json(
        { error: "Description must be 500 characters or less" },
        { status: 400 },
      );
    }
    const [updated] = await db
      .update(tradePost)
      .set({ description: description?.trim() || null, updatedAt: new Date() })
      .where(
        and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
      )
      .returning();

    return NextResponse.json(updated);
  }

  // Haves/wants edit — only when "open" and no active trades
  if (haves || wants) {
    if (existing.status !== "open") {
      return NextResponse.json(
        { error: "Can only edit haves/wants on an open trade post" },
        { status: 400 },
      );
    }

    // Check for active trades referencing this post
    const hasActiveTrade = await db.query.activeTrade.findFirst({
      where: and(
        or(
          eq(activeTrade.tradePostId, tradeId),
          eq(activeTrade.matchedTradePostId, tradeId),
        ),
        inArray(activeTrade.status, ["pending", "accepted", "partial"]),
      ),
      columns: { id: true },
    });

    if (hasActiveTrade) {
      return NextResponse.json(
        {
          error:
            "Cannot edit haves/wants while this post has active trades. Cancel or complete them first.",
        },
        { status: 400 },
      );
    }

    const now = new Date();

    if (haves) {
      if (haves.length === 0) {
        return NextResponse.json(
          { error: "Must have at least one 'have' item" },
          { status: 400 },
        );
      }
      // Soft-delete existing haves
      await db
        .update(tradePostHave)
        .set({ deletedAt: now })
        .where(
          and(
            eq(tradePostHave.tradePostId, tradeId),
            isNull(tradePostHave.deletedAt),
          ),
        );

      // Insert new haves
      await db.insert(tradePostHave).values(
        haves.map((h) => ({
          tradePostId: tradeId,
          collectionId: h.collectionId,
          collectionNo: h.collectionNo ?? null,
          member: h.member ?? null,
          season: h.season ?? null,
          class: h.class ?? null,
          thumbnailUrl: h.thumbnailUrl ?? null,
          serial: h.serial ?? null,
          objektId: h.objektId ?? null,
        })),
      );
    }

    if (wants) {
      if (wants.length === 0) {
        return NextResponse.json(
          { error: "Must have at least one 'want' item" },
          { status: 400 },
        );
      }
      // Validate ANY wants
      for (const w of wants) {
        if (w.isAny && !w.artist && !w.member && !w.season && !w.class) {
          return NextResponse.json(
            {
              error:
                "ANY want items must specify at least one filter (artist, member, season, or class)",
            },
            { status: 400 },
          );
        }
      }
      // Soft-delete existing wants
      await db
        .update(tradePostWant)
        .set({ deletedAt: now })
        .where(
          and(
            eq(tradePostWant.tradePostId, tradeId),
            isNull(tradePostWant.deletedAt),
          ),
        );

      // Insert new wants
      await db.insert(tradePostWant).values(
        wants.map((w) => ({
          tradePostId: tradeId,
          collectionId: w.isAny ? "" : w.collectionId,
          collectionNo: w.collectionNo ?? null,
          member: w.member ?? null,
          season: w.season ?? null,
          class: w.class ?? null,
          thumbnailUrl: w.thumbnailUrl ?? null,
          isAny: w.isAny ?? false,
          artist: w.artist ?? null,
        })),
      );
    }

    // Update description if provided alongside haves/wants
    if (description !== undefined) {
      if (description && description.length > 500) {
        return NextResponse.json(
          { error: "Description must be 500 characters or less" },
          { status: 400 },
        );
      }
      await db
        .update(tradePost)
        .set({ description: description?.trim() || null, updatedAt: now })
        .where(eq(tradePost.id, tradeId));
    } else {
      await db
        .update(tradePost)
        .set({ updatedAt: now })
        .where(eq(tradePost.id, tradeId));
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No changes specified" }, { status: 400 });
}

// DELETE /api/trades/[id] — delete own trade
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tradeId } = await params;

  const existing = await db.query.tradePost.findFirst({
    where: and(
      eq(tradePost.id, tradeId),
      eq(tradePost.userId, session.user.id),
    ),
    columns: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Trade not found or not yours" },
      { status: 404 },
    );
  }

  if (existing.status === "in_trade") {
    return NextResponse.json(
      {
        error: "Cannot delete a trade post while it is part of an active trade",
      },
      { status: 400 },
    );
  }

  await db
    .delete(tradePost)
    .where(
      and(eq(tradePost.id, tradeId), eq(tradePost.userId, session.user.id)),
    );

  return NextResponse.json({ success: true });
}
