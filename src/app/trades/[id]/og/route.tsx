import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { tradePost, tradePostHave, tradePostWant } from "@/lib/db/schema";
import { anyWantLabel } from "@/lib/objekt-label";
import { getSeasonPrefix } from "@/lib/season-prefix";

// Worst-case max slots: maxRows(3) * cols(6) = 18, +1 for the +N chip slot.
const HARD_LIMIT = 19;
// Trade embeds don't have a per-poster column count — render up to 6 wide.
const COLS = 6;

export const runtime = "nodejs";

const DARK = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
};

function readFont(filename: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", filename));
}

/**
 * Fetch, decode, and re-encode a thumbnail as a PNG data URI at card size.
 * Satori can't decode webp (some cosmo.fans thumbnails are served that way,
 * mislabeled as application/octet-stream), so every image is normalized
 * through sharp before being handed to ImageResponse. Failures resolve to
 * null so a single bad thumbnail can't break the whole embed.
 */
async function loadThumbnail(
  url: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf)
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

type HaveRow = typeof tradePostHave.$inferSelect;
type WantRow = typeof tradePostWant.$inferSelect;
// Unified row shape the grid renders — wants add isAny/artist over haves.
type Item = {
  collectionId: string;
  collectionNo: string | null;
  member: string | null;
  season: string | null;
  class: string | null;
  thumbnailUrl: string | null;
  isAny: boolean;
  artist: string | null;
  quantity: number;
};

function toItem(row: HaveRow | WantRow): Item {
  const isAny = "isAny" in row ? row.isAny : false;
  const artist = "artist" in row ? row.artist : null;
  return {
    collectionId: row.collectionId,
    collectionNo: row.collectionNo,
    member: row.member,
    season: row.season,
    class: row.class,
    thumbnailUrl: row.thumbnailUrl,
    isAny,
    artist,
    quantity: 1,
  };
}

// Collapse duplicate objekts into one slot, accumulating quantity — several
// serials of the same collection show as a single card with a count, matching
// how the trade UI groups items.
function groupItems(rows: (HaveRow | WantRow)[]): Item[] {
  const out: Item[] = [];
  const seen = new Map<string, Item>();
  for (const row of rows) {
    const item = toItem(row);
    const key = item.isAny
      ? `any:${item.member ?? ""}|${item.season ?? ""}|${item.class ?? ""}|${item.artist ?? ""}|${item.collectionNo ?? ""}`
      : `c:${item.collectionId}`;
    const existing = seen.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      out.push(item);
      seen.set(key, item);
    }
  }
  return out;
}

