export type ValidArtist = "artms" | "tripleS" | "idntt";

export interface CosmoPublicUser {
  id: number;
  nickname: string;
  address: string;
  profileImageUrl?: string;
}

export interface CosmoSearchResult {
  results: CosmoPublicUser[];
}

export interface CosmoUserProfile {
  id: number;
  nickname: string;
  address: string;
  profileImageUrl?: string;
  fandomName: string;
  followDurationDays: number;
  currentStreak: number;
  statusMessage: string | null;
  createdAt: string;
}

export interface CosmoSeasonMeta {
  title: string;
  color?: string;
  backgroundColor?: string;
}

export interface CosmoArtistMember {
  name: string;
  order: number;
  profileImageUrl?: string;
}

export interface CosmoArtistDetail {
  seasons?: CosmoSeasonMeta[];
  artistMembers?: CosmoArtistMember[];
}

export interface ObjektEntry {
  collectionId: string;
  artist: string;
  member: string;
  collectionNo: string;
  season: string;
  class: string;
  thumbnailImage?: string;
  serial?: number;
  objektId?: string;
}
