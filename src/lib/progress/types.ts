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
  backImage: string;
  accentColor: string;
  ownedCount: number;
  transferableCount: number;
  globalTotalCount: number;
  globalTradableCount: number;
  gridMintCount: number;
  progressCountable: boolean;
  member?: string;
  artist?: string;
};

export type ProgressSerial = {
  serial: number;
  objektId: string;
  transferable: boolean;
};

export type ProgressSerialsResponse = {
  serials: ProgressSerial[];
};

export type ProgressMemberResponse = {
  nickname: string;
  address: string;
  member: string;
  artist: string;
  collections: ProgressCollection[];
};
