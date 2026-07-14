import { relations, sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);
export const generateId = () => nanoid();

// ============================================================
// Better Auth tables
// ============================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Denormalised from the `account` table for fast lookups without a join.
  // Populated via Better Auth's databaseHooks after-sign-in.
  discordId: text("discord_id").unique(),
  discordUsername: text("discord_username"),
  // Maximum number of pending trade offers this user can have at once.
  // Default 10; increase for premium users.
  tradeOfferQuota: integer("trade_offer_quota").notNull().default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================
// Custom tables
// ============================================================

export const cosmoAccount = pgTable("cosmo_account", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  nickname: text("nickname"),
  cosmoId: integer("cosmo_id"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
  // Last time the nickname was revalidated against the live Cosmo API. Null
  // for accounts linked before this column existed — treated as stale.
  lastCosmoCheck: timestamp("last_cosmo_check"),
});

export const tradePost = pgTable(
  "trade_post",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    description: text("description"),
    status: text("status").notNull().default("open"),
    wantsOnly: boolean("wants_only").notNull().default(false),
    // "list" trade posts are auto-synced mirrors of a poster's haves/wants
    // (see src/lib/poster-trade-sync.ts), created so posters can reuse the
    // existing matching engine without a parallel implementation.
    source: text("source")
      .notNull()
      .default("manual")
      .$type<"manual" | "list">(),
    availabilityCheckedAt: timestamp("availability_checked_at"),
    linkedPosterId: text("linked_poster_id").references(() => poster.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("trade_post_user_id_idx").on(t.userId),
    index("trade_post_status_created_idx").on(t.status, t.createdAt),
    index("trade_post_status_availability_checked_idx").on(
      t.status,
      t.availabilityCheckedAt,
    ),
    uniqueIndex("trade_post_linked_poster_id_unique").on(t.linkedPosterId),
  ],
);

