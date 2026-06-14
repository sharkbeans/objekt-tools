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
};

export type ProgressMemberResponse = {
  nickname: string;
  address: string;
  member: string;
  artist: string;
  collections: ProgressCollection[];
};
