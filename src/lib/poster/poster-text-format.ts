import type { PosterData } from "@/components/poster/poster-canvas";
import type { ResolvedPosterItem } from "@/lib/poster/poster-resolver";
import { getSeasonPrefix, stripVariantSuffix } from "@/lib/season-prefix";

// The trailing A/Z on a collectionNo is the online/offline variant marker.
// It's noise in a pasted trade list — "CC101" is what people write.
function itemCode(item: ResolvedPosterItem): string | null {
  if (item.entry) {
    return `${getSeasonPrefix(item.entry.season)}${stripVariantSuffix(item.entry.collectionNo)}`;
  }
  const { parsed } = item;
  if (parsed.freeform || parsed.isAny) return null;
  if (parsed.season && parsed.collectionNo) {
    return `${getSeasonPrefix(parsed.season)}${stripVariantSuffix(parsed.collectionNo)}`;
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
    const group = byMember.get(member);
    if (!group) return null;
    const codes = group.order
      .map((code) => {
        const n = group.counts.get(code) ?? 0;
        return n > 1 ? `${code}(x${n})` : code;
      })
      .join(" ");
    return member ? `${member} ${codes}` : codes;
  });

  return [...memberLines.filter(Boolean), ...freeformLines].join("\n");
}

/** `listUrl` is appended as a bare trailing line — omit it for unsaved drafts
 * that have no public URL yet. */
export function formatPosterAsText(
  data: PosterData,
  listUrl?: string | null,
): string {
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

  if (listUrl?.trim()) {
    sections.push(listUrl.trim());
  }

  return sections.join("\n\n");
}