export const tradePostHave = pgTable(
  "trade_post_have",
  {
    id: serial("id").primaryKey(),
    tradePostId: text("trade_post_id")
      .notNull()
      .references(() => tradePost.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull(),
    collectionNo: text("collection_no"),
    member: text("member"),
    season: text("season"),
    class: text("class"),
    thumbnailUrl: text("thumbnail_url"),
    serial: integer("serial"),
    objektId: text("objekt_id"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("trade_post_have_trade_post_id_idx").on(t.tradePostId),
    index("trade_post_have_collection_id_idx").on(t.collectionId),
  ],
);

export const tradePostWant = pgTable(
  "trade_post_want",
  {
    id: serial("id").primaryKey(),
    tradePostId: text("trade_post_id")
      .notNull()
      .references(() => tradePost.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull(),
    collectionNo: text("collection_no"),
    member: text("member"),
    season: text("season"),
    class: text("class"),
    thumbnailUrl: text("thumbnail_url"),
    // ANY-filter wants: no specific objekt, just filter criteria
    isAny: boolean("is_any").notNull().default(false),
    artist: text("artist"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("trade_post_want_trade_post_id_idx").on(t.tradePostId),
    index("trade_post_want_collection_id_idx").on(t.collectionId),
  ],
);

export const tradeNotification = pgTable(
  "trade_notification",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tradePostId: text("trade_post_id"),
    activeTradeId: text("active_trade_id").references(() => activeTrade.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("trade_notification_user_id_idx").on(t.userId),
    index("trade_notification_user_dismissed_idx").on(t.userId, t.dismissed),
  ],
);

export const cosmoToken = pgTable("cosmo_token", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeTrade = pgTable(
  "active_trade",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    tradePostId: text("trade_post_id").references(() => tradePost.id, {
      onDelete: "set null",
    }),
    // The trade post of the other party (the match)
    matchedTradePostId: text("matched_trade_post_id").references(
      () => tradePost.id,
      { onDelete: "set null" },
    ),
    // initiator = user who clicked "Send a Trade Offer"; recipient = user who owns the matched trade post
    initiatorUserId: text("initiator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    counterOfferToId: text("counter_offer_to_id"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<
        | "pending"
        | "accepted"
        | "partial"
        | "completed"
        | "cancelled"
        | "countered"
        | "disputed"
      >(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at"),
    acceptanceBlock: integer("acceptance_block"),
    expiresAt: timestamp("expires_at"),
    resolvedByTradeId: text("resolved_by_trade_id"),
  },
  (t) => [
    index("active_trade_initiator_idx").on(t.initiatorUserId),
    index("active_trade_recipient_idx").on(t.recipientUserId),
    index("active_trade_status_idx").on(t.status),
    foreignKey({
      columns: [t.counterOfferToId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    foreignKey({
      columns: [t.resolvedByTradeId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    uniqueIndex("active_trade_unique_pending_pair")
      .on(t.tradePostId, t.matchedTradePostId, t.initiatorUserId)
      .where(sql`status = 'pending'`),
  ],
);

// One row per side of the trade (initiator side + recipient side)
export const activeTradeSide = pgTable(
  "active_trade_side",
  {
    id: serial("id").primaryKey(),
    activeTradeId: text("active_trade_id")
      .notNull()
      .references(() => activeTrade.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    recipientAddress: text("recipient_address").notNull(),
    objektId: text("objekt_id").notNull(),
    collectionId: text("collection_id").notNull(),
    collectionNo: text("collection_no"),
    member: text("member"),
    serial: integer("serial"),
    thumbnailUrl: text("thumbnail_url"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "sent" | "confirmed">(),
    ownerAtAcceptance: text("owner_at_acceptance"),
    transferHash: text("transfer_hash"),
    detectedAt: timestamp("detected_at"),
    // The objekt actually transferred for this side, once matched. Since the
    // indexer's serialization is unreliable, verification matches transfers by
    // collection rather than the pinned objektId above — this records which
    // specific serial ended up satisfying the side, for logging/return-tracking.
    actualObjektId: text("actual_objekt_id"),
    actualSerial: integer("actual_serial"),
  },
  (t) => [
    index("active_trade_side_trade_idx").on(t.activeTradeId),
    index("active_trade_side_user_idx").on(t.userId),
    index("active_trade_side_trade_status_idx").on(t.activeTradeId, t.status),
  ],
);

export const tradeTransferLog = pgTable(
  "trade_transfer_log",
  {
    id: serial("id").primaryKey(),
    activeTradeId: text("active_trade_id")
      .notNull()
      .references(() => activeTrade.id, { onDelete: "cascade" }),
    activeTradeSideId: integer("active_trade_side_id").references(
      () => activeTradeSide.id,
      { onDelete: "cascade" },
    ),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    objektId: text("objekt_id").notNull(),
    collectionId: text("collection_id").notNull(),
    collectionNo: text("collection_no"),
    member: text("member"),
    serial: integer("serial"),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    event: text("event")
      .notNull()
      .$type<
        | "sent"
        | "confirmed"
        | "pre_accept_sent"
        | "pre_accept_confirmed"
        | "wrong_objekt"
        | "wrong_recipient"
        | "recovered"
        | "returned"
      >(),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
  },
  (t) => [
    index("trade_transfer_log_trade_idx").on(t.activeTradeId),
    index("trade_transfer_log_trade_event_idx").on(t.activeTradeId, t.event),
  ],
);

export const poster = pgTable(
  "poster",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    editToken: text("edit_token"),
    createdByIp: text("created_by_ip"),
    version: integer("version").notNull().default(1),
    username: text("username"),
    cosmoId: text("cosmo_id"),
    notes: text("notes"),
    haveTitle: text("have_title").notNull().default("Have"),
    wantTitle: text("want_title").notNull().default("Want"),
    theme: text("theme").notNull().default("dark"),
    groupByMember: boolean("group_by_member").notNull().default(false),
    groupByNumbers: boolean("group_by_numbers").notNull().default(true),
    colsPerRow: integer("cols_per_row").notNull().default(5),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("poster_user_id_idx").on(t.userId)],
);

export const posterHave = pgTable(
  "poster_have",
  {
    id: serial("id").primaryKey(),
    posterId: text("poster_id")
      .notNull()
      .references(() => poster.id, { onDelete: "cascade" }),
    collectionId: text("collection_id"),
    collectionNo: text("collection_no"),
    member: text("member"),
    season: text("season"),
    class: text("class"),
    thumbnailUrl: text("thumbnail_url"),
    serial: integer("serial"),
    objektId: text("objekt_id"),
    quantity: integer("quantity").notNull().default(1),
    freeform: boolean("freeform").notNull().default(false),
    rawLabel: text("raw_label"),
    onOffline: text("on_offline"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("poster_have_poster_id_idx").on(t.posterId)],
);

export const posterWant = pgTable(
  "poster_want",
  {
    id: serial("id").primaryKey(),
    posterId: text("poster_id")
      .notNull()
      .references(() => poster.id, { onDelete: "cascade" }),
    collectionId: text("collection_id"),
    collectionNo: text("collection_no"),
    member: text("member"),
    season: text("season"),
    class: text("class"),
    thumbnailUrl: text("thumbnail_url"),
    serial: integer("serial"),
    objektId: text("objekt_id"),
    quantity: integer("quantity").notNull().default(1),
    freeform: boolean("freeform").notNull().default(false),
    rawLabel: text("raw_label"),
    onOffline: text("on_offline"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("poster_want_poster_id_idx").on(t.posterId)],
);

// Dedup log for the proactive "you have a new match" notification: one row
// means the owner of notifiedTradePostId has already been told that
// matchedTradePostId matches them, so edits don't re-notify on every save.
export const tradeMatchSeen = pgTable(
  "trade_match_seen",
  {
    id: serial("id").primaryKey(),
    notifiedTradePostId: text("notified_trade_post_id")
      .notNull()
      .references(() => tradePost.id, { onDelete: "cascade" }),
    matchedTradePostId: text("matched_trade_post_id")
      .notNull()
      .references(() => tradePost.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trade_match_seen_pair_unique").on(
      t.notifiedTradePostId,
      t.matchedTradePostId,
    ),
  ],
);

export const tradeBan = pgTable(
  "trade_ban",
  {
    id: serial("id").primaryKey(),
    cosmoId: text("cosmo_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    activeTradeId: text("active_trade_id").references(() => activeTrade.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    liftedAt: timestamp("lifted_at"),
    liftedReason: text("lifted_reason"),
  },
  (t) => [
    index("trade_ban_cosmo_id_idx").on(t.cosmoId),
    index("trade_ban_user_id_idx").on(t.userId),
  ],
);

// ============================================================
// Relations
// ============================================================

export const userRelations = relations(user, ({ one, many }) => ({
  cosmoAccount: one(cosmoAccount, {
    fields: [user.id],
    references: [cosmoAccount.userId],
  }),
  tradePosts: many(tradePost),
  tradeNotifications: many(tradeNotification),
  posters: many(poster),
}));

export const cosmoAccountRelations = relations(cosmoAccount, ({ one }) => ({
  user: one(user, {
    fields: [cosmoAccount.userId],
    references: [user.id],
  }),
}));

export const tradePostRelations = relations(tradePost, ({ one, many }) => ({
  user: one(user, {
    fields: [tradePost.userId],
    references: [user.id],
  }),
  haves: many(tradePostHave),
  wants: many(tradePostWant),
  linkedPoster: one(poster, {
    fields: [tradePost.linkedPosterId],
    references: [poster.id],
  }),
}));

export const tradePostHaveRelations = relations(tradePostHave, ({ one }) => ({
  tradePost: one(tradePost, {
    fields: [tradePostHave.tradePostId],
    references: [tradePost.id],
  }),
}));

export const tradePostWantRelations = relations(tradePostWant, ({ one }) => ({
  tradePost: one(tradePost, {
    fields: [tradePostWant.tradePostId],
    references: [tradePost.id],
  }),
}));

export const tradeNotificationRelations = relations(
  tradeNotification,
  ({ one }) => ({
    user: one(user, {
      fields: [tradeNotification.userId],
      references: [user.id],
    }),
  }),
);

export const tradeTransferLogRelations = relations(
  tradeTransferLog,
  ({ one }) => ({
    activeTrade: one(activeTrade, {
      fields: [tradeTransferLog.activeTradeId],
      references: [activeTrade.id],
    }),
    side: one(activeTradeSide, {
      fields: [tradeTransferLog.activeTradeSideId],
      references: [activeTradeSide.id],
    }),
    sender: one(user, {
      fields: [tradeTransferLog.senderUserId],
      references: [user.id],
      relationName: "logSender",
    }),
    recipient: one(user, {
      fields: [tradeTransferLog.recipientUserId],
      references: [user.id],
      relationName: "logRecipient",
    }),
  }),
);

export const posterRelations = relations(poster, ({ one, many }) => ({
  user: one(user, {
    fields: [poster.userId],
    references: [user.id],
  }),
  haves: many(posterHave),
  wants: many(posterWant),
}));

export const posterHaveRelations = relations(posterHave, ({ one }) => ({
  poster: one(poster, {
    fields: [posterHave.posterId],
    references: [poster.id],
  }),
}));

export const posterWantRelations = relations(posterWant, ({ one }) => ({
  poster: one(poster, {
    fields: [posterWant.posterId],
    references: [poster.id],
  }),
}));

export const tradeBanRelations = relations(tradeBan, ({ one }) => ({
  user: one(user, {
    fields: [tradeBan.userId],
    references: [user.id],
  }),
  activeTrade: one(activeTrade, {
    fields: [tradeBan.activeTradeId],
    references: [activeTrade.id],
  }),
}));

export const activeTradeRelations = relations(activeTrade, ({ one, many }) => ({
  tradePost: one(tradePost, {
    fields: [activeTrade.tradePostId],
    references: [tradePost.id],
    relationName: "initiatorPost",
  }),
  matchedTradePost: one(tradePost, {
    fields: [activeTrade.matchedTradePostId],
    references: [tradePost.id],
    relationName: "matchedPost",
  }),
  initiator: one(user, {
    fields: [activeTrade.initiatorUserId],
    references: [user.id],
    relationName: "initiator",
  }),
  recipient: one(user, {
    fields: [activeTrade.recipientUserId],
    references: [user.id],
    relationName: "recipient",
  }),
  counterOfferTo: one(activeTrade, {
    fields: [activeTrade.counterOfferToId],
    references: [activeTrade.id],
    relationName: "counterOfferChain",
  }),
  counterOffers: many(activeTrade, { relationName: "counterOfferChain" }),
  sides: many(activeTradeSide),
  transferLogs: many(tradeTransferLog),
}));

export const activeTradeSideRelations = relations(
  activeTradeSide,
  ({ one }) => ({
    activeTrade: one(activeTrade, {
      fields: [activeTradeSide.activeTradeId],
      references: [activeTrade.id],
    }),
    user: one(user, {
      fields: [activeTradeSide.userId],
      references: [user.id],
    }),
  }),
);
