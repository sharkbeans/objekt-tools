import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// Better Auth tables
// ============================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
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
  nickname: text("nickname").notNull(),
  cosmoId: integer("cosmo_id"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
});

export const tradePost = pgTable("trade_post", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  description: text("description"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("trade_post_user_id_idx").on(t.userId),
  index("trade_post_status_created_idx").on(t.status, t.createdAt),
]);

export const tradePostHave = pgTable("trade_post_have", {
  id: serial("id").primaryKey(),
  tradePostId: integer("trade_post_id")
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
}, (t) => [
  index("trade_post_have_trade_post_id_idx").on(t.tradePostId),
  index("trade_post_have_collection_id_idx").on(t.collectionId),
]);

export const tradePostWant = pgTable("trade_post_want", {
  id: serial("id").primaryKey(),
  tradePostId: integer("trade_post_id")
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
}, (t) => [
  index("trade_post_want_trade_post_id_idx").on(t.tradePostId),
  index("trade_post_want_collection_id_idx").on(t.collectionId),
]);

export const tradeNotification = pgTable("trade_notification", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tradePostId: integer("trade_post_id"),
  message: text("message").notNull(),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("trade_notification_user_id_idx").on(t.userId),
]);

export const cosmoToken = pgTable("cosmo_token", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeTrade = pgTable("active_trade", {
  id: serial("id").primaryKey(),
  tradePostId: integer("trade_post_id").references(() => tradePost.id, { onDelete: "set null" }),
  // The trade post of the other party (the match)
  matchedTradePostId: integer("matched_trade_post_id").references(() => tradePost.id, { onDelete: "set null" }),
  // initiator = user who clicked "Initiate Trade"; recipient = user who owns the matched trade post
  initiatorUserId: text("initiator_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending").$type<
    "pending" | "accepted" | "partial" | "completed" | "cancelled" | "disputed"
  >(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (t) => [
  index("active_trade_initiator_idx").on(t.initiatorUserId),
  index("active_trade_recipient_idx").on(t.recipientUserId),
  index("active_trade_status_idx").on(t.status),
]);

// One row per side of the trade (initiator side + recipient side)
export const activeTradeSide = pgTable("active_trade_side", {
  id: serial("id").primaryKey(),
  activeTradeId: integer("active_trade_id")
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
  status: text("status").notNull().default("pending").$type<"pending" | "sent" | "confirmed">(),
  transferHash: text("transfer_hash"),
  detectedAt: timestamp("detected_at"),
}, (t) => [
  index("active_trade_side_trade_idx").on(t.activeTradeId),
  index("active_trade_side_user_idx").on(t.userId),
]);

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

export const tradeNotificationRelations = relations(tradeNotification, ({ one }) => ({
  user: one(user, {
    fields: [tradeNotification.userId],
    references: [user.id],
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
  sides: many(activeTradeSide),
}));

export const activeTradeSideRelations = relations(activeTradeSide, ({ one }) => ({
  activeTrade: one(activeTrade, {
    fields: [activeTradeSide.activeTradeId],
    references: [activeTrade.id],
  }),
  user: one(user, {
    fields: [activeTradeSide.userId],
    references: [user.id],
  }),
}));
