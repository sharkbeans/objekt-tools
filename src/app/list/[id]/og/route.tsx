import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { poster, posterHave, posterWant } from "@/lib/db/schema";

// Worst-case max slots: maxRows(3) * maxCols(6) = 18, +1 for the +N chip slot
const HARD_LIMIT = 19;

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

  // Step 1: fetch metadata only (no items) to compute maxSlots
  const meta = await db.query.poster.findFirst({
    where: eq(poster.id, id),
    columns: { id: true, userId: true, version: true, username: true, notes: true, theme: true, colsPerRow: true, haveTitle: true, wantTitle: true, groupByNumbers: true },
  });

  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pal = meta.theme === "light" ? LIGHT : DARK;

  const PAD = 40;
  const HEADER_H = 22 + 1 + 16 + 16;
  const NOTES_H = meta.notes ? 12 + 12 : 0;
  const SECTION_LABEL_H = 15 + 10;
  const BODY_H = 630 - PAD * 2 - HEADER_H - NOTES_H - 16;
  const GAP = 8;
  const CARD_W = 72;
  const CARD_IMG_H = Math.round(CARD_W * 4 / 3);
  const LABEL_H = 4 + 11 + 2 + 11;
  const CARD_H = CARD_IMG_H + LABEL_H;
  const cols = Math.min(meta.colsPerRow, 6);
  const maxRows = Math.max(1, Math.floor((BODY_H - SECTION_LABEL_H) / (CARD_H + GAP)));
  const maxSlots = Math.min(maxRows * cols, HARD_LIMIT);

  // Step 2: fetch ALL rows (cheap, small rows) so we can group duplicates before
  // truncating. We only render maxSlots images, so Satori stays bounded regardless
  // of how many rows exist.
  const [allHaves, allWants] = await Promise.all([
    db.select().from(posterHave)
      .where(eq(posterHave.posterId, id))
      .orderBy(asc(posterHave.position)),
    db.select().from(posterWant)
      .where(eq(posterWant.posterId, id))
      .orderBy(asc(posterWant.position)),
  ]);

  // Group duplicate objekts into a single slot, accumulating quantity — mirrors the
  // canvas getNumberGroupKey/getDisplayItems logic so the embed matches the poster.
  type Row = (typeof allHaves)[number];
  function groupRows(rows: Row[]): Row[] {
    if (!meta?.groupByNumbers) {
      return rows.map((r) => ({ ...r, quantity: r.quantity ?? 1 }));
    }
    const out: Row[] = [];
    const seen = new Map<string, Row>();
    for (const r of rows) {
      const key = r.collectionId
        ? `c:${r.collectionId}`
        : `p:${r.member ?? ""}|${r.season ?? ""}|${r.collectionNo ?? ""}|${r.onOffline ?? ""}|${r.rawLabel ?? ""}`;
      const qty = r.quantity ?? 1;
      const existing = seen.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        const item = { ...r, quantity: qty };
        out.push(item);
        seen.set(key, item);
      }
    }
    return out;
  }

  const groupedHaves = groupRows(allHaves);
  const groupedWants = groupRows(allWants);

  // Reserve last slot for the +N chip when grouped items overflow the grid.
  const haveSlots = groupedHaves.length > maxSlots ? maxSlots - 1 : maxSlots;
  const wantSlots = groupedWants.length > maxSlots ? maxSlots - 1 : maxSlots;
  const haves = groupedHaves.slice(0, haveSlots);
  const wants = groupedWants.slice(0, wantSlots);
  // True count of grouped items not shown — each duplicate group counts once.
  const haveExtra = groupedHaves.length - haves.length;
  const wantExtra = groupedWants.length - wants.length;

  const row = { ...meta };

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
                      height: CARD_IMG_H,
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
              // split rawlabel to get the season-prefixed collectionNo
              const rawParts = item.rawLabel?.split(" ") ?? [];
              const labelLine1 = item.member ?? rawParts[0] ?? "";
              const labelLine2 = item.member
                ? (rawParts.length >= 2 ? rawParts.slice(1).join(" ") : (item.collectionNo ?? ""))
                : "";
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
                      height: CARD_IMG_H,
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
                        height={CARD_IMG_H}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                        alt=""
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          width: CARD_W,
                          height: CARD_IMG_H,
                          background: pal.sectionBg,
                        }}
                      />
                    )}
                    {(item.quantity ?? 1) > 1 && (
                      <div
                        style={{
                          display: "flex",
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#000000",
                          color: "#ffffff",
                          fontSize: 11,
                          fontFamily: "Bold",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid rgba(255,255,255,0.3)",
                        }}
                      >
                        {item.quantity}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      marginTop: 4,
                      gap: 2,
                      width: CARD_W,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        fontSize: 11,
                        color: pal.fg,
                        fontFamily: "Regular",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {labelLine1}
                    </div>
                    {labelLine2 && (
                      <div
                        style={{
                          display: "flex",
                          fontSize: 11,
                          color: pal.muted,
                          fontFamily: "Regular",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {labelLine2}
                      </div>
                    )}
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
