import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { loadProfileCard } from "@/lib/profile/profile-summary";
import { decodeRouteParam } from "@/lib/route-params";

export const runtime = "nodejs";

// Same palette the list/trade/collection embeds use, so a Discord channel
// carrying several objekt.my links reads as one product.
const PAL = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
  danger: "#f2809b",
  dangerBg: "#2a1119",
  accent: "#ffffff",
};

function readFont(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", filename));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const raw = decodeRouteParam((await params).address);
  const identifier = raw.startsWith("@") ? raw.slice(1) : raw;

  const [regularFont, boldFont, memberFont] = [
    readFont("og-regular.ttf"),
    readFont("og-bold.ttf"),
    readFont("og-member.otf"),
  ];

  // DB-only lookup: an unlinked Cosmo user just gets the generic card, rather
  // than paying for a Cosmo API call on every embed fetch.
  const card = await loadProfileCard(identifier);
  const displayName = card?.nickname ?? identifier;
  const since = card?.linkedAt
    ? new Date(card.linkedAt).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : null;

  const html = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PAL.bg,
        color: PAL.fg,
        fontFamily: "Regular",
        padding: 56,
      }}
    >
      {/* Wordmark */}
      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: PAL.muted,
          letterSpacing: 1,
        }}
      >
        objekt.my
      </div>

      {/* Identity */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontFamily: "Member",
            color: PAL.accent,
            lineHeight: 1.05,
          }}
        >
          @{displayName}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: PAL.muted }}>
          {card?.linked
            ? since
              ? `On objekt.my since ${since}`
              : "On objekt.my"
            : "Cosmo collection & grid progress"}
        </div>
      </div>

      {/* Collection pitch */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          padding: "26px 28px",
          borderRadius: 12,
          border: `1px solid ${PAL.border}`,
          background: PAL.sectionBg,
          fontSize: 24,
          color: PAL.muted,
        }}
      >
        View this collection, grid progress, and lists on objekt.my
      </div>
    </div>
  );

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Regular", data: regularFont, weight: 400 },
      { name: "Member", data: memberFont, weight: 600 },
      { name: "Bold", data: boldFont, weight: 700 },
    ],
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
