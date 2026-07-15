import type { PosterData } from "@/components/poster/poster-canvas";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { getSeasonPrefix } from "@/lib/season-prefix";

function itemCode(item: ResolvedPosterItem): string | null {
  if (item.entry) {
    return `${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`;
  }
  const { parsed } = item;
  if (parsed.freeform || parsed.isAny) return null;
  if (parsed.season && parsed.collectionNo) {
    return `${getSeasonPrefix(parsed.season)}${parsed.collectionNo}`;
  }
  return parsed.raw || null;
}

function itemMember(item: ResolvedPosterItem): string | null {
  return item.entry?.member ?? item.parsed.member ?? null;
}

function formatSection(items: ResolvedPosterItem[]): string {
  if (items.length === 0) return "";

  const byMember = new Map<
    string,
    { order: string[]; counts: Map<string, number> }
  >();
  const memberOrder: string[] = [];
  const freeformLines: string[] = [];

  for (const item of items) {
    if (item.parsed.freeform || item.parsed.isAny) {
      const text = item.parsed.raw.trim();
      if (text) freeformLines.push(text);
      continue;
    }
    const member = itemMember(item) ?? "";
    const code = itemCode(item);
    if (!code) continue;
    const qty =
      item.parsed.quantity && item.parsed.quantity > 1
        ? item.parsed.quantity
        : 1;

    let group = byMember.get(member);
    if (!group) {
      group = { order: [], counts: new Map() };
      byMember.set(member, group);
      memberOrder.push(member);
    }
    if (!group.counts.has(code)) group.order.push(code);
    group.counts.set(code, (group.counts.get(code) ?? 0) + qty);
  }

  const memberLines = memberOrder.map((member) => {
    const group = byMember.get(member)!;
    const codes = group.order
      .map((code) => {
        const n = group.counts.get(code)!;
        return n > 1 ? `${code}(x${n})` : code;
      })
      .join(" ");
    return member ? `${member} ${codes}` : codes;
  });

  return [...memberLines, ...freeformLines].join("\n");
}

export function formatPosterAsText(data: PosterData): string {
  const sections: string[] = [];

  if (data.haves.length > 0) {
    const body = formatSection(data.haves);
    if (body) sections.push(`**${data.haveTitle.toUpperCase()}**\n${body}`);
  }

  if (data.wants.length > 0) {
    const body = formatSection(data.wants);
    if (body) sections.push(`**${data.wantTitle.toUpperCase()}**\n${body}`);
  }

  if (data.notes?.trim()) {
    sections.push(data.notes.trim());
  }

  return sections.join("\n\n");
}
