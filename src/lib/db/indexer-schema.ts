import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const collections = pgTable("collection", {
  id: uuid().primaryKey(),
  collectionId: text("collection_id").notNull(),
  season: text().notNull(),
  member: text().notNull(),
  artist: text().notNull(),
  collectionNo: text("collection_no").notNull(),
  class: text().notNull(),
  thumbnailImage: text("thumbnail_image").notNull(),
  frontImage: text("front_image").notNull(),
  backImage: text("back_image").notNull(),
  accentColor: text("accent_color").notNull(),
  onOffline: text("on_offline").notNull().$type<"online" | "offline">(),
});

export const objekts = pgTable("objekt", {
  id: varchar().primaryKey(),
  owner: text().notNull(),
  serial: integer().notNull(),
  transferable: boolean().notNull(),
  collectionId: uuid("collection_id").references(() => collections.id),
});

export const transfers = pgTable("transfer", {
  id: varchar({ length: 36 }).primaryKey(),
  from: text().notNull(),
  to: text().notNull(),
  timestamp: timestamp({ withTimezone: true }).notNull(),
  tokenId: text("token_id").notNull(),
  hash: text().notNull(),
  objektId: varchar("objekt_id").references(() => objekts.id),
  collectionId: uuid("collection_id").references(() => collections.id),
});
