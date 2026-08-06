import { compareMembers, compareSeasons } from "@/lib/filter-options";
import { anyWantLabel, type ObjektLabelItem } from "@/lib/objekt-label";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";

/**
 * The plain-text form of a have/want list — the thing people actually paste
 * into Discord. Shared by the trade post page and the list page so both
 * render byte-identical text.
 */
export type TradeTextItem = ObjektLabelItem & {
  isAny?: boolean;
  quantity?: number;
  /** Freeform entry — printed verbatim instead of as a season/number code. */
  customLabel?: string | null;
};

function collectionSortValue(item: TradeTextItem) {
  const no = item.collectionNo
    ? Number.parseInt(stripVariantSuffix(item.collectionNo), 10)
    : Number.POSITIVE_INFINITY;
  return Number.isFinite(no) ? no : Number.POSITIVE_INFINITY;
}

function compareTradeItems(a: TradeTextItem, b: TradeTextItem) {
  const seasonCompare = compareSeasons(a.season ?? "", b.season ?? "");
  if (seasonCompare !== 0) return seasonCompare;
  const noCompare = collectionSortValue(a) - collectionSortValue(b);
  if (noCompare !== 0) return noCompare;
  return (a.collectionId ?? "").localeCompare(b.collectionId ?? "");
}

function objektCode(item: TradeTextItem) {
  if (item.collectionNo) {
    const prefix = getSeasonPrefix(item.season);
    return `${prefix}${stripVariantSuffix(item.collectionNo)}`;
  }
  return item.collectionId || "Unknown";
}

function countTokens(items: TradeTextItem[]) {
  const counts = new Map<string, number>();
  for (const item of [...items].sort(compareTradeItems)) {
    const code = objektCode(item);
    counts.set(code, (counts.get(code) ?? 0) + (item.quantity ?? 1));
  }
  return [...counts.entries()].map(([code, count]) =>
    count > 1 ? `${code} x${count}` : code,
  );
}

function formatTradeTextSection(items: TradeTextItem[]) {
  const groups = new Map<string, TradeTextItem[]>();
  // Freeform and wildcard entries have no season/number code to group under a
  // member, so they get their own one-line-per-label bucket at the bottom.
  const labelCounts = new Map<string, number>();

  for (const item of items) {
    const custom = item.customLabel?.trim();
    if (custom || item.isAny) {
      const label = custom || anyWantLabel(item);
      labelCounts.set(
        label,
        (labelCounts.get(label) ?? 0) + (item.quantity ?? 1),
      );
      continue;
    }
    const member = item.member?.trim() || "Unknown";
    groups.set(member, [...(groups.get(member) ?? []), item]);
  }

  const lines = [...groups.entries()]
    .sort(([a], [b]) => compareMembers(a, b))
    .map(
      ([member, groupItems]) =>
        `${member} ${countTokens(groupItems).join(" ")}`,
    );

  for (const [label, count] of [...labelCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(count > 1 ? `${label} x${count}` : label);
  }

  return lines.length ? lines : ["None"];
}

export type TradeTextSource = {
  haves: TradeTextItem[];
  wants: TradeTextItem[];
  /** Free-text notes appended below the two sections. */
  description?: string | null;
  haveTitle?: string;
  wantTitle?: string;
};

/**
 * `url` is appended as a bare trailing line — pass it for the copied text and
 * omit it for the on-screen preview, so the preview stays about the objekts.
 * `urlLabel` prefixes that line ("Trade: <url>") when given.
 */
export function formatTradeText(
  source: TradeTextSource,
  url?: string,
  urlLabel?: string,
) {
  const lines = [
    source.haveTitle?.trim() || "Have",
    ...formatTradeTextSection(source.haves),
    "",
    source.wantTitle?.trim() || "Want",
    ...formatTradeTextSection(source.wants),
  ];

  const notes = source.description?.trim();
  if (notes) lines.push("", notes);
  if (url) lines.push("", urlLabel ? `${urlLabel}: ${url}` : url);

  return lines.join("\n");
}
