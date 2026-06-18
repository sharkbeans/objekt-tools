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
  nickname: string;
  address: string;
  profileImageUrl?: string;
  statusMessage?: string;
}

export interface CosmoSeasonMeta {
  title: string;
  color?: string;
  backgroundColor?: string;
}

export interface CosmoArtistDetail {
  seasons?: CosmoSeasonMeta[];
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
