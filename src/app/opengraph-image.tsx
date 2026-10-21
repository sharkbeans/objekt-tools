import { ImageResponse } from "next/og";
import {
  artBlobs,
  CardFace,
  LogoMark,
  SHARE_CARD_PAL as PAL,
  SHARE_CARD_SIZE,
  shareCardFonts,
} from "@/lib/share-card";

// The site-wide link preview: the home page's, and the fallback for any page
// that doesn't draw its own (collection, list and profile pages do; /match has
// its own beside its page). Static: built once at build time.

export const alt =
  "objekt.my: track your Cosmo objekt grids and find who has what you're missing.";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

// A grid in progress: collected objekts and the slots still missing.
const GRID: ({ art: string; band: string } | null)[] = [
  { art: artBlobs([249, 168, 212], [216, 180, 254]), band: "#f472b6" },
  { art: artBlobs([186, 230, 253], [134, 239, 172]), band: "#38bdf8" },
  null,
  { art: artBlobs([253, 230, 138], [249, 168, 212]), band: "#facc15" },
  { art: artBlobs([134, 239, 172], [186, 230, 253]), band: "#4ade80" },
  null,
  { art: artBlobs([216, 180, 254], [253, 230, 138]), band: "#a78bfa" },
  { art: artBlobs([254, 202, 202], [186, 230, 253]), band: "#f87171" },
];

function GridTile({ face }: { face: { art: string; band: string } | null }) {
  const tile = { display: "flex", width: 100, height: 150 };
  if (face) {
    return (
      <div style={tile}>
        <CardFace art={face.art} band={face.band} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...tile,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 11,
        border: "2px dashed #52525b",
        color: "#71717a",
        fontFamily: "Member",
        fontSize: 40,
      }}
    >
      ?
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "0 72px",
        background: PAL.bg,
        backgroundImage:
          "radial-gradient(circle at 78% 50%, rgba(167,139,250,0.12), rgba(167,139,250,0) 42%)",
        color: PAL.fg,
        fontFamily: "Regular",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <LogoMark fill={PAL.fg} size={92} />
          <div style={{ display: "flex", fontFamily: "Member", fontSize: 84 }}>
            objekt.my
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 26,
            fontSize: 38,
            lineHeight: 1.3,
            color: PAL.soft,
          }}
        >
          <span>Track your grids.</span>
          <span>Find who has what</span>
          <span>you’re missing.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 22,
            color: PAL.muted,
          }}
        >
          Free fan-made tools for Cosmo collectors
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: 4 * 100 + 3 * 16,
          gap: 16,
        }}
      >
        {GRID.map((face, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed illustration
          <GridTile face={face} key={i} />
        ))}
      </div>
    </div>,
    { ...SHARE_CARD_SIZE, fonts: shareCardFonts() },
  );
}
