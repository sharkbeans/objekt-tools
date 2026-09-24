// DTOs for the List matching index (tradePost / tradePostHave / tradePostWant,
// kept after the trades retirement — plan 039). See trade-post-matches.ts.

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

/**
 * A matched trade post as returned by /api/posters/[id]/matches
 * (findTradePostMatches). Note: id is a nanoid string.
 */
export interface TradePostDTO {
  id: string;
  userId: string;
  description?: string | null;
  status: string;
  wantsOnly: boolean;
  source?: "manual" | "list";
  // The poster (List) a source="list" post mirrors — see poster-trade-sync.
  // Null for manual trade posts.
  linkedPosterId?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    image?: string | null;
    discordId?: string | null;
    discordUsername?: string | null;
  };
  cosmoNickname?: string | null;
  cosmoAddress?: string | null;
  haves: TradePostItem[];
  wants: TradePostItem[];
  // Present only on results from findTradePostMatches (the actual overlapping
  // items — their haves I want, and their wants I can fill from my haves).
  theyHaveIWant?: TradePostItem[];
  iHaveTheyWant?: TradePostItem[];
}
