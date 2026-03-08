// ============================================================
// Filter constants — sourced from objekt-explorer
// ============================================================

export const validArtists = ["artms", "tripleS", "idntt"] as const;
export type ValidArtist = (typeof validArtists)[number];

export const validSeasons = [
  "Atom01",
  "Binary01",
  "Cream01",
  "Divine01",
  "Ever01",
  "Atom02",
  "Binary02",
  // idntt
  "Spring25",
  "Summer25",
  "Autumn25",
  "Winter26",
] as const;
export type ValidSeason = (typeof validSeasons)[number];

export const validClasses = [
  "First",
  "Basic",
  "Double",
  "Event",
  "Unit",
  "Motion",
  "Special",
  "Premier",
  "Welcome",
  "Zero",
] as const;
export type ValidClass = (typeof validClasses)[number];

export const validOnlineTypes = ["online", "offline"] as const;
export type ValidOnlineType = (typeof validOnlineTypes)[number];

export const validSorts = ["newest", "oldest"] as const;
export type ValidSort = (typeof validSorts)[number];

// Per-artist class availability — from objekt-explorer filter-data.ts
export const classArtistMap: { artistId: ValidArtist; classes: string[] }[] = [
  {
    artistId: "tripleS",
    classes: ["First", "Double", "Motion", "Unit", "Special", "Premier", "Welcome", "Zero"],
  },
  {
    artistId: "artms",
    classes: ["First", "Double", "Motion", "Special", "Premier", "Welcome"],
  },
  {
    artistId: "idntt",
    classes: ["Basic", "Event", "Motion", "Special", "Unit", "Welcome"],
  },
];

// Per-artist season availability
export const seasonArtistMap: { artistId: ValidArtist; seasons: string[] }[] = [
  {
    artistId: "tripleS",
    seasons: ["Atom01", "Binary01", "Cream01", "Divine01", "Ever01", "Atom02", "Binary02"],
  },
  {
    artistId: "artms",
    seasons: ["Atom01", "Binary01", "Cream01", "Divine01", "Ever01", "Atom02", "Binary02"],
  },
  {
    artistId: "idntt",
    seasons: ["Spring25", "Summer25", "Autumn25", "Winter26"],
  },
];

// Member shortform aliases — from objekt-explorer packages/lib/src/types/objekt.ts
export const shortformMembers: Record<string, string> = {
  naky: "NaKyoung",
  n: "Nien",
  nk: "NaKyoung",
  tone: "Kotone",
  sulin: "Sullin",
  s: "Sullin",
  sh: "SoHyun",
  c: "Choerry",
  ch: "Choerry",
  choery: "Choerry",
  cw: "ChaeWon",
  cy: "ChaeYeon",
  sy: "SeoYeon",
  sm: "SooMin",
  so: "ShiOn",
  sa: "SeoAh",
  sl: "Sullin",
  jw: "JiWoo",
  jb: "JooBin",
  jy: "JiYeon",
  js: "JinSoul",
  dh: "DaHyun",
  kd: "Kaede",
  kl: "KimLip",
  k: "Kaede",
  hr: "HyeRin",
  hy: "HaYeon",
  hj: "HeeJin",
  hs: "HaSeul",
  yb: "YuBin",
  yj: "YeonJi",
  yy: "YooYeon",
  x: "Xinyu",
  m: "Mayu",
  l: "Lynn",
  soda: "DaHyun",
  kwak: "YeonJi",
  yubam: "YuBin",
  ham: "SeoYeon",
  ssaem: "SoHyun",
  park: "SoHyun",
  mg: "MinGyeol",
  hh: "HwanHee",
  jh: "JuHo",
  ti: "TaeIn",
  cm: "CheongMyeong",
  t: "Towa",
  kh: "KyuHyuk",
  nr: "NuRi",
  sj: "SeongJun",
  gb: "GyeongBeen",
  es: "EunSoo",
};

// Members grouped by artist
export const membersByArtist: Record<ValidArtist, string[]> = {
  tripleS: [
    "NaKyoung",
    "JiWoo",
    "ChaeYeon",
    "YooYeon",
    "SooMin",
    "HyeRin",
    "JiYeon",
    "YuBin",
    "DaHyun",
    "Choerry",
    "SeoAh",
    "ShiOn",
    "HeeJin",
    "ChaeWon",
    "SoHyun",
    "YeonJi",
    "SeoYeon",
    "HaYeon",
    "Kotone",
    "Sullin",
    "Xinyu",
    "Mayu",
    "Lynn",
    "MinGyeol",
    "HwanHee",
    "JuHo",
    "TaeIn",
    "CheongMyeong",
    "Towa",
    "KyuHyuk",
    "NuRi",
    "SeongJun",
    "GyeongBeen",
    "EunSoo",
    "Nien",
    "JooBin",
  ],
  artms: ["KimLip", "JinSoul", "HaSeul", "Choerry", "HeeJin"],
  idntt: ["Kaede"],
};
