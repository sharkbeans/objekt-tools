import type { ValidArtist } from "./cosmo/types";

// Hardcoded, no per-member color exists in the indexer or Cosmo API — only a
// per-collection accentColor (aggregated to per-season, see
// /api/progress/season-colors). Sourced from:
// tripleS: https://hackmd.io/@aomou/triplescolors
// artms:   https://hackmd.io/@aomou/triplescolors
// idntt:   https://kprofiles.com/representative-colors-of-modhaus-idols/
const MEMBER_COLORS_BY_ARTIST: Record<ValidArtist, Record<string, string>> = {
  tripleS: {
    SeoYeon: "#22AEFF",
    HyeRin: "#9200FF",
    JiWoo: "#FFF800",
    ChaeYeon: "#98F21D",
    YooYeon: "#DB0C74",
    SooMin: "#FC83A4",
    NaKyoung: "#6799A0",
    YuBin: "#FFE3E2",
    Kaede: "#FFC935",
    DaHyun: "#FF9AD6",
    Kotone: "#FFDE00",
    YeonJi: "#5974FF",
    Nien: "#FF953F",
    SoHyun: "#1222B5",
    Xinyu: "#D51313",
    Mayu: "#FE8E76",
    Lynn: "#AC62B7",
    JooBin: "#B7F54C",
    HaYeon: "#52D9BB",
    ShiOn: "#FF428A",
    ChaeWon: "#C7A3E0",
    Sullin: "#7BBA8D",
    SeoAh: "#CFF3FF",
    JiYeon: "#FFAB62",
  },
  artms: {
    HeeJin: "#ED0090",
    HaSeul: "#00A652",
    KimLip: "#EF1841",
    JinSoul: "#1724A7",
    Choerry: "#B510B5",
  },
  idntt: {
    JiWoon: "#8AD363",
    DoHun: "#FE3600",
    CheongMyeong: "#F99BBB",
    TaeIn: "#564FED",
    YeJoon: "#49369A",
    Towa: "#338CE5",
    JuHo: "#FF833E",
    SeongJun: "#94A8D6",
    HeeJu: "#7DD0F4",
    JaeYoung: "#B8ACE8",
    GyeongBeen: "#4EDD9C",
    NuRi: "#FFD72E",
    EunSoo: "#FF7364",
    HwanHee: "#FFED4A",
    KyuHyuk: "#C6E800",
  },
};

export function getMemberColor(
  artist: string,
  member: string,
): string | undefined {
  return MEMBER_COLORS_BY_ARTIST[artist as ValidArtist]?.[member];
}
