import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  serial,
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
});

export const tradePostHave = pgTable("trade_post_have", {
  id: serial("id").primaryKey(),
  tradePostId: integer("trade_post_id")
    .notNull()
    .references(() => tradePost.id, { onDelete: "cascade" }),
  collectionId: text("collection_id").notNull(),
  member: text("member"),
  season: text("season"),
  class: text("class"),
  thumbnailUrl: text("thumbnail_url"),
  serial: integer("serial"),
});

export const tradePostWant = pgTable("trade_post_want", {
  id: serial("id").primaryKey(),
  tradePostId: integer("trade_post_id")
    .notNull()
    .references(() => tradePost.id, { onDelete: "cascade" }),
  collectionId: text("collection_id").notNull(),
  member: text("member"),
  season: text("season"),
  class: text("class"),
  thumbnailUrl: text("thumbnail_url"),
});

export const cosmoToken = pgTable("cosmo_token", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// Relations
// ============================================================

export const userRelations = relations(user, ({ one, many }) => ({
  cosmoAccount: one(cosmoAccount, {
    fields: [user.id],
    references: [cosmoAccount.userId],
  }),
  tradePosts: many(tradePost),
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
