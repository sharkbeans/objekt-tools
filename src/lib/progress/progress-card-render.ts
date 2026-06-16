/**
 * Renders a shareable collection-completion card to a canvas — same approach as
 * poster-canvas-render.ts (canvas 2D, mobile-safe blob-URL image loading, no
 * html-to-image), so it works reliably on mobile browsers when sharing.
 */

import type { PosterTheme } from "@/components/poster/poster-canvas";
import type { ScarcityTier } from "@/lib/progress/scarcity-tier";

const DARK = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  track: "#27272a",
  accent: "#71717a",
};
const LIGHT = {
  bg: "#ffffff",
  fg: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  track: "#e4e4e7",
  accent: "#d4d4d8",
};

const CARD_W = 70;
const CARD_H = Math.round(CARD_W * 1.545); // objekt aspect ≈ 11/17
const GAP = 8;
const PAD = 32;

export interface ProgressCardItem {
  thumbnailImage: string;
  owned: boolean;
  scarcityTier?: ScarcityTier;
  caption?: string; // optional label drawn under the card (e.g. "87%")
}

export interface ProgressCardInput {
  username: string;
  title: string; // member name, or artist label
  subtitle?: string; // e.g. artist name under a member title
  date: string;
  owned: number;
  total: number;
  items: ProgressCardItem[];
  square?: boolean; // square cards (member avatars) instead of 11/17 objekts
  verifyHandle?: string; // cosmo nickname for the verify link
  highlights?: { rarestOwned?: string; rarestMissing?: string };
  // When true, throw if any objekt image fails to load instead of drawing a
  // placeholder — used by the dex share so a card is never silently incomplete.
  strictImages?: boolean;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  // Fetch to a blob URL so the image is same-origin — avoids canvas taint and
  // mobile Safari CORS cache poisoning. (Mirrors poster-canvas-render.ts.)
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`img load failed: ${url}`));
    };
    img.src = blobUrl;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

export async function renderProgressCardToCanvas(
  input: ProgressCardInput,
  theme: PosterTheme,
  maxCols = 10,
  pixelRatio = 2,
): Promise<HTMLCanvasElement> {
  const t = theme === "dark" ? DARK : LIGHT;
  const cols = Math.max(1, Math.min(maxCols, input.items.length || 1));
  const rows = Math.ceil(input.items.length / cols);

  const cardImgH = input.square ? CARD_W : CARD_H;
  const labelH = input.items.some((i) => i.caption) ? 16 : 0;
  const rowStride = cardImgH + labelH + GAP;

  const innerW = cols * CARD_W + (cols - 1) * GAP;
  const cardW = innerW + PAD * 2;

  // ── Vertical layout budget ──────────────────────────────────────────────
  const headerH = 52;
  const statH = 56; // big percent + progress bar
  const gridH = rows > 0 ? rows * rowStride : 0;
  const highlightsH = input.highlights?.rarestOwned ? 28 : 0;
  const footerH = 48;

  const cardH =
    PAD + headerH + 16 + statH + 20 + gridH + highlightsH + footerH + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = cardW * pixelRatio;
  canvas.height = cardH * pixelRatio;
  const rawCtx = canvas.getContext("2d");
  if (!rawCtx) throw new Error("Canvas 2D context unavailable");
  const ctx = rawCtx;
  ctx.scale(pixelRatio, pixelRatio);

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, cardW, cardH);

  let y = PAD;

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "700 22px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.fg;
  ctx.fillText(input.title, PAD, y);

  ctx.font = "12px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.muted;
  const metaParts = [input.subtitle, input.username, input.date].filter(
    Boolean,
  ) as string[];
  ctx.fillText(metaParts.join("  ·  "), PAD, y + 28);

  ctx.font = "600 12px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.textAlign = "right";
  ctx.fillText("objekt.my", cardW - PAD, y + 2);
  ctx.textAlign = "left";

  y += headerH + 16;

  // ── Completion stat + progress bar ──────────────────────────────────────
  const pct =
    input.total > 0 ? Math.round((input.owned / input.total) * 100) : 0;
  ctx.font = "700 30px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.fg;
  ctx.fillText(`${pct}%`, PAD, y);

  ctx.font = "14px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.muted;
  ctx.textAlign = "right";
  ctx.fillText(
    `${input.owned} / ${input.total} collected`,
    cardW - PAD,
    y + 10,
  );
  ctx.textAlign = "left";

  const barY = y + 40;
  ctx.fillStyle = t.track;
  roundRect(ctx, PAD, barY, innerW, 8, 4);
  ctx.fill();
  if (pct > 0) {
    ctx.fillStyle = t.fg;
    roundRect(ctx, PAD, barY, Math.max(8, (innerW * pct) / 100), 8, 4);
    ctx.fill();
  }

  y += statH + 20;

  // ── Card grid ───────────────────────────────────────────────────────────
  const urls = [...new Set(input.items.map((i) => i.thumbnailImage))].filter(
    Boolean,
  );
  const images = new Map<string, HTMLImageElement>();
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      images.set(url, await loadImage(url));
    }),
  );
  if (input.strictImages) {
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      throw new Error(
        `${failed} objekt image${failed === 1 ? "" : "s"} failed to load. Please try again.`,
      );
    }
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CARD_W + GAP);
    const cy = y + row * rowStride;
    const img = images.get(item.thumbnailImage);

    if (img) {
      ctx.save();
      roundRect(ctx, x, cy, CARD_W, cardImgH, 5);
      ctx.clip();
      ctx.drawImage(img, x, cy, CARD_W, cardImgH);
      ctx.restore();
    } else {
      ctx.fillStyle = t.track;
      roundRect(ctx, x, cy, CARD_W, cardImgH, 5);
      ctx.fill();
    }

    // Dim unowned (matches the dex's bg-black/[0.715]).
    if (!item.owned) {
      ctx.save();
      roundRect(ctx, x, cy, CARD_W, cardImgH, 5);
      ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,0.715)";
      ctx.fillRect(x, cy, CARD_W, cardImgH);
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x, cy, CARD_W, cardImgH, 5);
    ctx.stroke();

    // Optional caption under the card (e.g. per-member completion %).
    if (item.caption) {
      ctx.font = "600 11px Helvetica, Arial, sans-serif";
      ctx.fillStyle = t.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(item.caption, x + CARD_W / 2, cy + cardImgH + 3, CARD_W);
      ctx.textAlign = "left";
    }
  }

  y += gridH;

  // ── Highlights ──────────────────────────────────────────────────────────
  if (highlightsH > 0) {
    const parts: string[] = [];
    if (input.highlights?.rarestOwned)
      parts.push(`Rarest owned: ${input.highlights.rarestOwned}`);
    ctx.font = "12px Helvetica, Arial, sans-serif";
    ctx.fillStyle = t.muted;
    ctx.textAlign = "center";
    ctx.fillText(parts.join("    ·    "), cardW / 2, y + 6, innerW);
    ctx.textAlign = "left";
    y += highlightsH;
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const disclaimer = input.verifyHandle
    ? `Self-reported via COSMO. Verify at objekt.top/@${input.verifyHandle}`
    : "Self-reported via COSMO.";
  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.muted;
  ctx.textAlign = "center";
  ctx.fillText(disclaimer, cardW / 2, y + 8);

  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.fillStyle = t.accent;
  ctx.fillText("Generated from objekt.my", cardW / 2, y + 26);
  ctx.textAlign = "left";

  return canvas;
}
