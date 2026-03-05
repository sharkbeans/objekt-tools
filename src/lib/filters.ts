export const ARTISTS = ["artms", "tripleS", "idntt"] as const;
export type Artist = (typeof ARTISTS)[number];

export const MEMBERS_BY_ARTIST: Record<Artist, string[]> = {
  artms: [
    "HeeJin", "HaSeul", "Kim Lip", "JinSoul", "Choerry",
  ],
  tripleS: [
    "SeoYeon", "HyeRin", "JiWoo", "ChaeYeon", "YooYeon",
    "SooMin", "NaKyoung", "YuBin", "Kaede", "DaHyun",
    "Kotone", "YeonJi", "Nien", "SoHyun", "Xinyu",
    "Mayu", "Lynn", "JooBin", "HaYeon", "ShiOn",
    "ChaeWon", "Sullin", "SeoAh", "JiYeon",
  ],
  idntt: [],
};

export const SEASONS = [
  "Atom01",
  "Binary01",
  "Cream01",
  "Divine01",
] as const;

export const CLASSES = [
  "First",
  "Special",
  "Double",
  "Welcome",
  "Zero",
] as const;

export const ON_OFFLINE_OPTIONS = ["online", "offline"] as const;

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
] as const;

export type TradeFilters = {
  artist: string[];
  member: string[];
  season: string[];
  class: string[];
  onOffline: string | null;
  sort: string;
};
