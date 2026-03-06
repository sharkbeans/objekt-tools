import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  boolean,
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
  onOffline: text("on_offline").notNull().$type<"online" | "offline">(),
});

export const objekts = pgTable("objekt", {
  id: varchar().primaryKey(),
  owner: text().notNull(),
  serial: integer().notNull(),
  transferable: boolean().notNull(),
  collectionId: uuid("collection_id").references(() => collections.id),
});
