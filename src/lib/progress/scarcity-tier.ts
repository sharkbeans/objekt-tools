// Pure scarcity-tier helpers. No server/indexer imports so this is safe to
// pull into client components (dex cards, dialog) and the canvas renderer.

export type ScarcityTier = "common" | "uncommon" | "rare" | "grail";

// Tiers in ascending rarity. A supply <= maxSupply lands in that tier; the
// first match (smallest threshold) wins. Thresholds are intentionally simple
// and easy to tune — COSMO supplies vary widely by class.
export const SCARCITY_TIERS: { tier: ScarcityTier; maxSupply: number }[] = [
  { tier: "grail", maxSupply: 50 },
  { tier: "rare", maxSupply: 200 },
  { tier: "uncommon", maxSupply: 1000 },
];

export function deriveScarcityTier(supply: number): ScarcityTier {
  for (const { tier, maxSupply } of SCARCITY_TIERS) {
    if (supply <= maxSupply) return tier;
  }
  return "common";
}

// Standard gacha rarity coloring (gray → blue → purple → gold). Hex values so
// the same map works for Tailwind inline styles and the canvas renderer.
export const SCARCITY_TIER_META: Record<
  ScarcityTier,
  { label: string; color: string }
> = {
  common: { label: "Common", color: "#9ca3af" },
  uncommon: { label: "Uncommon", color: "#60a5fa" },
  rare: { label: "Rare", color: "#a78bfa" },
  grail: { label: "Grail", color: "#fbbf24" },
};

// Compact count: 1234 -> "1.2k". Keeps dex labels short.
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}
