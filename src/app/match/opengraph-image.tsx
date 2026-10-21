import { ImageResponse } from "next/og";
import {
  artBlobs,
  CardFace,
  LogoMark,
  SHARE_CARD_PAL as PAL,
  SHARE_CARD_SIZE,
  shareCardFonts,
} from "@/lib/share-card";

// The link preview for objekt.my/match, which is where the extension is
// pitched and installed from. Drawn after the store listing's promo tile — a
// Discord post whose code turns into a matched card — so a link shared on X or
// Discord looks like the listing it leads to. Static: built once at build time.

export const alt =
  "Objekt Match: find who has your missing objekts on Discord. Search your trade channels, then see every match on objekt.my.";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

const GREEN = "#4ade80";

function Label({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Bold",
        fontSize: 12,
        letterSpacing: 1,
        color: PAL.muted,
        marginTop: 10,
      }}
    >
      {children}
    </div>
  );
}

function DiscordPost() {
  return (
    <div
      style={{
        display: "flex",
        width: 290,
        flexShrink: 0,
        padding: "18px 18px 20px",
        gap: 12,
        borderRadius: 16,
        border: `1px solid ${PAL.border}`,
        background: PAL.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 18,
          background: "#a855f7",
          color: "#ffffff",
          fontFamily: "Bold",
          fontSize: 17,
        }}
      >
        T
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontFamily: "Bold", color: PAL.fg }}>trader</span>
          <span style={{ fontSize: 12, color: PAL.muted }}>Today at 3:41</span>
        </div>
        <Label>HAVE</Label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
            color: PAL.fg,
          }}
        >
          <span>SeoYeon</span>
          <span
            style={{
              padding: "1px 6px",
              borderRadius: 6,
              background: PAL.fg,
              color: PAL.bg,
              fontFamily: "Bold",
            }}
          >
            CC101
          </span>
          <span>CC103</span>
        </div>
        <Label>WANT</Label>
        <div style={{ display: "flex", marginTop: 4, color: PAL.fg }}>
          Kaede AA101
        </div>
      </div>
    </div>
  );
}

function CardStack() {
  const card = {
    display: "flex",
    position: "absolute" as const,
    top: 40,
    width: 108,
    height: 162,
  };
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 196,
        height: 230,
        flexShrink: 0,
      }}
    >
      <div style={{ ...card, left: 4, transform: "rotate(-9deg)" }}>
        <CardFace
          art={artBlobs([249, 168, 212], [216, 180, 254])}
          band="#f472b6"
        />
      </div>
      <div style={{ ...card, right: 4, transform: "rotate(9deg)" }}>
        <CardFace
          art={artBlobs([253, 230, 138], [186, 230, 253])}
          band="#facc15"
        />
      </div>
      <div style={{ ...card, left: 44, top: 28 }}>
        <CardFace
          art={artBlobs([134, 239, 172], [253, 230, 138])}
          band={GREEN}
        />
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 128,
          top: 12,
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          background: GREEN,
          border: `3px solid ${PAL.bg}`,
        }}
      >
        <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke={PAL.bg}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.2"
          />
        </svg>
      </div>
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        padding: "0 48px 0 72px",
        background: PAL.bg,
        backgroundImage:
          "radial-gradient(circle at 80% 50%, rgba(74,222,128,0.12), rgba(74,222,128,0) 42%)",
        color: PAL.fg,
        fontFamily: "Regular",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 540,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LogoMark fill={PAL.fg} size={76} />
          <div style={{ display: "flex", fontFamily: "Member", fontSize: 68 }}>
            Objekt Match
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 24,
            fontSize: 36,
            lineHeight: 1.3,
            color: PAL.soft,
          }}
        >
          <span>Find who has your missing</span>
          <span>objekts on Discord</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 22,
            lineHeight: 1.4,
            color: PAL.muted,
          }}
        >
          Search your trade channels, then see every match on objekt.my
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
        }}
      >
        <DiscordPost />
        <svg aria-hidden="true" height="22" viewBox="0 0 30 22" width="30">
          <path
            d="M2 11h24M18 3l8 8-8 8"
            fill="none"
            stroke="#71717a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        </svg>
        <CardStack />
      </div>
    </div>,
    { ...SHARE_CARD_SIZE, fonts: shareCardFonts() },
  );
}
