/**
 * Renders a trade poster directly to a canvas element — no html-to-image,
 * no SVG foreignObject, no CORS taint issues on mobile browsers.
 */

import type { PosterData, PosterTheme } from "@/components/poster/poster-canvas";
import { getSeasonPrefix } from "@/lib/season-prefix";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";

const DARK = {
  bg: "#0f0f14", fg: "#e4e4e7", muted: "#a1a1aa",
  border: "#3f3f46", sectionBg: "#18181b", accent: "#71717a",
};
const LIGHT = {
  bg: "#ffffff", fg: "#18181b", muted: "#71717a",
  border: "#e4e4e7", sectionBg: "#f4f4f5", accent: "#d4d4d8",
};

const CARD_W = 100;
const GAP = 10;
const PAD = 32;
const LABEL_H = 20; // space below card for label text

function groupByMemberFn(items: ResolvedPosterItem[]) {
  const groups: { member: string | null; items: ResolvedPosterItem[] }[] = [];
  const seen = new Map<string, typeof groups[0]>();
  for (const item of items) {
    const m = item.entry?.member ?? item.parsed.member ?? null;
    const key = m ?? "\0";
    if (!seen.has(key)) {
      const g = { member: m, items: [] as ResolvedPosterItem[] };
      groups.push(g);
      seen.set(key, g);
    }
    seen.get(key)!.items.push(item);
  }
  return groups;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  // Fetch to a blob URL so the image is same-origin — avoids canvas taint
  // (toBlob SecurityError) while also bypassing the mobile Safari CORS cache
  // poisoning that occurs with crossOrigin="anonymous" on cached CDN images.
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error(`img load failed: ${url}`)); };
    img.src = blobUrl;
  });
}

function itemLabel(item: ResolvedPosterItem) {
  return item.entry
    ? `${item.entry.member} ${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`
    : item.parsed.raw;
}

/** Returns the canvas height needed to draw a section (flat grid layout) */
function sectionHeight(count: number, cols: number): number {
  if (count === 0) return 0;
  const rows = Math.ceil(count / cols);
  const cardH = Math.round(CARD_W * 1.5);
  return 20 + rows * (cardH + LABEL_H + GAP); // 20 = section title
}