// Two-line card label: member on top, season-prefixed number below.
function cardLabels(item: Item): { line1: string; line2: string } {
  if (item.isAny) {
    return { line1: anyWantLabel(item), line2: "" };
  }
  const line1 = item.member ?? "";
  const num = item.collectionNo?.replace(/[A-Za-z]$/, "") ?? "";
  const line2 = num ? `${getSeasonPrefix(item.season)}${num}` : "";
  return { line1, line2 };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const meta = await db.query.tradePost.findFirst({
    where: eq(tradePost.id, id),
    columns: {
      id: true,
      description: true,
      wantsOnly: true,
      updatedAt: true,
    },
    with: {
      user: {
        columns: {},
        with: {
          cosmoAccount: { columns: { nickname: true } },
        },
      },
    },
  });

  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nickname = meta.user?.cosmoAccount?.nickname ?? null;
  const pal = DARK;

  const PAD = 40;
  const HEADER_H = 22 + 1 + 16 + 16;
  const NOTES_H = meta.description ? 12 + 12 : 0;
  const FOOTER_H = 11 + 10; // disclaimer line height + top gap
  const SECTION_LABEL_H = 15 + 10;
  const BODY_H = 630 - PAD * 2 - HEADER_H - NOTES_H - FOOTER_H - 16;
  const GAP = 8;
  // Real objekt thumbnails are ~314x486 — match that aspect so cover-fit
  // doesn't crop the top/bottom off the card image.
  const OBJEKT_ASPECT = 486 / 314;
  const CARD_W = 64;
  const CARD_IMG_H = Math.round(CARD_W * OBJEKT_ASPECT);
  const LABEL_H = 4 + 11 + 2 + 11;
  const CARD_H = CARD_IMG_H + LABEL_H;
  const maxRows = Math.max(
    1,
    Math.floor((BODY_H - SECTION_LABEL_H) / (CARD_H + GAP)),
  );
  const maxSlots = Math.min(maxRows * COLS, HARD_LIMIT);

  const [allHaves, allWants] = await Promise.all([
    db.select().from(tradePostHave).where(eq(tradePostHave.tradePostId, id)),
    db.select().from(tradePostWant).where(eq(tradePostWant.tradePostId, id)),
  ]);

  const groupedHaves = groupItems(allHaves.filter((h) => h.deletedAt === null));
  const groupedWants = groupItems(allWants.filter((w) => w.deletedAt === null));

  // Reserve last slot for the +N chip when grouped items overflow the grid.
  const haveSlots = groupedHaves.length > maxSlots ? maxSlots - 1 : maxSlots;
  const wantSlots = groupedWants.length > maxSlots ? maxSlots - 1 : maxSlots;
  const haves = groupedHaves.slice(0, haveSlots);
  const wants = groupedWants.slice(0, wantSlots);

  function quantityTotal(items: Item[]): number {
    return items.reduce((total, item) => total + Math.max(1, item.quantity), 0);
  }

  const haveExtra = quantityTotal(groupedHaves.slice(haves.length));
  const wantExtra = quantityTotal(groupedWants.slice(wants.length));

  const showHave = haves.length > 0;
  const showWant = wants.length > 0;
  const twoColumns = showHave && showWant;

  // Pre-fetch + normalize every distinct thumbnail once (haves/wants share
  // duplicates) before handing anything to Satori.
  const thumbnailUrls = new Set<string>();
  for (const item of [...haves, ...wants]) {
    if (item.thumbnailUrl) thumbnailUrls.add(item.thumbnailUrl);
  }
  const thumbnailEntries = await Promise.all(
    [...thumbnailUrls].map(
      async (url) =>
        [url, await loadThumbnail(url, CARD_W, CARD_IMG_H)] as const,
    ),
  );
  const thumbnailMap = new Map(thumbnailEntries);

  let regularFont: Buffer;
  let boldFont: Buffer;
  try {
    regularFont = readFont("og-regular.ttf");
    boldFont = readFont("og-bold.ttf");
  } catch {
    return NextResponse.json({ error: "Font files missing" }, { status: 500 });
  }

  function CardGrid({ items, extra }: { items: Item[]; extra: number }) {
    const rows: (Item | null)[][] = [];
    const all: (Item | null)[] = [...items];
    if (extra > 0) all.push(null); // placeholder for +N chip
    for (let i = 0; i < all.length; i += COLS) {
      rows.push(all.slice(i, i + COLS));
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
              const { line1, line2 } = cardLabels(item);
              const imageDataUri = item.thumbnailUrl
                ? thumbnailMap.get(item.thumbnailUrl)
                : null;
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
                    {imageDataUri ? (
                      // biome-ignore lint/performance/noImgElement: Satori requires plain <img>
                      <img
                        src={imageDataUri}
                        width={CARD_W}
                        height={CARD_IMG_H}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                        alt=""
                      />
                    ) : (
                      // Image missing or failed to load — show the label text
                      // instead of an empty box.
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          width: CARD_W,
                          height: CARD_IMG_H,
                          background: pal.sectionBg,
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 4,
                          gap: 2,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            fontSize: 10,
                            color: pal.muted,
                            fontFamily: "Regular",
                            textAlign: "center",
                            lineHeight: "1.3",
                          }}
                        >
                          {line1}
                        </div>
                        {line2 && (
                          <div
                            style={{
                              display: "flex",
                              fontSize: 9,
                              color: pal.muted,
                              fontFamily: "Regular",
                              textAlign: "center",
                            }}
                          >
                            {line2}
                          </div>
                        )}
                      </div>
                    )}
                    {item.quantity > 1 && (
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
                      {line1}
                    </div>
                    {line2 && (
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
                        {line2}
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
  // Two columns split the inner width (minus divider + gap); one column fills it.
  const COL_W = twoColumns ? (INNER_W - 1 - 32) / 2 : INNER_W;

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
          {nickname ? `@${nickname}'s Trade` : "Trade"}
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

      {/* Body */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 32,
          width: INNER_W,
        }}
      >
        {showHave && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: COL_W,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 15,
                fontFamily: "Bold",
                color: pal.fg,
              }}
            >
              HAVE
            </div>
            <CardGrid items={haves} extra={haveExtra} />
          </div>
        )}

        {twoColumns && (
          <div style={{ display: "flex", width: 1, background: pal.border }} />
        )}

        {showWant && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: COL_W,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 15,
                fontFamily: "Bold",
                color: pal.fg,
              }}
            >
              WANT
            </div>
            <CardGrid items={wants} extra={wantExtra} />
          </div>
        )}
      </div>

      {/* Description */}
      {meta.description && (
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
          {meta.description.slice(0, 160)}
        </div>
      )}

      {/* Disclaimer */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 11,
          color: pal.muted,
          fontFamily: "Regular",
          width: INNER_W,
        }}
      >
        {nickname
          ? `Users self-claim what they have. Please verify at objekt.top/@${nickname}`
          : "Users self-claim what they have. Please verify before trading."}
      </div>
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
      ETag: `"${id}:${meta.updatedAt.getTime()}"`,
    },
  });
}
