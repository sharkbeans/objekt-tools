import type { activeTrade, activeTradeSide } from "@/lib/db/schema";

// Derive status unions from the schema so changes propagate automatically.
type ActiveTradeRow = typeof activeTrade.$inferSelect;
type ActiveTradeSideRow = typeof activeTradeSide.$inferSelect;
export type TradeStatus = ActiveTradeRow["status"];
export type SideStatus = ActiveTradeSideRow["status"];

/** User as flattened by the active-trades API routes (cosmoAccount inlined). */
export interface TradeUserDTO {
  id: string;
  name: string;
  image?: string | null;
  cosmoNickname?: string | null;
  cosmoAddress?: string | null;
  discordId?: string | null;
  discordUsername?: string | null;
}

/** Active-trade side as serialized over JSON (dates become strings). */
export interface TradeSideDTO {
  id: number;
  userId: string;
  address: string;
  recipientAddress: string;
  objektId: string;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  serial?: number | null;
  thumbnailUrl?: string | null;
  status: SideStatus;
  detectedAt?: string | null;
  user: TradeUserDTO;
}

/**
 * Active trade as returned by the active-trades list/history endpoints.
 * Date fields are serialized to ISO strings over JSON.
 */
export interface ActiveTradeDTO {
  id: string;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  expiresAt?: string | null;
  tradePostId?: string | null;
  matchedTradePostId?: string | null;
  initiatorUserId: string;
  recipientUserId: string;
  counterOfferToId?: string | null;
  counterOfferId?: string | null;
  initiator: TradeUserDTO;
  recipient: TradeUserDTO;
  sides: TradeSideDTO[];
}

/** Item in a trade post's haves or wants list. */
export interface TradePostItem {
  id: number;
  collectionId: string;
  collectionNo?: string | null;
  member?: string | null;
  season?: string | null;
  class?: string | null;
  serial?: number | null;
  isAny?: boolean;
  artist?: string | null;
  thumbnailUrl?: string | null;
}

/** Trade post as returned by /api/trades* list endpoints. Note: id is a nanoid string. */
export interface TradePostDTO {
  id: string;
  userId: string;
  description?: string | null;
  status: string;
  wantsOnly: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; image?: string | null };
  cosmoNickname?: string | null;
  cosmoAddress?: string | null;
  haves: TradePostItem[];
  wants: TradePostItem[];
}

/** Minimal shape returned by /api/objekts/search results array. */
export interface ObjektSearchResult {
  collectionId: string;
  thumbnailImage?: string | null;
  frontImage?: string | null;
}