/** Returns the canvas height needed to draw a section (group-by-member layout) */
function sectionHeightGrouped(
  groups: { member: string | null; items: ResolvedPosterItem[] }[],
): number {
  if (groups.length === 0) return 0;
  let h = 20; // section title
  const cardH = Math.round(CARD_W * 1.5);
  for (const g of groups) {
    if (g.member) h += 18; // member label
    const rows = Math.ceil(g.items.length / 12); // wrapped rows (max 12/row)
    h += rows * (cardH + LABEL_H + GAP) + 16; // 16 = group gap
  }
  return h;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export async function renderPosterToCanvas(
  data: PosterData,
  theme: PosterTheme,
  groupByMember: boolean,
  colsPerRow: number,
  pixelRatio = 2,
): Promise<HTMLCanvasElement> {
  const t = theme === "dark" ? DARK : LIGHT;
  const cardH = Math.round(CARD_W * 1.5);

  // ── Compute cols ────────────────────────────────────────────────────────────
  let cols: number;
  if (groupByMember) {
    const haveGroups = groupByMemberFn(data.haves);
    const wantGroups = groupByMemberFn(data.wants);
    const maxGroupSize = Math.max(
      ...haveGroups.map((g) => g.items.length),
      ...wantGroups.map((g) => g.items.length),
      4,
    );
    cols = Math.min(maxGroupSize, 12);
  } else {
    cols = colsPerRow;
  }

  const innerW = cols * CARD_W + (cols - 1) * GAP;
  const posterW = innerW + PAD * 2;

  // ── Compute height ──────────────────────────────────────────────────────────
  const haveGroups = groupByMemberFn(data.haves);
  const wantGroups = groupByMemberFn(data.wants);

  const haveH = groupByMember
    ? sectionHeightGrouped(haveGroups)
    : sectionHeight(data.haves.length, cols);
  const wantH = groupByMember
    ? sectionHeightGrouped(wantGroups)
    : sectionHeight(data.wants.length, cols);

  const notesH = data.notes ? 60 : 0;
  const dividerH = 1 + 20; // 1px line + 20px gap
  const hasBothSections = data.haves.length > 0 && data.wants.length > 0;

  const posterH =
    PAD +
    40 + // header
    20 + dividerH + // header divider
    haveH +
    (hasBothSections ? dividerH : 0) +
    wantH +
    notesH +
    60 + // disclaimer + footer
    PAD;

  // ── Create canvas ───────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = posterW * pixelRatio;
  canvas.height = posterH * pixelRatio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelRatio, pixelRatio);

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, posterW, posterH);

  let y = PAD;

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.font = "600 16px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.fg;
  ctx.textBaseline = "top";
  if (data.username) ctx.fillText(data.username, PAD, y);

  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.muted;
  ctx.fillText(data.date, PAD, y + 20);

  ctx.font = "600 12px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.textAlign = "right";
  ctx.fillText("objekt.my", posterW - PAD, y + 4);
  ctx.textAlign = "left";

  y += 40;

  // ── Divider ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = t.border;
  ctx.fillRect(PAD, y, innerW, 1);
  y += 20;

  // ── Helper: draw one section ─────────────────────────────────────────────────
  async function drawSection(
    title: string,
    items: ResolvedPosterItem[],
    images: Map<string, HTMLImageElement>,
  ) {
    if (items.length === 0) return;

    // Section title
    ctx.font = "700 13px Helvetica, Arial, sans-serif";
    ctx.fillStyle = t.fg;
    ctx.letterSpacing = "1.5px";
    ctx.fillText(title.toUpperCase(), PAD, y);
    ctx.letterSpacing = "0px";
    y += 20;

    if (groupByMember) {
      const groups = groupByMemberFn(items);
      for (const group of groups) {
        if (group.member) {
          ctx.font = "600 11px Helvetica, Arial, sans-serif";
          ctx.fillStyle = t.muted;
          ctx.fillText(group.member.toUpperCase(), PAD, y);
          y += 18;
        }
        await drawItemRow(group.items, images);
        y += 16;
      }
    } else {
      await drawItemRow(items, images);
    }
  }

  async function drawItemRow(items: ResolvedPosterItem[], images: Map<string, HTMLImageElement>) {
    const batches: ResolvedPosterItem[][] = [];
    if (groupByMember) {
      // Wrap freely in groups
      for (let i = 0; i < items.length; i += 12) batches.push(items.slice(i, i + 12));
    } else {
      for (let i = 0; i < items.length; i += cols) batches.push(items.slice(i, i + cols));
    }

    for (const row of batches) {
      for (let i = 0; i < row.length; i++) {
        const item = row[i];
        const x = PAD + i * (CARD_W + GAP);
        const img = item.imageUrl ? images.get(item.imageUrl) : undefined;

        if (img) {
          // Draw card image with rounded corners
          ctx.save();
          roundRect(ctx, x, y, CARD_W, cardH, 6);
          ctx.clip();
          ctx.drawImage(img, x, y, CARD_W, cardH);
          ctx.restore();

          // Border overlay
          ctx.strokeStyle = t.border;
          ctx.lineWidth = 1;
          roundRect(ctx, x, y, CARD_W, cardH, 6);
          ctx.stroke();
        } else {
          // Placeholder
          ctx.strokeStyle = t.accent;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          roundRect(ctx, x, y, CARD_W, cardH, 6);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = "10px Helvetica, Arial, sans-serif";
          ctx.fillStyle = t.muted;
          ctx.textAlign = "center";
          ctx.fillText(item.parsed.raw, x + CARD_W / 2, y + cardH / 2, CARD_W - 8);
          ctx.textAlign = "left";
        }

        // Label below card
        const label = itemLabel(item);
        ctx.font = "12px Helvetica, Arial, sans-serif";
        ctx.fillStyle = t.fg;
        ctx.textAlign = "center";
        ctx.fillText(label, x + CARD_W / 2, y + cardH + 5, CARD_W);
        ctx.textAlign = "left";
      }
      y += cardH + LABEL_H + GAP;
    }
  }

  // ── Pre-load all images ─────────────────────────────────────────────────────
  const allUrls = [
    ...data.haves.map((i) => i.imageUrl),
    ...data.wants.map((i) => i.imageUrl),
  ].filter((u): u is string => !!u);

  const uniqueUrls = [...new Set(allUrls)];
  const images = new Map<string, HTMLImageElement>();
  await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      try {
        images.set(url, await loadImage(url));
      } catch {
        // image stays missing — placeholder drawn instead
      }
    }),
  );

  // ── Draw sections ───────────────────────────────────────────────────────────
  await drawSection(data.haveTitle, data.haves, images);

  if (hasBothSections) {
    ctx.fillStyle = t.border;
    ctx.fillRect(PAD, y, innerW, 1);
    y += 20;
  }

  await drawSection(data.wantTitle, data.wants, images);

  // ── Notes ───────────────────────────────────────────────────────────────────
  if (data.notes) {
    ctx.fillStyle = t.border;
    ctx.fillRect(PAD, y, innerW, 1);
    y += 20;

    ctx.font = "700 13px Helvetica, Arial, sans-serif";
    ctx.fillStyle = t.fg;
    ctx.fillText("NOTES", PAD, y);
    y += 20;

    ctx.font = "14px Helvetica, Arial, sans-serif";
    ctx.fillStyle = t.muted;
    for (const line of data.notes.split("\n")) {
      ctx.fillText(line, PAD, y);
      y += 20;
    }
  }

  // ── Disclaimer ──────────────────────────────────────────────────────────────
  y += 4;
  const disclaimer = data.cosmoId
    ? `Users self-claim what they have. Please verify at objekt.top/@${data.cosmoId}`
    : "Users self-claim what they have.";
  ctx.font = "12px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.muted;
  ctx.textAlign = "center";
  ctx.fillText(disclaimer, posterW / 2, y);
  y += 20;

  // ── Footer ──────────────────────────────────────────────────────────────────
  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.fillText("Generated from objekt.my", posterW / 2, y);
  ctx.textAlign = "left";

  return canvas;
}
