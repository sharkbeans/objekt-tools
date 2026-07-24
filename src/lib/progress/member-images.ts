import { realMembersByArtist } from "@/lib/filters";

const IDNTT_KOREAN: Record<string, string> = {
  DoHun: "도훈",
  HeeJu: "희주",
  TaeIn: "태인",
  JaeYoung: "재영",
  JuHo: "주호",
  JiWoon: "지운",
  HwanHee: "환희",
  MinGyeol: "민결",
};

// Deterministic portrait fallbacks render without waiting for an API request.
// The member-images endpoint can still overlay newer Cosmo profile images.
export const STATIC_MEMBER_IMAGES: Record<string, string> = {
  ...Object.fromEntries(
    realMembersByArtist.tripleS.map((name, index) => [
      `tripleS|${name}`,
      `https://static.cosmo.fans/uploads/member-profile/2025-05-01/S${index + 1}.jpg`,
    ]),
  ),
  ...Object.fromEntries(
    realMembersByArtist.artms.map((name) => [
      `artms|${name}`,
      `https://static.cosmo.fans/images/artms/${name}.jpg`,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(IDNTT_KOREAN).map(([english, korean]) => [
      `idntt|${english}`,
      `https://static.cosmo.fans/uploads/member-profile/idntt-${korean}.jpg`,
    ]),
  ),
};
