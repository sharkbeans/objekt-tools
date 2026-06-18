import type { ScarcityTier } from "./scarcity-tier";

export type ProgressRollup = {
  artist: string;
  member: string;
  class: string;
  season: string;
  onOffline: string;
  owned: number;
  total: number;
};

export type ProgressOverviewResponse = {
  nickname: string;
  address: string;
  rollups: ProgressRollup[];
};

export type ProgressCollection = {
  collectionId: string;
  collectionNo: string;
  season: string;
  class: string;
  onOffline: string;
  thumbnailImage: string;
  frontImage: string;
  ownedCount: number;
  member?: string;
  artist?: string;
  accentColor?: string;
  // On-chain scarcity (optional — present only on the member-dex response).
  supply?: number;
  transferable?: number;
  scarcityTier?: ScarcityTier;
};

export type ProgressMemberResponse = {
  nickname: string;
  address: string;
  member: string;
  artist: string;
  collections: ProgressCollection[];
};
