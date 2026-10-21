import fs from "node:fs";
import path from "node:path";

// Shared pieces of the site-wide link previews (src/app/opengraph-image.tsx
// and src/app/match/opengraph-image.tsx): the canvas, the fonts, and the
// logo mark. Per-page previews (collection, list, profile) draw their own.

// 1.91:1, the size X, Discord and Facebook all crop link cards to.
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export const SHARE_CARD_PAL = {
  bg: "#0b0b0c",
  fg: "#fafafa",
  soft: "#d4d4d8",
  muted: "#a1a1aa",
  border: "#2e2e33",
  surface: "#161618",
};

// The objekt.my mark on a 512 grid — also the favicon (src/app/icon.tsx).
export const LOGO_TOP_SHAPE =
  "M 220.4 92.2 L 409.6 92.2 L 409.6 281.2 L 373.6 317.4 L 184.3 317.4 L 184.3 128.2 Z";

export const LOGO_LOWER_FRAME =
  "M 135.2 204.8 L 307.2 204.8 L 307.2 368.0 L 270.3 409.6 L 102.4 409.6 L 102.4 237.6 Z M 150.8 227.8 L 284.2 227.8 L 284.2 357.0 L 256.8 386.6 L 125.4 386.6 L 125.4 253.2 Z";

export function LogoMark({ size, fill }: { size: number; fill: string }) {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 512 512"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={LOGO_TOP_SHAPE} fill={fill} />
      <path d={LOGO_LOWER_FRAME} fill={fill} fillRule="evenodd" />
    </svg>
  );
}

type Rgb = [number, number, number];

// Two radial blobs of colour standing in for an objekt's art, each fading to
// its own colour at zero alpha — fading to `transparent` (black at zero alpha)
// muddies the midtones grey.
export function artBlobs(a: Rgb, b: Rgb): string {
  const blob = ([r, g, bl]: Rgb, at: string) =>
    `radial-gradient(circle at ${at}, rgba(${r},${g},${bl},0.9), rgba(${r},${g},${bl},0) 55%)`;
  return `${blob(a, "35% 30%")}, ${blob(b, "55% 75%")}`;
}

// An objekt card face, sized by its parent: the art, and the coloured band
// down the right edge every objekt has.
export function CardFace({ art, band }: { art: string; band: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        borderRadius: 11,
        overflow: "hidden",
        backgroundColor: "#f4f4f5",
        backgroundImage: art,
        boxShadow: "0 16px 36px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          right: 0,
          width: 11,
          height: "100%",
          background: band,
        }}
      />
    </div>
  );
}

function readFont(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", filename));
}

export function shareCardFonts() {
  return [
    { name: "Regular", data: readFont("og-regular.ttf"), weight: 400 as const },
    { name: "Bold", data: readFont("og-bold.ttf"), weight: 700 as const },
    // Nimbus Sans Bold, a Helvetica cut: the narrower face for headlines.
    { name: "Member", data: readFont("og-member.otf"), weight: 600 as const },
  ];
}
