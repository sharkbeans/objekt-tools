import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { poster, posterHave, posterWant } from "@/lib/db/schema";

export const runtime = "nodejs";

const DARK = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
};
const LIGHT = {
  bg: "#ffffff",
  fg: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  sectionBg: "#f4f4f5",
};


function readFont(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", filename));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const row = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    with: {
      haves: { orderBy: asc(posterHave.position) },
      wants: { orderBy: asc(posterWant.position) },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pal = row.theme === "light" ? LIGHT : DARK;

  const PAD = 40;
  const HEADER_H = 22 + 1 + 16 + 16; // username + divider + gaps
  const NOTES_H = row.notes ? 12 + 12 : 0; // line height + margin
  const SECTION_LABEL_H = 15 + 10; // label + gap below
  const BODY_H = 630 - PAD * 2 - HEADER_H - NOTES_H - 16; // 16 = gap between header and body
  const GAP = 8;
  const CARD_W = 80;
  const CARD_H = CARD_W + 3 + 12; // image + margin + label
  const cols = Math.min(row.colsPerRow, 6);
  const maxRows = Math.max(1, Math.floor((BODY_H - SECTION_LABEL_H) / (CARD_H + GAP)));

  const maxItems = maxRows * cols;
  const haves = row.haves.slice(0, maxItems);
  const wants = row.wants.slice(0, maxItems);
  const haveExtra = row.haves.length - haves.length;
  const wantExtra = row.wants.length - wants.length;

  let regularFont: Buffer;
  let boldFont: Buffer;
  try {
    regularFont = readFont("og-regular.ttf");
    boldFont = readFont("og-bold.ttf");
  } catch {
    return NextResponse.json({ error: "Font files missing" }, { status: 500 });
  }

  function CardGrid({ items, extra }: { items: typeof haves; extra: number }) {
    const rows: ((typeof items)[0] | null)[][] = [];
    const all: ((typeof items)[0] | null)[] = [...items];
    if (extra > 0) all.push(null); // placeholder for +N chip
    for (let i = 0; i < all.length; i += cols) {
      rows.push(all.slice(i, i + cols));
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        {rows.map((row, ri) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static OG layout
            key={ri}
            style={{ display: "flex", flexDirection: "row", gap: GAP }}
          >
            {row.map((item, ci) => {
              if (item === null) {
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static OG layout
                    key={ci}
                    style={{
                      display: "flex",
                      width: CARD_W,
                      height: CARD_H,
                      borderRadius: 8,
                      background: pal.sectionBg,
                      border: `1px solid ${pal.border}`,
                      alignItems: "center",
                      justifyContent: "center",
                      color: pal.muted,
                      fontSize: 14,
                      fontFamily: "Regular",
                    }}
                  >
                    +{extra} more
                  </div>
                );
              }
              const label =
                item.rawLabel ??
                (item.member && item.collectionNo
                  ? `${item.member} ${item.collectionNo}`
                  : (item.collectionNo ?? ""));
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static layout for OG image
                  key={ci}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: CARD_W,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: CARD_W,
                      height: CARD_W,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: pal.sectionBg,
                      border: `1px solid ${pal.border}`,
                      position: "relative",
                    }}
                  >
                    {item.thumbnailUrl ? (
                      // biome-ignore lint/performance/noImgElement: Satori requires plain <img>
                      <img
                        src={item.thumbnailUrl}
                        width={CARD_W}
                        height={CARD_W}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                        alt=""
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          width: CARD_W,
                          height: CARD_W,
                          background: pal.sectionBg,
                        }}
                      />
                    )}
                    {(item.quantity ?? 1) > 1 && (
                      <div
                        style={{
                          display: "flex",
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "#3b82f6",
                          color: "#fff",
                          borderRadius: 4,
                          fontSize: 11,
                          fontFamily: "Bold",
                          padding: "1px 4px",
                        }}
                      >
                        x{item.quantity}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      marginTop: 3,
                      fontSize: 10,
                      color: pal.muted,
                      fontFamily: "Regular",
                      maxWidth: CARD_W,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  const INNER_W = 1200 - PAD * 2; // 1120
  const COL_W = (INNER_W - 1 - 32) / 2; // subtract divider + gap, split evenly

  const html = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height: 630,
        background: pal.bg,
        padding: PAD,
        gap: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: INNER_W,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontFamily: "Bold",
            color: pal.fg,
          }}
        >
          {row.username ? `@${row.username}` : "Trade List"}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 14,
            color: pal.muted,
            fontFamily: "Regular",
          }}
        >
          objekt.my
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          height: 1,
          background: pal.border,
          width: INNER_W,
        }}
      />

      {/* Body — two explicit-width columns */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 32,
          width: INNER_W,
        }}
      >
        {/* HAVE */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10, width: COL_W }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontFamily: "Bold",
              color: pal.fg,
            }}
          >
            {row.haveTitle}
          </div>
          <CardGrid items={haves} extra={haveExtra} />
        </div>

        {/* Vertical divider */}
        <div style={{ display: "flex", width: 1, background: pal.border }} />

        {/* WANT */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10, width: COL_W }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 15,
              fontFamily: "Bold",
              color: pal.fg,
            }}
          >
            {row.wantTitle}
          </div>
          <CardGrid items={wants} extra={wantExtra} />
        </div>
      </div>

      {/* Notes */}
      {row.notes && (
        <div
          style={{
            display: "flex",
            fontSize: 12,
            color: pal.muted,
            fontFamily: "Regular",
            marginTop: 4,
            width: INNER_W,
          }}
        >
          {row.notes.slice(0, 160)}
        </div>
      )}
    </div>
  );

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Regular", data: regularFont, weight: 400 },
      { name: "Bold", data: boldFont, weight: 700 },
    ],
    headers: {
      "Cache-Control": "public, immutable, max-age=31536000",
      ETag: `"${id}:${row.version}"`,
    },
  });
}
